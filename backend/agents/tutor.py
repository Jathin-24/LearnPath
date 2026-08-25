"""
tutor.py

Topic Tutor: answers the learner's questions while they're mid-roadmap,
grounded in whatever topic is currently AVAILABLE/IN_PROGRESS - replaces
the old hard-coded "you're mid-roadmap, go to your dashboard" canned
redirect that fired on every single message regardless of what was asked
(itself a "feels robotic" source, not just the assessment chat). Called
directly from /chat (backend/api/main.py), same pattern as explainer.py -
not a LangGraph node, no structured output, single LLM call, plain text.

Still keeps the "stay focused on one roadmap" intent from
docs/user_workflow.md: the system prompt answers genuine questions about
the CURRENT topic directly, and only redirects (in the same natural reply,
not a separate hard-coded string) if the learner is clearly trying to
start an unrelated new goal.
"""

from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import AppState, NodeStatus


def _current_node(state: AppState):
    if state.roadmap is None:
        return None
    for status in (NodeStatus.IN_PROGRESS, NodeStatus.AVAILABLE):
        node = next((n for n in state.roadmap.nodes if n.status == status), None)
        if node:
            return node
    return None


_FALLBACK_REPLY = (
    "I had trouble answering that just now - try again, or head to your Dashboard "
    "to keep going with your current topic."
)


def run_topic_tutor(state: AppState, user_message: str, llm_client: LLMClient | None = None) -> str:
    node = _current_node(state)
    client = llm_client or LLMClient()

    recent_turns = "\n".join(
        f"{turn.role}: {turn.content}" for turn in state.conversation_history[-6:]
    )

    if node is None:
        # No active topic to ground in (e.g. roadmap fully complete) - still
        # answer helpfully rather than a dead-end redirect.
        prompt = f"""You are a learning assistant. The learner has finished or doesn't yet \
have an active roadmap topic. Answer their message helpfully in 2-4 sentences, warm and \
direct - no preamble, no JSON, plain text only.

Recent conversation:
{recent_turns}

Learner's message: {user_message}"""
    else:
        concepts = ", ".join(node.key_concepts) if node.key_concepts else "not specified"
        project = f"{node.project.title} - {node.project.description}" if node.project else "none yet"
        prompt = f"""You are the Topic Tutor for a personalized learning path recommender. \
The learner is currently working through ONE topic in their roadmap: "{node.topic}"\
{f' ({node.course_summary})' if node.course_summary else ""}. Key concepts: {concepts}. \
Their project for this topic: {project}.

Answer their message in 2-5 sentences, warm and direct - as if you're their tutor for \
this specific topic. If they ask a genuine question about "{node.topic}" or its concepts/ \
project, answer it directly and helpfully. If they're clearly trying to start a different, \
unrelated learning goal instead, gently redirect them back to finishing "{node.topic}" first \
in the SAME reply - don't just refuse, explain briefly why staying focused on one topic at a \
time works better, and mention they can start a new goal from their Profile once this roadmap \
is done. No preamble, no JSON - plain text only, written directly to the learner ("you").

Recent conversation:
{recent_turns}

Learner's message: {user_message}"""

    try:
        return client.complete(prompt, max_tokens=400).strip()
    except Exception:
        return _FALLBACK_REPLY
