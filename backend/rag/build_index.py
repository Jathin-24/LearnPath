"""
build_index.py

Builds a FAISS vector index over enriched_courses.json for RAG retrieval.
Run once (or whenever enriched_courses.json changes) - not part of the live
request path. Embeddings: sklearn TF-IDF (lightweight, no GPU/ML libs needed).

Usage:
    python -m backend.rag.build_index
"""

import json
import pickle
from pathlib import Path

import faiss
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "enriched_courses.json"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
INDEX_PATH = ARTIFACTS_DIR / "course_index.faiss"
METADATA_PATH = ARTIFACTS_DIR / "course_metadata.json"
VECTORIZER_PATH = ARTIFACTS_DIR / "tfidf_vectorizer.pkl"


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

    print(f"Building TF-IDF index for {len(texts)} courses ...")
    vectorizer = TfidfVectorizer(
        max_features=4096,
        sublinear_tf=True,
        norm="l2",
    )
    embeddings = vectorizer.fit_transform(texts).toarray().astype("float32")

    # Normalized vectors + inner product = cosine similarity
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(course_names, f, indent=2)
    with open(VECTORIZER_PATH, "wb") as f:
        pickle.dump(vectorizer, f)

    print(f"Wrote index ({index.ntotal} vectors) to {INDEX_PATH}")
    print(f"Wrote metadata ({len(course_names)} course names) to {METADATA_PATH}")
    print(f"Wrote vectorizer to {VECTORIZER_PATH}")


if __name__ == "__main__":
    build_index()
