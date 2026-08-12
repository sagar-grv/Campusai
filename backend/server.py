"""
Campus AI - FastAPI backend
- College Query Assistant (RAG, grounded on placement DB)
- Resume vs JD Gap Analysis
- Interview Prep generator
"""
import os
import io
import json
import uuid
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pypdf import PdfReader
from docx import Document as DocxDocument

from gemini_client import GeminiClient, EMBED_DIM
from security import (
    rate_limiter,
    check_prompt_injection,
    check_domain_scope,
    sanitize_log_message,
    STRICT_SYSTEM_GUARDRAILS,
    PER_ENDPOINT_LIMITS,
)

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "campus_ai")
CORS = os.environ.get("CORS_ORIGINS", "*")
SEED_VERSION = 2

mongo: Optional[AsyncIOMotorClient] = None
db = None
gemini: Optional[GeminiClient] = None


# ---------- utilities ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunk_text(text: str, size: int = 600, overlap: int = 80) -> List[str]:
    text = " ".join(text.split())
    if len(text) <= size:
        return [text] if text else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap
    return chunks


def cosine(a: List[float], b: List[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    return float(np.dot(va, vb))  # both unit-normalised upstream


# ---------- data models ----------
class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=6, ge=1, le=12)
    session_id: Optional[str] = None
    stream: bool = False


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    grounded: bool
    session_id: str
    matched_companies: Optional[List[dict]] = None


class GapAnalysisRequest(BaseModel):
    resume_text: str = Field(min_length=10, max_length=15000)
    job_description: str = Field(min_length=10, max_length=15000)


class GapAnalysisResponse(BaseModel):
    match_score: int
    matched_skills: List[str]
    missing_skills: List[str]
    improvements: List[str]
    summary: str


class InterviewPrepRequest(BaseModel):
    job_description: str = Field(min_length=20, max_length=10000)
    missing_skills: Optional[List[str]] = None
    num_questions: int = Field(default=8, ge=3, le=15)


class InterviewPrepResponse(BaseModel):
    technical: List[dict]  # {question, why_asked, hint}
    behavioral: List[dict]


class EligibilityRequest(BaseModel):
    cgpa: float = Field(ge=0.0, le=10.0, default=7.0)
    branch: str = Field(default="CS")
    tenth_pct: float = Field(ge=0.0, le=100.0, default=75.0)
    twelfth_pct: float = Field(ge=0.0, le=100.0, default=75.0)
    has_backlog: bool = Field(default=False)
    batch: Optional[str] = None  # "2025", "2023-24", or None for all


class CompareRequest(BaseModel):
    company_ids: List[str] = Field(min_items=1, max_items=4)


# ---------- resume parsing ----------
def parse_resume(filename: str, content: bytes) -> str:
    fn = filename.lower()
    if fn.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            raise HTTPException(400, f"Could not read PDF: {e}")
    if fn.endswith(".docx"):
        try:
            doc = DocxDocument(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise HTTPException(400, f"Could not read DOCX: {e}")
    if fn.endswith(".txt"):
        return content.decode("utf-8", errors="ignore")
    raise HTTPException(400, "Unsupported file. Use PDF, DOCX, or TXT.")


# ---------- seeding ----------
async def seed_placement_data():
    """One-time seeding of company placement DB into MongoDB with embeddings."""
    seed_marker = await db.meta.find_one({"_id": "placement_seed"})
    if seed_marker and seed_marker.get("version") == SEED_VERSION:
        return

    companies_path = ROOT / "data" / "companies.json"
    if not companies_path.exists():
        print("[seed] companies.json not found, skipping")
        return

    with open(companies_path) as f:
        payload = json.load(f)

    documents = []
    for entry in payload:
        # Build a rich text chunk about each company
        parts = [f"Company: {entry.get('company', 'Unknown')}"]
        if entry.get("batch"):
            parts.append(f"Batch: {entry['batch']}")
        if entry.get("ctc"):
            parts.append(f"CTC / Package: {entry['ctc']}")
        if entry.get("role"):
            parts.append(f"Role(s): {entry['role']}")
        if entry.get("branches"):
            parts.append(f"Eligible branches: {entry['branches']}")
        if entry.get("cgpa"):
            parts.append(f"Minimum CGPA / Percentage: {entry['cgpa']}")
        if entry.get("eligibility"):
            parts.append(f"Eligibility criteria: {entry['eligibility']}")
        if entry.get("mode"):
            parts.append(f"Mode: {entry['mode']}")
        if entry.get("date"):
            parts.append(f"Drive date: {entry['date']}")
        if entry.get("notes"):
            parts.append(f"Process / Notes: {entry['notes']}")
        text = ". ".join(parts) + "."

        documents.append({
            "id": str(uuid.uuid4()),
            "text": text,
            "source": f"{entry.get('source_file', 'placement_db')}::{entry.get('company','Unknown')}",
            "type": "placement",
            "company_data": entry,
            "created_at": now_iso(),
        })

    # Store raw structured company list immediately for Explorer & Eligibility UI
    await db.companies.delete_many({})
    company_docs = [{
        "id": str(uuid.uuid4()),
        **entry,
        "created_at": now_iso(),
    } for entry in payload]
    if company_docs:
        await db.companies.insert_many(company_docs)
    print(f"[seed] Inserted {len(company_docs)} raw company records into DB.")

    cache_file = ROOT / "data" / "embedded_chunks_cache.json"
    if cache_file.exists():
        print(f"[seed] Loading cached embeddings from {cache_file.name}...")
        with open(cache_file, "r") as f:
            documents = json.load(f)
    else:
        print(f"[seed] Embedding {len(documents)} placement records via Gemini...")
        texts = [d["text"] for d in documents]
        vectors = await gemini.embed_many(texts, task_type="RETRIEVAL_DOCUMENT")
        for d, v in zip(documents, vectors):
            d["embedding"] = v
            d["embedding_dim"] = len(v)
        try:
            with open(cache_file, "w") as f:
                json.dump(documents, f)
            print(f"[seed] Cached embeddings saved to {cache_file.name}")
        except Exception as e:
            print(f"[seed] Could not cache embeddings: {e}")

    await db.chunks.delete_many({})
    if documents:
        await db.chunks.insert_many(documents)

    await db.meta.insert_one({"_id": "placement_seed", "at": now_iso(), "n": len(documents)})
    print(f"[seed] Done. Loaded {len(documents)} embedded chunks into DB.")


# ---------- initialization ----------
async def ensure_initialized():
    global mongo, db, gemini
    if gemini is None:
        try:
            gemini = GeminiClient()
        except Exception as e:
            print(f"[gemini] init error: {e}")
    if db is None or mongo is None:
        try:
            real_mongo = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000)
            await real_mongo.admin.command("ping")
            mongo = real_mongo
            print("[db] Connected to real MongoDB instance.")
        except Exception as e:
            print(f"[db] Real MongoDB unavailable ({e}), using in-memory mongomock_motor client.")
            try:
                from mongomock_motor import AsyncMongoMockClient
                mongo = AsyncMongoMockClient()
            except Exception as e2:
                print(f"[db] mongomock_motor fallback error: {e2}")
                mongo = None
        if mongo:
            db = mongo[DB_NAME]
            try:
                await seed_placement_data()
            except Exception as e:
                print(f"[seed] Seeding exception: {e}")


# ---------- lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_initialized()
    yield
    if mongo:
        try:
            mongo.close()
        except Exception:
            pass



app = FastAPI(title="Campus AI", lifespan=lifespan)
handler = app
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS.split(",")] if CORS != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- routes ----------
@app.get("/api/health")
async def health():
    await ensure_initialized()
    ok = True
    try:
        if mongo and hasattr(mongo, "admin"):
            await mongo.admin.command("ping")
    except Exception:
        ok = False
    seed = None
    if db is not None:
        try:
            seed = await db.meta.find_one({"_id": "placement_seed"})
        except Exception:
            pass
    return {
        "ok": ok,
        "chat_model": os.environ.get("CHAT_MODEL", "gemini-2.5-flash"),
        "embed_model": os.environ.get("EMBED_MODEL", "gemini-embedding-001"),
        "gemini_ready": gemini is not None and (gemini.ready or bool(os.environ.get("NVIDIA_API_KEY"))),
        "companies_seeded": bool(seed),
    }


