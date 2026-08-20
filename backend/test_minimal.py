"""
Minimal FastAPI test for Vercel deployment debugging
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/api/health")
async def health():
    return JSONResponse({"ok": True, "msg": "minimal works"})

@app.get("/api/test")
async def test():
    try:
        import numpy
        import pypdf
        import pdfplumber
        return JSONResponse({"ok": True, "imports": "ok"})
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)