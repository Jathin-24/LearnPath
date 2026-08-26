"""
retriever.py

Query-time RAG retrieval over the FAISS index built by build_index.py.
retrieve(query, k) is the only function the Path-A agent should call.
"""

import json
import pickle
from functools import lru_cache

import faiss
import numpy as np

from backend.rag.build_index import DATA_PATH, INDEX_PATH, METADATA_PATH, VECTORIZER_PATH


@lru_cache
def _load_vectorizer():
    with open(VECTORIZER_PATH, "rb") as f:
        return pickle.load(f)


@lru_cache
def _load_index():
    if not INDEX_PATH.exists():
        raise FileNotFoundError(
            f"No RAG index found at {INDEX_PATH}. Run: python -m backend.rag.build_index"
        )
    index = faiss.read_index(str(INDEX_PATH))
    with open(METADATA_PATH, encoding="utf-8") as f:
        course_names = json.load(f)
    return index, course_names


@lru_cache
def _load_courses() -> dict:
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_courses() -> dict:
    """Public accessor for the raw enriched_courses.json dict - used by
    Path-A for prerequisite-graph traversal, not just similarity search."""
    return _load_courses()


def embed_text(text: str) -> list[float]:
    """Raw normalized embedding for a piece of text - used by Path-A to
    compare goals for the roadmap_templates reuse cache (backend/common/db.py),
    not just course similarity search."""
    vectorizer = _load_vectorizer()
    vec = vectorizer.transform([text]).toarray().astype("float32")
    # L2-normalize for cosine similarity via inner product
    norms = np.linalg.norm(vec, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vec = vec / norms
    return vec[0].tolist()


def retrieve(query: str, k: int = 5) -> list[dict]:
    """Returns up to k courses most relevant to query, ranked by cosine
    similarity, each as {"course_name": str, "score": float, **enriched fields}."""
    index, course_names = _load_index()
    vectorizer = _load_vectorizer()
    courses = _load_courses()

    query_vec = vectorizer.transform([query]).toarray().astype("float32")
    norms = np.linalg.norm(query_vec, axis=1, keepdims=True)
    norms[norms == 0] = 1
    query_vec = query_vec / norms

    scores, indices = index.search(query_vec, min(k, len(course_names)))

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx == -1:
            continue
        name = course_names[idx]
        results.append({"course_name": name, "score": float(score), **courses[name]})
    return results
