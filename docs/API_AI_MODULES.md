# API — AI Resume Parser (Module 1)

All endpoints require JWT authentication and tenant context (`X-Tenant-Slug` header).

## POST `/api/candidates/parse-resume`

Upload a resume for AI parsing preview (does not create a candidate).

**Content-Type:** `multipart/form-data`  
**Field:** `resume` (file — PDF, DOC, or DOCX, max 10 MB)

**Response 200:**
```json
{
  "parsed_profile": { "name": "...", "confidence": 0.85, "...": "..." },
  "ai_confidence": 0.85,
  "pending_resume_id": "uuid",
  "pending_ext": ".pdf",
  "original_filename": "resume.pdf",
  "mime_type": "application/pdf",
  "file_size_bytes": 12345,
  "source": "ai"
}
```

**Errors:** `400` invalid file, `422` text extraction failed, `503` AI not configured

---

## POST `/api/candidates`

Extended to accept resume-parsed fields. Backward compatible — all new fields optional.

**Additional body fields:**
- `pending_resume_id`, `pending_ext`, `original_filename`, `mime_type`, `file_size_bytes`, `ai_confidence`
- `parsed_profile` (JSONB snapshot)
- `linkedin`, `github`, `portfolio`, `current_company`, `current_location`, `preferred_location`
- `notice_period`, `current_salary`, `professional_summary`
- `education`, `experience`, `projects`, `certifications`, `languages`, `technical_skills`, `soft_skills`

Sets `source` to `resume` when a parsed profile or pending resume is included.

---

## POST `/api/candidates/:id/reparse-resume`

Re-parse stored resume or upload a replacement file.

**Content-Type:** `multipart/form-data` (optional field `resume`)

Without a file: re-reads the stored resume from disk.

**Response 200:**
```json
{
  "candidate": { "...": "updated candidate row" },
  "parsed_profile": { "...": "..." },
  "ai_confidence": 0.82,
  "source": "ai"
}
```

---

## GET `/api/candidates/:id/resume/download`

Download the original resume file for a candidate.

**Response:** file stream with `Content-Disposition: attachment`

---

## PATCH `/api/candidates/:id`

Extended with optional profile fields: `linkedin`, `github`, `portfolio`, `current_company`, `current_location`, `preferred_location`, `notice_period`, `current_salary`, `professional_summary`, `parsed_profile`.
