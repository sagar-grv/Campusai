"""Verified placement seed loader.

Loads the canonical verified company records from the bundled JSON files,
injecting a real `id` (uuid4) and a UTC `created_at` timestamp per record.
Nothing else is added or modified.
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

SEED_VERSION = "verified-v2"

_DATA_DIR = Path(__file__).resolve().parent
_JSON_FILES = ("verified_2025.json", "verified_2023_24.json")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_verified_seed() -> list[dict]:
    records = []
    for name in _JSON_FILES:
        with open(_DATA_DIR / name, encoding="utf-8") as f:
            data = json.load(f)
        for rec in data:
            rec = dict(rec)
            rec["id"] = str(uuid.uuid4())
            rec["created_at"] = _now_iso()
            records.append(rec)
    return records