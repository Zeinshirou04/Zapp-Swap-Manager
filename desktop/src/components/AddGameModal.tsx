import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import { Game, Library } from '../types/api.ts';
import { X, Plus, Folder, Image, Tag, AlertCircle, Loader2, HardDrive, CheckCircle2 } from 'lucide-react';
import { parseGamePath, computePreviewPaths } from '../utils/pathParser.ts';
import { formatLibraryOptionLabel, normalizePath } from '../utils/format.ts';

interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (game: Game) => void;
  libraries: Library[];
}

export const AddGameModal: React.FC<AddGameModalProps> = ({
  open,
  onClose,
  onSuccess,
  libraries,
}) => {
  const [name, setName] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [installDir, setInstallDir] = useState('');
  const [libraryId, setLibraryId] = useState(libraries[0]?.id || '');
  const [coverUrl, setCoverUrl] = useState('');
  const [swapEnabled, setSwapEnabled] = useState(true);
  const [isNativeHdd, setIsNativeHdd] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathWarning, setPathWarning] = useState<string | null>(null);
  const [knownRoots, setKnownRoots] = useState<string[]>([]);
  const [autoDetectedTitle, setAutoDetectedTitle] = useState('');

  // Load known library roots on open to facilitate exact prefix matching
  useEffect(() => {
    if (!open) return;
    const roots: string[] = [];
    try {
      const all = localStorage.getItem('zapp_all_library_paths');
      if (all) roots.push(...JSON.parse(all));
      const custom = localStorage.getItem('zapp_custom_library_paths');
      if (custom) roots.push(...JSON.parse(custom));
    } catch {
      // ignore
    }

    api
      .detectLibraries()
      .then((detected) => {
        const detectedPaths = detected.map((d) => d.path);
        const combined = Array.from(new Set([...roots, ...detectedPaths]));
        setKnownRoots(combined);
      })
      .catch(() => {
        setKnownRoots(Array.from(new Set(roots)));
      });
  }, [open]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setName('');
      setPathInput('');
      setInstallDir('');
      setLibraryId(libraries[0]?.id || '');
      setCoverUrl('');
      setSwapEnabled(true);
      setIsNativeHdd(false);
      setTagsInput('');
      setError(null);
      setPathWarning(null);
      setAutoDetectedTitle('');
    }
  }, [open, libraries]);

  if (!open) return null;

  const handlePathChange = (val: string) => {
    setPathInput(val);
    const parsed = parseGamePath({
      rawPath: val,
      libraries,
      currentLibraryId: libraryId,
      knownRoots,
    });

    setInstallDir(parsed.installDir);

    if (parsed.matchedLibraryId && parsed.isAbsolute) {
      setLibraryId(parsed.matchedLibraryId);
    }

    if (parsed.detectedTitle && (!name.trim() || name === autoDetectedTitle)) {
      setName(parsed.detectedTitle);
      setAutoDetectedTitle(parsed.detectedTitle);
    }

    if (parsed.unregisteredDrive) {
      setPathWarning(
        `Drive ${parsed.driveLetter} is not registered in Zapp. Go to Settings > Configure Libraries to register it.`
      );
    } else {
      setPathWarning(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a game name.');
      return;
    }
    if (!libraryId) {
      setError('Please select a storage library.');
      return;
    }
    const finalDir = installDir.trim() || name.trim();
    if (!finalDir) {
      setError('Please provide a folder name or path for the game.');
      return;
    }

    setLoading(true);
    setError(null);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const created = await api.createCustomGame({
        name: name.trim(),
        library_id: libraryId,
        install_dir: finalDir,
        cover_url: coverUrl.trim() || undefined,
        swap_enabled: swapEnabled,
        is_native_hdd: isNativeHdd,
        tags: tags.length > 0 ? tags : undefined,
      });

      onSuccess(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register game');
    } finally {
      setLoading(false);
    }
  };

  const targetLib = libraries.find((l) => l.id === libraryId);
  const preview = computePreviewPaths(installDir, targetLib, libraries, knownRoots);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Add Non-Steam Game</h2>
          </div>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
          Register a game folder with a native Zapp manifest. Custom games can be swapped between SSD cache and HDD master just like Steam titles.
        </p>

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
              marginBottom: '16px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Game Folder Path Input */}
          <div>
            <label
              htmlFor="add-game-folder"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Game Folder or Path *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Folder size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                id="add-game-folder"
                type="text"
                required
                value={pathInput}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder='e.g. E:\Game\GRYPHLINK\games\EndField Game or relative folder'
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Paste full folder path (e.g. Windows Explorer &quot;Copy as Path&quot;) or type a relative folder name.
            </span>

            {pathWarning && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#d97706',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <AlertCircle size={14} />
                <span>{pathWarning}</span>
              </div>
            )}

            {installDir && installDir !== pathInput && !pathWarning && (
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle2 size={13} style={{ color: 'var(--primary)' }} />
                <span>
                  Detected subfolder: <code>{installDir}</code>
                </span>
              </div>
            )}
          </div>

          {/* Game Title */}
          <div>
            <label
              htmlFor="add-game-name"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Game Title *
            </label>
            <input
              id="add-game-name"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAutoDetectedTitle('');
              }}
              placeholder="e.g. Arknights: Endfield, Wuthering Waves"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Target Drive / Library */}
          <div>
            <label
              htmlFor="add-game-library"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Target Drive / Library *
            </label>
            <select
              id="add-game-library"
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--bg-main)',
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
            {targetLib && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  backgroundColor: 'var(--primary-subtle)',
                  border: '1px solid var(--primary-border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Folder size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div style={{ wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Base Parent Folder: </span>
                  <code style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {normalizePath((targetLib as any).path || '') || targetLib.name}
                  </code>
                </div>
              </div>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              The parent game storage directory. Auto-selected if pasting an absolute path above.
            </span>
          </div>

          {/* Live Path Preview Card */}
          {installDir && preview.targetDisplay && (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: 'rgba(0, 0, 0, 0.03)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <HardDrive size={14} />
                <span>RESOLVED GAME LOCATIONS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ wordBreak: 'break-all' }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Target (SSD): </span>
                  <code>{preview.targetDisplay}</code>
                </div>
                {preview.backupDisplay && (
                  <div style={{ wordBreak: 'break-all' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Backup (HDD): </span>
                    <code>{preview.backupDisplay}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cover Art URL */}
          <div>
            <label
              htmlFor="add-game-cover"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Custom Cover Artwork (Web URL or Local File Path)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Image size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                id="add-game-cover"
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://.../cover.jpg, C:\path\to\cover.png, or cover.png"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label
              htmlFor="add-game-tags"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}
            >
              Tags (comma-separated)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                id="add-game-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Gacha, RPG, Open World"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-main)',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          {/* Toggles */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '12px',
              backgroundColor: 'var(--bg-main)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={swapEnabled}
                onChange={(e) => setSwapEnabled(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Allow Swapping (can promote to SSD / evict to HDD)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isNativeHdd}
                onChange={(e) => setIsNativeHdd(e.target.checked)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Native HDD Game (permanent storage, do not migrate to SSD)
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading && <Loader2 size={14} className="spin" />}
              {loading ? 'Registering...' : 'Register Game'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
