import React, { useEffect } from 'react';
import { CaptureItem } from '../types/api.ts';
import { getCaptureFileUrl } from '../api/client.ts';
import { formatBytes, formatExactTimestamp } from '../utils/format.ts';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  X,
} from 'lucide-react';

export interface CaptureViewerModalProps {
  open: boolean;
  items: CaptureItem[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
  onCopyImage: (item: CaptureItem) => void;
  copyingId: string | null;
  copiedId: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  sharex: 'ShareX',
  shadowplay: 'NVIDIA ShadowPlay',
  custom: 'Custom Folder',
};

const MATCH_LABELS: Record<string, string> = {
  shadowplay_folder: 'ShadowPlay Game Folder',
  sharex_history: 'ShareX History Tags',
  filename: 'Filename Match',
  alias: 'Custom Alias',
};

export const CaptureViewerModal: React.FC<CaptureViewerModalProps> = ({
  open,
  items,
  currentIndex,
  onSelectIndex,
  onClose,
  onCopyImage,
  copyingId,
  copiedId,
}) => {
  const safeIdx = Math.max(0, Math.min(currentIndex, Math.max(0, items.length - 1)));
  const current = open && items.length > 0 ? items[safeIdx] : null;

  useEffect(() => {
    if (!open || !current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && safeIdx > 0) {
        onSelectIndex(safeIdx - 1);
      } else if (e.key === 'ArrowRight' && safeIdx < items.length - 1) {
        onSelectIndex(safeIdx + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, current, safeIdx, items.length, onClose, onSelectIndex]);

  if (!open || !current) return null;

  const isCopying = copyingId === current.id;
  const isCopied = copiedId === current.id;
  const mediaSrc = getCaptureFileUrl(current.id);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 12, 16, 0.86)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
        padding: '20px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.filename}
        className="card"
        style={{
          width: '100%',
          maxWidth: '980px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          padding: '18px',
        }}
      >
        {/* Top Metadata & Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  border: '1px solid var(--primary-border)',
                }}
              >
                {SOURCE_LABELS[current.source] || current.source}
              </span>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {current.filename}
              </h2>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span>{formatExactTimestamp(current.captured_at)}</span>
              <span>•</span>
              <span>{formatBytes(current.size_bytes)}</span>
              <span>•</span>
              <span>{safeIdx + 1} / {items.length}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {current.kind === 'image' && (
              <button
                type="button"
                className={isCopied ? 'btn-primary' : 'btn-secondary'}
                onClick={() => onCopyImage(current)}
                disabled={isCopying}
                style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isCopying ? (
                  <>
                    <Loader2 size={14} className="spin" /> Copying...
                  </>
                ) : isCopied ? (
                  <>
                    <Check size={14} /> Copied Image
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy Image
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Capture Viewer"
              className="btn-ghost"
              style={{ padding: '6px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Viewport */}
        <div
          style={{
            flex: 1,
            minHeight: '320px',
            backgroundColor: '#090b0f',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '8px',
          }}
        >
          {current.kind === 'image' ? (
            <img
              src={mediaSrc}
              alt={current.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '66vh',
                objectFit: 'contain',
                borderRadius: '4px',
              }}
            />
          ) : (
            <video
              key={current.id}
              src={mediaSrc}
              controls
              autoPlay
              preload="metadata"
              style={{
                width: '100%',
                maxHeight: '66vh',
                borderRadius: '4px',
                backgroundColor: '#000',
              }}
            />
          )}
        </div>

        {/* Bottom Attribution & Prev/Next Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span>Matched via: <strong style={{ color: 'var(--text-main)' }}>{MATCH_LABELS[current.matched_by] || current.matched_by}</strong></span>
            {current.window_title && (
              <>
                <span>•</span>
                <span>Window: <code>{current.window_title}</code></span>
              </>
            )}
            {current.process_name && (
              <>
                <span>•</span>
                <span>Process: <code>{current.process_name}</code></span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={safeIdx <= 0}
              onClick={() => onSelectIndex(safeIdx - 1)}
              style={{ fontSize: '0.8rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={safeIdx >= items.length - 1}
              onClick={() => onSelectIndex(safeIdx + 1)}
              style={{ fontSize: '0.8rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