def batch_of(doc: dict) -> str:
    src = str(doc.get("source_file") or "")
    if "2023" in src:
        return "2023-24"
    if "2025" in src:
        return "2025"
    batch_val = str(doc.get("batch") or "").strip()
    if batch_val in ("2023-24", "2025"):
        return batch_val
    return "Other"


@app.get("/api/companies")
async def list_companies(
    q: str = "",
    batch: str = "",
    branch: str = "",
    min_ctc: float = 0.0,
    sort: str = "",
    page: int = 1,
    page_size: int = 25,
):
    await ensure_initialized()
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    cursor = db.companies.find({}, {"_id": 0})
    docs = await cursor.to_list(length=1000)
    if q:
        ql = q.lower()
        docs = [d for d in docs if any(
            ql in str(d.get(k, "")).lower() for k in ("company", "role", "branches", "eligibility")
        )]
    if batch:
        docs = [d for d in docs if batch_of(d) == batch]
    if branch:
        bl = branch.lower()
        docs = [d for d in docs if bl in str(d.get("branches") or "").lower() or bl in str(d.get("eligibility") or "").lower()]
    if min_ctc and min_ctc > 0:
        docs = [d for d in docs if (_extract_ctc_float(d.get("ctc")) or 0) >= min_ctc]
    if sort == "ctc_desc":
        docs.sort(key=lambda x: _extract_ctc_float(x.get("ctc")) or 0, reverse=True)
    elif sort == "ctc_asc":
        docs.sort(key=lambda x: _extract_ctc_float(x.get("ctc")) or 0)
    elif sort in ("name", "name_asc"):
        docs.sort(key=lambda x: str(x.get("company") or "").lower())
    total = len(docs)
    start = (page - 1) * page_size
    return {"companies": docs[start:start + page_size], "total": total, "page": page, "page_size": page_size}


