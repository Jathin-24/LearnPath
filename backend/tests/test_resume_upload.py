"""
test_resume_upload.py

Integration test for the resume reader (build order Round 2), real Postgres.
No external PDF fixture file - builds a minimal valid single-page PDF by hand
(pypdf can create blank pages but not easily author text content, so this
constructs the raw PDF object structure directly: catalog, pages, page,
font, and a content stream with a Tj text-show operator, plus a correct
xref table pypdf needs to parse it).
"""

import io

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _build_pdf(text: str) -> bytes:
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 300 300]/Contents 5 0 R>>",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    stream = f"BT /F1 12 Tf 20 200 Td ({text}) Tj ET".encode()
    objects.append(b"<</Length " + str(len(stream)).encode() + b">>\nstream\n" + stream + b"\nendstream")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(str(i).encode() + b" 0 obj" + obj + b"endobj\n")
    xref_offset = out.tell()
    n = len(objects) + 1
    out.write(f"xref\n0 {n}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(b"trailer<</Size " + str(n).encode() + b"/Root 1 0 R>>\n")
    out.write(b"startxref\n" + str(xref_offset).encode() + b"\n%%EOF")
    return out.getvalue()


def _create_session(client) -> str:
    return client.post("/session").json()["session_id"]


def test_resume_upload_extracts_text_into_profile(client):
    session_id = _create_session(client)
    pdf_bytes = _build_pdf("Experienced Python backend developer with 3 years building REST APIs")

    resp = client.post(
        "/profile/resume",
        data={"session_id": session_id},
        files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 200
    resume_raw = resp.json()["state"]["learner_profile"]["resume_raw"]
    assert "Python backend developer" in resume_raw

    fetched = client.get(f"/state/{session_id}")
    assert fetched.json()["state"]["learner_profile"]["resume_raw"] == resume_raw


def test_resume_upload_rejects_non_pdf(client):
    session_id = _create_session(client)

    resp = client.post(
        "/profile/resume",
        data={"session_id": session_id},
        files={"file": ("resume.txt", b"just plain text", "text/plain")},
    )
    assert resp.status_code == 400
