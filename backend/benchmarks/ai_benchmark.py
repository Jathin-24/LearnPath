"""
ai_benchmark.py

Head-to-head benchmark for the learning-path recommender's hybrid engine
(Path-A RAG + LLM planning + prerequisite-graph traversal) against two
baselines, over a fixed matrix of 30 learner profiles.

Engines compared
----------------
  hybrid        : run_path_a() + run_roadmap_generator() -- the real product.
  baseline_llm  : a single generic LLM "plan a path" call -- no RAG, no
                  prerequisite graph. Represents "ask ChatGPT for a syllabus".
  baseline_rag  : naive retrieve(top-K) content similarity only -- no LLM
                  planning/ordering, no prerequisite traversal.

Scoring (each dimension 0-10)
-----------------------------
  relevance      : how topically relevant the returned topics are to the goal.
  ordering       : prerequisites/course ordering correctness (do foundations
                   precede dependents).
  personalization: adaptation to stated skills, timeline, hours/week.
  feasibility    : workload (node count/depth) is sane for the timeline.
  grounding      : resources grounded in a real, citable corpus (dataset URL
                   or web source) rather than generic topic names.

By default a single LLM call grades all three outputs for one profile
against a rubric (rubrics below). Pass --offline to skip LLM grading and
use deterministic heuristics instead (useful when free-tier LLM rate
limits are exhausted).

Resumability
------------
Every profile verdict is appended to the results JSON + printed as it
completes. If a run is interrupted by rate limits, re-run with --resume
(after the endpoint cooldown) to continue where it stopped. Use --limit N
to stop after N profiles (one small batch per window on free tier), and
--only "backend,ml" to test a subset by name.

Usage (from the repo root, with the venv active)
------------------------------------------------
  python -m backend.benchmarks.ai_benchmark --limit 3
  python -m backend.benchmarks.ai_benchmark --resume --limit 5
  python -m backend.benchmarks.ai_benchmark --offline --resume
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Profile matrix (30 learner profiles). "hours/week" and "timeline_months"
# feed feasibility scoring; the rest is passed to the LLM planner and grader.
# ---------------------------------------------------------------------------
PROFILES: list[dict] = [
    {"name": "backend_python", "goal": "become a backend developer using Python", "level": "beginner",
     "skills": ["python basics"], "interests": ["APIs", "databases"], "timeline_months": 6, "hours_week": 10},
    {"name": "backend_java", "goal": "land a Java backend engineering role", "level": "intermediate",
     "skills": ["java", "sql"], "interests": ["Spring", "microservices"], "timeline_months": 4, "hours_week": 15},
    {"name": "frontend_react", "goal": "become a frontend developer with React", "level": "beginner",
     "skills": ["html", "css"], "interests": ["state management", "UI"], "timeline_months": 4, "hours_week": 12},
    {"name": "frontend_typescript", "goal": "master frontend engineering in TypeScript", "level": "intermediate",
     "skills": ["javascript", "react"], "interests": ["type safety", "testing"], "timeline_months": 3, "hours_week": 12},
    {"name": "fullstack_js", "goal": "become a full-stack developer with JavaScript", "level": "beginner",
     "skills": ["basic js"], "interests": ["node", "react", "rest"], "timeline_months": 6, "hours_week": 10},
    {"name": "fullstack_python", "goal": "full-stack developer on the Python stack", "level": "intermediate",
     "skills": ["python", "flask"], "interests": ["django", "frontend"], "timeline_months": 5, "hours_week": 10},
    {"name": "data_scientist", "goal": "become a data scientist", "level": "beginner",
     "skills": ["python", "statistics basics"], "interests": ["ml", "visualization"], "timeline_months": 6, "hours_week": 12},
    {"name": "data_engineer", "goal": "become a data engineer building pipelines", "level": "intermediate",
     "skills": ["sql", "python"], "interests": ["etl", "spark", "warehouses"], "timeline_months": 5, "hours_week": 12},
    {"name": "ml_engineer", "goal": "become a machine learning engineer", "level": "intermediate",
     "skills": ["python", "numpy", "statistics"], "interests": ["deep learning", "deployment"], "timeline_months": 6, "hours_week": 15},
    {"name": "ml_ops", "goal": "specialize in MLOps and model deployment", "level": "advanced",
     "skills": ["pytorch", "docker", "python"], "interests": ["kubeflow", "observability"], "timeline_months": 3, "hours_week": 15},
    {"name": "cloud_aws", "goal": "become a cloud engineer on AWS", "level": "beginner",
     "skills": ["linux", "networking basics"], "interests": ["ec2", "serverless"], "timeline_months": 4, "hours_week": 10},
    {"name": "devops_ci", "goal": "become a DevOps engineer", "level": "intermediate",
     "skills": ["linux", "git", "docker basics"], "interests": ["kubernetes", "ci/cd"], "timeline_months": 6, "hours_week": 15},
    {"name": "security_analyst", "goal": "become a cybersecurity analyst", "level": "beginner",
     "skills": ["networking basics"], "interests": ["threat detection", "forensics"], "timeline_months": 5, "hours_week": 10},
    {"name": "security_offensive", "goal": "become an ethical hacker (pentester)", "level": "intermediate",
     "skills": ["linux", "networking"], "interests": ["exploitation", "web security"], "timeline_months": 6, "hours_week": 12},
    {"name": "android_dev", "goal": "become an Android app developer", "level": "beginner",
     "skills": ["java basics"], "interests": ["kotlin", "mobile ui"], "timeline_months": 5, "hours_week": 10},
    {"name": "ios_dev", "goal": "become an iOS developer with Swift", "level": "beginner",
     "skills": ["basic programming"], "interests": ["swift", "xcode"], "timeline_months": 5, "hours_week": 10},
    {"name": "game_dev", "goal": "become a game developer", "level": "beginner",
     "skills": ["python"], "interests": ["unity", "game design"], "timeline_months": 6, "hours_week": 12},
    {"name": "ux_design", "goal": "become a UX/product designer", "level": "beginner",
     "skills": ["photoshop basics"], "interests": ["research", "prototyping"], "timeline_months": 4, "hours_week": 10},
    {"name": "qa_engineer", "goal": "become a QA / test automation engineer", "level": "beginner",
     "skills": ["manual testing"], "interests": ["selenium", "ci"], "timeline_months": 4, "hours_week": 10},
    {"name": "database_admin", "goal": "become a database administrator", "level": "intermediate",
     "skills": ["sql", "linux"], "interests": ["postgres", "performance"], "timeline_months": 5, "hours_week": 10},
    {"name": "site_reliability", "goal": "become an SRE / site reliability engineer", "level": "advanced",
     "skills": ["linux", "python", "kubernetes"], "interests": ["monitoring", "oncall automation"], "timeline_months": 4, "hours_week": 15},
    {"name": "data_analyst", "goal": "become a data analyst", "level": "beginner",
     "skills": ["excel", "sql basics"], "interests": ["sql", "power bi"], "timeline_months": 3, "hours_week": 10},
    {"name": "statistician", "goal": "build statistical modeling / data science skills", "level": "advanced",
     "skills": ["python", "pandas", "statistics"], "interests": ["experiments", "inference"], "timeline_months": 3, "hours_week": 10},
    {"name": "blockchain", "goal": "become a blockchain / web3 developer", "level": "intermediate",
     "skills": ["javascript", "solidity basics"], "interests": ["ethereum", "smart contracts"], "timeline_months": 5, "hours_week": 12},
    {"name": "mobile_react_native", "goal": "build cross-platform apps with React Native", "level": "intermediate",
     "skills": ["react", "javascript"], "interests": ["mobile", "typescript"], "timeline_months": 4, "hours_week": 12},
    {"name": "ai_products", "goal": "become an AI/LLM product developer", "level": "intermediate",
     "skills": ["python", "api basics"], "interests": ["llms", "rag", "prompting"], "timeline_months": 4, "hours_week": 12},
    {"name": "scala_bigdata", "goal": "become a big-data engineer with Scala/Spark", "level": "advanced",
     "skills": ["java", "sql"], "interests": ["spark", "scala"], "timeline_months": 5, "hours_week": 15},
    {"name": "golang_backend", "goal": "become a backend engineer in Go", "level": "intermediate",
     "skills": ["python", "apis"], "interests": ["go", "microservices"], "timeline_months": 4, "hours_week": 12},
    {"name": "system_admin", "goal": "become a systems administrator (linux)", "level": "beginner",
     "skills": ["basic computer use"], "interests": ["linux", "scripting"], "timeline_months": 4, "hours_week": 10},
    {"name": "project_manager_tech", "goal": "transition into technical project management", "level": "intermediate",
     "skills": ["communication", "some code"], "interests": ["agile", "software delivery"], "timeline_months": 3, "hours_week": 8},
]

ENGINES = ("hybrid", "baseline_llm", "baseline_rag")
DIMENSIONS = ("relevance", "ordering", "personalization", "feasibility", "grounding")

RESULT_PATH = Path(__file__).parent / "ai_benchmark_results.json"
REPORT_PATH = Path(__file__).parent / "ai_benchmark_report.md"


# ---------------------------------------------------------------------------
# Engine implementations
# ---------------------------------------------------------------------------
def _run_hybrid(profile: dict):
    """The real product: Path-A (RAG + LLM planning + prerequisite traversal)
    then Roadmap Generator. use_template_cache=False so every profile is
    evaluated on fresh retrieval/planning rather than a cross-user cache hit."""
    from backend.agents.path_a import run_path_a
    from backend.agents.roadmap_generator import run_roadmap_generator
    from backend.orchestrator.state_schema import AppState, PathType

    state = AppState(session_id=f"bench-hybrid-{profile['name']}")
    state.learner_profile.goal = profile["goal"]
    state.learner_profile.stated_known_skills = profile.get("skills", [])
    state.learner_profile.interests = profile.get("interests", [])
    state.learner_profile.timeline = f"{profile['timeline_months']} months"
    state.skill_gap_map.assessments = []

    state = run_path_a(state, use_template_cache=False)
    state = run_roadmap_generator(state)

    nodes = state.roadmap.nodes if state.roadmap is not None else []
    items = []
    for n in nodes:
        if n.path_type == PathType.PATH_A_DATASET:
            source = n.course_search_link or "dataset"
            label = n.course_name or n.topic
        else:
            source = "web" if (n.web_sources or n.youtube_links) else "web-unfilled"
            label = n.topic
        items.append({"topic": label, "path_type": n.path_type.value, "source": source})
    return items


def _run_baseline_llm(profile: dict):
    """Generic LLM plan with NO RAG and NO prerequisite graph input."""
    from backend.common.llm_client import LLMClient

    client = LLMClient()
    prompt = (
        "You are a career coach. Given the learner profile below, produce a JSON "
        "list of study topics to achieve their goal, in the order they should learn "
        "them. Return ONLY a JSON array of strings, nothing else.\n"
        f"GOAL: {profile['goal']}\n"
        f"LEVEL: {profile.get('level')}\n"
        f"KNOWN SKILLS: {profile.get('skills')}\n"
        f"INTERESTS: {profile.get('interests')}\n"
        f"TIMELINE (months): {profile['timeline_months']}\n"
        f"HOURS/WEEK: {profile['hours_week']}\n"
    )
    raw = client.complete(prompt, max_tokens=900)
    topics = _safe_parse_list(raw)
    if not topics:
        time.sleep(20)  # endure endpoint cooldown, retry once
        try:
            raw = client.complete(prompt, max_tokens=900)
            topics = _safe_parse_list(raw)
        except Exception:
            topics = []
    return [{"topic": t, "path_type": "baseline_llm", "source": "generic-llm"} for t in topics]


def _run_baseline_rag(profile: dict):
    """Naive content-similarity retrieval, no LLM planning/ordering."""
    from backend.rag.retriever import retrieve

    results = retrieve(profile["goal"], k=15)
    items = []
    for r in results:
        items.append({
            "topic": r["course_name"],
            "path_type": "baseline_rag",
            "source": r.get("search_link") or "dataset",
            "score": round(r.get("score", 0), 3),
        })
    return items


def _safe_parse_list(raw: str) -> list[str]:
    import json as _json
    import re
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")  # only outermost fences; inner 'json' tag is fine
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    else:
        text = f"[{text[text.find('[') + 1:] if '[' in text else text}]"
    try:
        data = _json.loads(text)
        if isinstance(data, list):
            return [str(x) for x in data if str(x).strip()]
    except Exception:
        pass
    # Recovery for a truncation-clipped JSON array: pull every quoted string
    # that looks like a topic inside the brackets.
    if start != -1:
        inside = text[start:end + 1] if end > start else text[start:]
        return [m.replace("\\\"", '"') for m in re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', inside) if m.strip()]
    return [line.strip(" -\"'") for line in raw.splitlines() if line.strip(" -\"'")]


# ---------------------------------------------------------------------------
# Grader (LLM, with offline fallback)
# ---------------------------------------------------------------------------
GRADER_PROMPT = """You are an impartial evaluator of learning-path recommender systems.
Grade each of the three candidate plans against a 0-10 rubric on these dimensions:
  relevance      - topics topically relevant to the stated goal
  ordering       - prerequisite/course ordering correctness (foundations before dependents)
  personalization- adapts to skill level, timeline, weekly hours, interests
  feasibility    - workload sane for the timeline and hours/week
  grounding      - resources grounded in a real citable corpus, not just topic names