@app.get("/api/companies/stats")
async def companies_stats():
    await ensure_initialized()
    total = await db.companies.count_documents({})
    ctc_values = []
    by_batch = {}
    top_recruiters = {}
    top_roles = {}
    async for c in db.companies.find({}, {"ctc": 1, "role": 1, "company": 1, "source_file": 1, "_id": 0}):
        v = _extract_ctc_float(c.get("ctc"))
        if v:
            ctc_values.append(v)
        b = batch_of(c)
        by_batch[b] = by_batch.get(b, 0) + 1
        name = str(c.get("company") or "").strip()
        if name:
            top_recruiters[name] = top_recruiters.get(name, 0) + 1
        r = (c.get("role") or "").split(",")[0].strip()[:40]
        if r:
            top_roles[r] = top_roles.get(r, 0) + 1
    top_roles_sorted = sorted(top_roles.items(), key=lambda x: -x[1])[:6]
    top_recruiters_sorted = sorted(top_recruiters.items(), key=lambda x: -x[1])[:8]
    return {
        "total_companies": total,
        "avg_ctc_lpa": round(sum(ctc_values) / len(ctc_values), 2) if ctc_values else 0,
        "max_ctc_lpa": round(max(ctc_values), 2) if ctc_values else 0,
        "by_batch": [{"batch": b, "count": n} for b, n in sorted(by_batch.items())],
        "top_recruiters": [{"company": c, "count": n} for c, n in top_recruiters_sorted],
        "top_roles": [{"role": r, "count": n} for r, n in top_roles_sorted],
    }


@app.get("/api/stats")
async def stats():
    return await companies_stats()


@app.get("/api/companies/{company_id}")
async def get_company(company_id: str):
    await ensure_initialized()
    doc = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not doc:
        doc = await db.companies.find_one({"company": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Company not found.")
    return doc


NO_ANSWER_TEXT = (
    "I don't have enough information in the placement database to answer that "
    "confidently. Try asking about a specific company (e.g., 'What is Infosys "
    "eligibility?') or a role (e.g., 'Which companies hire for Data Analyst?')."
)

CHAT_SYSTEM = STRICT_SYSTEM_GUARDRAILS


def sse(dict_payload: dict) -> str:
    return f"data: {json.dumps(dict_payload)}\n\n"


async def build_chat_context(question: str, top_k: int):
    """Shared retrieval for both the POST and streaming chat paths."""
    ql = question.lower()
    keyword_matches = []

    import re
    num_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|ctc|lacs|lakh|lakhs)?', ql)
    target_num = float(num_match.group(1)) if num_match else None
    is_greater_query = any(k in ql for k in ["more", "above", "greater", "higher", ">", "at least", "min"])
    is_highest_query = any(k in ql for k in ["highest", "max", "top", "best", "maximum"])
    is_criteria_query = any(k in ql for k in ["%", "percent", "cgpa", "backlog", "percentage", "cutoff", "criteria", "eligibility"])

    async for c in db.companies.find({}, {"_id": 0}):
        comp_name = str(c.get("company") or "").lower()
        role_name = str(c.get("role") or "").lower()
        branches_name = str(c.get("branches") or "").lower()
        elig_name = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''}".lower()
        ctc_float = _extract_ctc_float(c.get("ctc"))

        if comp_name and comp_name in ql:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_highest_query and ctc_float and ctc_float >= 15.0:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_greater_query and target_num and ctc_float and ctc_float >= target_num:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_criteria_query and target_num and (f"{int(target_num)}%" in elig_name or f"{target_num}" in elig_name):
            if c not in keyword_matches and len(keyword_matches) < 8:
                keyword_matches.append(c)
        elif role_name and any(term in ql for term in role_name.split() if len(term) > 3):
            if c not in keyword_matches and len(keyword_matches) < 6:
                keyword_matches.append(c)

    if is_greater_query or is_highest_query:
        keyword_matches.sort(key=lambda x: _extract_ctc_float(x.get("ctc")) or 0, reverse=True)

    q_vec = (await gemini.embed_many([question], task_type="RETRIEVAL_QUERY"))[0]
    hits = []
    async for doc in db.chunks.find({"type": "placement"}, {"text": 1, "source": 1, "embedding": 1, "company_data": 1}):
        emb = doc.get("embedding")
        if not emb or len(emb) != len(q_vec):
            continue
        score = cosine(q_vec, emb)
        hits.append({
            "text": doc["text"],
            "source": doc.get("source", "placement_db"),
            "score": score,
            "company": (doc.get("company_data") or {}).get("company"),
        })
    hits.sort(key=lambda x: x["score"], reverse=True)
    top = hits[: top_k]

    grounded = (len(top) > 0 and top[0]["score"] >= 0.20) or len(keyword_matches) > 0

    context_parts = []
    for i, h in enumerate(top):
        context_parts.append(f"[Doc {i+1} | source={h['source']} | similarity={h['score']:.2f}]\n{h['text']}")
    for km in keyword_matches[:6]:
        context_parts.append(
            f"[Structured Match | Company={km.get('company')}]\n"
            f"Company: {km.get('company')}. Role: {km.get('role')}. CTC: {km.get('ctc')}. "
            f"Branches: {km.get('branches')}. Eligibility: {km.get('eligibility') or km.get('cgpa')}. Notes: {km.get('notes')}."
        )

    matched_comps = keyword_matches[:4]
    if not matched_comps and top:
        for h in top:
            c_name = h.get("company")
            if c_name:
                comp_doc = await db.companies.find_one({"company": c_name}, {"_id": 0})
                if comp_doc and comp_doc not in matched_comps:
                    matched_comps.append(comp_doc)
            if len(matched_comps) >= 3:
                break

    return {
        "context": "\n\n".join(context_parts),
        "sources": [{"source": h["source"], "score": round(h["score"], 3), "company": h["company"]} for h in top[:5]],
        "grounded": grounded,
        "matched_comps": matched_comps,
        "session_id": str(uuid.uuid4()),
    }


