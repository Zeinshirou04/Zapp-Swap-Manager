import React, { useState, useEffect } from 'react';
import { api, resolveCoverUrl } from '../api/client.ts';
import { Game, Job, JobType, Library } from '../types/api.ts';
import {
  formatBytes,
  formatExactTimestamp,
  formatLastPlayed,
  formatLibraryName,
  formatLibraryOptionLabel,
  getSteamGridUrls,
  getSteamHeroUrls,
  normalizePath,
} from '../utils/format.ts';
import {
  ArrowLeft,
  Settings,
  Database,
  Zap,
  HardDrive,
  Clock,
  Folder,
  ShieldCheck,
  AlertTriangle,
  Camera,
  Film,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';

export interface GameDetailViewProps {
  game: Game;
  libraries: Library[];
  jobs: Job[];
  onBack: () => void;
  onAction: (game: Game, type: JobType) => void;
  actionLoading: boolean;
  onGameUpdated: (updated: Game) => void;
}

export const GameDetailView: React.FC<GameDetailViewProps> = ({
  game,
  libraries,
  jobs,
  onBack,
  onAction,
  actionLoading,
  onGameUpdated,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [steamFallbackIdx, setSteamFallbackIdx] = useState<number | null>(() => (game.cover_url ? null : 0));
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [heroFallbackIdx, setHeroFallbackIdx] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [coverRevision, setCoverRevision] = useState(0);

  // Settings form states
  const [name, setName] = useState(game.name);
  const [coverUrl, setCoverUrl] = useState(game.cover_url || '');
  const [installDir, setInstallDir] = useState(game.install_dir);
  const [selectedLibId, setSelectedLibId] = useState(game.current_library_id);
  const [swapEnabled, setSwapEnabled] = useState(game.swap_enabled ?? true);
  const [isNativeHdd, setIsNativeHdd] = useState(game.is_native_hdd ?? false);
  const [tagsInput, setTagsInput] = useState((game.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever the selected game or its metadata updates
  useEffect(() => {
    setImgFailed(false);
    setSteamFallbackIdx(game.cover_url ? null : 0);
    setHeroImgFailed(false);
    setHeroFallbackIdx(0);
    setName(game.name);
    setCoverUrl(game.cover_url || '');
    setInstallDir(game.install_dir);
    setSelectedLibId(game.current_library_id);
    setSwapEnabled(game.swap_enabled ?? true);
    setIsNativeHdd(game.is_native_hdd ?? false);
    setTagsInput((game.tags || []).join(', '));
  }, [game]);

  const isOnSSD = game.state === 'active_ssd';
  const currentLib = libraries.find((l) => l.id === game.current_library_id);
  const isSwappable = (game.swap_enabled ?? true) && !game.is_native_hdd;

  const activeJob = jobs.find(
    (j) =>
      (j.status === 'running' || j.status === 'queued') &&
      String(j.app_id) === String(game.app_id)
  );

  // Portrait Grid cover URL resolution (custom cover first, then Steam 600x900 grids)
  const gridUrls = getSteamGridUrls(game.app_id);

  let displayUrl: string | null = null;
  if (!imgFailed) {
    if (steamFallbackIdx === null && game.cover_url) {
      const bust = coverRevision > 0 ? `${game.cover_url}-${coverRevision}` : game.cover_url;
      displayUrl = resolveCoverUrl(game, bust);
    } else if (!game.is_custom && steamFallbackIdx !== null && steamFallbackIdx < gridUrls.length) {
      displayUrl = gridUrls[steamFallbackIdx];
    }
  }

  const handleImgError = () => {
    if (steamFallbackIdx === null) {
      if (!game.is_custom) {
        setSteamFallbackIdx(0);
      } else {
        setImgFailed(true);
      }
    } else if (steamFallbackIdx < gridUrls.length - 1) {
      setSteamFallbackIdx(steamFallbackIdx + 1);
    } else {
      setImgFailed(true);
    }
  };

  // Hero Banner resolution (Steam library_hero.jpg first for Steam games, or fallback cover artwork)
  const heroUrls = getSteamHeroUrls(game.app_id);
  let heroDisplayUrl: string | null = null;
  if (!heroImgFailed) {
    if (!game.is_custom && heroFallbackIdx < heroUrls.length) {
      heroDisplayUrl = heroUrls[heroFallbackIdx];
    } else if (displayUrl) {
      heroDisplayUrl = displayUrl;
    }
  }

  const handleHeroImgError = () => {
    if (!game.is_custom && heroFallbackIdx < heroUrls.length - 1) {
      setHeroFallbackIdx(heroFallbackIdx + 1);
    } else {
      setHeroImgFailed(true);
    }
  };

  const openSettingsModal = () => {
    setName(game.name);
    setCoverUrl(game.cover_url || '');
    setInstallDir(game.install_dir);
    setSelectedLibId(game.current_library_id);
    setSwapEnabled(game.swap_enabled ?? true);
    setIsNativeHdd(game.is_native_hdd ?? false);
    setTagsInput((game.tags || []).join(', '));
    setError(null);
    setSaveSuccess(false);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
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
        install_dir: installDir.trim() || undefined,
        library_id: selectedLibId || undefined,
        swap_enabled: swapEnabled,
        is_native_hdd: isNativeHdd,
        tags,
      });

      setCoverRevision((prev) => prev + 1);
      onGameUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => {
        setIsSettingsOpen(false);
        setSaveSuccess(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Build resolved absolute paths for display
  const currentLibPath = normalizePath((currentLib as { path?: string })?.path || '');
  const displayFullPath = currentLibPath
    ? `${currentLibPath}\\${game.install_dir}`
    : game.install_dir;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Notion-Style Hero Banner with Acrylic Frosted Backdrop & Foreground Portrait Grid */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          margin: '-24px -24px 0 -24px',
          padding: '20px 28px 32px 28px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-sunken)',
        }}
      >
        {/* Background Banner Image */}
        {heroDisplayUrl && (
          <img
            src={heroDisplayUrl}
            alt=""
            aria-hidden="true"
            onError={handleHeroImgError}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Acrylic Frosted Scrim in front of Banner */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(20px) saturate(1.35)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.35)',
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--bg-main) 62%, transparent) 0%, color-mix(in srgb, var(--bg-main) 82%, transparent) 60%, var(--bg-main) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Foreground Content over Acrylic Banner */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Breadcrumb Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-text, var(--primary))',
                padding: 0,
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={16} /> Back to Games
            </button>

            <button
              type="button"
              onClick={openSettingsModal}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '0.85rem',
              }}
            >
              <Settings size={15} /> Game Settings
            </button>
          </div>

          {/* Foreground Portrait Grid Poster, Title & Swap Actions */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: '24px',
              alignItems: 'flex-end',
            }}
          >
            {/* Portrait Grid Cover Poster (2:3) */}
            <div
              style={{
                width: '132px',
                aspectRatio: '2 / 3',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-strong)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 14px 30px -6px rgba(0, 0, 0, 0.35)',
              }}
            >
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt={game.name}
                  onError={handleImgError}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', padding: '12px', textAlign: 'center' }}>
                  <Folder size={28} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>NO ARTWORK</span>
                </div>
              )}
            </div>

            {/* Clean Title & Quick Stats (Status badges live in Game & Backup Status below) */}
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '4px' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em', margin: 0, color: 'var(--text-main)' }}>
                {game.name}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.875rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>App ID: <code>{game.app_id}</code></span>
                <span>•</span>
                <span>Size: <strong style={{ color: 'var(--text-main)' }}>{formatBytes(game.size_bytes)}</strong></span>
                <span>•</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Clock size={14} /> Last Played: <strong style={{ color: 'var(--text-main)' }}>{formatLastPlayed(game.last_played)}</strong>
                </span>
              </div>

              {game.tags && game.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                  {game.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        border: '1px solid var(--border-strong)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
              {activeJob ? (
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: 'var(--primary-subtle)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--primary-border)',
                    fontSize: '0.85rem',
                    color: 'var(--primary-text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Loader2 size={16} className="spin" />
                  <span>Migration in progress...</span>
                </div>
              ) : isSwappable ? (
                isOnSSD ? (
                  <>
                    <button
                      onClick={() => onAction(game, 'backup')}
                      disabled={actionLoading}
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px' }}
                    >
                      <Database size={16} /> Backup to HDD
                    </button>
                    <button
                      onClick={() => onAction(game, 'evict')}
                      disabled={actionLoading}
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', color: 'var(--danger)', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                    >
                      <HardDrive size={16} /> Evict to HDD
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onAction(game, 'promote')}
                    disabled={actionLoading}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px' }}
                  >
                    <Zap size={16} /> Promote to SSD
                  </button>
                )
              ) : (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {game.is_native_hdd ? 'Pinned to HDD (Native)' : 'Game Swapping Disabled'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details Sections (Flat backgroundless layout directly on page canvas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '28px' }}>
        {/* Section 1: Storage Location */}
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Folder size={18} style={{ color: 'var(--primary-text)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Current Storage Path</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>Configured Library:</span>
              <strong style={{ color: 'var(--text-main)' }}>
                {currentLib ? formatLibraryName(currentLib) : 'Unregistered Drive'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>Full Directory:</span>
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.8rem',
                  color: 'var(--text-main)',
                  wordBreak: 'break-all',
                  userSelect: 'text',
                }}
              >
                {displayFullPath}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Game & Backup Status (Consolidated status indicators) */}
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Database size={18} style={{ color: game.has_hdd_backup ? 'var(--success)' : 'var(--warning)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Game & Backup Status</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: isOnSSD ? 'var(--primary-subtle)' : 'var(--bg-card-hover)',
                  color: isOnSSD ? 'var(--ssd-color)' : 'var(--hdd-color)',
                  border: `1px solid ${isOnSSD ? 'var(--primary-border)' : 'var(--border-color)'}`,
                }}
              >
                {isOnSSD ? 'Fast SSD Cache' : 'Storage HDD Master'}
              </span>

              <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                {game.is_custom ? 'Non-Steam Standalone' : 'Steam Game'}
              </span>

              {game.is_native_hdd && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', color: 'var(--primary-text)', border: '1px solid var(--primary-border)' }}>
                  Native HDD Only
                </span>
              )}

              {game.has_hdd_backup && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--success-subtle)', color: 'var(--success)', border: '1px solid rgba(22, 163, 74, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> Backup Verified
                </span>
              )}
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Master Copy:</span>
              <strong style={{ color: game.has_hdd_backup ? 'var(--success)' : 'var(--warning)' }}>
                {game.has_hdd_backup ? 'Present & Verified on HDD' : 'No Backup on HDD Master'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Last Backup Run:</span>
              <span style={{ color: 'var(--text-main)' }}>
                {game.last_backup_time ? new Date(game.last_backup_time).toLocaleString() : 'Never backed up'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Activity & Runtime (Exact timestamp) */}
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Clock size={18} style={{ color: 'var(--primary-text)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>Activity & Runtime</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Latest Played:</span>
              <strong style={{ color: 'var(--text-main)' }}>{formatExactTimestamp(game.last_played)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Build Identifier:</span>
              <code style={{ fontSize: '0.8rem' }}>{game.build_id || 'custom'}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Media & Captures Section (Backgroundless, clean divider) */}
      <div
        style={{
          paddingTop: '24px',
          borderTop: '1px solid var(--border-color)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} style={{ color: 'var(--primary-text)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Media & Captures (ShareX / NVIDIA ShadowPlay)
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--primary-text)',
            }}
          >
            Coming Soon
          </span>
        </div>

        <div
          style={{
            padding: '28px 20px',
            textAlign: 'center',
            borderRadius: '8px',
            border: '1px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Film size={24} style={{ color: 'var(--primary-text)', opacity: 0.7 }} />
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
            No Captures Synced Yet
          </h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Screenshots and gameplay recordings for <strong>{game.name}</strong> will appear here for browsing and cloud backup.
          </p>
        </div>
      </div>

      {/* Game Settings Modal (Lively Login-Inspired Styling) */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
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
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              position: 'relative',
              boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.3)',
              borderRadius: '16px',
            }}
          >
            {/* Ambient subtle glow header */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, #6246EA 0%, #9F9EFE 100%)',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
              }}
            />

            <button
              onClick={() => setIsSettingsOpen(false)}
              aria-label="Close"
              className="btn-secondary"
              style={{ position: 'absolute', top: '16px', right: '16px', padding: '6px', border: 'none' }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                }}
              >
                <Settings size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Configure Game</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Customize display title, artwork, and swapping policies.
                </p>
              </div>
            </div>

            {activeJob && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--warning)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>A transfer job is queued or running for this game. Settings are locked until it completes.</span>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {saveSuccess && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(22, 163, 74, 0.1)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--success)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>Game settings updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Game Title
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {game.is_custom && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Storage Drive / Library
                    </label>
                    <select
                      value={selectedLibId}
                      onChange={(e) => setSelectedLibId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {libraries.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {formatLibraryOptionLabel(lib)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Game Subfolder Name
                    </label>
                    <input
                      type="text"
                      value={installDir}
                      onChange={(e) => setInstallDir(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--text-main)',
                        fontSize: '0.875rem',
                      }}
                    />
                    {(() => {
                      const selLib = libraries.find((l) => l.id === selectedLibId);
                      const baseP = normalizePath((selLib as { path?: string })?.path || '');
                      const fullP = baseP ? `${baseP}\\${installDir.trim()}` : installDir.trim();
                      return fullP ? (
                        <div
                          style={{
                            marginTop: '6px',
                            padding: '6px 10px',
                            backgroundColor: 'var(--primary-subtle)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--primary-border)',
                            fontSize: '0.78rem',
                            wordBreak: 'break-all',
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>Target Directory: </span>
                          <code style={{ fontWeight: 600, color: 'var(--primary)' }}>{fullP}</code>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Cover Artwork URL or Local Path
                </label>
                <input
                  type="text"
                  placeholder="https://... or D:\covers\game.jpg"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="RPG, Favorite, Gacha"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={swapEnabled}
                    onChange={(e) => setSwapEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>Enable Swapping & Promotion for this game</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={isNativeHdd}
                    onChange={(e) => setIsNativeHdd(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span>Native HDD Game (Keep on HDD master permanently)</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || Boolean(activeJob)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {saving && <Loader2 size={16} className="spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
