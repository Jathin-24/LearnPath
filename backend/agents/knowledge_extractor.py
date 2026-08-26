"""
knowledge_extractor.py

Turns free text (an imported AI-conversation summary, or resume text) into a
list of structured, categorized facts about the learner - the per-user
knowledge base (backend/common/db.py's user_knowledge table). Not a
LangGraph node - called directly from backend/api/main.py's
/context/import and /profile/resume routes, the same way path_b.py and
tutor.py are called directly rather than wired into the graph.

Reliability (per CLAUDE.md): LLM output is validated against
KnowledgeExtractionOutput before touching the database. On parse failure,
retry once with a stricter prompt; on second failure, raise rather than
write malformed data - callers treat this as best-effort and must not let
a failure here break the raw-text save that already succeeded.
"""

import json
import re

from pydantic import BaseModel, Field, ValidationError

from backend.common.llm_client import LLMClient

VALID_CATEGORIES = {
    "goal",
    "skill",
    "interest",
    "learning_style",
    "constraint",
    "personality",
    "other",
}


class KnowledgeEntryOutput(BaseModel):
    category: str
    content: str


class KnowledgeExtractionOutput(BaseModel):
    entries: list[KnowledgeEntryOutput] = Field(default_factory=list)


_PROMPT_TEMPLATE = """Extract distinct, factual statements about a learner from the text \
below, each tagged with one category. Only include what's actually stated - don't infer \
or guess. Split compound statements into separate entries (e.g. "knows Python and SQL" \
becomes two entries).

Valid categories: goal, skill, interest, learning_style, constraint, personality, other.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "entries": [
    {{"category": "skill", "content": "knows Python at an intermediate level"}}
  ]
}}

Text (source: {source}):
{text}
"""


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def extract_knowledge(
    text: str, source: str, llm_client: LLMClient | None = None
) -> list[dict]:
    """Returns a list of {"category", "content", "source"} dicts, ready for
    backend.common.db.add_knowledge_entries. Raises on double parse failure -
    callers must catch and log, not let this break the caller's request."""
    client = llm_client or LLMClient()
    prompt = _PROMPT_TEMPLATE.format(source=source, text=text)

    def attempt(p: str) -> KnowledgeExtractionOutput:
        return KnowledgeExtractionOutput.model_validate(_parse_json(client.complete(p, max_tokens=1200)))

    try:
        output = attempt(prompt)
    except (json.JSONDecodeError, ValidationError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, no commentary."
        output = attempt(stricter)  # let this raise if it fails again - fail loud

    return [
        {
            "category": entry.category if entry.category in VALID_CATEGORIES else "other",
            "content": entry.content,
            "source": source,
        }
        for entry in output.entries
        if entry.content.strip()
    ]


class ResumeProfileOutput(BaseModel):
    """Structured fields pulled from a resume for auto-filling the Profile
    form directly - distinct from extract_knowledge's freeform category/
    content entries above. Every field is optional/empty by default since a
    resume may not state all of them; callers merge non-empty values into
    LearnerProfile rather than overwriting fields the learner already
    entered themselves."""

    name: str | None = None
    email: str | None = None
    age: int | None = None
    gender: str | None = None
    occupation_status: str | None = None  # "student" | "working_professional", or None
    professional_role: str | None = None
    goal: str | None = None
    interests: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    hobbies: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    prior_learning_history: list[str] = Field(default_factory=list)
    extra_info: str | None = None


_RESUME_PROFILE_PROMPT = """Extract the following fields from the resume text below, if \
present. Only include what's actually stated - don't infer or guess (e.g. don't guess \
occupation_status unless the resume clearly indicates a current student or a working \
professional). Leave a field null/empty if it isn't in the text.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "name": "full name or null",
  "email": "email or null",
  "age": null,
  "gender": "gender or null",
  "occupation_status": "student" or "working_professional" or null,
  "professional_role": "current job title, e.g. 'Backend Developer', or null",
  "goal": "a one-sentence career/learning goal if the resume implies one, else null",
  "interests": ["stated interests, if any"],
  "skills": ["technical/professional skills listed"],
  "hobbies": ["hobbies or personal interests outside work, if listed"],
  "certifications": ["certifications, e.g. 'AWS Certified Developer'"],
  "prior_learning_history": ["degrees, courses, or prior training mentioned"],
  "extra_info": "a short paragraph (2-4 sentences) covering anything else notable that \
doesn't fit the fields above - awards, publications, languages spoken, volunteer work, \
open-source contributions, etc. - or null if there's nothing left over"
}}

Resume text:
{text}
"""


def regex_extract_resume_profile(text: str) -> ResumeProfileOutput:
    """Regex / heuristic fallback that extracts basic profile fields from
    resume text without any LLM call. Used when the LLM is unavailable
    (bad keys, rate limits, timeout). Extracts less than the LLM path but
    guarantees the user sees *something* filled in."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    name = None
    email = None
    skills: list[str] = []
    certifications: list[str] = []
    hobbies: list[str] = []
    prior_learning_history: list[str] = []
    professional_role = None
    occupation_status = None
    extra_parts: list[str] = []

    # Email
    m = re.search(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", text)
    if m:
        email = m.group(0)

    # Name: first line that isn't an email, phone, or common header
    _SKIP = re.compile(
        r"(^resume|^cv|^curriculum|^contact|^email|^phone|^address|@|^\d{3}[\-\.\s]?\d{3})",
        re.IGNORECASE,
    )
    for line in lines[:8]:
        if _SKIP.search(line):
            continue
        if len(line.split()) <= 4 and not any(c.isdigit() for c in line):
            name = line
            break

    # Skills line: "Skills: ..." or "Technical Skills: ..."
    _SKILLS_RE = re.compile(
        r"(?:technical\s+)?skills?\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    m = _SKILLS_RE.search(text)
    if m:
        skills = [s.strip() for s in re.split(r"[,;|/]", m.group(1)) if s.strip()]

    # Certifications
    _CERT_RE = re.compile(
        r"certifications?\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    m = _CERT_RE.search(text)
    if m:
        certifications = [s.strip() for s in re.split(r"[,;|]", m.group(1)) if s.strip()]

    # Hobbies
    _HOBBY_RE = re.compile(
        r"hobbies?\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    m = _HOBBY_RE.search(text)
    if m:
        hobbies = [s.strip() for s in re.split(r"[,;|]", m.group(1)) if s.strip()]

    # Education / degrees
    _EDU_RE = re.compile(
        r"(?:education|degree|university|college|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|ph\.?d\.?)[^\n]*",
        re.IGNORECASE,
    )
    for m in _EDU_RE.finditer(text):
        prior_learning_history.append(m.group(0).strip())

    # Occupation: look for "Currently: ..." or "Current role: ..."
    _ROLE_RE = re.compile(
        r"(?:current(?:ly)?|present)\s*(?:role|position|job)?\s*[:\-]\s*(.+)", re.IGNORECASE
    )
    m = _ROLE_RE.search(text)
    if m:
        raw_role = m.group(1).strip()
        # If the Currently: line just says "Working Professional" or "Student",
        # look for the actual job title in the lines above it.
        if raw_role.lower() in ("working professional", "student"):
            # Match standalone job titles (short lines with title-like words),
            # not long sentences that happen to contain those words.
            _TITLE_RE = re.compile(
                r"^(?:senior |junior |lead |principal |staff |associate )?"
                r"(?:backend |frontend |full.?stack |software |data |cloud |devops |"
                r"machine learning |ml |ai |systems |security |network |mobile |"
                r"web )?"
                r"(?:developer|engineer|manager|analyst|designer|architect|director|"
                r"scientist|researcher|consultant|lead|specialist|administrator|"
                r"coordinator|officer|professor|associate|intern|freelancer)"
                r"(?:s)?(?:\s+(?:at|@)\s+.+)?$",
                re.IGNORECASE,
            )
            all_lines = text.splitlines()
            for line in reversed(all_lines):
                stripped = line.strip()
                if _TITLE_RE.match(stripped) and len(stripped.split()) <= 6:
                    professional_role = stripped
                    break
            if not professional_role:
                professional_role = raw_role
        else:
            professional_role = raw_role
        if any(w in text.lower() for w in ("student", "university", "college")):
            occupation_status = "student"
        else:
            occupation_status = "working_professional"

    return ResumeProfileOutput(
        name=name,
        email=email,
        professional_role=professional_role,
        occupation_status=occupation_status,
        skills=skills,
        certifications=certifications,
        hobbies=hobbies,
        prior_learning_history=prior_learning_history,
        extra_info="; ".join(extra_parts) if extra_parts else None,
    )


def extract_resume_profile(text: str, llm_client: LLMClient | None = None) -> ResumeProfileOutput:
    """Returns structured profile fields pulled from resume text - see
    backend/api/main.py's /profile/resume, which merges these into
    LearnerProfile (filling blanks / appending list fields, never
    overwriting what the learner already told us directly).

    Tries the LLM first; if the LLM is unavailable (bad keys, rate
    limits, timeout), falls back to regex extraction so the user always
    sees fields filled. Raises only if both paths fail (extremely rare)."""
    try:
        client = llm_client or LLMClient()
        prompt = _RESUME_PROFILE_PROMPT.format(text=text)

        def attempt(p: str) -> ResumeProfileOutput:
            return ResumeProfileOutput.model_validate(_parse_json(client.complete(p, max_tokens=900)))

        try:
            return attempt(prompt)
        except (json.JSONDecodeError, ValidationError):
            stricter = prompt + "\n\nRespond with ONLY valid JSON, no commentary."
            return attempt(stricter)
    except Exception:
        return regex_extract_resume_profile(text)


def format_knowledge_digest(entries: list[dict]) -> str:
    """Formats backend.common.db.get_knowledge_for_user's rows into a short
    block for prompt injection (profiler.py, roadmap_generator.py). Empty
    string if there's nothing yet, so callers can splice it in unconditionally."""
    if not entries:
        return ""
    lines = "\n".join(f"- ({e['category']}) {e['content']}" for e in entries)
    return f"\nKnown facts about this learner (from their profile knowledge base):\n{lines}\n"
