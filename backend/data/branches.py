"""Branch normalization for the PlaceOS placement app."""

CANONICAL_TAGS = (
    "CS",
    "IT",
    "EXTC",
    "MECH",
    "CIVIL",
    "MCA",
    "AI",
    "DS",
    "CSBS",
    "CYBER",
    "CSDS",
    "MXTC",
    "CHEMICAL",
    "INSTRUMENTATION",
    "METALLURGICAL",
    "FIRE",
    "TEXTILE",
    "MSC",
)

BRANCH_OPTIONS = ["", "CS", "IT", "EXTC", "MECH", "CIVIL", "MCA", "AI", "DS", "CSBS"]

BRANCH_ALIASES = {
    "CS": ["CS", "CE", "CSE", "COMPUTER", "COMPUTERS", "COMPUTER SCIENCE", "COMPUTER SCIENCE ENGINEERING", "COMPUTER ENGINEERING", "COMPUTER ENGG", "COMPUTER SCI"],
    "IT": ["IT", "INFORMATION", "INFORMATION TECHNOLOGY"],
    "EXTC": ["EXTC", "ECE", "ELECTRONICS", "ELECTRICAL", "TELECOMMUNICATION", "TELECOM", "E&TC", "ELECTRONICS AND TELECOMMUNICATION"],
    "MECH": ["MECH", "MECHANICAL"],
    "MXTC": ["MECHATRONICS", "MXTC", "MXT", "ME"],
    "CIVIL": ["CIVIL"],
    "MCA": ["MCA"],
    "AI": ["AI", "ARTIFICIAL", "ARTIFICIAL INTELLIGENCE"],
    "DS": ["DS", "DATA SCIENCE", "DATA ANALYTICS"],
    "CSBS": ["CSBS", "CSB", "BUSINESS"],
    "CSDS": ["CSDS", "CSE-DS"],
    "CYBER": ["CYBER", "SECURITY", "CYBER SECURITY"],
    "CHEMICAL": ["CHEMICAL"],
    "INSTRUMENTATION": ["INSTRUMENTATION"],
    "METALLURGICAL": ["METALLURGICAL"],
    "FIRE": ["FIRE"],
    "TEXTILE": ["TEXTILE"],
    "MSC": ["MSC"],
}

_SEPS = set(" \t\r\n,;/&()[]-|+.:;*")

_PHRASES = []
_TOKENS = {}

for _canon, _aliases in BRANCH_ALIASES.items():
    for _alias in _aliases:
        _a = _alias.upper()
        if any(ch in _SEPS for ch in _a):
            _PHRASES.append((_a, _canon))
        else:
            _TOKENS[_a] = _canon
_PHRASES.sort(key=lambda p: len(p[0]), reverse=True)
del _canon, _aliases, _alias, _a


def _upper(value):
    if value is None:
        return ""
    return str(value).upper()


def normalize_branches(branches):
    """Return canonical comma-separated branch tags for a company string."""
    s = _upper(branches).strip()
    if not s:
        return ""

    import re
    m = re.search(r"\bEXCEPT\b", s)
    if m:
        tail = _scan(s[m.end():])
        return "ALL EXCEPT " + ",".join(tail) if tail else "ALL"
    if re.search(r"\bONLY\b", s):
        tail = _scan(re.sub(r"\bONLY\b", " ", s))
        return ",".join(_dedupe(tail))
    if re.search(r"\bALL\b", s):
        return "ALL"

    return ",".join(_scan(s))


def _dedupe(items):
    seen = set()
    result = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _scan(s):
    out = []
    seen = set()
    i = 0
    n = len(s)
    while i < n:
        if s[i] in _SEPS:
            i += 1
            continue
        matched = False
        for phrase, canon in _PHRASES:
            if s.startswith(phrase, i) and (i + len(phrase) == n or s[i + len(phrase)] in _SEPS):
                if canon not in seen:
                    seen.add(canon)
                    out.append(canon)
                i += len(phrase)
                matched = True
                break
        if matched:
            continue
        j = i
        while j < n and s[j] not in _SEPS:
            j += 1
        canon = _TOKENS.get(s[i:j])
        if canon is not None and canon not in seen:
            seen.add(canon)
            out.append(canon)
        i = j
    return out


def canonical_for_tags(tags):
    """Map app query tags through BRANCH_ALIASES to canonical tags."""
    result = []
    if not tags:
        return result
    for tag in tags:
        if not tag:
            continue
        t = str(tag).strip().upper()
        if not t:
            continue
        if t in _TOKENS:
            result.append(_TOKENS[t])
        elif t in CANONICAL_TAGS:
            result.append(t)
        elif any(ch not in _SEPS for ch in t):
            result.append(t)
    return result


def matches_allowed(company_branches_canonical, user_canonical_tags):
    """Return True if a company's canonical branches allow the user's tags."""
    company = (company_branches_canonical or "").strip().upper()
    user = canonical_for_tags(user_canonical_tags)
    if company in ("", "ALL"):
        return True
    if company.startswith("ALL EXCEPT "):
        excluded = set(company[len("ALL EXCEPT "):].split(","))
        return not any(tag in excluded for tag in user)
    allowed = set(company.split(","))
    return any(tag in allowed for tag in user)