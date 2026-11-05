import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import { DetectedLibrary, DriveType, LibraryType } from '../types/api.ts';
import { Database, FolderOpen, Loader2, Plus, Search, X, Zap } from 'lucide-react';

interface LibraryWizardModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after libraries are registered; the app rescans games. */
  onSaved: () => void;
}

interface WizardEntry extends DetectedLibrary {
  selected: boolean;
  role: LibraryType | null;
}

const STEPS = ['Detect Libraries', 'Assign Drive Roles', 'Save & Scan'];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(1)} GB`;
}

export const LibraryWizardModal: React.FC<LibraryWizardModalProps> = ({ open, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [entries, setEntries] = useState<WizardEntry[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fresh wizard state on every open; load existing and auto-detect step 1 immediately.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setEntries([]);
    setManualPath('');
    setSaveError(null);
    setDetectError(null);
    setDetecting(true);

    Promise.all([
      api.listLibraries().catch(() => []),
      api.detectLibraries().catch(() => []),
    ])
      .then(([existing, detected]) => {
        const merged: WizardEntry[] = [];
        const seen = new Set<string>();

        // 1. Existing registered libraries (pre-selected with their configured roles)
        for (const lib of existing) {
          const norm = lib.path.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            merged.push({
              id: lib.id,
              path: lib.path,
              drive_type: 'unknown' as DriveType,
              free_bytes: lib.free_bytes,
              total_bytes: lib.total_bytes,
              selected: true,
              role: lib.type,
            });
          }
        }

        // 2. Newly detected Steam libraries
        for (const lib of detected) {
          const norm = lib.path.toLowerCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            merged.push({
              ...lib,
              selected: true,
              role: null,
            });
          }
        }

        setEntries(merged);
      })
      .catch((err) => setDetectError(err instanceof Error ? err.message : 'Detection failed'))
      .finally(() => setDetecting(false));
  }, [open]);

  if (!open) return null;

  const selected = entries.filter((e) => e.selected);

  const addManualPath = () => {
    const p = manualPath.trim();
    if (!p || entries.some((e) => e.path.toLowerCase() === p.toLowerCase())) return;
    setEntries((prev) => [
      ...prev,
      {
        id: '',
        path: p,
        drive_type: 'unknown' as DriveType,
        free_bytes: 0,
        total_bytes: 0,
        selected: true,
        role: null,
      },
    ]);
    setManualPath('');
  };

  const save = async () => {
    try {
      setSaving(true);
      setSaveError(null);
      await api.registerLibraries(selected.map((e) => ({ type: e.role as LibraryType, path: e.path })));
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to register libraries');
    } finally {
      setSaving(false);
    }
  };

  const missingRole = selected.some((e) => e.role === null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configure Libraries"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
      }}
    >
      <div className="card" style={{ maxWidth: '640px', width: '100%', padding: '20px', position: 'relative' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="btn-secondary"
          style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', border: 'none' }}
        >
          <X size={16} />
        </button>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Configure Steam Libraries</h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Step {step} of 3: {STEPS[step - 1]}
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '9999px',
                background: i < step ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
              }}
            />
          ))}
        </div>

        {/* Step 1: auto-detect + manual add */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              {detecting && <Loader2 size={14} className="spin" />}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {detecting ? 'Scanning drives for Steam libraries...' : `${selected.length} library folder(s) found`}
              </span>
            </div>

            {detectError && (
              <div
                style={{
                  marginBottom: '10px',
                  padding: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <FolderOpen size={14} /> {detectError} — add the path manually below.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {entries.map((e) => (
                <label
                  key={e.path}
                  className="card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={e.selected}
                    onChange={(ev) =>
                      setEntries((prev) =>
                        prev.map((p) => (p.path === e.path ? { ...p, selected: ev.target.checked } : p))
                      )
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{e.path}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {e.drive_type} • Free: {formatBytes(e.free_bytes)} / Total: {formatBytes(e.total_bytes)}
                    </div>
                  </div>
                </label>
              ))}
              {entries.length === 0 && !detecting && !detectError && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No libraries found automatically. Add any folder where your games are installed below.</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  flex: 1,
                }}
              >
                <Search size={14} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Games folder path (e.g. D:\Games or D:\SteamLibrary)"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualPath()}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', width: '100%', fontSize: '0.85rem' }}
                />
              </div>
              <button onClick={addManualPath} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}

        {/* Step 2: SSD / HDD roles */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {selected.map((e) => (
              <div
                key={e.path}
                className="card"
                style={{
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{e.path}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Free: {formatBytes(e.free_bytes)}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setEntries((prev) => prev.map((p) => (p.path === e.path ? { ...p, role: 'ssd_cache' as LibraryType } : p)))}
                    className={e.role === 'ssd_cache' ? 'btn-primary' : 'btn-secondary'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Zap size={14} /> SSD Cache
                  </button>
                  <button
                    onClick={() => setEntries((prev) => prev.map((p) => (p.path === e.path ? { ...p, role: 'hdd_master' as LibraryType } : p)))}
                    className={e.role === 'hdd_master' ? 'btn-primary' : 'btn-secondary'}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Database size={14} /> HDD Master
                  </button>
                </div>
              </div>
            ))}
            {missingRole && (
              <p style={{ fontSize: '0.82rem', color: 'var(--warning)' }}>
                Assign a role to every selected library to continue.
              </p>
            )}
          </div>
        )}

        {/* Step 3: review, save, trigger game scan */}
        {step === 3 && (
          <div>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', paddingLeft: 0, listStyle: 'none' }}>
              {selected.map((e) => (
                <li key={e.path} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                  {e.role === 'ssd_cache' ? <Zap size={14} style={{ color: 'var(--ssd-color)' }} /> : <Database size={14} style={{ color: 'var(--hdd-color)' }} />}
                  <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{e.path}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{e.role === 'ssd_cache' ? 'SSD Cache' : 'HDD Master'}</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Game scan starts automatically after saving.
            </p>
            {saveError && (
              <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.85rem' }}>
                {saveError}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="btn-secondary" disabled={saving}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="btn-primary"
              disabled={detecting || selected.length === 0 || (step === 2 && missingRole)}
            >
              Next
            </button>
          ) : (
            <button onClick={save} className="btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {saving && <Loader2 size={14} className="spin" />} Save & Scan Games
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
