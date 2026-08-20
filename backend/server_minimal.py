"""
Minimal FastAPI test for Vercel deployment debugging
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/api/health")
async def health():
    return {"ok": True, "msg": "minimal works"}

@app.get("/api/test")
async def test():
    try:
        import motor
        import pydantic
        import google.genai
        return {"ok": True, "imports": "ok"}
    except Exception as e:
        import traceback
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()}