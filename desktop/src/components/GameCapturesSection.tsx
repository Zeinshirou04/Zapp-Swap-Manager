import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getCaptureFileUrl } from '../api/client.ts';
import { CaptureItem, Game } from '../types/api.ts';
import { copyCaptureImageToClipboard } from '../utils/clipboard.ts';
import { formatLastPlayed } from '../utils/format.ts';
import { CaptureViewerModal } from './CaptureViewerModal.tsx';
import {
  Camera,
  Check,
  Copy,
  Film,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Tag,
  X,
} from 'lucide-react';

export interface GameCapturesSectionProps {
  game: Game;
  onGameUpdated: (updated: Game) => void;
}

const SOURCE_BADGES: Record<string, string> = {
  sharex: 'ShareX',
  shadowplay: 'ShadowPlay',
  custom: 'Custom',
};

export const GameCapturesSection: React.FC<GameCapturesSectionProps> = ({
  game,
  onGameUpdated,
}) => {
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [aliases, setAliases] = useState<string[]>(game.capture_aliases || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video'>('all');
  const [showAliases, setShowAliases] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [savingAliases, setSavingAliases] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    setAliases(game.capture_aliases || []);
    setViewerOpen(false);
    setViewerIndex(0);
  }, [game.app_id, game.capture_aliases]);

  const loadCaptures = useCallback(async () => {
    if (typeof api.getGameCaptures !== 'function') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGameCaptures(game.app_id);
      setItems(res.items || []);
      if (Array.isArray(res.aliases)) {
        setAliases(res.aliases);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load captures');
    } finally {
      setLoading(false);
    }
  }, [game.app_id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof api.getGameCaptures !== 'function') return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getGameCaptures(game.app_id);
        if (!cancelled) {
          setItems(res.items || []);
          if (Array.isArray(res.aliases)) {
            setAliases(res.aliases);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load captures');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [game.app_id]);

  const filteredItems = useMemo(() => {
    if (kindFilter === 'all') return items;
    return items.filter((it) => it.kind === kindFilter);
  }, [items, kindFilter]);

  const persistAliases = async (nextAliases: string[]) => {
    if (typeof api.updateGameCaptureAliases !== 'function') return;
    setSavingAliases(true);
    setError(null);
    try {
      const updated = await api.updateGameCaptureAliases(game.app_id, nextAliases);
      setAliases(updated.capture_aliases || nextAliases);
      onGameUpdated(updated);
      await loadCaptures();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update aliases');
    } finally {
      setSavingAliases(false);
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = aliasInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) return;

    const existingLower = new Set(aliases.map((a) => a.toLowerCase()));
    const merged = [...aliases];
    for (const p of parts) {
      if (!existingLower.has(p.toLowerCase())) {
        existingLower.add(p.toLowerCase());
        merged.push(p);
      }
    }
    setAliasInput('');
    await persistAliases(merged);
  };

  const handleRemoveAlias = async (target: string) => {
    const next = aliases.filter((a) => a.toLowerCase() !== target.toLowerCase());
    await persistAliases(next);
  };

  const handleCopyImage = async (item: CaptureItem) => {
    setCopyingId(item.id);
    setCopyNotice(null);
    setError(null);
    try {
      await copyCaptureImageToClipboard(item.id);
      setCopiedId(item.id);
      setCopyNotice(`Copied ${item.filename} to clipboard`);
      setTimeout(() => {
        setCopiedId((prev) => (prev === item.id ? null : prev));
        setCopyNotice((prev) => (prev === `Copied ${item.filename} to clipboard` ? null : prev));
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy image to clipboard');
    } finally {
      setCopyingId(null);
    }
  };

  const openViewerAt = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const imageCount = items.filter((i) => i.kind === 'image').length;
  const videoCount = items.filter((i) => i.kind === 'video').length;

  return (
    <div
      style={{
        paddingTop: '24px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Camera size={18} style={{ color: 'var(--primary-text)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            Media & Captures (ShareX / NVIDIA ShadowPlay)
          </h3>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: '999px',
              border: '1px solid var(--border-color)',
            }}
          >
            {items.length} {items.length === 1 ? 'capture' : 'captures'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Kind filter tabs */}
          <div
            role="tablist"
            aria-label="Capture media filter"
            style={{
              display: 'inline-flex',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}
          >
            {(
              [
                { id: 'all', label: `All (${items.length})` },
                { id: 'image', label: `Images (${imageCount})` },
                { id: 'video', label: `Videos (${videoCount})` },
              ] as const
            ).map((tab) => {
              const active = kindFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setKindFilter(tab.id)}
                  style={{
                    border: 'none',
                    borderRadius: 0,
                    padding: '5px 10px',
                    fontSize: '0.78rem',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    backgroundColor: active ? 'var(--primary-subtle)' : 'transparent',
                    color: active ? 'var(--primary-text, var(--primary))' : 'var(--text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowAliases((v) => !v)}
            style={{ fontSize: '0.78rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <Tag size={13} /> Match Aliases {aliases.length > 0 ? `(${aliases.length})` : ''}
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={() => void loadCaptures()}
            disabled={loading}
            aria-label="Refresh Captures"
            style={{ padding: '5px 8px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Inline Matching Aliases Panel */}
      {showAliases && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Add ShareX window titles, executable names, or ShadowPlay folder aliases when captures use a generic launcher title.
          </div>

          <form onSubmit={handleAddAlias} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              aria-label="Capture matching alias"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="e.g. Client-Win64-Shipping, Endfield"
              disabled={savingAliases}
              style={{
                flex: '1 1 240px',
                padding: '7px 10px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
              }}
            />
            <button
              type="submit"
              className="btn-secondary"
              disabled={savingAliases || !aliasInput.trim()}
              style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={14} /> Add Alias
            </button>
          </form>

          {aliases.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {aliases.map((alias) => (
                <span
                  key={alias}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.76rem',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--primary-subtle)',
                    border: '1px solid var(--primary-border)',
                    color: 'var(--primary-text, var(--primary))',
                  }}
                >
                  <code>{alias}</code>
                  <button
                    type="button"
                    aria-label={`Remove alias ${alias}`}
                    onClick={() => void handleRemoveAlias(alias)}
                    disabled={savingAliases}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status notices */}
      {copyNotice && (
        <div
          role="status"
          style={{
            fontSize: '0.82rem',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Check size={14} />
          <span>{copyNotice}</span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Content */}
      {loading && items.length === 0 ? (
        <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="spin" />
          <span>Scanning ShareX and NVIDIA ShadowPlay captures...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: '28px 20px',
            textAlign: 'center',
            borderRadius: '8px',
            border: '1px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Film size={24} style={{ color: 'var(--primary-text)', opacity: 0.7 }} />
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
            No Captures Found for {game.name}
          </h4>
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-muted)', maxWidth: '520px' }}>
            Zapp checks your auto-detected ShareX screenshots and NVIDIA ShadowPlay recordings. If captures use a custom launcher title, add one under{' '}
            <button
              type="button"
              onClick={() => setShowAliases(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--primary-text, var(--primary))',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Match Aliases
            </button>
            .
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredItems.map((item, idx) => {
            const fileUrl = getCaptureFileUrl(item.id);
            const isCopying = copyingId === item.id;
            const isCopied = copiedId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <button
                  type="button"
                  onClick={() => openViewerAt(idx)}
                  aria-label={`View ${item.filename}`}
                  style={{
                    position: 'relative',
                    aspectRatio: '16 / 9',
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    backgroundColor: '#0c0f15',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'block',
                  }}
                >
                  {item.kind === 'image' ? (
                    <img
                      src={fileUrl}
                      alt={item.filename}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <>
                      <video
                        src={fileUrl}
                        preload="metadata"
                        muted
                        playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.25)',
                          color: '#fff',
                        }}
                      >
                        <span
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '999px',
                            backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Play size={16} fill="currentColor" />
                        </span>
                      </span>
                    </>
                  )}

                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(15, 23, 42, 0.78)',
                      color: '#f8fafc',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                    }}
                  >
                    {SOURCE_BADGES[item.source] || item.source}
                  </span>
                </button>

                {item.kind === 'image' && (
                  <button
                    type="button"
                    onClick={() => void handleCopyImage(item)}
                    disabled={isCopying}
                    aria-label={`Copy ${item.filename}`}
                    title="Copy screenshot to clipboard"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      zIndex: 2,
                      padding: '4px 8px',
                      borderRadius: '999px',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      backgroundColor: isCopied ? 'var(--primary)' : 'rgba(15, 23, 42, 0.78)',
                      color: isCopied ? '#0f172a' : '#f8fafc',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {isCopying ? (
                      <Loader2 size={12} className="spin" />
                    ) : isCopied ? (
                      <>
                        <Check size={12} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </button>
                )}

                <div
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '0.75rem',
                  }}
                >
                  <span
                    title={item.filename}
                    style={{
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.filename}
                  </span>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatLastPlayed(item.captured_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CaptureViewerModal
        open={viewerOpen}
        items={filteredItems}
        currentIndex={viewerIndex}
        onSelectIndex={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        onCopyImage={(item) => void handleCopyImage(item)}
        copyingId={copyingId}
        copiedId={copiedId}
      />
    </div>
  );
};
