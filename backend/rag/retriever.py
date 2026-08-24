"""
retriever.py

Query-time RAG retrieval over the FAISS index built by build_index.py.
retrieve(query, k) is the only function the Path-A agent should call.
"""

import json
from functools import lru_cache

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.rag.build_index import DATA_PATH, INDEX_PATH, METADATA_PATH, MODEL_NAME


@lru_cache
def _load_model() -> SentenceTransformer:
    return SentenceTransformer(MODEL_NAME)


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
    model = _load_model()
    vec = model.encode([text], normalize_embeddings=True)
    return vec[0].tolist()


def retrieve(query: str, k: int = 5) -> list[dict]:
    """Returns up to k courses most relevant to query, ranked by cosine
    similarity, each as {"course_name": str, "score": float, **enriched fields}."""
    index, course_names = _load_index()
    model = _load_model()
    courses = _load_courses()

    query_vec = model.encode([query], normalize_embeddings=True)
    query_vec = np.asarray(query_vec, dtype="float32")

    scores, indices = index.search(query_vec, min(k, len(course_names)))

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx == -1:
            continue
        name = course_names[idx]
        results.append({"course_name": name, "score": float(score), **courses[name]})
    return results
