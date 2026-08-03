import { useRef, useState } from 'react';
import { api } from '../api/client';

interface ResumeUploadZoneProps {
  onParsed: (file: File, result: import('../types').ResumeParseResponse) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  /** Job the candidate is being submitted to — adds JD keyword match to the ATS score. */
  jobId?: number | null;
}

export default function ResumeUploadZone({ onParsed, onError, disabled, jobId }: ResumeUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);

  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.pdf') && !ext.endsWith('.doc') && !ext.endsWith('.docx')) {
      onError('Unsupported file type. Use PDF, DOC, or DOCX.');
      return;
    }
    setParsing(true);
    onError('');
    try {
      const result = await api.parseResumePreview(file, jobId);
      onParsed(file, result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to parse resume');
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 className="card-heading">Upload Resume</h3>
        <p className="text-muted" style={{ marginBottom: '0.75rem' }}>
          PDF, DOC, or DOCX — fields are extracted for you to review before saving.
          {parsing ? ' Large files may take up to a minute on local AI.' : ''}
        </p>
      <div
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled || parsing) return;
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
      >
        <p className="drop-zone-title">{parsing ? 'Parsing resume…' : 'Drag & drop resume here'}</p>
        <button
          type="button"
          className="button-pill button-secondary"
          disabled={disabled || parsing}
          onClick={() => inputRef.current?.click()}
        >
          {parsing ? 'Parsing…' : 'Choose file'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
