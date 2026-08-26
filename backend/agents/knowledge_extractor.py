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


def format_knowledge_digest(entries: list[dict]) -> str:
    """Formats backend.common.db.get_knowledge_for_user's rows into a short
    block for prompt injection (profiler.py, roadmap_generator.py). Empty
    string if there's nothing yet, so callers can splice it in unconditionally."""
    if not entries:
        return ""
    lines = "\n".join(f"- ({e['category']}) {e['content']}" for e in entries)
    return f"\nKnown facts about this learner (from their profile knowledge base):\n{lines}\n"