def stream_chat_response(ctx: dict, question: str):
    async def gen():
        yield sse({
            "type": "meta",
            "sources": ctx["sources"],
            "matched_companies": ctx["matched_comps"],
            "session_id": ctx["session_id"],
            "grounded": ctx["grounded"],
        })
        if not ctx["grounded"]:
            yield sse({"type": "done"})
            return
        prompt = f"CONTEXT:\n{ctx['context']}\n\nSTUDENT QUESTION:\n{question}\n\nGrounded answer:"
        try:
            async for chunk in gemini.generate_stream(system=CHAT_SYSTEM, prompt=prompt, temperature=0.15, max_tokens=850):
                if "Fallback response: Unable to reach AI models" in chunk:
                    yield sse({"type": "error", "detail": "AI generation temporarily unavailable. Please try again in a moment."})
                    return
                if chunk:
                    yield sse({"type": "delta", "text": chunk})
        except Exception as e:
            print(f"[chat-stream] generation error: {e}")
            yield sse({"type": "error", "detail": "AI generation failed mid-stream. Please retry."})
            return
        yield sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["chat"])
    check_prompt_injection(body.question)

    if not check_domain_scope(body.question):
        return ChatResponse(
            answer=NO_ANSWER_TEXT,
            sources=[],
            grounded=False,
            session_id=body.session_id or str(uuid.uuid4()),
            matched_companies=[],
        )

    if not gemini or (not gemini.ready and not os.environ.get("NVIDIA_API_KEY")):
        raise HTTPException(503, "Neither GEMINI_API_KEY nor NVIDIA_API_KEY is configured.")

    ctx = await build_chat_context(body.question, body.top_k)

    if body.stream:
        return stream_chat_response(ctx, body.question)

    if not ctx["grounded"]:
        return ChatResponse(
            answer=NO_ANSWER_TEXT,
            sources=[],
            grounded=False,
            session_id=ctx["session_id"],
            matched_companies=[],
        )

    prompt = f"CONTEXT:\n{ctx['context']}\n\nSTUDENT QUESTION:\n{body.question}\n\nGrounded answer:"
    answer = await gemini.generate(system=CHAT_SYSTEM, prompt=prompt, temperature=0.15, max_tokens=850)
    if "Fallback response: Unable to reach AI models" in answer:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")

    return ChatResponse(
        answer=answer,
        sources=ctx["sources"],
        grounded=True,
        session_id=ctx["session_id"],
        matched_companies=ctx["matched_comps"],
    )

    # 1. Structured Keyword & Numeric Matching over db.companies
    ql = body.question.lower()
    keyword_matches = []
    
    import re
    num_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|ctc|lacs|lakh|lakhs)?', ql)
    target_num = float(num_match.group(1)) if num_match else None
    is_greater_query = any(k in ql for k in ["more", "above", "greater", "higher", ">", "at least", "min"])
    is_highest_query = any(k in ql for k in ["highest", "max", "top", "best", "maximum"])
    is_criteria_query = any(k in ql for k in ["%", "percent", "cgpa", "backlog", "percentage", "cutoff", "criteria", "eligibility"])

    async for c in db.companies.find({}, {"_id": 0}):
        comp_name = str(c.get("company") or "").lower()
        role_name = str(c.get("role") or "").lower()
        branches_name = str(c.get("branches") or "").lower()
        elig_name = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''}".lower()
        ctc_float = _extract_ctc_float(c.get("ctc"))

        if comp_name and comp_name in ql:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_highest_query and ctc_float and ctc_float >= 15.0:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_greater_query and target_num and ctc_float and ctc_float >= target_num:
            if c not in keyword_matches:
                keyword_matches.append(c)
        elif is_criteria_query and target_num and (f"{int(target_num)}%" in elig_name or f"{target_num}" in elig_name):
            if c not in keyword_matches and len(keyword_matches) < 8:
                keyword_matches.append(c)
        elif role_name and any(term in ql for term in role_name.split() if len(term) > 3):
            if c not in keyword_matches and len(keyword_matches) < 6:
                keyword_matches.append(c)

    if is_greater_query or is_highest_query:
        keyword_matches.sort(key=lambda x: _extract_ctc_float(x.get("ctc")) or 0, reverse=True)

    # 2. Vector Embedding Search over db.chunks
    q_vec = (await gemini.embed_many([body.question], task_type="RETRIEVAL_QUERY"))[0]
    hits = []
    async for doc in db.chunks.find({"type": "placement"}, {"text": 1, "source": 1, "embedding": 1, "company_data": 1}):
        emb = doc.get("embedding")
        if not emb or len(emb) != len(q_vec):
            continue
        score = cosine(q_vec, emb)
        hits.append({
            "text": doc["text"],
            "source": doc.get("source", "placement_db"),
            "score": score,
            "company": (doc.get("company_data") or {}).get("company"),
        })
    hits.sort(key=lambda x: x["score"], reverse=True)
    top = hits[: body.top_k]

    # Grounding decision: Grounded if vector score >= 0.20 OR keyword matches found
    grounded = (len(top) > 0 and top[0]["score"] >= 0.20) or len(keyword_matches) > 0

    if not grounded:
        return ChatResponse(
            answer=(
                "I don't have enough information in the placement database to answer that "
                "confidently. Try asking about a specific company (e.g., 'What is Infosys "
                "eligibility?') or a role (e.g., 'Which companies hire for Data Analyst?')."
            ),
            sources=[],
            grounded=False,
            session_id=body.session_id or str(uuid.uuid4()),
            matched_companies=[],
        )

    # Build context from vector hits and keyword matches
    context_parts = []
    for i, h in enumerate(top):
        context_parts.append(f"[Doc {i+1} | source={h['source']} | similarity={h['score']:.2f}]\n{h['text']}")

    for km in keyword_matches[:6]:
        context_parts.append(
            f"[Structured Match | Company={km.get('company')}]\n"
            f"Company: {km.get('company')}. Role: {km.get('role')}. CTC: {km.get('ctc')}. "
            f"Branches: {km.get('branches')}. Eligibility: {km.get('eligibility') or km.get('cgpa')}. Notes: {km.get('notes')}."
        )

    context = "\n\n".join(context_parts)
    system = (
        "You are the Campus AI Placement Assistant for engineering college students in India. "
        "Answer ONLY using the retrieved context below. Do NOT invent companies, salaries, "
        "eligibility criteria, or dates. If the context does not contain the answer, reply "
        "exactly: 'I don't have that information in the placement database.' "
        "When you cite facts, add a small tag like [Doc N] pointing to the source. "
        "Keep answers concise, structured with bullet points, and free of markdown headers."
    )
    prompt = f"CONTEXT:\n{context}\n\nSTUDENT QUESTION:\n{body.question}\n\nGrounded answer:"
    answer = await gemini.generate(system=system, prompt=prompt, temperature=0.15, max_tokens=850)

    # Prepare matched_companies array for rendering UI cards
    matched_comps = keyword_matches[:4]
    if not matched_comps and top:
        for h in top:
            c_name = h.get("company")
            if c_name:
                comp_doc = await db.companies.find_one({"company": c_name}, {"_id": 0})
                if comp_doc and comp_doc not in matched_comps:
                    matched_comps.append(comp_doc)
            if len(matched_comps) >= 3:
                break

    return ChatResponse(
        answer=answer,
        sources=[{"source": h["source"], "score": round(h["score"], 3), "company": h["company"]} for h in top[:5]],
        grounded=True,
        session_id=body.session_id or str(uuid.uuid4()),
        matched_companies=matched_comps,
    )


