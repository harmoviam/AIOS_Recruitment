import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { ImportFolderCandidate, Job } from '../types';

type Step = 'configure' | 'preview' | 'importing' | 'done';

export default function ImportCandidatesFolderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('configure');
  const [folderPath, setFolderPath] = useState('/Users/apple/Downloads/total');
  const [defaultJobId, setDefaultJobId] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<ImportFolderCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [totalFiles, setTotalFiles] = useState(0);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  useEffect(() => {
    api.getJobs().then(setJobs);
  }, []);

  const handleScan = async () => {
    if (!folderPath.trim()) return;
    setScanning(true);
    setScanError('');
    try {
      const result = await api.scanImportFolder(folderPath.trim());
      setCandidates(result.candidates);
      setTotalFiles(result.total_files);
      setTotalPdfs(result.total_pdfs);
      setSelected(new Set(result.candidates.map((_, i) => i)));
      setStep('preview');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to scan folder');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((_, i) => i)));
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setStep('importing');
    try {
      const selectedRows = candidates
        .filter((_, i) => selected.has(i))
        .map((c) => ({
          candidateName: c.name,
          candidateEmail: c.email,
          candidatePhone: c.phone,
          jobTitle: c.role,
          skills: c.skills,
          experience_years: c.experience,
          notes: c.summary,
        }));
      const result = await api.importFromFolder(
        folderPath.trim(),
        selectedRows,
        defaultJobId ? Number(defaultJobId) : undefined
      );
      setImportResult(result);
      setStep('done');
    } catch (err) {
      setImportResult({
        imported: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : 'Import failed'],
      });
      setStep('done');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Import from Folder' }]} />
      <div className="page-content">
        <PageHeader
          title="Import Candidates from Folder"
          description="Scan a folder of resume PDFs and import all candidates with their CVs attached."
        />

        <div className="stepper">
          <span className={step === 'configure' ? 'active' : ''}>1. Configure</span>
          <span className={step === 'preview' || step === 'importing' ? 'active' : ''}>2. Preview</span>
          <span className={step === 'done' ? 'active' : ''}>3. Done</span>
        </div>

        {step === 'configure' && (
          <div className="card">
            <div className="form-group">
              <label className="form-label" htmlFor="folder-path">Folder Path *</label>
              <input
                id="folder-path"
                className="input-field"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/resume/folder"
              />
              <p className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
                Folder must contain an <code>all_resumes_summary.csv</code> file and matching PDF resumes.
              </p>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label" htmlFor="default-job-folder">Default Job (when role column is empty)</label>
              <select
                id="default-job-folder"
                className="input-field"
                value={defaultJobId}
                onChange={(e) => setDefaultJobId(e.target.value)}
              >
                <option value="">Select job (optional)…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} — {j.client}</option>
                ))}
              </select>
            </div>

            {scanError && <p className="text-critical" style={{ marginTop: '0.75rem' }}>{scanError}</p>}

            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => navigate('/candidates')}>Cancel</button>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={!folderPath.trim() || scanning}
                onClick={handleScan}
              >
                {scanning ? 'Scanning…' : 'Scan Folder →'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="card">
            <p className="text-muted">
              Found <strong>{candidates.length}</strong> candidates from <strong>{totalPdfs}</strong> PDFs
              ({totalFiles} total files in folder)
            </p>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label" htmlFor="default-job-preview">Default Job (when role column is empty)</label>
              <select
                id="default-job-preview"
                className="input-field"
                value={defaultJobId}
                onChange={(e) => setDefaultJobId(e.target.value)}
              >
                <option value="">Select job (optional)…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} — {j.client}</option>
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
                        checked={selected.size === candidates.length && candidates.length > 0}
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
                  {candidates.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                        />
                      </td>
                      <td>{c.name || '—'}</td>
                      <td className="text-muted">{c.email || '—'}</td>
                      <td className="text-muted">{c.phone || '—'}</td>
                      <td>{c.role || '—'}</td>
                      <td className="text-muted">{c.experience || '—'}</td>
                      <td className="text-muted" style={{ fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.filename}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {selected.size} of {candidates.length} selected
            </p>

            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setStep('configure')}>Back</button>
              <button
                type="button"
                className="button-pill button-primary"
                disabled={selected.size === 0 || importing}
                onClick={handleImport}
              >
                {importing ? 'Importing…' : `Import ${selected.size} Candidates with Resumes →`}
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '1.1rem' }}>Importing candidates and uploading resumes…</p>
            <p className="text-muted" style={{ marginTop: '0.5rem' }}>This may take a few minutes depending on the number of files.</p>
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="card">
            <div className="import-summary">
              <span className="summary-chip success">✓ {importResult.imported} imported</span>
              <span className="summary-chip warning">⊘ {importResult.skipped} skipped</span>
              {importResult.errors.length > 0 && (
                <span className="summary-chip error">✗ {importResult.errors.length} errors</span>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p className="text-critical" style={{ marginBottom: '0.5rem' }}>Errors:</p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                  {importResult.errors.map((err, i) => (
                    <li key={i} className="text-critical" style={{ fontSize: '0.85rem' }}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => { setStep('configure'); setImportResult(null); setCandidates([]); setSelected(new Set()); }}>
                Import More
              </button>
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
