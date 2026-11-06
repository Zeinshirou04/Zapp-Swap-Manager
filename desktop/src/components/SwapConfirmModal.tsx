import React from 'react';
import { JobType, Library } from '../types/api.ts';
import { AlertTriangle, HardDrive, Loader2, X } from 'lucide-react';
import { formatBytes, formatLibraryName } from '../utils/format.ts';

export interface SwapAction {
  type: JobType;
  appId: number;
  title: string;
  sizeBytes: number;
  targetLibraryId: string;
  sourceLibraryId?: string;
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
  promote: { verb: 'Move to SSD', canFree: false },
  evict: { verb: 'Evict to HDD', canFree: true },
  backup: { verb: 'Backup to HDD', canFree: false },
};

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
  const targetLib =
    libraries.find((l) => l.id === action.targetLibraryId) ||
    (action.type === 'promote'
      ? libraries.find((l) => l.type === 'ssd_cache')
      : libraries.find((l) => l.type === 'hdd_master'));

  const sourceLib =
    libraries.find((l) => l.id === action.sourceLibraryId) ||
    (action.type === 'promote'
      ? libraries.find((l) => l.type === 'hdd_master')
      : libraries.find((l) => l.type === 'ssd_cache'));

  const ssd = action.type === 'promote' ? targetLib : sourceLib;
  const hdd = action.type === 'promote' ? sourceLib : targetLib;

  // Space projections based on action type:
  // Promote: moves HDD -> SSD (SSD fills sizeBytes, HDD frees sizeBytes)
  // Evict: moves SSD -> HDD (SSD frees sizeBytes, HDD fills sizeBytes)
  // Backup: copies SSD -> HDD (SSD unchanged, HDD fills sizeBytes)
  let ssdDelta = 0;
  let hddDelta = 0;

  if (action.type === 'promote') {
    ssdDelta = -action.sizeBytes;
    hddDelta = action.sizeBytes;
  } else if (action.type === 'evict') {
    ssdDelta = action.sizeBytes;
    hddDelta = -action.sizeBytes;
  } else if (action.type === 'backup') {
    ssdDelta = 0;
    hddDelta = -action.sizeBytes;
  }

  const ssdFreeBefore = ssd?.free_bytes ?? 0;
  const ssdFreeAfter = ssdFreeBefore + ssdDelta;

  const hddFreeBefore = hdd?.free_bytes ?? 0;
  const hddFreeAfter = hddFreeBefore + hddDelta;

  const ssdName = ssd ? formatLibraryName(ssd) : 'SSD Library';
  const hddName = hdd ? formatLibraryName(hdd) : 'HDD Library';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm ${meta.verb}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
      }}
    >
      <div
        className="card"
        style={{ maxWidth: '520px', width: '100%', padding: '24px', position: 'relative' }}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="btn-secondary"
          style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px', border: 'none' }}
        >
          <X size={16} />
        </button>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
          Confirm Transfer — {meta.verb}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {action.title} • App ID: {action.appId} • Size: {formatBytes(action.sizeBytes)}
        </p>

        {/* Drive capacity impact */}
        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
          Projected Drive Space
        </h3>
        {ssd && (
          <MeterRow
            label={ssdName}
            freeBefore={ssdFreeBefore}
            freeAfter={ssdFreeAfter}
            total={ssd.total_bytes}
            warn={ssdFreeAfter < 0}
          />
        )}
        {hdd && (
          <MeterRow
            label={hddName}
            freeBefore={hddFreeBefore}
            freeAfter={hddFreeAfter}
            total={hdd.total_bytes}
            warn={hddFreeAfter < 0}
          />
        )}
        {action.type !== 'backup' && ssdFreeAfter < 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: '0.85rem', alignItems: 'center' }}>
            <AlertTriangle size={16} />
            <span>This transfer would exceed the SSD&apos;s free space.</span>
          </div>
        )}

        {/* Safety guarantees */}
        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 600 }}>
          Safety Guarantees
        </h3>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px', paddingLeft: 0, listStyle: 'none' }}>
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
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--danger)',
              borderRadius: 'var(--radius)',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onCancel} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary"
            disabled={loading || (action.type === 'promote' && ssdFreeAfter < 0)}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" /> Queuing...
              </>
            ) : (
              'Confirm Transfer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