@app.post("/api/resume/parse")
async def resume_parse(file: UploadFile = File(...), request: Request = None):
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["parse"])
    content = await file.read()
    text = parse_resume(file.filename, content)
    return {"filename": file.filename, "text": text, "chars": len(text)}


COMMON_TECH_SKILLS = [
    "python", "javascript", "typescript", "react", "react.js", "node.js", "express", "fastapi", "django",
    "flask", "java", "c++", "c", "c#", ".net", "spring", "spring boot", "sql", "postgresql", "mysql",
    "mongodb", "redis", "docker", "kubernetes", "aws", "gcp", "azure", "git", "github", "ci/cd",
    "data structures", "algorithms", "system design", "microservices", "rest api", "graphql", "html", "css",
    "tailwind", "machine learning", "deep learning", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
    "tableau", "power bi", "agile", "scrum", "unit testing", "linux", "bash", "object oriented design"
]


@app.post("/api/gap-analysis", response_model=GapAnalysisResponse)
async def gap_analysis(req: GapAnalysisRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["gap"])
    check_prompt_injection(req.resume_text)
    check_prompt_injection(req.job_description)

    r_text = req.resume_text
    j_text = req.job_description

    if not gemini or (not gemini.ready and not os.environ.get("NVIDIA_API_KEY")):
        raise HTTPException(503, "Neither GEMINI_API_KEY nor NVIDIA_API_KEY is configured.")
    if len(r_text) < 15:
        raise HTTPException(400, "Resume text is too short. Please provide at least 15 characters.")
    if len(j_text) < 15:
        raise HTTPException(400, "Job description is too short. Please provide at least 15 characters.")

    system = (
        "You are a strict, grounded resume analysis engine. You will receive a candidate's "
        "resume text and a target job description. Extract skills, tools, and requirements "
        "ONLY as they appear in the two texts. Return STRICT JSON matching this schema:\n"
        "{\n"
        '  "match_score": integer 0-100 (how well the resume aligns with the JD),\n'
        '  "matched_skills": [ short skill strings that appear in BOTH resume and JD ],\n'
        '  "missing_skills": [ skills or requirements found in JD but NOT in resume ],\n'
        '  "improvements": [ 3-5 concrete, actionable suggestions to close the gap ],\n'
        '  "summary": "2-3 sentence honest assessment"\n'
        "}\n"
        "Do NOT wrap the JSON in markdown code fences."
    )
    prompt = (
        f"===== RESUME =====\n{r_text[:8000]}\n\n"
        f"===== JOB DESCRIPTION =====\n{j_text[:6000]}\n\n"
        f"Return ONLY the JSON."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.1, max_tokens=900)
    if "Fallback response: Unable to reach AI models" in raw:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")
    data = _safe_json(raw)

    # Fallback skill keyword extraction if LLM JSON was missing or empty
    r_low = r_text.lower()
    j_low = j_text.lower()
    resume_found = [s for s in COMMON_TECH_SKILLS if s in r_low]
    jd_found = [s for s in COMMON_TECH_SKILLS if s in j_low]
    
    fallback_matched = [s.title() for s in jd_found if s in resume_found]
    fallback_missing = [s.title() for s in jd_found if s not in resume_found]

    matched_skills = list(data.get("matched_skills") or [])
    missing_skills = list(data.get("missing_skills") or [])
    improvements = list(data.get("improvements") or [])
    summary = str(data.get("summary") or "").strip()

    if not matched_skills and fallback_matched:
        matched_skills = fallback_matched
    if not missing_skills and fallback_missing:
        missing_skills = fallback_missing

    r_hay = r_text.lower()
    j_hay = j_text.lower()
    matched_skills = [s for s in matched_skills if s and (str(s).lower() in r_hay or str(s).lower() in j_hay)][:20]
    missing_skills = [s for s in missing_skills if s and str(s).lower() in j_hay][:20]

    calc_score = 0
    if jd_found:
        calc_score = round(len(fallback_matched) / len(jd_found) * 100)
    elif r_text and j_text:
        calc_score = 65

    raw_score = int(data.get("match_score", 0))
    match_score = raw_score if raw_score > 0 else (calc_score if calc_score > 0 else 60)

    if not improvements:
        improvements = [
            f"Add explicit bullet points detailing your hands-on experience with {s}."
            for s in missing_skills[:4]
        ] or [
            "Tailor project descriptions to highlight core technologies required in the JD.",
            "Include quantified achievements and metrics for tech projects.",
            "Ensure technical skills section explicitly names tools mentioned in the target role."
        ]

    if not summary:
        summary = f"Resume matches {match_score}% of the target job description requirements. Core strengths include {', '.join(matched_skills[:3]) if matched_skills else 'foundational concepts'}, with key gap areas in {', '.join(missing_skills[:3]) if missing_skills else 'additional specialized tooling'}."

    return GapAnalysisResponse(
        match_score=min(100, max(10, match_score)),
        matched_skills=matched_skills[:20],
        missing_skills=missing_skills[:20],
        improvements=improvements[:6],
        summary=summary,
    )
