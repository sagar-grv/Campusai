"""Emergent-style RAG retrieval core ported to the local placement schema.

Importable standalone (stdlib + data.branches only). Ports the emergent
scoring/retrieval approach with fixes: ctc/ctc_lpa included in the scoring
hay, word-boundary token matching, CGPA-vs-percentage cutoff parsing,
backlog-policy awareness, and branch-aware matching.
"""
import re

from data.branches import normalize_branches, matches_allowed, canonical_for_tags

STOP = {"the", "a", "an", "is", "are", "of", "for", "and", "or", "in", "on",
        "to", "with", "what", "which", "who", "how", "me", "i", "my", "do",
        "does", "can", "should", "list", "show", "tell", "give"}

_NUM = r"[0-9]+(?:\.[0-9]+)?"
_CGPA_AFTER = re.compile(
    r"cgi?p[ai]\s*(?:(?:of|is|be|being|above|onwards|minimum|at|least|and|or|"
    r"higher|more|greater|than|around|about|not|less|equal|upto|up|to|with)\s+)*"
    r"[-:]?\s*(" + _NUM + r")", re.IGNORECASE)
_CGPA_BEFORE = re.compile(r"(" + _NUM + r")\s*(?:bt)?cgi?p[ai]", re.IGNORECASE)
_PCT = re.compile(r"(" + _NUM + r")\s*%")

_BACKLOG_MARKERS = ("backlog", "kt", "atkt", "arrear", "reappear")
_NEG = [
    re.compile(r"\bno\s+(?:active|live|current|open|pending|standing|existing|dead)?\s*(?:backlogs?|kts?|atkts?)\b"),
    re.compile(r"\bno\s+dead\s+or\s+live\s+(?:backlogs?|kts?)\b"),
    re.compile(r"(?:backlogs?|kts?|atkts?)\b[^.\n]*\bnot\s+(?:allowed|eligible|considered|permitted|accept(?:ed)?|taken)\b"),
    re.compile(r"(?:backlogs?|kts?|atkts?)\b[^.\n]*(?:will|shall|would|is|are|do|does|has|have)\s+not\b"),
    re.compile(r"(?:backlogs?|kts?|atkts?)\b[^.\n]*(?:won'?t|shalln'?t|shouldn'?t|isn'?t|aren'?t)\b"),
    re.compile(r"\bwithout\s+(?:any\s+)?(?:backlogs?|kts?|atkts?)\b"),
]


def tokenize(text):
    return [t for t in re.findall(r"[a-z0-9\.]+", (text or "").lower())
            if t not in STOP and len(t) > 1]


def score_company(qt, c):
    if not qt or not isinstance(c, dict):
        return 0
    name = str(c.get("company") or "").lower()
    lpa = c.get("ctc_lpa")
    hay = " ".join([
        name,
        str(c.get("role") or ""),
        str(c.get("branches") or ""),
        str(c.get("branches_canonical") or ""),
        str(c.get("cgpa") or ""),
        str(c.get("eligibility") or ""),
        str(c.get("notes") or ""),
        str(c.get("batch") or ""),
        str(c.get("ctc") or ""),
        str(lpa) if lpa is not None else "",
    ]).lower()
    name_tokens = set(re.findall(r"[a-z0-9\.]+", name))
    hay_tokens = set(re.findall(r"[a-z0-9\.]+", hay))
    for tok in list(hay_tokens):
        if "." in tok and tok.replace(".", "").isdigit():
            hay_tokens.add(tok.split(".")[0])
    s = 0
    for t in qt:
        if t in hay_tokens:
            s += 2 if t in name_tokens else 1
    return s


def cgpa_min_from_string(s):
    if not s:
        return 0.0
    text = str(s)
    vals = []
    for m in _CGPA_AFTER.finditer(text):
        vals.append(float(m.group(1)))
    for m in _CGPA_BEFORE.finditer(text):
        vals.append(float(m.group(1)))
    vals = [v for v in vals if 0 < v <= 10]
    if vals:
        return min(vals)
    pcts = [float(m.group(1)) for m in _PCT.finditer(text)]
    if pcts:
        return max(pcts) / 10.0
    return 0.0


def query_asks_about_backlogs(question):
    for t in tokenize(question):
        for marker in _BACKLOG_MARKERS:
            if marker in t:
                return True
    return False


def allows_backlogs(c):
    if not isinstance(c, dict):
        return True
    text = " ".join([str(c.get("eligibility") or ""),
                     str(c.get("cgpa") or "")]).lower()
    if not text.strip():
        return True
    return not any(p.search(text) for p in _NEG)


def _lpa(c):
    try:
        v = c.get("ctc_lpa")
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def retrieve_relevant(records, question, top_k=8, fallback_n=6, user_branch=None):
    records = [r for r in (records or []) if isinstance(r, dict)]
    qt = tokenize(question)
    candidates = records
    backlog_query = False
    if query_asks_about_backlogs(question):
        backlog_query = True
        allowed = [c for c in records if allows_backlogs(c)]
        if allowed:
            candidates = allowed
    user_canon = canonical_for_tags([user_branch]) if user_branch else []
    scored = []
    for c in candidates:
        s = score_company(qt, c)
        if user_branch and user_canon:
            bc = c.get("branches_canonical") or normalize_branches(c.get("branches") or "")
            if matches_allowed(bc, user_canon):
                s += 3
            else:
                s -= 2
        scored.append((s, c))
    ranked = sorted((x for x in scored if x[0] > 0),
                    key=lambda p: p[0], reverse=True)
    matched = [c for s, c in ranked][:top_k]
    if backlog_query and candidates and not matched:
        # Companies that allow backlogs rarely mention "backlog" in their text, so
        # the query words won't tokenize onto them. The allowed set is the answer:
        # surface it (ordered by score, then CTC) instead of returning nothing.
        ranked = sorted(scored, key=lambda p: (p[0], _lpa(p[1])), reverse=True)
        matched = [c for s, c in ranked][:top_k]
    fallback = []
    if not matched:
        fallback = sorted(records, key=_lpa, reverse=True)[:fallback_n]
    return matched, fallback, bool(matched)
