import React, { useEffect, useState } from 'react';
import { CaptureItem } from '../types/api.ts';
import { getCaptureFileUrl } from '../api/client.ts';
import { formatBytes, formatExactTimestamp } from '../utils/format.ts';
import { CustomImageViewer } from './CustomImageViewer.tsx';
import { CustomVideoPlayer } from './CustomVideoPlayer.tsx';
import { ZappIcon } from './ZappIcon.tsx';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
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
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const safeIdx = Math.max(0, Math.min(currentIndex, Math.max(0, items.length - 1)));
  const current = open && items.length > 0 ? items[safeIdx] : null;

  useEffect(() => {
    if (!open || !current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (current.kind !== 'video') {
        if (e.key === 'ArrowLeft' && safeIdx > 0) {
          onSelectIndex(safeIdx - 1);
        } else if (e.key === 'ArrowRight' && safeIdx < items.length - 1) {
          onSelectIndex(safeIdx + 1);
        }
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
        backgroundColor: 'rgba(10, 12, 16, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.filename}
        className="card"
        style={{
          width: 'fit-content',
          maxWidth: 'min(94vw, 1100px)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '14px 16px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-card, 12px)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.55)',
        }}
      >
        {/* Top Minimalist Header Bar: Title, Date, Size, Image Counter, and Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '999px',
                backgroundColor: 'var(--primary-subtle)',
                color: 'var(--primary)',
                border: '1px solid var(--primary-border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0,
              }}
            >
              <ZappIcon
                name={current.source === 'sharex' ? 'sharex' : current.source === 'shadowplay' ? 'shadowplay' : 'custom-folder'}
                size={13}
              />
              {SOURCE_LABELS[current.source] || current.source}
            </span>

            <h2
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '360px',
              }}
            >
              {current.filename}
            </h2>

            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>{formatExactTimestamp(current.captured_at)}</span>
              <span style={{ opacity: 0.4 }}>|</span>
              <span>{formatBytes(current.size_bytes)}</span>
              <span style={{ opacity: 0.4 }}>|</span>
              <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                {safeIdx + 1} / {items.length}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {/* Previous & Next for Video (For images, navigation is inside the floating image controls) */}
            {current.kind === 'video' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={safeIdx <= 0}
                  onClick={() => onSelectIndex(safeIdx - 1)}
                  aria-label="Previous video"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={safeIdx >= items.length - 1}
                  onClick={() => onSelectIndex(safeIdx + 1)}
                  aria-label="Next video"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              aria-label={showDetails ? 'Hide capture details' : 'Show capture details'}
              className={showDetails ? 'btn-primary' : 'btn-secondary'}
              style={{
                fontSize: '0.75rem',
                padding: '5px 9px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Info size={13} />
              {showDetails ? 'Details' : 'Details'}
            </button>

            {current.kind === 'image' && (
              <button
                type="button"
                className={isCopied ? 'btn-primary' : 'btn-secondary'}
                onClick={() => onCopyImage(current)}
                disabled={isCopying}
                style={{ fontSize: '0.78rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                {isCopying ? (
                  <>
                    <Loader2 size={13} className="spin" /> Copying...
                  </>
                ) : isCopied ? (
                  <>
                    <Check size={13} /> Copied Image
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copy Image
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Capture Viewer"
              className="btn-ghost"
              style={{ padding: '5px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Viewport (Clean, seamless container without black background or letterbox frame) */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          {current.kind === 'image' ? (
            <CustomImageViewer
              src={mediaSrc}
              alt={current.filename}
              onPrevious={() => onSelectIndex(safeIdx - 1)}
              onNext={() => onSelectIndex(safeIdx + 1)}
              hasPrevious={safeIdx > 0}
              hasNext={safeIdx < items.length - 1}
            />
          ) : (
            <CustomVideoPlayer key={current.id} src={mediaSrc} autoPlay />
          )}
        </div>

        {/* Separate Section for Window, Process, and Matching Details (Hidden by default, toggled via Details button) */}
        <div
          style={{
            display: showDetails ? 'flex' : 'none',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-main)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Matched via: <strong style={{ color: 'var(--text-main)' }}>{MATCH_LABELS[current.matched_by] || current.matched_by}</strong>
          </span>
          {current.window_title && (
            <span>
              • Window: <code>{current.window_title}</code>
            </span>
          )}
          {current.process_name && (
            <span>
              • Process: <code>{current.process_name}</code>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