@app.post("/api/interview-prep", response_model=InterviewPrepResponse)
async def interview_prep(body: InterviewPrepRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["interview"])
    check_prompt_injection(body.job_description)
    if body.missing_skills:
        for s in body.missing_skills:
            check_prompt_injection(s)

    if not gemini or not gemini.ready:
        raise HTTPException(503, "GEMINI_API_KEY is not configured.")
    system = (
        "You are an interview preparation coach. Generate targeted interview questions for the "
        "given job description. Focus especially on the candidate's missing skills so they can "
        "prepare. Never invent generic filler. Return STRICT JSON:\n"
        "{\n"
        '  "technical": [ { "question": "...", "why_asked": "...", "hint": "one-line study hint" } ],\n'
        '  "behavioral": [ { "question": "...", "why_asked": "...", "hint": "..." } ]\n'
        "}\n"
        "Include roughly 70% technical, 30% behavioral. Do NOT wrap in markdown."
    )
    missing = ", ".join(body.missing_skills or []) or "(none provided; base on JD only)"
    total_q = body.num_questions
    n_tech = max(1, round(total_q * 0.7))
    n_beh = max(0, total_q - n_tech)
    prompt = (
        f"Job description:\n{body.job_description[:5000]}\n\n"
        f"Candidate's known skill gaps: {missing}\n\n"
        f"Generate exactly {n_tech} technical and {n_beh} behavioral questions."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.3, max_tokens=1400)
    if "Fallback response: Unable to reach AI models" in raw:
        raise HTTPException(503, "AI generation temporarily unavailable. Please try again in a moment.")
    data = _safe_json(raw)
    return InterviewPrepResponse(
        technical=list(data.get("technical", []))[:n_tech],
        behavioral=list(data.get("behavioral", []))[:n_beh],
    )


