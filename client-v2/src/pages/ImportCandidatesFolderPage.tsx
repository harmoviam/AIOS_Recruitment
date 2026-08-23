import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { FolderImportOutcome, Job } from '../types';
import {
  inspectCandidateImportFolder,
  type FolderImportRow,
} from '../utils/folderImport';

type Step = 'configure' | 'preview' | 'importing' | 'done';
type ImportAttempt =
  | { status: 'pending' }
  | { status: 'complete'; outcome: FolderImportOutcome['outcome'] }
  | { status: 'failed'; error: string };

const DIRECTORY_INPUT_PROPS = { webkitdirectory: '', directory: '' } as Record<string, string>;
const IMPORT_CONCURRENCY = 3;

function candidatePayload(row: FolderImportRow): Record<string, string> {
  const candidate = row.candidate;
  return {
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    jobTitle: candidate.role,
    skills: candidate.skills,
    experience_years: candidate.experience,
    notes: candidate.summary,
    filename: candidate.filename,
  };
}

export default function ImportCandidatesFolderPage() {
  const navigate = useNavigate();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('configure');
  const [folderName, setFolderName] = useState('');
  const [defaultJobId, setDefaultJobId] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rows, setRows] = useState<FolderImportRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [readingFolder, setReadingFolder] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [attempts, setAttempts] = useState<Record<number, ImportAttempt>>({});
  const [processed, setProcessed] = useState(0);
  const [attemptTotal, setAttemptTotal] = useState(0);

  useEffect(() => {
    api.getJobs().then(setJobs).catch(() => setJobs([]));
  }, []);

  const selectableIndexes = useMemo(
    () => rows.flatMap((row, index) => row.pdfStatus === 'matched' ? [index] : []),
    [rows]
  );
  const missingCount = rows.length - selectableIndexes.length;
  const completedAttempts = Object.values(attempts).filter((attempt) => attempt.status === 'complete');
  const importedCount = completedAttempts.filter(
    (attempt) => attempt.status === 'complete' && attempt.outcome === 'imported'
  ).length;
  const repairedCount = completedAttempts.filter(
    (attempt) => attempt.status === 'complete' && attempt.outcome === 'resume_attached'
  ).length;
  const skippedCount = completedAttempts.filter(
    (attempt) => attempt.status === 'complete' && attempt.outcome === 'skipped_duplicate'
  ).length;
  const failedIndexes = Object.entries(attempts).flatMap(([index, attempt]) =>
    attempt.status === 'failed' ? [Number(index)] : []
  );

  const resetImport = () => {
    setFolderName('');
    setRows([]);
    setSelected(new Set());
    setAttempts({});
    setProcessed(0);
    setAttemptTotal(0);
    setFolderError('');
    if (folderInputRef.current) folderInputRef.current.value = '';
    setStep('configure');
  };

  const handleFolder = async (files: FileList | null) => {
    if (!files?.length) return;
    setReadingFolder(true);
    setFolderError('');
    try {
      const inspection = await inspectCandidateImportFolder(Array.from(files));
      setFolderName(inspection.folderName);
      setRows(inspection.rows);
      setTotalFiles(inspection.totalFiles);
      setTotalPdfs(inspection.totalPdfs);
      setSelected(new Set(
        inspection.rows.flatMap((row, index) => row.pdfStatus === 'matched' ? [index] : [])
      ));
      setAttempts({});
      setStep('preview');
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Unable to read this folder.');
      if (folderInputRef.current) folderInputRef.current.value = '';
    } finally {
      setReadingFolder(false);
    }
  };

  const toggleSelect = (index: number) => {
    if (rows[index]?.pdfStatus !== 'matched') return;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = selectableIndexes.length > 0 &&
      selectableIndexes.every((index) => selected.has(index));
    setSelected(allSelected ? new Set() : new Set(selectableIndexes));
  };

  const runImport = async (indexes: number[], retry = false) => {
    if (indexes.length === 0) return;
    const initialAttempts = retry ? { ...attempts } : {};
    for (const index of indexes) initialAttempts[index] = { status: 'pending' };
    setAttempts(initialAttempts);
    setProcessed(0);
    setAttemptTotal(indexes.length);
    setStep('importing');

    let cursor = 0;
    const worker = async () => {
      while (cursor < indexes.length) {
        const index = indexes[cursor++];
        const row = rows[index];
        if (!row?.resume) continue;
        try {
          const result = await api.importFromFolder(
            candidatePayload(row),
            row.resume,
            defaultJobId ? Number(defaultJobId) : undefined
          );
          setAttempts((current) => ({
            ...current,
            [index]: { status: 'complete', outcome: result.outcome },
          }));
        } catch (err) {
          setAttempts((current) => ({
            ...current,
            [index]: {
              status: 'failed',
              error: err instanceof Error ? err.message : 'Import failed.',
            },
          }));
        } finally {
          setProcessed((current) => current + 1);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(IMPORT_CONCURRENCY, indexes.length) }, () => worker())
    );
    setStep('done');
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Import from Folder' }]} />
      <div className="page-content">
        <PageHeader
          title="Import Candidates from Folder"
          description="Choose a folder of resume PDFs and import all candidates with their CVs attached."
        />

        <div className="stepper">
          <span className={step === 'configure' ? 'active' : ''}>1. Choose Folder</span>
          <span className={step === 'preview' || step === 'importing' ? 'active' : ''}>2. Preview</span>
          <span className={step === 'done' ? 'active' : ''}>3. Done</span>
        </div>

        {step === 'configure' && (
          <div className="card">
            <div className="drop-zone">
              <p className="drop-zone-title">Choose your candidate resume folder</p>
              <p className="text-muted">
                The folder must contain <code>all_resumes_summary.csv</code> and its matching PDF resumes.
                Files stay on this device until you start the import.
              </p>
              <label className="button-pill button-primary">
                {readingFolder ? 'Reading Folder…' : 'Choose Folder'}
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  hidden
                  disabled={readingFolder}
                  {...DIRECTORY_INPUT_PROPS}
                  onChange={(event) => void handleFolder(event.target.files)}
                />
              </label>
            </div>
            {folderError && <p className="text-critical" style={{ marginTop: '0.75rem' }}>{folderError}</p>}
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => navigate('/candidates')}>Cancel</button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="card">
            <p className="text-muted">
              Folder: <strong>{folderName}</strong> — found <strong>{rows.length}</strong> candidate rows and{' '}
              <strong>{totalPdfs}</strong> PDFs ({totalFiles} total files).
            </p>
            {missingCount > 0 && (
              <p className="text-critical" style={{ marginTop: '0.5rem' }}>
                {missingCount} row{missingCount === 1 ? '' : 's'} cannot be selected because the matching PDF is missing or ambiguous.
              </p>
            )}

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label" htmlFor="default-job-folder">Default Job (when role column is empty)</label>
              <select
                id="default-job-folder"
                className="input-field"
                value={defaultJobId}
                onChange={(event) => setDefaultJobId(event.target.value)}
              >
                <option value="">Select job (optional)…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title} — {job.client}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectableIndexes.length > 0 && selectableIndexes.every((index) => selected.has(index))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Experience</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.rowNumber}-${row.candidate.filename}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(index)}
                          disabled={row.pdfStatus !== 'matched'}
                          onChange={() => toggleSelect(index)}
                        />
                      </td>
                      <td>{row.candidate.name}</td>
                      <td className="text-muted">{row.candidate.email || '—'}</td>
                      <td className="text-muted">{row.candidate.phone || '—'}</td>
                      <td>{row.candidate.role || '—'}</td>
                      <td className="text-muted">{row.candidate.experience || '—'}</td>
                      <td
                        className={row.pdfStatus === 'matched' ? 'text-muted' : 'text-critical'}
                        title={row.candidate.filename}
                        style={{ fontSize: '0.75rem', maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {row.pdfStatus === 'matched'
                          ? row.candidate.filename
                          : row.pdfStatus === 'ambiguous'
                            ? 'Ambiguous filename'
                            : 'PDF missing'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {selected.size} of {selectableIndexes.length} importable candidates selected
            </p>
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={resetImport}>Choose Another Folder</button>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={selected.size === 0}
                onClick={() => void runImport([...selected].sort((a, b) => a - b))}
              >
                Import {selected.size} Candidates with Resumes →
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '1.1rem' }}>Importing candidates and uploading resumes…</p>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>
              {processed} of {attemptTotal} processed. Keep this page open until the import finishes.
            </p>
            <progress value={processed} max={Math.max(attemptTotal, 1)} style={{ width: 'min(460px, 100%)', marginTop: '1rem' }} />
          </div>
        )}

        {step === 'done' && (
          <div className="card">
            <div className="import-summary">
              <span className="summary-chip success">✓ {importedCount} imported</span>
              {repairedCount > 0 && <span className="summary-chip success">✓ {repairedCount} resumes attached</span>}
              <span className="summary-chip warning">⊘ {skippedCount} duplicates skipped</span>
              {failedIndexes.length > 0 && (
                <span className="summary-chip error">✗ {failedIndexes.length} failed</span>
              )}
            </div>

            {failedIndexes.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p className="text-critical" style={{ marginBottom: '0.5rem' }}>Failed rows:</p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {failedIndexes.map((index) => {
                    const attempt = attempts[index];
                    return (
                      <li key={index} className="text-critical" style={{ fontSize: '0.85rem' }}>
                        {rows[index]?.candidate.name}: {attempt?.status === 'failed' ? attempt.error : 'Import failed.'}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={resetImport}>Import More</button>
              {failedIndexes.length > 0 && (
                <button
                  type="button"
                  className="button-pill button-secondary"
                  onClick={() => void runImport(failedIndexes, true)}
                >
                  Retry {failedIndexes.length} Failed
                </button>
              )}
              <button type="button" className="button-pill button-primary" onClick={() => navigate('/candidates')}>
                View Candidates →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
