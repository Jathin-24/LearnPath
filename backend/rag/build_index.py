"""
build_index.py

Builds a FAISS vector index over enriched_courses.json for RAG retrieval.
Run once (or whenever enriched_courses.json changes) - not part of the live
request path. Embeddings: local sentence-transformers, all-MiniLM-L6-v2, per
docs/final_decisions.md ("local, free, no API key").

Usage:
    python -m backend.rag.build_index
"""

import json
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "enriched_courses.json"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
INDEX_PATH = ARTIFACTS_DIR / "course_index.faiss"
METADATA_PATH = ARTIFACTS_DIR / "course_metadata.json"

MODEL_NAME = "all-MiniLM-L6-v2"


def _embedding_text(course_name: str, profile: dict) -> str:
    concepts = ", ".join(profile.get("concepts", []))
    return (
        f"{course_name}. Difficulty: {profile.get('difficulty', 'unknown')}. "
        f"Concepts: {concepts}. {profile.get('summary', '')}"
    )


def build_index() -> None:
    with open(DATA_PATH, encoding="utf-8") as f:
        courses = json.load(f)

    course_names = list(courses.keys())
    texts = [_embedding_text(name, courses[name]) for name in course_names]

    print(f"Embedding {len(texts)} courses with {MODEL_NAME} ...")
    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    embeddings = np.asarray(embeddings, dtype="float32")

    # Normalized vectors + inner product = cosine similarity
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(course_names, f, indent=2)

    print(f"Wrote index ({index.ntotal} vectors) to {INDEX_PATH}")
    print(f"Wrote metadata ({len(course_names)} course names) to {METADATA_PATH}")


if __name__ == "__main__":
    build_index()
