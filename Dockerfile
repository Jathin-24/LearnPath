# syntax = docker/dockerfile:1

# ---------- Stage 1: build the React SPA ----------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Single-origin build: the SPA and the API are served by the SAME FastAPI
# process on one port, so the API base URL is empty (requests go to the
# current origin). Local dev (VITE_API_BASE_URL unset) keeps its 8000 default.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---------- Stage 2: FastAPI backend + built SPA ----------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
# libgomp1 = OpenMP runtime required by the faiss-cpu / scikit-learn wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ backend/
COPY --from=frontend /build/dist frontend/dist

EXPOSE 8000
CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]