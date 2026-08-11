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
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pypdf import PdfReader
from docx import Document as DocxDocument

from gemini_client import GeminiClient, EMBED_DIM

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
CORS = os.environ.get("CORS_ORIGINS", "*")

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


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    grounded: bool
    session_id: str


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
    if seed_marker:
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

    # Batch embed
    print(f"[seed] Embedding {len(documents)} placement records...")
    texts = [d["text"] for d in documents]
    vectors = await gemini.embed_many(texts, task_type="RETRIEVAL_DOCUMENT")
    for d, v in zip(documents, vectors):
        d["embedding"] = v
        d["embedding_dim"] = len(v)

    if documents:
        await db.chunks.insert_many(documents)

    # Also store raw structured company list for the Explorer UI
    await db.companies.delete_many({})
    for entry in payload:
        await db.companies.insert_one({
            "id": str(uuid.uuid4()),
            **entry,
            "created_at": now_iso(),
        })

    await db.meta.insert_one({"_id": "placement_seed", "at": now_iso(), "n": len(documents)})
    print(f"[seed] Done. Inserted {len(documents)} chunks and {len(payload)} companies.")


# ---------- lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global mongo, db, gemini
    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]
    gemini = GeminiClient()
    # Ensure indexes
    await db.chunks.create_index("type")
    try:
        await seed_placement_data()
    except Exception as e:
        print(f"[seed] failed: {e}")
    yield
    mongo.close()


app = FastAPI(title="Campus AI", lifespan=lifespan)
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
    ok = True
    try:
        await mongo.admin.command("ping")
    except Exception:
        ok = False
    seed = await db.meta.find_one({"_id": "placement_seed"})
    return {
        "ok": ok,
        "chat_model": os.environ.get("CHAT_MODEL"),
        "embed_model": os.environ.get("EMBED_MODEL"),
        "gemini_ready": gemini is not None and gemini.ready,
        "companies_seeded": bool(seed),
    }


@app.get("/api/companies")
async def list_companies(q: str = "", limit: int = 200):
    cursor = db.companies.find({}, {"_id": 0})
    docs = await cursor.to_list(length=1000)
    if q:
        ql = q.lower()
        docs = [d for d in docs if any(
            ql in str(d.get(k, "")).lower() for k in ("company", "role", "branches", "eligibility")
        )]
    return {"companies": docs[:limit], "total": len(docs)}


@app.get("/api/stats")
async def stats():
    total = await db.companies.count_documents({})
    ctc_values = []
    async for c in db.companies.find({"ctc": {"$ne": None}}, {"ctc": 1, "_id": 0}):
        v = c.get("ctc") or ""
        # extract first float
        buf = ""
        for ch in v:
            if ch.isdigit() or ch == ".":
                buf += ch
            elif buf:
                break
        try:
            if buf:
                ctc_values.append(float(buf))
        except Exception:
            pass
    top_roles = {}
    async for c in db.companies.find({}, {"role": 1, "_id": 0}):
        r = (c.get("role") or "").split(",")[0].strip()[:40]
        if r:
            top_roles[r] = top_roles.get(r, 0) + 1
    top_roles_sorted = sorted(top_roles.items(), key=lambda x: -x[1])[:6]
    return {
        "total_companies": total,
        "avg_ctc_lpa": round(sum(ctc_values) / len(ctc_values), 2) if ctc_values else 0,
        "max_ctc_lpa": round(max(ctc_values), 2) if ctc_values else 0,
        "top_roles": [{"role": r, "count": n} for r, n in top_roles_sorted],
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    if not gemini or not gemini.ready:
        raise HTTPException(503, "GEMINI_API_KEY is not configured. Please set it in backend/.env")

    # Embed the question and retrieve top-k
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

    # Grounding threshold - be strict to avoid hallucination
    grounded = len(top) > 0 and top[0]["score"] >= 0.35

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
        )

    context = "\n\n".join(
        f"[Doc {i+1} | source={h['source']} | similarity={h['score']:.2f}]\n{h['text']}"
        for i, h in enumerate(top)
    )
    system = (
        "You are the Campus AI Placement Assistant for engineering college students in India. "
        "Answer ONLY using the retrieved context below. Do NOT invent companies, salaries, "
        "eligibility criteria, or dates. If the context does not contain the answer, reply "
        "exactly: 'I don't have that information in the placement database.' "
        "When you cite facts, add a small tag like [Doc N] pointing to the source. "
        "Keep answers concise, structured with bullet points, and free of markdown headers."
    )
    prompt = f"CONTEXT:\n{context}\n\nSTUDENT QUESTION:\n{body.question}\n\nGrounded answer:"
    answer = await gemini.generate(system=system, prompt=prompt, temperature=0.15, max_tokens=700)

    return ChatResponse(
        answer=answer,
        sources=[{"source": h["source"], "score": round(h["score"], 3), "company": h["company"]} for h in top[:5]],
        grounded=True,
        session_id=body.session_id or str(uuid.uuid4()),
    )


