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


def extract_resume_profile(text: str, llm_client: LLMClient | None = None) -> ResumeProfileOutput:
    """Returns structured profile fields pulled from resume text - see
    backend/api/main.py's /profile/resume, which merges these into
    LearnerProfile (filling blanks / appending list fields, never
    overwriting what the learner already told us directly). Raises on
    double parse failure - callers must catch and treat this as
    best-effort, same as extract_knowledge."""
    client = llm_client or LLMClient()
    prompt = _RESUME_PROFILE_PROMPT.format(text=text)

    def attempt(p: str) -> ResumeProfileOutput:
        return ResumeProfileOutput.model_validate(_parse_json(client.complete(p, max_tokens=900)))

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, no commentary."
        return attempt(stricter)  # let this raise if it fails again - fail loud


def format_knowledge_digest(entries: list[dict]) -> str:
    """Formats backend.common.db.get_knowledge_for_user's rows into a short
    block for prompt injection (profiler.py, roadmap_generator.py). Empty
    string if there's nothing yet, so callers can splice it in unconditionally."""
    if not entries:
        return ""
    lines = "\n".join(f"- ({e['category']}) {e['content']}" for e in entries)
    return f"\nKnown facts about this learner (from their profile knowledge base):\n{lines}\n"
