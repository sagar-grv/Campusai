"""Regression harness: guarantee the placement DB never silently re-gains wrong data.

The emergent dataset (backend/data/emergent_*.json, loaded via
backend/data/emergent_seed.py) is the source of truth and what the server
auto-seeds. It was built from the provided 2025 extraction (139 records) and the
emergent seed_data COMPANIES list for 2023-24 (39 records), mapped to the local
record schema and validated.

This harness gates on deterministic facts:
  1. Seed integrity    - counts per batch, ctc range, no blank companies.
  2. Ground truths     - regression-proof values (Winjit 9.3, JTP 24.0, batch
                         highest/lowest).
  3. Parser coverage   - re-parsing the known PDFs still extracts ~all records.
  4. No ghost value    - no record in the seed carries a CTC number that only
                         exists in the corrupted text layer (e.g. 30 for Winjit).

Usage (from repo root):
    python scripts/verify_db.py
Exit code 0 = pass, 1 = fail (would block ingestion / flag the deployment).
"""
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND)

from ingest.parser import parse_placement_pdf  # noqa: E402
from data.emergent_seed import load_emergent_seed  # noqa: E402

PDFS = [
    ("Company Database for 2025 batch.pdf",
     os.path.join(os.path.dirname(BACKEND), "..", "context", "Company Database for 2025 batch.pdf")),
    ("Company Database 2023-24.pdf",
     os.path.join(os.path.dirname(BACKEND), "..", "context", "Company Database 2023-24.pdf")),
]

EXPECTED_COUNTS = {"2025": 138, "2023-24": 39}

# (batch, company substring) -> authoritative numeric LPA from the emergent seed.
GROUND_TRUTHS = {
    ("2025", "winjit"): 9.3,
    ("2025", "jtp"): 24.0,          # batch highest
    ("2025", "tcs"): 3.36,          # batch lowest
    ("2025", "ion group"): 17.3,
    ("2025", "mondelez"): 15.4,
    ("2023-24", "goldman"): 23.5,   # batch highest
    ("2023-24", "oracle"): 22.5,
    ("2023-24", "zs associates"): 13.66,
    ("2023-24", "falkonry"): 10.02,
    ("2023-24", "incedo"): 7.55,
    ("2023-24", "tcs"): 3.36,       # batch lowest
}

# These (batch, ctc_lpa) combos would indicate the corrupted-text number leaked into
# the seed (proof the right dataset is loaded). The canonical ghost value from the
# corruption bug is 30.0 for Winjit (raw text reads "receivabl9e. 30 LPA").
FORBIDDEN_CTCS = {
    ("2025", 30.0),
}


def main() -> int:
    seed = load_emergent_seed()
    failures = []

    # ---- 1. Seed integrity ----
    counts = {}
    for r in seed:
        counts[r["batch"]] = counts.get(r["batch"], 0) + 1
    print("seed counts:", counts)
    for batch, want in EXPECTED_COUNTS.items():
        if counts.get(batch) != want:
            failures.append(f"seed count {batch} = {counts.get(batch)}, expected {want}")

    all_good_ctc = all(r.get("ctc_lpa") is None or 0 < r["ctc_lpa"] <= 60 for r in seed)
    if not all_good_ctc:
        failures.append(f"seed contains ctc_lpa outside (0, 60]: "
                        f"{[r['company'] for r in seed if r.get('ctc_lpa') is not None and not (0 < r['ctc_lpa'] <= 60)]}")
    blank = [r for r in seed if not (r.get("company") or "").strip()]
    if blank:
        failures.append(f"seed contains blank company names: {len(blank)}")

    # ---- 2. Ground truths ----
    for (batch, sub), want in GROUND_TRUTHS.items():
        vals = [r["ctc_lpa"] for r in seed if r["batch"] == batch and sub in (r["company"] or "").lower()]
        if not vals:
            failures.append(f"ground-truth company '{sub}' ({batch}) missing from seed")
        elif vals[0] is None or abs((vals[0] or 0) - want) > 1e-9:
            failures.append(f"ground-truth {sub} ({batch}) = {vals[0]}, expected {want}")

    # ---- 3. Parser coverage ----
    for fname, pdf in PDFS:
        if not os.path.exists(pdf):
            print(f"SKIP missing PDF: {pdf}")
            continue
        res = parse_placement_pdf(pdf, source_file_name=fname)
        n = res["parsed_count"]
        print(f"parser: {fname} -> {n} records (sr_max={res['expected_sr_max']})")
        want = EXPECTED_COUNTS.get("2025" if "2025" in fname else "2023-24", 39)
        if n < want * 0.9:
            failures.append(f"{fname}: parser coverage collapsed to {n}/{want}")

    # ---- 4. Forbidden ghost CTCs in seed ----
    for r in seed:
        if (r["batch"], r.get("ctc_lpa")) in FORBIDDEN_CTCS:
            failures.append(f"seed carries corrupted-text CTC {r.get('ctc_lpa')} for {r['company']} ({r['batch']})")

    print()
    if failures:
        print("FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("PASS — seed integrity verified, ground truths hold, parser coverage stable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