# ---------- eligibility checker ----------
@app.post("/api/eligibility")
async def check_eligibility(req: EligibilityRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["eligibility"])
    cursor = db.companies.find({}, {"_id": 0})
    all_companies = await cursor.to_list(length=1000)

    # Filter batch if specified
    if req.batch:
        all_companies = [c for c in all_companies if batch_of(c) == req.batch]

    user_branch = req.branch.upper().strip()
    eligible_list = []
    ineligible_list = []
    marginal_list = []
    eligible_ctcs = []

    for c in all_companies:
        reasons = []
        is_eligible = True

        elig_str = f"{c.get('eligibility') or ''} {c.get('cgpa') or ''} {c.get('notes') or ''}".lower()
        branches_str = str(c.get("branches") or "").upper()

        # 1. Branch evaluation
        if branches_str and "ALL" not in branches_str:
            # check common branch tags
            branch_match = False
            alias_map = {
                "CS": ["CS", "COMPUTER", "CE", "CSE"],
                "IT": ["IT", "INFORMATION"],
                "EXTC": ["EXTC", "ECE", "ELECTRONICS", "TELECOM"],
                "MECH": ["MECH", "MECHANICAL"],
                "CIVIL": ["CIVIL"],
                "MCA": ["MCA"],
                "AI": ["AI", "ARTIFICIAL"],
                "DS": ["DS", "DATA SCIENCE", "DATA ANALYTICS"],
                "CSBS": ["CSBS", "BUSINESS"],
            }
            target_aliases = alias_map.get(user_branch, [user_branch])
            for alias in target_aliases:
                if alias in branches_str:
                    branch_match = True
                    break
            if not branch_match:
                is_eligible = False
                reasons.append(f"Branch mismatch (Eligible: {c.get('branches') or 'Varies'})")

        # 2. CGPA requirement check
        cgpa_req = _extract_cgpa(elig_str)
        if cgpa_req is not None and cgpa_req <= 10.0:
            if req.cgpa < cgpa_req:
                is_eligible = False
                reasons.append(f"CGPA below required cutoff ({req.cgpa} < {cgpa_req})")

        # 3. Academic percentage check (10th/12th)
        pct_req = _extract_pct(elig_str)
        if pct_req is not None:
            if req.tenth_pct < pct_req or req.twelfth_pct < pct_req:
                is_eligible = False
                reasons.append(f"Academic percentage below required ({min(req.tenth_pct, req.twelfth_pct)}% < {pct_req}%)")

        # 4. Backlog policy check
        if req.has_backlog:
            if any(term in elig_str for term in ["no live kt", "no active backlog", "no live backlog", "no dead or live kt", "no backlog"]):
                is_eligible = False
                reasons.append("Company rejects candidates with active backlogs / KTs")

        # Marginal band: ineligible only by a small/single criterion
        is_marginal = False
        if not is_eligible and len(reasons) == 1:
            only = reasons[0]
            if "CGPA below required cutoff" in only and cgpa_req is not None and (cgpa_req - req.cgpa) <= 0.5:
                is_marginal = True
            elif "Academic percentage below required" in only and pct_req is not None and (pct_req - min(req.tenth_pct, req.twelfth_pct)) <= 5.0:
                is_marginal = True
            elif "backlogs / KTs" in only:
                is_marginal = True

        # Parse numeric CTC for stats
        ctc_val = _extract_ctc_float(c.get("ctc"))

        company_res = {
            **c,
            "is_eligible": is_eligible,
            "is_marginal": is_marginal,
            "reasons": reasons if not is_eligible else ["All criteria satisfied"],
        }

        if is_eligible:
            eligible_list.append(company_res)
            if ctc_val:
                eligible_ctcs.append(ctc_val)
        elif is_marginal:
            marginal_list.append(company_res)
        else:
            ineligible_list.append(company_res)

    return {
        "summary": {
            "total_evaluated": len(all_companies),
            "eligible_count": len(eligible_list),
            "ineligible_count": len(ineligible_list),
            "marginal_count": len(marginal_list),
            "marginal_percentage": round((len(marginal_list) / len(all_companies) * 100), 1) if all_companies else 0,
            "eligible_percentage": round((len(eligible_list) / len(all_companies) * 100), 1) if all_companies else 0,
            "max_eligible_ctc": round(max(eligible_ctcs), 2) if eligible_ctcs else 0,
            "avg_eligible_ctc": round(sum(eligible_ctcs) / len(eligible_ctcs), 2) if eligible_ctcs else 0,
        },
        "eligible": eligible_list,
        "ineligible": ineligible_list,
        "marginal": marginal_list,
    }


