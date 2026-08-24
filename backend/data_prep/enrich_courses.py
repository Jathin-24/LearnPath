"""
enrich_courses.py

ONE-TIME OFFLINE STEP (not part of the runtime app).

Reads the raw review dataset (course_reviews.csv: Index, Reviews, Course) and
produces a structured metadata file (enriched_courses.json) that the rest of
the system (RAG index, Path-A agent, concept-checklist generator) will read
from at runtime instead of touching raw review text.

For each of the ~80 courses, this script:
  1. Samples a batch of that course's reviews
  2. Calls an LLM once to extract: concept tags, difficulty level, a short
     strengths/weaknesses summary
  3. Generates a platform search link from the course name

After all courses are processed, it makes ONE additional LLM call with the
full list of (course, concepts, difficulty) to infer a prerequisite graph
(edges: course -> list of prerequisite courses).

Output: backend/data/enriched_courses.json

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python enrich_courses.py --input ../data/course_reviews.csv --output ../data/enriched_courses.json

Cost note: with 80 courses this is ~80 + 1 = 81 LLM calls total, run once.
Re-run only if the dataset changes.
"""

import argparse
import json
import os
import time
import urllib.parse
from collections import defaultdict

import pandas as pd

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import openai  # xAI's Grok API is OpenAI-compatible
except ImportError:
    openai = None


MAX_REVIEWS_PER_COURSE_SAMPLE = 10  # enough signal while staying within free-tier limits


class LLMClient:
    """Thin wrapper so the rest of the script doesn't care which provider is used.
    Provider selected via LLM_PROVIDER env var: 'anthropic' (default), 'xai', or 'groq'.
    API key is ALWAYS read from environment, never hardcoded or passed in as a
    literal - do not paste raw keys into code or chat.
    """

    def __init__(self):
        self.provider = os.environ.get("LLM_PROVIDER", "anthropic").lower()

        if self.provider in {"xai", "groq"}:
            if openai is None:
                raise SystemExit("Run: pip install openai --break-system-packages")
            key_name = "XAI_API_KEY" if self.provider == "xai" else "GROQ_API_KEY"
            api_key = os.environ.get(key_name)
            if not api_key:
                raise SystemExit(f"Set {key_name} before running with LLM_PROVIDER={self.provider}")
            base_url = (
                "https://api.x.ai/v1"
                if self.provider == "xai"
                else "https://api.groq.com/openai/v1"
            )
            self._client = openai.OpenAI(api_key=api_key, base_url=base_url)
            model_name = "XAI_MODEL" if self.provider == "xai" else "GROQ_MODEL"
            default_model = "grok-4" if self.provider == "xai" else "openai/gpt-oss-120b"
            self.model = os.environ.get(model_name, default_model)
        else:
            if anthropic is None:
                raise SystemExit("Run: pip install anthropic --break-system-packages")
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if not api_key:
                raise SystemExit("Set ANTHROPIC_API_KEY before running (default provider)")
            self._client = anthropic.Anthropic(api_key=api_key)
            self.model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    def complete(self, prompt: str, max_tokens: int = 600) -> str:
        if self.provider in {"xai", "groq"}:
            request = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            }
            if self.provider == "groq":
                request["reasoning_effort"] = "low"
            response = self._client.chat.completions.create(**request)
            return response.choices[0].message.content.strip()
        else:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()


def load_reviews(input_path: str) -> dict:
    """Group raw reviews by course name."""
    df = pd.read_csv(input_path)
    df = df.dropna(subset=["Course", "Reviews"])
    grouped = defaultdict(list)
    for course, review in zip(df["Course"], df["Reviews"]):
        grouped[course].append(review)
    return grouped


def make_search_link(course_name: str) -> str:
    """Auto-generate a platform search link since the dataset has no URL field."""
    query = urllib.parse.quote_plus(course_name)
    return f"https://www.udemy.com/courses/search/?q={query}"


def build_extraction_prompt(course_name: str, sample_reviews: list) -> str:
    joined = "\n---\n".join(sample_reviews)
    return f"""You are analyzing student reviews for an online course to build a structured
course profile. Course name: "{course_name}"

Here are {len(sample_reviews)} student reviews:
{joined}

Based ONLY on what these reviews say, respond with ONLY a JSON object (no markdown
fences, no preamble) in this exact shape:

{{
  "concepts": ["list", "of", "specific", "technical", "concepts", "mentioned"],
  "difficulty": "beginner" | "intermediate" | "advanced",
  "strengths": "one sentence on what reviewers consistently praise",
  "weaknesses": "one sentence on what reviewers consistently criticize",
  "summary": "one sentence overall takeaway"
}}

Keep "concepts" to the specific named topics/tools/techniques reviewers mention
(e.g. "Flexbox layout", "K-means clustering"), not generic words. Aim for 5-12 concepts.
"""


