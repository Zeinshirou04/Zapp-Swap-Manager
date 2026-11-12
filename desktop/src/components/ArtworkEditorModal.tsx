import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { ArtworkKind, Game } from '../types/api.ts';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Loader2, RotateCcw, Upload, X } from 'lucide-react';

export interface ArtworkEditorModalProps {
  open: boolean;
  game: Game;
  gridPreviewUrl: string | null;
  bannerPreviewUrl: string | null;
  onClose: () => void;
  onGameUpdated: (updated: Game) => void;
}

interface SlotConfig {
  kind: ArtworkKind;
  title: string;
  subtitle: string;
  aspectRatio: string;
  previewHeight: string;
  rawValue: string | null | undefined;
  previewUrl: string | null;
  inputId: string;
  uploadAriaLabel: string;
  applyLabel: string;
  resetLabel: string;
  placeholder: string;
}

interface ArtworkSlotPanelProps {
  gameId: number;
  slot: SlotConfig;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (updated: Game, message: string) => void;
  onError: (msg: string) => void;
  disabled: boolean;
}

const ArtworkSlotPanel: React.FC<ArtworkSlotPanelProps> = ({
  gameId,
  slot,
  onBusyChange,
  onSuccess,
  onError,
  disabled,
}) => {
  const isCached = Boolean(slot.rawValue?.startsWith('cached:'));
  const hasCustom = Boolean(slot.rawValue?.trim());
  const [urlInput, setUrlInput] = useState<string>(isCached ? '' : slot.rawValue || '');
  const [slotLoading, setSlotLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUrlInput(slot.rawValue && !slot.rawValue.startsWith('cached:') ? slot.rawValue : '');
  }, [slot.rawValue]);

  const handleApplyUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      onError('Enter an https:// or http:// image URL, or click Reset Default.');
      return;
    }
    setSlotLoading(true);
    onBusyChange(true);
    onError('');
    try {
      const updated = await api.updateGameArtwork(
        gameId,
        slot.kind === 'grid' ? { cover_url: trimmed } : { banner_url: trimmed }
      );
      onSuccess(updated, `${slot.title} updated`);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to update ${slot.title}`);
    } finally {
      setSlotLoading(false);
      onBusyChange(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSlotLoading(true);
    onBusyChange(true);
    onError('');
    try {
      const updated = await api.uploadGameArtwork(gameId, slot.kind, file);
      onSuccess(updated, `${slot.title} uploaded`);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to upload ${slot.title}`);
    } finally {
      setSlotLoading(false);
      onBusyChange(false);
    }
  };

  const handleReset = async () => {
    setSlotLoading(true);
    onBusyChange(true);
    onError('');
    try {
      const updated = await api.updateGameArtwork(
        gameId,
        slot.kind === 'grid' ? { cover_url: '' } : { banner_url: '' }
      );
      setUrlInput('');
      onSuccess(updated, `${slot.title} reset to default`);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Failed to reset ${slot.title}`);
    } finally {
      setSlotLoading(false);
      onBusyChange(false);
    }
  };

  const statusText = isCached
    ? 'Uploaded image'
    : hasCustom
    ? 'Custom URL'
    : slot.kind === 'banner'
    ? 'Default (Steam / Grid)'
    : 'Default';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-main)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{slot.title}</h3>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{slot.subtitle}</p>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '999px',
            backgroundColor: hasCustom ? 'var(--primary-subtle)' : 'var(--bg-card)',
            color: hasCustom ? 'var(--primary)' : 'var(--text-muted)',
            border: `1px solid ${hasCustom ? 'var(--primary-border)' : 'var(--border-color)'}`,
            whiteSpace: 'nowrap',
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Live Preview */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-sunken)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          height: '132px',
          overflow: 'hidden',
          padding: '6px',
        }}
      >
        {slot.previewUrl ? (
          <img
            src={slot.previewUrl}
            alt={`${slot.title} preview`}
            style={{
              height: slot.kind === 'grid' ? '100%' : slot.previewHeight,
              width: slot.kind === 'banner' ? '100%' : 'auto',
              aspectRatio: slot.aspectRatio,
              objectFit: 'cover',
              borderRadius: '6px',
              border: '1px solid var(--border-strong)',
            }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            <ImageIcon size={20} />
            <span>No {slot.title.toLowerCase()} set</span>
          </div>
        )}
      </div>

      {/* URL Input Row */}
      <form onSubmit={handleApplyUrl} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor={slot.inputId} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          {slot.title} URL
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id={slot.inputId}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={isCached ? 'Uploaded image active — paste https://... to replace' : slot.placeholder}
            disabled={disabled || slotLoading}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
            }}
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={disabled || slotLoading || !urlInput.trim()}
            style={{ fontSize: '0.8rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
          >
            {slotLoading ? <Loader2 size={14} className="spin" /> : slot.applyLabel}
          </button>
        </div>
      </form>

      {/* Upload & Reset Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label={slot.uploadAriaLabel}
            onChange={handleUploadFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || slotLoading}
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: '0.8rem', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} /> Upload Image
          </button>
        </div>

        <button
          type="button"
          className="btn-ghost"
          disabled={disabled || slotLoading || !hasCustom}
          onClick={handleReset}
          style={{ fontSize: '0.78rem', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <RotateCcw size={13} /> {slot.resetLabel}
        </button>
      </div>
    </div>
  );
};

export const ArtworkEditorModal: React.FC<ArtworkEditorModalProps> = ({
  open,
  game,
  gridPreviewUrl,
  bannerPreviewUrl,
  onClose,
  onGameUpdated,
}) => {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (open) {
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [open, game.app_id]);

  if (!open) return null;

  const handleSuccess = (updated: Game, message: string) => {
    setErrorMsg('');
    setSuccessMsg(message);
    onGameUpdated(updated);
  };

  const slots: SlotConfig[] = [
    {
      kind: 'grid',
      title: 'Grid Cover (2:3)',
      subtitle: 'Portrait poster displayed in Library grid cards and details header.',
      aspectRatio: '2 / 3',
      previewHeight: '100%',
      rawValue: game.cover_url,
      previewUrl: gridPreviewUrl,
      inputId: 'artwork-grid-url',
      uploadAriaLabel: 'Upload Grid Cover Image',
      applyLabel: 'Apply Grid',
      resetLabel: 'Reset Grid',
      placeholder: 'https://.../grid-cover.jpg',
    },
    {
      kind: 'banner',
      title: 'Hero Banner',
      subtitle: 'Wide backdrop in Game Details. Defaults to Steam hero / Grid cover when unset.',
      aspectRatio: '16 / 9',
      previewHeight: '100%',
      rawValue: game.banner_url,
      previewUrl: bannerPreviewUrl,
      inputId: 'artwork-banner-url',
      uploadAriaLabel: 'Upload Hero Banner Image',
      applyLabel: 'Apply Banner',
      resetLabel: 'Use Default',
      placeholder: 'https://.../hero-banner.jpg',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-artwork-title"
        className="card"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close Artwork Editor"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'var(--primary-subtle)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}
          >
            <ImageIcon size={20} />
          </div>
          <div>
            <h2 id="edit-artwork-title" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
              Edit Artwork — {game.name}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Set separate Grid Cover and Hero Banner artwork via image URL or local file upload.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'rgba(22, 163, 74, 0.1)',
              border: '1px solid rgba(22, 163, 74, 0.3)',
              borderRadius: 'var(--radius)',
              color: 'var(--success)',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={15} />
            <span>{successMsg}</span>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
          }}
        >
          {slots.map((slot) => (
            <ArtworkSlotPanel
              key={slot.kind}
              gameId={game.app_id}
              slot={slot}
              onBusyChange={setBusy}
              onSuccess={handleSuccess}
              onError={setErrorMsg}
              disabled={busy}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
