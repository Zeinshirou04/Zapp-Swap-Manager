import React from 'react';
import { JobType, Library } from '../types/api.ts';
import { AlertTriangle, HardDrive, Loader2, X } from 'lucide-react';

export interface SwapAction {
  type: JobType;
  appId: number;
  title: string;
  sizeBytes: number;
  targetLibraryId: string;
}

interface SwapConfirmModalProps {
  action: SwapAction | null;
  libraries: Library[];
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTION_META: Record<JobType, { verb: string; canFree: boolean }> = {
  // promote copies to SSD (target SSD fills); evict frees SSD after verified backup;
  // backup only mirrors changes: no disk impact.
  promote: { verb: 'Move to SSD', canFree: false },
  evict: { verb: 'Evict to HDD', canFree: true },
  backup: { verb: 'Backup to HDD', canFree: false },
};

function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? '-' : '';
  const gb = Math.abs(bytes) / (1024 * 1024 * 1024);
  if (gb >= 1000) return `${sign}${(gb / 1024).toFixed(2)} TB`;
  return `${sign}${gb.toFixed(2)} GB`;
}

const ChecklistItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.85rem' }}>
    <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓</span>
    <span style={{ color: 'var(--text-muted)' }}>{children}</span>
  </li>
);

const MeterRow: React.FC<{
  label: string;
  freeBefore: number;
  freeAfter: number;
  total: number;
  warn: boolean;
}> = ({ label, freeBefore, freeAfter, total, warn }) => {
  const usedAfter = Math.max(0, total - freeAfter);
  const pct = total > 0 ? Math.min(100, Math.round((usedAfter / total) * 100)) : 0;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <HardDrive size={14} style={{ color: 'var(--text-muted)' }} /> {label}
        </span>
        <span style={{ fontWeight: 600, color: warn ? 'var(--danger)' : 'var(--text-main)' }}>
          {formatBytes(freeBefore)} → {formatBytes(freeAfter)} free
        </span>
      </div>
      <div className="progress-bar-bg">
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, backgroundColor: warn ? 'var(--danger)' : 'var(--primary)' }}
        />
      </div>
      {warn && (
        <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
          Not enough free space after this transfer.
        </span>
      )}
    </div>
  );
};

export const SwapConfirmModal: React.FC<SwapConfirmModalProps> = ({
  action,
  libraries,
  loading,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!action) return null;

  const meta = ACTION_META[action.type];
  const ssd = libraries.find((l) => l.type === 'ssd_cache');
  const hdd = libraries.find((l) => l.type === 'hdd_master');

  // EVict frees space on the SSD (source); promote fills the SSD (target).
  const ssdDelta = action.type === 'evict' ? action.sizeBytes
    : action.type === 'promote' ? -action.sizeBytes
    : 0;
  const ssdFreeBefore = ssd?.free_bytes ?? 0;
  const ssdFreeAfter = ssdFreeBefore + ssdDelta;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm ${meta.verb}`}
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
      <div
        className="card"
        style={{ maxWidth: '520px', width: '100%', padding: '20px', position: 'relative' }}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="btn-secondary"
          style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', border: 'none' }}
        >
          <X size={16} />
        </button>

        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>
          Confirm Transfer — {meta.verb}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {action.title} • App ID: {action.appId} • Size: {formatBytes(action.sizeBytes)}
        </p>

        {/* Drive capacity impact */}
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Drive Space Impact
        </h3>
        {ssd && (
          <MeterRow
            label="SSD Cache"
            freeBefore={ssdFreeBefore}
            freeAfter={ssdFreeAfter}
            total={ssd.total_bytes}
            warn={ssdFreeAfter < 0}
          />
        )}
        {hdd && (
          <MeterRow
            label="HDD Master"
            freeBefore={hdd.free_bytes}
            freeAfter={hdd.free_bytes}
            total={hdd.total_bytes}
            warn={false}
          />
        )}
        {action.type !== 'backup' && ssdFreeAfter < 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.85rem', alignItems: 'center' }}>
            <AlertTriangle size={16} />
            <span>This transfer would exceed the SSD&apos;s free space.</span>
          </div>
        )}

        {/* Safety guarantees */}
        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Safety Guarantees
        </h3>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', paddingLeft: 0, listStyle: 'none' }}>
          <ChecklistItem>
            Files are first mirrored with Robocopy and bit-for-bit verified before anything is deleted.
          </ChecklistItem>
          <ChecklistItem>
            SSD files are removed only after the HDD copy passes verification — nothing is deleted up front.
          </ChecklistItem>
          <ChecklistItem>
            Steam manifests are updated atomically; a failed or cancelled transfer leaves the game playable from its current library.
          </ChecklistItem>
        </ul>

        {error && (
          <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary"
            disabled={loading || (action.type !== 'backup' && ssdFreeAfter < 0)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {loading && <Loader2 size={14} className="spin" />}
            Confirm Transfer
          </button>
        </div>
      </div>
    </div>
  );
};
