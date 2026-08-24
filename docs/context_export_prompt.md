# Context Export Prompt

Shown on an optional onboarding step: "Already talked to an AI assistant about
your goals? Copy this, paste it there, then paste the reply back here."

## The prompt (this is what the user copies)

```
Based on everything you know about me from our conversations, please summarize:
1. My career goals or things I've said I want to learn or achieve
2. My current skills, experience, or background you're aware of
3. My interests and the kinds of topics I tend to ask about
4. Any learning preferences you've noticed (pace, style, formats I prefer)

Please keep it factual and based only on what we've actually discussed - don't
guess or make anything up. Format it as plain text I can copy elsewhere.
```

## How it's used (backend)
- User pastes the OTHER assistant's reply into a text box -> stored as
  `learner_profile.imported_context_raw` (raw string, untouched)
- Profiler Agent, on next run, includes this raw text in its extraction prompt
  as ADDITIONAL context alongside the live conversation - explicitly labeled
  to the LLM as "self-reported summary from another AI tool, treat as a hint
  not a fact" so it doesn't silently override what the user tells us directly
  in this app
- This is entirely optional - onboarding works fully without it, this just
  gives Profiler a head start for users with existing context elsewhere

## Product note
This is a nice, honest way to bootstrap personalization without us doing any
cross-platform data access ourselves - the user explicitly copies, reads, and
pastes it themselves, so there's no privacy overreach. Frame the UI copy this
way ("nothing leaves your control") when you build the onboarding step.