def extract_course_profile(client: "LLMClient", course_name: str, reviews: list) -> dict:
    sample = reviews[:MAX_REVIEWS_PER_COURSE_SAMPLE]
    prompt = build_extraction_prompt(course_name, sample)

    text = client.complete(prompt, max_tokens=1000)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback: don't let one bad parse kill the whole run
        return {
            "concepts": [],
            "difficulty": "unknown",
            "strengths": "",
            "weaknesses": "",
            "summary": "",
            "_parse_error": True,
            "_raw": text,
        }


def build_prerequisite_graph(client, course_profiles: dict) -> dict:
    """One LLM call across all courses to infer a prerequisite DAG."""
    course_list = [
        {
            "course": name,
            "concepts": profile.get("concepts", []),
            "difficulty": profile.get("difficulty", "unknown"),
        }
        for name, profile in course_profiles.items()
    ]

    prompt = f"""Here is a list of {len(course_list)} courses with their concepts and difficulty:

{json.dumps(course_list, indent=2)}

Build a prerequisite graph across these courses. For each course, list which OTHER
courses from this same list (if any) a learner should ideally complete first, based
on concept overlap and difficulty progression (e.g. "SQL for Beginners" before
"Advanced SQL and Query Optimization"; "Linear Algebra for Machine Learning" before
"Advanced Neural Networks"). Only include a prerequisite edge when there is a genuine
conceptual dependency - most courses should have 0-2 prerequisites, some will have none.

Respond with ONLY a JSON object (no markdown fences, no preamble) mapping course name
to a list of prerequisite course names, e.g.:
{{
  "Advanced SQL and Query Optimization": ["SQL for Beginners"],
  "SQL for Beginners": [],
  ...
}}
Include EVERY course from the input list as a key, even if its prerequisite list is empty.
"""

    text = client.complete(prompt, max_tokens=4000)
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        print("WARNING: could not parse prerequisite graph response; saving raw text.")
        return {"_parse_error": True, "_raw": text}


def save_profiles(output_path: str, profiles: dict) -> None:
    temporary_path = f"{output_path}.tmp"
    with open(temporary_path, "w") as f:
        json.dump(profiles, f, indent=2)
    os.replace(temporary_path, output_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="../data/course_reviews.csv")
    parser.add_argument("--output", default="../data/enriched_courses.json")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Optional: only process first N courses (useful for testing before full run)"
    )
    args = parser.parse_args()

    client = LLMClient()
    print(f"Using provider: {client.provider} (model: {client.model})")

    print(f"Loading reviews from {args.input} ...")
    grouped = load_reviews(args.input)
    course_names = list(grouped.keys())
    if args.limit:
        course_names = course_names[: args.limit]
    print(f"Found {len(grouped)} unique courses; processing {len(course_names)}.")

    profiles = {}
    if os.path.exists(args.output):
        try:
            with open(args.output) as f:
                profiles = json.load(f)
            print(f"Resuming with {len(profiles)} saved course profiles.")
        except (OSError, json.JSONDecodeError):
            print("WARNING: could not load existing output; starting fresh.")

    for i, course_name in enumerate(course_names, 1):
        if course_name in profiles and not profiles[course_name].get("_parse_error"):
            print(f"[{i}/{len(course_names)}] Skipping saved profile: {course_name}")
            continue
        print(f"[{i}/{len(course_names)}] Extracting profile: {course_name}")
        profile = extract_course_profile(client, course_name, grouped[course_name])
        profile["search_link"] = make_search_link(course_name)
        profile["review_count"] = len(grouped[course_name])
        profiles[course_name] = profile
        save_profiles(args.output, profiles)
        time.sleep(0.3)  # gentle pacing

    print("Building prerequisite graph across all processed courses ...")
    prereq_graph = build_prerequisite_graph(client, profiles)
    for course_name, prereqs in prereq_graph.items():
        if course_name in profiles:
            profiles[course_name]["prerequisites"] = prereqs

    save_profiles(args.output, profiles)

    print(f"Done. Wrote enriched metadata for {len(profiles)} courses to {args.output}")


if __name__ == "__main__":
    main()
