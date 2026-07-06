import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import {
  VGM_CANONICAL_COLUMNS,
  VGM_COLUMN_LABELS,
  buildVgmTemplateCsv,
  parseCandidateImportCsv,
} from '../utils/candidateImportFormat';
import type { ImportValidation, Job } from '../types';

type Step = 'upload' | 'preview' | 'validate';

export default function ImportCandidatesPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [format, setFormat] = useState<'vgm' | 'generic'>('vgm');
  const [defaultJobId, setDefaultJobId] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCandidateImportCsv(text);
    setRows(parsed.rows);
    setFormat(parsed.format);
    setValidation(null);
    setStep('preview');
  };

  const runValidation = async () => {
    const result = await api.validateImport(rows, defaultJobId ? Number(defaultJobId) : undefined);
    setValidation(result);
    setStep('validate');
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await api.importCandidates(
        rows,
        true,
        defaultJobId ? Number(defaultJobId) : undefined
      );
      alert(`Imported ${result.imported} candidates (${result.skipped} skipped).`);
      navigate('/candidates');
    } finally {
      setImporting(false);
    }
  };

  const previewColumns = format === 'vgm' ? [...VGM_CANONICAL_COLUMNS] : Object.keys(rows[0] || {});
  const hasJobColumn = rows.some((r) => r.jobTitle?.trim());
  const readyToValidate = rows.length > 0 && (hasJobColumn || defaultJobId);

  const validCount = validation?.valid ?? rows.length;
  const errorCount = validation?.errors ?? 0;
  const warnCount = validation?.warnings ?? 0;

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Import' }]} />
      <div className="page-content">
        <PageHeader
          title="Import Candidates"
          description="Upload CSV in VGM export format — columns are auto-detected."
        />

        <div className="stepper">
          <span className={step === 'upload' ? 'active' : ''}>1. Upload</span>
          <span className={step === 'preview' ? 'active' : ''}>2. Preview</span>
          <span className={step === 'validate' ? 'active' : ''}>3. Validate</span>
        </div>

        {step === 'upload' && (
          <div className="card">
            <div
              className="drop-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <p className="drop-zone-title">Drag & drop CSV here</p>
              <p className="text-muted">
                Use the VGM export format with columns:{' '}
                <strong>candidateName, candidateEmail, candidatePhone, jobTitle, companyName, location,
                currentStatus, sourcedBy, sourcedBy, lvl1manager, lvl1manager, lvl2manager, lvl2manager,
                appliedOn, interviewDate</strong>
              </p>
              <label className="button-pill button-secondary">
                Browse Files
                <input type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              <a
                href={`data:text/csv,${encodeURIComponent(buildVgmTemplateCsv())}`}
                download="candidate-import-template.csv"
                className="link-button"
              >
                Download Template
              </a>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="card">
            <p className="text-muted">
              File: <strong>{fileName}</strong> — {rows.length} rows detected
              {format === 'vgm' ? ' (VGM format recognized)' : ' (custom format — ensure columns match)'}
            </p>

            {!hasJobColumn && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label" htmlFor="default-job">
                  Default job (when jobTitle column is empty) *
                </label>
                <select
                  id="default-job"
                  className="input-field"
                  value={defaultJobId}
                  onChange={(e) => setDefaultJobId(e.target.value)}
                >
                  <option value="">Select job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.title} — {j.client}</option>
                  ))}
                </select>
              </div>
            )}

            <table className="data-table" style={{ marginTop: '1rem' }}>
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Sample (row 1)</th>
                </tr>
              </thead>
              <tbody>
                {previewColumns.map((col) => (
                  <tr key={col}>
                    <td>{format === 'vgm' ? VGM_COLUMN_LABELS[col as keyof typeof VGM_COLUMN_LABELS] || col : col}</td>
                    <td className="text-muted">{rows[0]?.[col] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!readyToValidate && (
              <p className="text-critical" style={{ marginTop: '0.75rem' }}>
                Add jobTitle values in your CSV or select a default job above.
              </p>
            )}

            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setStep('upload')}>Back</button>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={!readyToValidate}
                onClick={runValidation}
              >
                Continue to Validation →
              </button>
            </div>
          </div>
        )}

        {step === 'validate' && validation && (
          <div className="card">
            <div className="import-summary">
              <span className="summary-chip success">✓ {validCount} valid</span>
              <span className="summary-chip warning">⚠ {warnCount} warnings</span>
              <span className="summary-chip error">✗ {errorCount} errors</span>
            </div>
            {validation.issues.length > 0 && (
              <table className="data-table">
                <thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Issue</th></tr></thead>
                <tbody>
                  {validation.issues.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.name || '—'}</td>
                      <td>{r.phone}</td>
                      <td className={r.severity === 'error' ? 'text-critical' : ''}>{r.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <label className="checkbox-label"><input type="checkbox" defaultChecked /> Skip rows with errors</label>
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setStep('preview')}>Back</button>
              <button type="button" className="button-pill button-primary" disabled={importing || validCount === 0} onClick={handleImport}>
                {importing ? 'Importing…' : `Import ${validCount} Candidates →`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
