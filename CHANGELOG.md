# Changelog

## [Unreleased]

### Module 1 — AI Resume Parser

**Added**
- Resume upload and AI parsing (PDF, DOC, DOCX) via Claude in `services/ai.ts`
- File storage helper `services/fileStorage.ts` for pending and candidate resume files
- API endpoints: `POST /api/candidates/parse-resume`, `POST /api/candidates/:id/reparse-resume`, `GET /api/candidates/:id/resume/download`
- Extended `POST /api/candidates` and `PATCH /api/candidates/:id` with structured profile fields
- Database migration `migrateAiResumeParser()` — `parsed_profile`, `resume_meta`, and profile columns on `candidates`
- Frontend: `ResumeUploadZone` component, extended `AddCandidatePage` and `CandidateDetailPage`
- Unit tests for parse confidence and file storage validation

**Dependencies**
- `multer`, `pdf-parse`, `mammoth`, `vitest`, `supertest`
