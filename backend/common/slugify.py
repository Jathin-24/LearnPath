"""
slugify.py

Deterministic node IDs from a topic/course name, per docs/final_decisions.md
("Node IDs" - slugified name, no separate ID service).
"""

import re


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")