# ---------- company comparison ----------
@app.post("/api/companies/compare")
async def compare_companies(body: CompareRequest, request: Request):
    await ensure_initialized()
    client_ip = request.client.host if request.client else "127.0.0.1"
    rate_limiter.check_rate_limit(client_ip, limit=PER_ENDPOINT_LIMITS["compare"])
    if not body.company_ids:
        raise HTTPException(400, "Please provide at least one company ID to compare.")
    cursor = db.companies.find({"id": {"$in": body.company_ids}}, {"_id": 0})
    selected = await cursor.to_list(length=10)

    if not selected:
        # Fallback search by company name if IDs are missing
        cursor = db.companies.find({"company": {"$in": body.company_ids}}, {"_id": 0})
        selected = await cursor.to_list(length=10)

    if not selected:
        raise HTTPException(404, "None of the specified companies were found.")

    comparison_ai = ""
    if gemini and gemini.ready and len(selected) > 1:
        comp_summary = "\n".join(
            f"- {c.get('company')}: CTC={c.get('ctc')}, Role={c.get('role')}, Branches={c.get('branches')}, Eligibility={c.get('eligibility')}, Process={c.get('notes')}"
            for c in selected
        )
        system = (
            "You are a career counselor comparing college placement drives. "
            "Compare the following companies side-by-side in bullet points. Highlight salary differences, "
            "eligibility strictness, role complexity, and selection process difficulty."
        )
        prompt = f"Companies to compare:\n{comp_summary}\n\nProvide a concise 3-bullet comparative summary."
        try:
            comparison_ai = await gemini.generate(system=system, prompt=prompt, temperature=0.2, max_tokens=600)
            if "Fallback response: Unable to reach AI models" in comparison_ai:
                comparison_ai = "AI comparative insights are unavailable right now. The structured comparison below is complete."
        except Exception as e:
            comparison_ai = f"AI comparison unavailable: {e}"

    return {
        "companies": selected,
        "ai_comparison": comparison_ai,
    }


# ---------- helper functions ----------
def _extract_cgpa(text: str) -> Optional[float]:
    import re
    m = re.search(r'(?:cgpa|cgpi)\s*[-:]?\s*([2-9]\.\d{1,2})', text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def _extract_pct(text: str) -> Optional[float]:
    import re
    m = re.search(r'(\d{2})%\s*(?:throughout|aggregate|and above|\+)', text)
    if m:
        try:
            val = float(m.group(1))
            if 50.0 <= val <= 95.0:
                return val
        except ValueError:
            pass
    return None


def _extract_ctc_float(val: Optional[str]) -> Optional[float]:
    if not val:
        return None
    buf = ""
    for ch in str(val):
        if ch.isdigit() or ch == ".":
            buf += ch
        elif buf:
            break
    try:
        return float(buf) if buf else None
    except ValueError:
        return None


def _safe_json(raw: str) -> dict:
    """Strip code fences and parse JSON; return {} on failure."""
    if not raw:
        return {}
    txt = raw.strip()
    # Strip markdown code fences
    import re
    txt = re.sub(r'^```(?:json)?\s*', '', txt, flags=re.IGNORECASE)
    txt = re.sub(r'\s*```$', '', txt)
    
    # Try direct parse
    try:
        return json.loads(txt)
    except Exception:
        pass

    # Extract outermost JSON object { ... }
    m = re.search(r'(\{.*\})', txt, re.DOTALL)
    if m:
        candidate = m.group(1)
        # Clean trailing commas before } or ]
        candidate_clean = re.sub(r',\s*([\}\]])', r'\1', candidate)
        try:
            return json.loads(candidate_clean)
        except Exception:
            pass

    return {}

