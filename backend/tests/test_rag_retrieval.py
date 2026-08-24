"""
test_rag_retrieval.py

Standalone retrieval-quality check (per CLAUDE.md build order step 4: "test
retrieval quality standalone before wiring into an agent"). Requires the FAISS
index to already be built: python -m backend.rag.build_index
"""

from backend.rag.retriever import retrieve


def test_backend_query_surfaces_backend_courses():
    results = retrieve("I want to become a backend developer", k=5)
    names = {r["course_name"] for r in results}
    backend_courses = {
        "Node.js Backend Development",
        "Flask API Development",
        "Django Web Framework",
        "REST API Design Principles",
        "Go Language for Backend",
        "GraphQL API Development",
    }
    assert names & backend_courses, f"expected a backend course in top 5, got {names}"


def test_machine_learning_query_surfaces_ml_courses():
    results = retrieve("I want to learn machine learning from scratch", k=5)
    names = {r["course_name"] for r in results}
    ml_courses = {
        "Machine Learning Fundamentals",
        "Deep Learning with TensorFlow",
        "Deep Learning with PyTorch",
        "Supervised Learning Algorithms",
        "Unsupervised Learning Techniques",
    }
    assert names & ml_courses, f"expected an ML course in top 5, got {names}"


def test_results_are_score_sorted_and_bounded():
    results = retrieve("mobile app development", k=3)
    assert len(results) == 3
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)
