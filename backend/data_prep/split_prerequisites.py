"""
split_prerequisites.py

Post-processes enriched_courses.json to separate prerequisite edges into:
  - internal_prerequisites: prerequisite IS one of our 80 courses -> link directly
  - external_prerequisite_concepts: prerequisite is a real concept but NOT in our
    course list -> flagged so the Roadmap Generator routes the learner to Path B
    (web/YouTube search) for that specific prerequisite instead of a dead course link

Run this once, right after enrich_courses.py, before building the RAG index.

Usage:
    python split_prerequisites.py --input ../data/enriched_courses.json --output ../data/enriched_courses.json
"""

import argparse
import json


def split_prerequisites(data: dict) -> dict:
    course_names = set(data.keys())

    for course, profile in data.items():
        raw_prereqs = profile.get("prerequisites", [])
        internal = [p for p in raw_prereqs if p in course_names]
        external = [p for p in raw_prereqs if p not in course_names]

        profile["internal_prerequisites"] = internal
        profile["external_prerequisite_concepts"] = external
        # keep "prerequisites" for backwards compatibility, but the app
        # should read internal_/external_ from here on
        profile.pop("prerequisites", None)

    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="../data/enriched_courses.json")
    parser.add_argument("--output", default="../data/enriched_courses.json")
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    data = split_prerequisites(data)

    total_internal = sum(len(v["internal_prerequisites"]) for v in data.values())
    total_external = sum(len(v["external_prerequisite_concepts"]) for v in data.values())
    print(f"Internal prerequisite edges (dataset courses): {total_internal}")
    print(f"External prerequisite concepts (route to Path B): {total_external}")

    with open(args.output, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote updated file to {args.output}")


if __name__ == "__main__":
    main()
