import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import TopBar from '../components/ui/TopBar';
import PageHeader from '../components/ui/PageHeader';
import type { ImportValidation } from '../types';

type Step = 'upload' | 'map' | 'validate';

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    return row;
  });
}

export default function ImportCandidatesPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setStep('map');
  };

  const runValidation = async () => {
    const result = await api.validateImport(rows);
    setValidation(result);
    setStep('validate');
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await api.importCandidates(rows, true);
      alert(`Imported ${result.imported} candidates (${result.skipped} skipped).`);
      navigate('/candidates');
    } finally {
      setImporting(false);
    }
  };

  const validCount = validation?.valid ?? rows.length;
  const errorCount = validation?.errors ?? 0;
  const warnCount = validation?.warnings ?? 0;

  return (
    <>
      <TopBar breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Import' }]} />
      <div className="page-content">
        <PageHeader
          title="Import Candidates"
          description="Upload CSV or Excel, map columns, and validate before import."
        />

        <div className="stepper">
          <span className={step === 'upload' ? 'active' : ''}>1. Upload</span>
          <span className={step === 'map' ? 'active' : ''}>2. Map columns</span>
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
              <p className="text-muted">Columns: name/full_name, phone/mobile, email/email_id</p>
              <label className="button-pill button-secondary">
                Browse Files
                <input type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              <a
                href="data:text/csv,name,phone,email%0AJane Doe,+919876543210,jane@email.com"
                download="candidate-template.csv"
                className="link-button"
              >
                Download Template
              </a>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="card">
            <p className="text-muted">File: <strong>{fileName}</strong> — {rows.length} rows detected</p>
            <table className="data-table" style={{ marginTop: '1rem' }}>
              <thead><tr><th>CSV Column</th><th>Sample</th></tr></thead>
              <tbody>
                {Object.keys(rows[0] || {}).map((col) => (
                  <tr key={col}><td>{col}</td><td>{rows[0][col]}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="form-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setStep('upload')}>Back</button>
              <button type="button" className="button-pill button-primary" onClick={runValidation}>Continue to Validation →</button>
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
              <button type="button" className="button-pill button-secondary" onClick={() => setStep('map')}>Back</button>
              <button type="button" className="button-pill button-primary" disabled={importing} onClick={handleImport}>
                {importing ? 'Importing…' : `Import ${validCount} Candidates →`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
