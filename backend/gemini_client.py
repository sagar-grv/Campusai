"""Thin async wrapper around google-genai for chat + embeddings."""
import os
import asyncio
from typing import List, Optional

import numpy as np


EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))


def _normalize(vec: List[float]) -> List[float]:
    a = np.asarray(vec, dtype=np.float32)
    n = float(np.linalg.norm(a))
    if n == 0:
        return a.tolist()
    return (a / n).tolist()


class GeminiClient:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self.chat_model = os.environ.get("CHAT_MODEL", "gemini-2.5-flash")
        self.embed_model = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
        self.embed_dim = EMBED_DIM
        self._client = None
        self.ready = False

        if self.api_key and not self.api_key.startswith("PASTE"):
            try:
                from google import genai  # noqa
                self._client = genai.Client(api_key=self.api_key)
                self.ready = True
            except Exception as e:
                print(f"[gemini] init failed: {e}")
                self.ready = False

    async def embed_many(self, texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[List[float]]:
        if not self.ready:
            raise RuntimeError("Gemini client not ready. Set GEMINI_API_KEY in backend/.env")
        from google.genai import types
        results: List[List[float]] = []
        # google-genai supports batch via contents=[str,...]; call per-text to avoid quota bursts
        for text in texts:
            def _call():
                return self._client.models.embed_content(
                    model=self.embed_model,
                    contents=text,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=self.embed_dim,
                    ),
                )
            res = await asyncio.to_thread(_call)
            emb = res.embeddings[0].values
            results.append(_normalize(list(emb)))
        return results

    async def generate(self, system: str, prompt: str, temperature: float = 0.2, max_tokens: int = 800) -> str:
        if not self.ready:
            raise RuntimeError("Gemini client not ready. Set GEMINI_API_KEY in backend/.env")
        from google.genai import types

        def _call():
            return self._client.models.generate_content(
                model=self.chat_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )
        res = await asyncio.to_thread(_call)
        return (res.text or "").strip()