@app.post("/api/resume/parse")
async def resume_parse(file: UploadFile = File(...)):
    content = await file.read()
    text = parse_resume(file.filename, content)
    return {"filename": file.filename, "text": text, "chars": len(text)}


@app.post("/api/gap-analysis", response_model=GapAnalysisResponse)
async def gap_analysis(
    resume_text: str = Form(...),
    job_description: str = Form(...),
):
    if not gemini or not gemini.ready:
        raise HTTPException(503, "GEMINI_API_KEY is not configured.")
    if len(resume_text) < 40:
        raise HTTPException(400, "Resume text is too short.")
    if len(job_description) < 20:
        raise HTTPException(400, "Job description is too short.")

    system = (
        "You are a strict, grounded resume analysis engine. You will receive a candidate's "
        "resume text and a target job description. Extract skills, tools, and requirements "
        "ONLY as they appear in the two texts. Never fabricate skills that are not present. "
        "Return STRICT JSON matching this schema:\n"
        "{\n"
        '  "match_score": integer 0-100 (how well the resume aligns with the JD),\n'
        '  "matched_skills": [ short skill strings that appear in BOTH resume and JD ],\n'
        '  "missing_skills": [ skills or requirements found in JD but NOT in resume ],\n'
        '  "improvements": [ 3-5 concrete, actionable suggestions to close the gap ],\n'
        '  "summary": "2-3 sentence honest assessment"\n'
        "}\n"
        "If the resume is empty or unreadable, return match_score=0 and say so in summary. "
        "Do NOT wrap the JSON in markdown code fences."
    )
    prompt = (
        f"===== RESUME =====\n{resume_text[:8000]}\n\n"
        f"===== JOB DESCRIPTION =====\n{job_description[:6000]}\n\n"
        f"Return ONLY the JSON."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.1, max_tokens=900)
    data = _safe_json(raw)
    return GapAnalysisResponse(
        match_score=int(data.get("match_score", 0)),
        matched_skills=list(data.get("matched_skills", []))[:20],
        missing_skills=list(data.get("missing_skills", []))[:20],
        improvements=list(data.get("improvements", []))[:6],
        summary=str(data.get("summary", "")),
    )


@app.post("/api/interview-prep", response_model=InterviewPrepResponse)
async def interview_prep(body: InterviewPrepRequest):
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
    prompt = (
        f"Job description:\n{body.job_description[:5000]}\n\n"
        f"Candidate's known skill gaps: {missing}\n\n"
        f"Generate about {body.num_questions} questions total."
    )
    raw = await gemini.generate(system=system, prompt=prompt, temperature=0.3, max_tokens=1400)
    data = _safe_json(raw)
    return InterviewPrepResponse(
        technical=list(data.get("technical", []))[: body.num_questions],
        behavioral=list(data.get("behavioral", []))[: body.num_questions],
    )


def _safe_json(raw: str) -> dict:
    """Strip code fences and parse JSON; return {} on failure."""
    txt = raw.strip()
    if txt.startswith("```"):
        # remove first line and last ```
        txt = "\n".join(txt.split("\n")[1:])
        if txt.rstrip().endswith("```"):
            txt = txt.rstrip()[:-3]
    try:
        return json.loads(txt)
    except Exception:
        # try to locate first { .. last }
        try:
            i = txt.index("{")
            j = txt.rindex("}")
            return json.loads(txt[i : j + 1])
        except Exception:
            return {}
