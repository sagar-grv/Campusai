"""
Campus AI - FastAPI backend
- College Query Assistant (RAG, grounded on placement DB)
- Resume vs JD Gap Analysis
- Interview Prep generator
"""
# Wrap everything in try/except to catch any module-level errors
try:
    import os
    import io
    import json
    import uuid
    import asyncio
    import secrets
    import time
    import re
    import traceback
    from pathlib import Path
    from contextlib import asynccontextmanager
    from datetime import datetime, timezone
    from typing import List, Optional

    _import_error = None
    try:
        from dotenv import load_dotenv
        from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Depends
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import StreamingResponse, Response
        from motor.motor_asyncio import AsyncIOMotorClient
        from pydantic import BaseModel, Field

        from gemini_client import GeminiClient, EMBED_DIM
        from security import (
            rate_limiter,
            check_prompt_injection,
            check_domain_scope,
            sanitize_log_message,
            STRICT_SYSTEM_GUARDRAILS,
            PER_ENDPOINT_LIMITS,
        )
        from data.emergent_seed import load_emergent_seed, SEED_VERSION
        from data.branches import normalize_branches, matches_allowed, canonical_for_tags
        from rag import (
            tokenize,
            score_company,
            cgpa_min_from_string,
            retrieve_relevant,
            query_asks_about_backlogs,
            allows_backlogs,
        )
    except Exception as e:
        _import_error = f"Import error: {e}\n{traceback.format_exc()}"

    ROOT = Path(__file__).parent
    try:
        load_dotenv(ROOT / ".env")
    except Exception:
        pass

except Exception as e:
    _import_error = f"Module init error: {e}\n{traceback.format_exc()}"

# If we get here with an import error, define minimal FastAPI for health endpoint
if '_import_error' in globals() and _import_error:
    from fastapi import FastAPI
    app = FastAPI()
    @app.get("/api/health")
    async def health():
        return {"ok": False, "error": "Module init failed", "detail": _import_error}
else:
    # Normal module body continues here...
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME = os.environ.get("DB_NAME", "campus_ai")
    CORS = os.environ.get("CORS_ORIGINS", "*")
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "change_me")
    ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "change_me_to_a_long_random_string")

    mongo: Optional[AsyncIOMotorClient] = None
    db = None
    gemini: Optional[GeminiClient] = None
    DB_MODE = "mock"
    _embed_mutex = asyncio.Lock()

    # Redis client (Upstash serverless) - disabled, using in-memory cache
    _redis_available = False
    CACHE_TTL = 300  # 5 minutes
    _cache_store = {}  # key -> (value, expiry_timestamp)


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
        import numpy as np
        va = np.asarray(a, dtype=np.float32)
        vb = np.asarray(b, dtype=np.float32)
        return float(np.dot(va, vb))  # both unit-normalised upstream