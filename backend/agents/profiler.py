"""
profiler.py

Profiler Agent: conversational onboarding intake. One call to run_profiler()
handles one turn - given the user's latest message (plus profile/history so
far), it produces a conversational reply AND extracts/updates
LearnerProfile fields in the same LLM call (keeps token usage down on a
free-tier budget). Sets ready_for_assessment once it has enough to move on.

Reliability (per CLAUDE.md): LLM output is validated against
ProfilerLLMOutput before touching AppState. On parse failure, retry once with
a stricter prompt; on second failure, raise rather than write malformed data.
"""

import json

from pydantic import BaseModel, Field, ValidationError

from backend.agents.knowledge_extractor import format_knowledge_digest
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import AgentName, AppState, ChatTurn, ConversationStage


class ProfilerLLMOutput(BaseModel):
    assistant_reply: str
    goal: str | None = None
    timeline: str | None = None
    interests: list[str] = Field(default_factory=list)
    stated_known_skills: list[str] = Field(default_factory=list)
    prior_learning_history: list[str] = Field(default_factory=list)
    ready_for_assessment: bool = False


_SYSTEM_INSTRUCTIONS = """You are the Profiler Agent for a personalized learning path \
recommender. Your job is to have a short, natural conversation with a learner to \
understand their goal, timeline, interests, and any relevant background - NOT to \
interrogate them with a form. Ask at most one clarifying question per turn if \
something important is still missing (usually: what's their goal). Once you have a \
clear goal (and ideally a rough timeline), set ready_for_assessment to true and let \
them know you're moving on to a quick skills check.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{
  "assistant_reply": "what you say back to the learner, conversational tone",
  "goal": "their goal, or null if still unclear",
  "timeline": "their stated timeline, or null if not mentioned",
  "interests": ["any interests they mentioned this turn"],
  "stated_known_skills": ["any skills they said they already know, this turn"],
  "prior_learning_history": ["any prior courses/experience they mentioned, this turn"],
  "ready_for_assessment": true or false
}
Only include NEW information from this turn in the list fields - don't repeat what's
already in "Known so far" below."""


def _build_prompt(state: AppState) -> str:
    profile = state.learner_profile
    known_so_far = {
        "goal": profile.goal,
        "timeline": profile.timeline,
        "interests": profile.interests,
        "stated_known_skills": profile.stated_known_skills,
        "prior_learning_history": profile.prior_learning_history,
    }
    recent_turns = "\n".join(
        f"{turn.role}: {turn.content}" for turn in state.conversation_history[-6:]
    )
    imported_hint = ""
    if profile.imported_context_raw:
        imported_hint = (
            "\nSelf-reported summary from another AI tool (treat as a hint, not a "
            f"fact - merge with what the learner tells you directly):\n{profile.imported_context_raw}\n"
        )

    resume_hint = ""
    if profile.resume_raw:
        resume_hint = (
            "\nText extracted from the learner's uploaded resume (treat as a hint, not "
            f"a fact - merge with what the learner tells you directly):\n{profile.resume_raw}\n"
        )

    knowledge_digest = ""
    if state.user_id:
        knowledge_digest = format_knowledge_digest(db.get_knowledge_for_user(state.user_id))

    return f"""{_SYSTEM_INSTRUCTIONS}

Known so far: {json.dumps(known_so_far)}
{imported_hint}{resume_hint}{knowledge_digest}
Recent conversation:
{recent_turns}

Learner's latest message: {state.last_user_message}
"""


def _parse_llm_output(raw_text: str) -> ProfilerLLMOutput:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    parsed = json.loads(cleaned)
    return ProfilerLLMOutput.model_validate(parsed)


def run_profiler(state: AppState, llm_client: LLMClient | None = None) -> AppState:
    client = llm_client or LLMClient()
    prompt = _build_prompt(state)

    try:
        raw = client.complete(prompt, max_tokens=900)
        output = _parse_llm_output(raw)
    except (json.JSONDecodeError, ValidationError):
        stricter_prompt = prompt + (
            "\n\nYour previous response must be retried. Keep assistant_reply under "
            "3 sentences. Respond with ONLY the raw JSON object described above - no "
            "markdown fences, no commentary, no text before or after the JSON."
        )
        raw = client.complete(stricter_prompt, max_tokens=900)
        output = _parse_llm_output(raw)  # let this raise if it fails again - fail loud

    profile = state.learner_profile
    if output.goal:
        profile.goal = output.goal
    if output.timeline:
        profile.timeline = output.timeline
    for item in output.interests:
        if item not in profile.interests:
            profile.interests.append(item)
    for item in output.stated_known_skills:
        if item not in profile.stated_known_skills:
            profile.stated_known_skills.append(item)
    for item in output.prior_learning_history:
        if item not in profile.prior_learning_history:
            profile.prior_learning_history.append(item)

    if state.last_user_message:
        state.conversation_history.append(ChatTurn(role="user", content=state.last_user_message))
    state.conversation_history.append(ChatTurn(role="assistant", content=output.assistant_reply))

    state.log(AgentName.PROFILER, "profile_updated", detail=output.assistant_reply)

    if output.ready_for_assessment:
        state.stage = ConversationStage.ASSESSMENT
        state.next_agent = AgentName.ASSESSMENT
        state.awaiting_input = False
    else:
        # Pause here, waiting for the learner's next message - next_agent
        # points at PROFILER itself so the next /chat call resumes here
        # instead of restarting or silently terminating (see graph.py).
        state.next_agent = AgentName.PROFILER
        state.awaiting_input = True

    return state