Learner profile:
  GOAL: {goal}
  LEVEL: {level}
  SKILLS: {skills}
  INTERESTS: {interests}
  TIMELINE (months): {timeline_months}
  HOURS/WEEK: {hours_week}

Plans:
  [hybrid] {hybrid}
  [baseline_llm] {baseline_llm}
  [baseline_rag] {baseline_rag}

Return ONLY a JSON object:
{{"hybrid":{{"relevance":0,..}},"baseline_llm":{{...}},"baseline_rag":{{...}}}}
with each sub-object having all five dimensions as integers 0-10.
"""


def _grade_with_llm(profile: dict, outputs: dict) -> dict:
    from backend.common.llm_client import LLMClient
    client = LLMClient()
    prompt = GRADER_PROMPT.format(
        goal=profile["goal"],
        level=profile.get("level"),
        skills=profile.get("skills"),
        interests=profile.get("interests"),
        timeline_months=profile["timeline_months"],
        hours_week=profile["hours_week"],
        hybrid=json.dumps(outputs["hybrid"][:20]),
        baseline_llm=json.dumps(outputs["baseline_llm"][:20]),
        baseline_rag=json.dumps(outputs["baseline_rag"][:20]),
    )
    raw = client.complete(prompt, max_tokens=1200)
    return _parse_scores(raw)


def _parse_scores(raw: str) -> dict:
    import json as _json
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        data = _json.loads(text[start:end + 1])
    except Exception:
        return {}

    def _norm(eng):
        sub = data.get(eng, {})
        return {d: int(max(0, min(10, sub.get(d, 0)))) for d in DIMENSIONS}

    return {eng: _norm(eng) for eng in ENGINES}


def _grade_offline(outputs: dict) -> dict:
    """Heuristic fallback when LLM grading can't run (rate limits / --offline)."""
    veredict = {}
    for eng in ENGINES:
        items = outputs[eng]
        topics = [i["topic"] for i in items if i.get("topic")]
        if not topics:
            veredict[eng] = {d: 0 for d in DIMENSIONS}
            continue
        lengths = sum(len(str(t)) for t in topics)
        has_grounding = any(
            str(i.get("source")) not in ("generic-llm", "web-unfilled", "None")
            for i in items
        )
        veredict[eng] = {
            "relevance": min(10, 4 + (lengths // 60)),
            "ordering": 6 if len(topics) >= 3 else 3,
            "personalization": 5,
            "feasibility": 5 if len(topics) <= 12 else 3,
            "grounding": 8 if has_grounding else 2,
        }
    return veredict


# ---------------------------------------------------------------------------
# Persistence / report
# ---------------------------------------------------------------------------
def _load_results(existing: dict | None) -> set[str]:
    if existing is None:
        return set()
    return set(existing.keys())


def _render_report(results: dict) -> str:
    lines = ["# AI Learning-Path Benchmark Report", ""]
    header = " | ".join(["profile"] + [f"{d}" for d in DIMENSIONS] + ["avg"])
    aggs = {eng: {d: [] for d in DIMENSIONS} for eng in ENGINES}
    for name, verdict in sorted(results.items()):
        lines.append(f"## {name}")
        for eng in ENGINES:
            sc = verdict.get(eng, {})
            avg = sum(sc.get(d, 0) for d in DIMENSIONS) / len(DIMENSIONS)
            row = f"`{eng}`: " + ", ".join(f"{d}={sc.get(d,0)}" for d in DIMENSIONS) + f" avg={avg:.1f}"
            lines.append(row)
            for d in DIMENSIONS:
                aggs[eng][d].append(sc.get(d, 0))
        lines.append("")
    lines.append("## Aggregates (mean across profiles)")
    lines.append("| engine | " + " | ".join(DIMENSIONS) + " | avg |")
    lines.append("|--------|" + "|".join("---|" for _ in DIMENSIONS) + "---|")
    for eng in ENGINES:
        means = [sum(aggs[eng][d]) / max(1, len(aggs[eng][d])) for d in DIMENSIONS]
        overall = sum(means) / len(means)
        lines.append(f"| {eng} | " + " | ".join(f"{m:.1f}" for m in means) + f" | {overall:.1f} |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="AI learning-path recommender benchmark")
    ap.add_argument("--limit", type=int, default=0, help="only run first N profiles (0 = all)")
    ap.add_argument("--only", type=str, default="", help="comma-separated profile name subset")
    ap.add_argument("--offline", action="store_true", help="use heuristic grading, no LLM grader")
    ap.add_argument("--resume", action="store_true", help="skip profiles already in the results file")
    args = ap.parse_args(argv)

    existing = None
    if args.resume and RESULT_PATH.exists():
        existing = json.loads(RESULT_PATH.read_text(encoding="utf-8"))
    done = _load_results(existing) if args.resume else set()

    pool = PROFILES
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        pool = [p for p in pool if p["name"] in wanted]
    if args.limit:
        pool = pool[:args.limit]

    results = existing if existing is not None else {}

    for idx, profile in enumerate(pool, 1):
        name = profile["name"]
        if name in done:
            print(f"[skip] {name} (already scored)")
            continue
        print(f"[{idx}/{len(pool)}] {name}: running engines...", flush=True)
        try:
            outputs = {
                "hybrid": _run_hybrid(profile),
                "baseline_llm": _run_baseline_llm(profile),
                "baseline_rag": _run_baseline_rag(profile),
            }
        except Exception as exc:
            print(f"[error] {name}: engine failed ({exc}); stopping to preserve rate limits.", flush=True)
            print("        Re-run with --resume after the cooldown.", flush=True)
            break

        verdict = _grade_offline(outputs) if args.offline else _grade_with_llm(profile, outputs)
        if not verdict or not all(v for v in verdict.values()):
            print(f"[warn] {name}: grader returned no/incomplete scores; using heuristics.", flush=True)
            verdict = _grade_offline(outputs)

        results[name] = verdict
        RESULT_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
        avg = {eng: sum(verdict[eng].values()) / len(DIMENSIONS) for eng in ENGINES}
        print(f"  hybrid={avg['hybrid']:.1f} llm={avg['baseline_llm']:.1f} rag={avg['baseline_rag']:.1f}", flush=True)

        if idx < len(pool) and not args.offline:
            time.sleep(2)  # gentle rate-limit backoff between profiles

    REPORT_PATH.write_text(_render_report(results), encoding="utf-8")
    print(f"\nWrote {len(results)} verdicts to {RESULT_PATH.name}")
    print(f"Report: {REPORT_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
