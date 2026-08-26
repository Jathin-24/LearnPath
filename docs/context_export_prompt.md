# Context Export Prompt

Shown on an optional onboarding step: "Already talked to an AI assistant about
your goals? Copy this, paste it there, then paste the reply back here."

## The prompt (this is what the user copies)

```
Based on everything you know about me from our conversations, write a summary using exactly these
headings. Under each one, list short bullet points (one fact per bullet) - only things we've
actually discussed, don't guess or make anything up. If you have nothing for a heading, write
"None mentioned".

Goals:
- (what I've said I want to learn or achieve)

Current Skills / Experience:
- (things I already know or have done, including my rough level)

Interests:
- (topics or areas I tend to ask about or seem drawn to)

Learning Style & Pace:
- (how I seem to prefer learning - pace, format, hands-on vs reading, etc.)

Constraints:
- (time available, deadlines, or anything limiting how I can learn)

Things I Find Difficult or Dislike:
- (topics I've struggled with or said I don't enjoy)

Format it as plain text I can copy elsewhere, keeping these exact headings.
```

Deliberately structured under fixed headings (rather than the original
numbered-list version) so `backend/agents/knowledge_extractor.py` can reliably
split the reply into categorized facts instead of parsing loose prose.

## How it's used (backend)
- User pastes the OTHER assistant's reply into a text box -> stored as
  `learner_profile.imported_context_raw` (raw string, untouched), same as
  before
- **New**: the raw text is also run through `knowledge_extractor.py`
  (one extra LLM call, schema-validated, retry-once-then-fail-loud) to pull
  out discrete facts tagged by category (goal/skill/interest/learning_style/
  constraint/personality/other), stored in the `user_knowledge` table
  (`backend/common/db.py`), keyed by `user_id` - not per-session, so it
  survives `/goal/restart`. Shown back to the user as "Key Points" on the
  Profile page, with a per-entry remove button. Best-effort: if extraction
  fails, the raw text save still succeeds unaffected.
- Profiler Agent and Roadmap Generator both fold a formatted digest of this
  knowledge base into their prompts (`format_knowledge_digest`), alongside -
  not replacing - the existing raw-text hint mechanism below
- Profiler Agent, on next run, also still includes the raw
  `imported_context_raw` text in its extraction prompt as ADDITIONAL context
  alongside the live conversation - explicitly labeled to the LLM as
  "self-reported summary from another AI tool, treat as a hint not a fact"
  so it doesn't silently override what the user tells us directly in this app
- This is entirely optional - onboarding works fully without it, this just
  gives Profiler a head start for users with existing context elsewhere.
  New users now land on this step automatically right after the required
  profile fields (name/email/age/etc.), with a "skip for now" path straight
  to chat - it's no longer something they have to find manually from the
  Profile page.

## Product note
This is a nice, honest way to bootstrap personalization without us doing any
cross-platform data access ourselves - the user explicitly copies, reads, and
pastes it themselves, so there's no privacy overreach. Frame the UI copy this
way ("nothing leaves your control") when you build the onboarding step.
