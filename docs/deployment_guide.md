# Deployment Guide

How to put this app on the internet. Three pieces: a hosted Postgres
database, the FastAPI backend, and the React frontend. Recommended stack
below is free-tier-friendly and needs no code changes beyond what's
already in place (CORS is env-var driven - see step 2.4) - swap any piece
for a different host if you prefer, the steps are the same shape.

| Piece | Recommended host | Why |
|---|---|---|
| Database | [Supabase](https://supabase.com) | Free Postgres, and this project already anticipated it as the deploy-time swap for local Postgres (see `CLAUDE.md`) |
| Backend | [Render](https://render.com) | Free web service tier, trivial Python/FastAPI deploys, env vars via dashboard |
| Frontend | [Vercel](https://vercel.com) | Best-in-class Vite/React support, auto-deploys from GitHub |

Do these in order - the backend needs the database URL, the frontend
needs the backend URL.

## 1. Database (Supabase)

1. Sign up at supabase.com, create a new project (pick a strong database
   password when prompted - you'll need it in step 3).
2. Once it's provisioned: **Project Settings → Database → Connection
   string**. Use the **Session pooler** connection string (port `6543`) -
   this backend opens a fresh `psycopg` connection per request rather than
   pooling itself (see `backend/common/db.py`), so a pooler on the DB side
   avoids exhausting Supabase's direct-connection limit under any real
   traffic. It looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:6543/postgres
   ```
3. That's it - no manual schema setup. `backend/common/db.py`'s `init_db()`
   runs automatically on the backend's startup (`main.py`'s `lifespan`
   hook) and creates every table if it doesn't already exist.

## 2. Backend (Render)

1. Push this repo to GitHub if you haven't already (it already is, per
   this project's history).
2. Render dashboard → **New → Web Service** → connect the GitHub repo.
3. Configure:
   - **Root directory**: leave blank (repo root - `requirements.txt` and
     `backend/` both live there).
   - **Runtime**: Python 3.
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT`
     (Render injects `$PORT`; don't hardcode 8000 here.)
4. **Environment variables** (Render dashboard → Environment), same
   names/shapes as your local `.env`:
   ```
   LLM_PROVIDERS=groq,groq,openrouter
   LLM_API_KEYS=<key1>,<key2>,<key3>
   LLM_MODELS=openai/gpt-oss-120b,openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b:free
   DATABASE_URL=<the Supabase pooler connection string from step 1>
   TAVILY_API_KEY=<your Tavily key>
   ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app
   ```
   `ALLOWED_ORIGINS` is what you'll set in step 3 once you know your
   Vercel URL - you can deploy the backend first with it blank and add it
   after, Render redeploys on env var changes.
5. Deploy. Once it's live, hit `https://<your-service>.onrender.com/health`
   - should show `"status": "ok"` and each LLM endpoint's state. If
   `llm_config_error` is non-null, double check the env vars above.
6. **Free tier note**: Render's free web services spin down after
   inactivity and take ~30-60s to wake on the next request - the first
   request after idle will be slow (a signup or `/health` check timing out
   the first try is normal, just retry). Fine for a demo/hackathon; a paid
   tier removes this if you need it always warm.
7. **Why TF-IDF (not sentence-transformers)**: the RAG retrieval is built on
   sklearn TF-IDF + FAISS instead of torch + sentence-transformers
   (`all-MiniLM-L6-v2`). That stack is intentional for the free tier: torch
   and the model artifact exceed Render's 512MB free-tier memory/build
   budget, whereas TF-IDF has no model download and no heavy ML dependency.
   The committed index (`backend/rag/artifacts/`) requires no build step at
   deploy. See `docs/final_decisions.md` under "RAG embeddings".

## 3. Frontend (Vercel)

1. Vercel dashboard → **Add New → Project** → import the same GitHub repo.
2. Configure:
   - **Root directory**: `frontend`
   - **Framework preset**: Vite (auto-detected)
   - **Build command**: `npm run build` (default)
   - **Output directory**: `dist` (default)
3. **Environment variable**:
   ```
   VITE_API_BASE_URL=https://<your-render-service>.onrender.com
   ```
4. Deploy. Vercel gives you a URL like `https://<project>.vercel.app`.
5. Go back to Render (step 2.4) and set `ALLOWED_ORIGINS` to that exact
   URL, then redeploy the backend (or just wait for the auto-redeploy
   Render triggers on env var save). Without this, the browser's CORS
   policy will block every request from the deployed frontend to the
   deployed backend - you'll see it immediately as failed network requests
   in devtools, not a subtle bug.

## 4. Verify end to end

Visit your Vercel URL, sign up, state a goal, and walk through onboarding.
If the first backend request is slow (see the Render free-tier note
above), that's expected - everything after should be normal speed.

## Notes / gotchas

- **Resume file storage** (`backend/common/db.py`'s `resume_files` table)
  stores PDF bytes directly in Postgres - no filesystem/S3 dependency, so
  it works identically on Render's ephemeral filesystem as it does
  locally. Nothing extra to configure.
- **The RAG index** (`backend/rag/artifacts/*.faiss`) is committed to the
  repo, not built at deploy time - no extra build step needed. If you
  change `backend/data/enriched_courses.json`, rebuild locally
  (`python -m backend.rag.build_index`) and commit the updated artifacts
  before deploying.
- **LLM rate limits**: the free tiers this project defaults to (Groq,
  OpenRouter's free models) have real daily/per-minute caps shared across
  however many people hit your deployed instance - if you expect real
  traffic (e.g. judges trying it live), consider adding a paid key as an
  earlier entry in `LLM_PROVIDERS`/`LLM_API_KEYS`/`LLM_MODELS` so free-tier
  exhaustion doesn't take the whole app down mid-demo.
- **Custom domain**: both Render and Vercel support adding one for free
  under their respective dashboards, if you want something nicer than the
  default subdomains.
