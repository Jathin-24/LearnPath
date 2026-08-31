"""
Optional single-image support: serve the built React SPA from the same
FastAPI process that hosts the API.

Mounted only when a production frontend build exists at frontend/dist (or
$FRONTEND_DIST). No-ops otherwise, so the Render/Vercel deployment paths
(backend and frontend hosted separately) are completely unaffected.

IMPORTANT: call mount_frontend(app) AFTER all API routes are registered.
The catch-all below only ever sees GET paths no real route claimed, and it
returns index.html (SPA fallback) for anything that is not a real asset file.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def _find_dist() -> Path | None:
    env = os.environ.get("FRONTEND_DIST", "").strip()
    if env:
        p = Path(env)
        return p if p.is_dir() else None
    # parents[2] of this file: backend/api/serve_frontend.py -> repo root.
    root = Path(__file__).resolve().parents[2]
    dist = root / "frontend" / "dist"
    return dist if dist.is_dir() else None


def mount_frontend(app: FastAPI) -> bool:
    """Mount a static SPA build. Returns True if it mounted, False otherwise."""
    dist = _find_dist()
    if dist is None:
        return False

    dist_root = dist.resolve()
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Serve real files (e.g. /favicon.svg, /vite.svg) if present, otherwise
        # fall back to index.html so client-side routes deep-link correctly.
        if full_path:
            target = (dist_root / full_path).resolve()
            if target.is_file() and str(target).startswith(str(dist_root)):
                return FileResponse(str(target))
        return FileResponse(str(dist_root / "index.html"))

    return True