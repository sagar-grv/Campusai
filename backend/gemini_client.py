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
        batch_size = 20
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            def _call(b_texts):
                # Call per text or batch if supported
                res_list = []
                for t in b_texts:
                    e = self._client.models.embed_content(
                        model=self.embed_model,
                        contents=t,
                        config=types.EmbedContentConfig(
                            task_type=task_type,
                            output_dimensionality=self.embed_dim,
                        ),
                    )
"""Thin async wrapper around google-genai for chat + embeddings."""
import os
import json
import asyncio
import urllib.request
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

        self.nv_key = os.environ.get("NVIDIA_API_KEY", "").strip()
        self.nv_model = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct").strip()

        if self.api_key and not self.api_key.startswith("PASTE"):
            try:
                from google import genai  # noqa
                self._client = genai.Client(api_key=self.api_key)
                self.ready = True
            except Exception as e:
                print(f"[gemini] init failed: {e}")
                self.ready = False

        if self.nv_key:
            self.ready = True

    async def embed_many(self, texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[List[float]]:
        if not self.ready:
            raise RuntimeError("Gemini client not ready. Set GEMINI_API_KEY in backend/.env")
        from google.genai import types
        results: List[List[float]] = []
        batch_size = 20
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            def _call(b_texts):
                # Call per text or batch if supported
                res_list = []
                for t in b_texts:
                    e = self._client.models.embed_content(
                        model=self.embed_model,
                        contents=t,
                        config=types.EmbedContentConfig(
                            task_type=task_type,
                            output_dimensionality=self.embed_dim,
                        ),
                    )
                    res_list.append(_normalize(list(e.embeddings[0].values)))
                return res_list
            res = await asyncio.to_thread(_call, batch)
            results.extend(res)
        return results

    async def generate(self, system: str, prompt: str, temperature: float = 0.2, max_tokens: int = 800) -> str:
        if not self.ready and not self.nv_key:
            raise RuntimeError("Neither Gemini nor NVIDIA API key is configured in backend/.env")

        last_error = None
        if self._client:
            from google.genai import types

            fallback_models = [
                self.chat_model,
                "gemini-2.5-flash",
                "gemini-1.5-flash",
                "gemini-1.5-pro",
                "gemini-2.5-pro",
            ]
            models_to_try = []
            for m in fallback_models:
                if m and m not in models_to_try:
                    models_to_try.append(m)

            for model_name in models_to_try:
                try:
                    def _call(m_name):
                        return self._client.models.generate_content(
                            model=m_name,
                            contents=prompt,
                            config=types.GenerateContentConfig(
                                system_instruction=system,
                                temperature=temperature,
                                max_output_tokens=max_tokens,
                            ),
                        )
                    res = await asyncio.to_thread(_call, model_name)
                    return (res.text or "").strip()
                except Exception as e:
                    last_error = e
                    err_msg = str(e).lower()
                    if "resource_exhausted" in err_msg or "quota" in err_msg or "429" in err_msg or "404" in err_msg or "not_found" in err_msg:
                        print(f"[gemini] Quota or availability issue for {model_name}, trying fallback model...")
                        continue
                    else:
                        print(f"[gemini] Error generation with {model_name}: {e}")
                        break

        print(f"[gemini] All Gemini models failed/rate-limited ({last_error}). Attempting NVIDIA API fallback...")

        # NVIDIA API Fallback
        nv_key = os.environ.get("NVIDIA_API_KEY", "").strip()
        nv_model = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct").strip()
        if nv_key:
            try:
                import urllib.request
                url = "https://integrate.api.nvidia.com/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {nv_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }
                body = {
                    "model": nv_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }

                def _call_nvidia():
                    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers)
                    res = urllib.request.urlopen(req, timeout=45)
                    data = json.loads(res.read())
                    return data["choices"][0]["message"]["content"]

                nv_response = await asyncio.to_thread(_call_nvidia)
                if nv_response:
                    print(f"[nvidia-fallback] Successfully generated response using NVIDIA NIM API ({nv_model})")
                    return nv_response.strip()
            except Exception as nv_err:
                print(f"[nvidia-fallback] NVIDIA API call failed: {nv_err}")

        return f"Fallback response: Unable to reach AI models due to API rate limits ({last_error})".strip()
