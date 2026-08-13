"""
Deterministic pdfplumber-based parser for company placement PDFs.

Expected 8-column table layout (order varies slightly between the
2023-24 and 2025 source files; column roles are detected from the
header row, so the parser stays robust to both):

  [SR.NO, COMPANY NAME, <date/process>, <selection/round>,
   ELIGIBLE PROGRAMS & BRANCHES, ACADEMIC CRITERIA, DESIGNATION, CTC]

Continuation rows (blank SR.NO and/or blank company) belong to the
previous numbered record and are merged in. Only a numeric SR.NO
starts a new record.

The module is importable both from the backend/ root (uvicorn) and
as a standalone Vercel function (stdlib + pdfplumber only).
"""
import io
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union

import pdfplumber

ROLES = ("company", "date", "process", "branches", "criteria",
         "designation", "ctc_detail", "ctc")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_cell(cell) -> str:
    """Normalise a raw table cell into plain, single-line text."""
    if cell is None:
        return ""
    text = str(cell).replace("\n", " ")
    text = re.sub(r"[\u2022\u2219\u00b7\uf071\uf0a7\u25cf]\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -|•")
    text = re.sub(r"\s+", " ", text).strip()
    if text in ("", "-"):
        return ""
    return text


def _extract_cgpa(text) -> Optional[float]:
    if not text:
        return None
    m = re.search(r"(?:cgpa|cgpi)\s*(?:of|[-:\u2010-\u2015])?\s*([2-9]\.\d{1,2})", text, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


def _ctc_to_lpa(text) -> Optional[float]:
    """Best-effort conversion of a raw CTC string to LPA (max numeric)."""
    if not text:
        return None
    # strip thousands separators so `75,000 INR / month` -> 75000, not `75`
    nums = [float(m) for m in re.findall(r"\d+(?:\.\d+)?", str(text).replace(",", ""))]
    if not nums:
        return None
    low = str(text).lower()

    # A monthly-stipend context (stipend / pm / per month / monthly). If a
    # full rupee CTC (>=1L) is present it wins; otherwise annualize the
    # biggest monthly figure, preferring an explicit LPA value if given.
    if any(k in low for k in ("pm", "/month", "per month", "monthly", "stipend")):
        full = [n for n in nums if 100000 <= n <= 20000000]
        if full:
            return round(max(full) / 100000.0, 2)
        monthlies = [n for n in nums if 5000 <= n <= 300000]
        if monthlies:
            annual = round(max(monthlies) * 12 / 100000.0, 2)
            explicit = [n for n in nums if n <= 500 and n not in monthlies]
            return max([annual] + explicit) if explicit else annual

    # Full rupee CTC figures (e.g. "8,50,000 (Fixed CTC)" -> 8.5 LPA).
    full = [n for n in nums if 100000 <= n <= 20000000]
    if full:
        return round(max(full) / 100000.0, 2)

    small = [n for n in nums if n <= 5000]
    return max(small) if small else None


def _role_for_header(text: str) -> Optional[str]:
    hl = (text or "").lower()
    if not hl:
        return None
    if "sr" in hl and "no" in hl:
        return "sr"
    if "company" in hl:
        return "company"
    if "date" in hl:
        return "date"
    if "branches" in hl or "programs" in hl:
        return "branches"
    if "selection" in hl or "round" in hl or "process" in hl:
        return "process"
    if "criteria" in hl or "academic" in hl:
        return "criteria"
    if "designation" in hl or "role" in hl:
        return "designation"
    if "ctc" in hl and "details" in hl:
        return "ctc_detail"
    if "ctc" in hl or "package" in hl:
        return "ctc"
    return None


def _is_main_header(row) -> bool:
    joined = " ".join((str(c) or "").strip() for c in row if c).lower()
    return ("sr" in joined[:20] and "no" in joined[:30]) or "company name" in joined


def _build_roles(header_row, sub_row=None) -> Dict[int, str]:
    roles: Dict[int, str] = {}
    for i in range(8):
        parts = []
        if i < len(header_row) and header_row[i]:
            parts.append(str(header_row[i]))
        if sub_row and i < len(sub_row) and sub_row[i]:
            parts.append(str(sub_row[i]))
        role = _role_for_header(" ".join(parts))
        if role and role not in roles.values():
            roles[i] = role
    if "sr" not in roles.values():
        roles[0] = "sr"
    return roles


def _sniff_batch(source_file: str) -> str:
    if "2023" in source_file:
        return "2023-24"
    if "2025" in source_file:
        return "2025"
    return "Other"


def _detect_mode(company: str) -> str:
    low = (company or "").lower()
    if re.search(r"i\s*\+\s*po", low) or "(internship" in low or "internship + po" in low:
        return "internship + po"
    return "on-campus"


def _build_company_lookup(page) -> Dict[int, str]:
    """Recover company names that pdfplumber's table extraction may drop.

    The table cell for the company column occasionally comes back empty even
    though the words are present in the text layer (e.g. rows 131 / 139 of the
    2025 file). We rebuild the mapping from the SR.NO x-position and the words
    sitting to its right in the same text line, before the next column starts.
    """
    words = page.extract_words() or []
    if not words:
        return {}

    srs = [w for w in words if re.fullmatch(r"\d+", w["text"])]
    if not srs:
        return {}

    min_top = min(w["top"] for w in words)

    def row_key(w):
        return round((w["top"] - min_top) / 6.0)

    rows: Dict[int, List[dict]] = {}
    for w in words:
        rows.setdefault(row_key(w), []).append(w)

    # Company column right edge, taken from the header: the first header word
    # after the "COMPANY NAME" cell that starts a new column (x gap > 15).
    company_end_x: Optional[float] = None
    hdr: List[dict] = []
    for w in words:
        if str(w["text"]).upper() == "COMPANY":
            hdr = rows.get(row_key(w), [])
            break
    if not hdr:
        hdr = rows.get(row_key(words[0]), [])
    hdr = sorted(hdr, key=lambda w: w["x0"])
    comp_idx = next((i for i, w in enumerate(hdr) if "company" in w["text"].lower()), None)
    if comp_idx is not None:
        prev_x1 = max(w["x1"] for w in hdr[:comp_idx + 1])
        for w in hdr[comp_idx + 1:]:
            if w["x0"] - prev_x1 > 15.0:
                company_end_x = w["x0"]
                break
            prev_x1 = max(prev_x1, w["x1"])

    lookup: Dict[int, str] = {}
    for row in rows.values():
        row.sort(key=lambda w: w["x0"])
        if not row:
            continue
        sr_word = row[0]
        m = re.fullmatch(r"\d+", sr_word["text"])
        if not m or sr_word["x0"] > 45:
            continue
        srn = int(sr_word["text"])
        sr_end = sr_word["x1"]
        collected = []
        for w in row[1:]:
            if w["x0"] < sr_end - 1.0:
                continue
            if company_end_x is not None and w["x0"] >= company_end_x:
                break
            collected.append(w["text"])
        name = " ".join(collected).strip()
        name = re.sub(r"[>\u25b8\u203a|]\s*$", "", name).strip()
        if name:
            lookup[srn] = name
    return lookup


def _new_record(srn: int, cells: List[str], roles: Dict[int, str]) -> dict:
    rec: dict = {"sr": srn}
    for role in ROLES:
        rec[role] = []
    for i, cell in enumerate(cells):
        role = roles.get(i)
        if role and role != "sr" and cell:
            rec[role].append(cell)
    return rec


def _merge_continuation(rec: dict, cells: List[str], roles: Dict[int, str]) -> None:
    for i, cell in enumerate(cells):
        role = roles.get(i)
        if role and role != "sr" and cell:
            rec[role].append(cell)


def _finalize(rec: dict, source_file: str, batch_override: str) -> Optional[dict]:
    fields = {r: " | ".join(dict.fromkeys(v for v in rec[r] if v)) for r in ROLES}

    company = fields.get("company") or ""
    role = fields.get("designation") or ""
    eligibility = fields.get("criteria") or ""
    branches = fields.get("branches") or ""
    notes = fields.get("process") or ""
    date = fields.get("date") or ""
    ctc_primary = fields.get("ctc") or ""
    ctc_detail = fields.get("ctc_detail") or ""

    ctc_lpa = _ctc_to_lpa(ctc_primary)
    if ctc_lpa is None and ctc_detail:
        ctc_lpa = _ctc_to_lpa(f"{ctc_detail} | {ctc_primary}".strip(" |"))
    if ctc_primary and ctc_lpa is not None:
        ctc_raw = ctc_primary
    else:
        ctc_raw = ctc_detail or ctc_primary

    if not any([company, role, ctc_raw, eligibility, branches, notes, date]):
        return None

    batch = (batch_override or "").strip() or _sniff_batch(source_file)

    return {
        "company": company,
        "mode": _detect_mode(company),
        "role": role,
        "ctc": ctc_raw,
        "ctc_lpa": ctc_lpa,
        "eligibility": eligibility,
        "branches": branches,
        "cgpa": _extract_cgpa(eligibility),
        "notes": notes,
        "date": date,
        "batch": batch,
        "source_file": source_file,
        "id": str(uuid.uuid4()),
        "created_at": now_iso(),
    }


def parse_placement_pdf(
    pdf_path_or_file,
    source_file_name: str = "",
    batch_override: str = "",
) -> dict:
    """Parse a placement PDF and return records plus parse statistics."""
    if isinstance(pdf_path_or_file, (str, os.PathLike)):
        source_file = source_file_name or os.path.basename(str(pdf_path_or_file))
        pdf = pdfplumber.open(str(pdf_path_or_file))
    else:
        source_file = source_file_name or "upload.pdf"
        pdf = pdfplumber.open(pdf_path_or_file)

    records: List[dict] = []
    skipped: List[dict] = []
    expected_sr_max = 0
    roles: Dict[int, str] = {}
    pending = None
    company_lookups: List[Dict[int, str]] = []

    try:
        for page_idx, page in enumerate(pdf.pages):
            company_lookups.append(_build_company_lookup(page))
            tables = page.extract_tables() or []

            def finalize_pending() -> None:
                nonlocal pending
                if pending is None:
                    return
                if not pending.get("company"):
                    company = company_lookups[pending["_page"]].get(pending["sr"]) if pending["_page"] < len(company_lookups) else None
                    if company:
                        pending["company"] = [company]
                final = _finalize(pending, source_file, batch_override)
                if final:
                    records.append(final)
                else:
                    skipped.append({"sr": pending["sr"], "reason": "no content"})
                pending = None

            for table in tables:
                if not table:
                    continue
                if not roles:
                    if _is_main_header(table[0]):
                        sub = table[1] if len(table) > 1 else None
                        roles = _build_roles(table[0], sub)
                        rows = table[2:] if len(table) > 1 else table[1:]
                    else:
                        roles = {0: "sr", 1: "company", 2: "date", 3: "process",
                                 4: "branches", 5: "criteria", 6: "designation",
                                 7: "ctc"}
                        rows = table
                else:
                    start = 2 if _is_main_header(table[0]) and len(table) > 1 else (
                        1 if _is_main_header(table[0]) else 0
                    )
                    rows = table[start:]

                for row in rows:
                    cells = [_clean_cell(c) for c in row]
                    sr_text = cells[0] if cells else ""
                    m = re.fullmatch(r"\d+", sr_text)
                    if m:
                        finalize_pending()
                        srn = int(sr_text)
                        expected_sr_max = max(expected_sr_max, srn)
                        pending = _new_record(srn, cells, roles)
                        pending["_page"] = page_idx
                    elif pending is not None:
                        _merge_continuation(pending, cells, roles)
        finalize_pending()
    finally:
        try:
            pdf.close()
        except Exception:
            pass

    parsed_count = len(records)
    if parsed_count < expected_sr_max * 0.6:
        raise ValueError(
            f"Placement PDF parse failed: only {parsed_count}/{expected_sr_max} "
            f"records extracted (max SR.NO {expected_sr_max}). Refusing to store "
            "partial data. Verify the uploaded file is a placement database PDF."
        )

    return {
        "records": records,
        "expected_sr_max": expected_sr_max,
        "parsed_count": parsed_count,
        "skipped": skipped,
        "file": source_file,
    }
