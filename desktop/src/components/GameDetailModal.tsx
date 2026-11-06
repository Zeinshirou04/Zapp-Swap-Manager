import React, { useState, useEffect } from 'react';
import { api, resolveCoverUrl } from '../api/client.ts';
import { Game, Job, JobType, Library } from '../types/api.ts';
import { formatBytes } from '../utils/format.ts';
import {
  X,
  Edit2,
  Zap,
  RefreshCw,
  Database,
  Folder,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface GameDetailModalProps {
  game: Game | null;
  libraries: Library[];
  onClose: () => void;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  activeJob?: Job;
  onGameUpdated: (updated: Game) => void;
}

export const GameDetailModal: React.FC<GameDetailModalProps> = ({
  game,
  libraries,
  onClose,
  onAction,
  actionLoading,
  activeJob: _activeJob,
  onGameUpdated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(game?.name || '');
  const [coverUrl, setCoverUrl] = useState(game?.cover_url || '');
  const [swapEnabled, setSwapEnabled] = useState(game?.swap_enabled ?? true);
  const [isNativeHdd, setIsNativeHdd] = useState(game?.is_native_hdd ?? false);
  const [tagsInput, setTagsInput] = useState((game?.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverRevision, setCoverRevision] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (game) {
      setName(game.name);
      setCoverUrl(game.cover_url || '');
      setSwapEnabled(game.swap_enabled ?? true);
      setIsNativeHdd(game.is_native_hdd ?? false);
      setTagsInput((game.tags || []).join(', '));
      setIsEditing(false);
      setError(null);
      setImgFailed(false);
    }
  }, [game]);

  if (!game) return null;

  const isOnSSD = game.state === 'active_ssd';
  const currentLib = libraries.find((l) => l.id === game.current_library_id);

  const bust = coverRevision > 0 ? `${game.cover_url || ''}-${coverRevision}` : (game.cover_url || undefined);
  const finalCoverSrc = resolveCoverUrl(game, bust);

  const handleSaveMetadata = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const updated = await api.updateCustomGame(game.app_id, {
        name: name.trim() || game.name,
        cover_url: coverUrl.trim() || undefined,
        swap_enabled: swapEnabled,
        is_native_hdd: isNativeHdd,
        tags,
      });

      setCoverRevision((prev) => prev + 1);
      setImgFailed(false);
      onGameUpdated(updated);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save game changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero Artwork Header */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '200px',
            backgroundColor: 'var(--bg-card-hover)',
            overflow: 'hidden',
          }}
        >
          {finalCoverSrc && !imgFailed ? (
            <img
              src={finalCoverSrc}
              alt={game.name}
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <Folder size={48} />
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(15, 23, 42, 0.85) 0%, transparent 70%)',
            }}
          />

          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              padding: '6px',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              color: '#ffffff',
              border: 'none',
            }}
          >
            <X size={16} />
          </button>

          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '20px',
              right: '20px',
              color: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  backgroundColor: isOnSSD ? 'var(--primary)' : 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}
              >
                {isOnSSD ? 'On Fast SSD' : 'On Storage HDD'}
              </span>
              {game.is_custom && (
                <span
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Non-Steam
                </span>
              )}
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              {game.name}
            </h2>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {saveSuccess && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(22, 163, 74, 0.1)',
                color: 'var(--success)',
                border: '1px solid rgba(22, 163, 74, 0.25)',
              }}
            >
              <CheckCircle2 size={16} />
              <span>Game configuration updated successfully.</span>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(220, 38, 38, 0.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Metrics & Location */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
            }}
          >
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Accurate Disk Size
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {formatBytes(game.size_bytes)}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Current Library
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {currentLib ? currentLib.name : game.current_library_id}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Backup Status
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {isOnSSD ? (
                  game.has_hdd_backup ? (
                    <span style={{ color: 'var(--success)' }}>Backed Up on HDD</span>
                  ) : (
                    <span style={{ color: 'var(--warning)' }}>SSD Only (No Backup)</span>
                  )
                ) : game.is_native_hdd ? (
                  <span style={{ color: 'var(--text-muted)' }}>Native HDD (No Swap)</span>
                ) : (
                  <span style={{ color: 'var(--primary)' }}>Swappable to SSD</span>
                )}
              </div>
            </div>
          </div>

          {/* Migration Actions */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              padding: '14px',
              backgroundColor: 'var(--bg-main)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block' }}>
                Storage Actions
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isOnSSD
                  ? 'Backup SSD changes to HDD or evict to free fast cache space'
                  : game.is_native_hdd
                  ? 'Configured as native HDD storage'
                  : 'Fast Robocopy migration to SSD cache'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {!isOnSSD ? (
                <button
                  type="button"
                  onClick={() => onAction(game, 'promote')}
                  disabled={actionLoading || (!swapEnabled && !game.is_custom)}
                  className="btn-primary"
                >
                  <Zap size={14} /> Move to SSD
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onAction(game, 'backup')}
                    disabled={actionLoading}
                    className="btn-secondary"
                  >
                    <RefreshCw size={14} /> Backup to HDD
                  </button>
                  <button
                    type="button"
                    onClick={() => onAction(game, 'evict')}
                    disabled={actionLoading}
                    className="btn-danger"
                  >
                    <Database size={14} /> Evict to HDD
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Metadata & Custom Config Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Configuration & Manifest Data</h3>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                >
                  <Edit2 size={13} /> Edit Config
                </button>
              )}
            </div>

            {isEditing ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '14px',
                  backgroundColor: 'var(--bg-main)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Title Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Custom Cover Artwork (Web URL or Local File Path)
                  </label>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://.../capsule.jpg, C:\path\to\cover.png, or cover.png"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Gacha, RPG, Open World"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={swapEnabled}
                      onChange={(e) => setSwapEnabled(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.825rem' }}>Allow Swapping between SSD and HDD</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isNativeHdd}
                      onChange={(e) => setIsNativeHdd(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.825rem' }}>Mark as Native HDD Game (permanent HDD storage)</span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn-secondary"
                    style={{ fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMetadata}
                    disabled={saving}
                    className="btn-primary"
                    style={{ fontSize: '0.85rem' }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-main)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.825rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>Folder Directory:</strong>{' '}
                  <code>{game.install_dir}</code>
                </div>
                <div>
                  <strong style={{ color: 'var(--text-muted)' }}>App ID:</strong> {game.app_id}
                </div>
                {game.tags && game.tags.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>Tags:</strong>
                    {game.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
