# Resume Parser Service

Python microservice for resume parsing and job-description generation, used by the Node server.

- **pdfplumber** — PDF text + table extraction
- **python-docx** — DOCX text + table extraction
- **spaCy** (`en_core_web_sm`) — NER (name, location) plus heuristic extraction of contacts, skills, experience, education, projects, certifications
- **jd_generator.py** — template-based job-description generation (no LLM): the title is matched against role families (frontend, backend, data, HR, sales, …) and seniority keywords, then a JD is assembled from curated building blocks

## Setup

```bash
cd parser-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

Or from the repo root: `npm run parser:setup`

## Run

```bash
.venv/bin/uvicorn main:app --port 8020
```

Or from the repo root: `npm run dev:parser` (also started by `npm run dev`).

## API

- `GET /health` — liveness check
- `POST /parse` — multipart `file` (PDF or DOCX) → `{ text, profile, engine }` where `profile` matches the `ParsedProfile` interface in `server/src/services/ai.ts`
- `POST /generate-jd` — JSON `{ title, client?, location?, open_positions?, notes? }` → `{ description, engine }`. Used by `POST /api/jobs/generate-description` on the Node server; Anthropic is only used as a fallback when this service is down.

The Node server calls this service when `RESUME_PARSER_URL` is set (default `http://localhost:8020`). If the service is down, the server falls back to the built-in `pdf-parse`/`mammoth` extraction, and — when Anthropic is configured — Claude still refines the structured profile. Legacy `.doc` files always use the Node fallback.
