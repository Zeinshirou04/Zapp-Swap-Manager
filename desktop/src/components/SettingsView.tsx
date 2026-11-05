import React, { useState, useEffect } from 'react';
import { getApiConfig, setApiConfig, api } from '../api/client.ts';
import { Preferences } from '../types/api.ts';
import { restartCoreDaemon } from '../api/native.ts';
import {
  Server,
  Check,
  AlertCircle,
  Sparkles,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  Sliders,
  Shield,
} from 'lucide-react';

interface SettingsViewProps {
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
  onSaved?: () => void;
  appVersion?: string;
  steamRunning?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onCheckUpdates,
  checkingUpdates = false,
  onSaved,
  appVersion = 'v0.3.0',
  steamRunning = false,
}) => {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8765');
  const [bearerToken, setBearerToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restartingDaemon, setRestartingDaemon] = useState(false);

  // Core preferences
  const [closeSteamOnTransfer, setCloseSteamOnTransfer] = useState(false);
  const [relaunchSteamAfterTransfer, setRelaunchSteamAfterTransfer] = useState(false);
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('light');

  useEffect(() => {
    const cfg = getApiConfig();
    setBaseUrl(cfg.baseUrl);
    setBearerToken(cfg.bearerToken);

    api
      .getPreferences()
      .then((prefs) => {
        setCloseSteamOnTransfer(!!prefs.close_steam_on_transfer);
        setRelaunchSteamAfterTransfer(!!prefs.relaunch_steam_after_transfer);
        setRunOnStartup(!!prefs.run_on_startup);
        if (prefs.theme) setTheme(prefs.theme);
      })
      .catch(() => {
        // Core might be offline or using defaults
      });
  }, []);

  const handleSave = async () => {
    setSaveSuccess(false);
    setSaveError(null);
    try {
      setApiConfig({ baseUrl, bearerToken });
      const updatedPrefs: Preferences = {
        close_steam_on_transfer: closeSteamOnTransfer,
        relaunch_steam_after_transfer: relaunchSteamAfterTransfer,
        run_on_startup: runOnStartup,
        theme,
      };
      await api.updatePreferences(updatedPrefs).catch((err) => {
        console.warn('Failed to persist preferences to core:', err);
      });
      setSaveSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setApiConfig({ baseUrl, bearerToken });
      const health = await api.getHealth();
      setTestResult({
        ok: true,
        message: `Connected! Core service is online (v${health.version}, uptime: ${Math.round(
          health.uptime_seconds
        )}s). Steam is ${health.steam_running ? 'running' : 'closed'}.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleRestartDaemon = async () => {
    if (!window.confirm('Restart the Zapp core background service?')) return;
    setRestartingDaemon(true);
    try {
      await restartCoreDaemon();
      setTimeout(async () => {
        try {
          await handleTestConnection();
        } finally {
          setRestartingDaemon(false);
        }
      }, 1500);
    } catch (err) {
      alert(`Restart failed: ${err instanceof Error ? err.message : String(err)}`);
      setRestartingDaemon(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '860px' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
          Settings & Preferences
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Configure core daemon connection, Steam transfer lifecycle, startup behavior, and application updates.
        </p>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(22, 163, 74, 0.1)',
            border: '1px solid rgba(22, 163, 74, 0.25)',
            borderRadius: 'var(--radius)',
            color: 'var(--success)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>Settings saved and applied successfully.</span>
        </div>
      )}

      {saveError && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.25)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{saveError}</span>
        </div>
      )}

      {/* Section 1: Steam Transfer Lifecycle Automation */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--primary-subtle)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sliders size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Steam Transfer Lifecycle</h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: steamRunning ? 'rgba(22, 163, 74, 0.1)' : 'var(--bg-main)',
                  color: steamRunning ? 'var(--success)' : 'var(--text-muted)',
                  border: `1px solid ${steamRunning ? 'rgba(22, 163, 74, 0.25)' : 'var(--border-color)'}`,
                }}
              >
                Steam: {steamRunning ? 'Running' : 'Closed'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Automate Steam client state during game migrations to prevent file lock contention and manifest sync conflicts.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={closeSteamOnTransfer}
              onChange={(e) => setCloseSteamOnTransfer(e.target.checked)}
              style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Close Steam before moving or evicting games
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Sends a graceful exit command (<code>steam://exit</code>) to let Steam flush cloud saves and release locked manifest files before copying begins.
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={relaunchSteamAfterTransfer}
              onChange={(e) => setRelaunchSteamAfterTransfer(e.target.checked)}
              style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Relaunch Steam after transfer finishes
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Automatically reopens Steam (<code>steam://open/main</code>) once the Robocopy sync and manifest relocation complete successfully.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Section 2: Core Daemon Connection & Tokens */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--primary-subtle)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Server size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Core Service & Security</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Connection parameters for the background daemon service managing SQLite and disk operations.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', paddingTop: '8px' }}>
          <div>
            <label
              htmlFor="settings-base-url"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginBottom: '6px',
              }}
            >
              Core Service Address
            </label>
            <input
              id="settings-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8765"
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              The core daemon binds strictly to loopback (127.0.0.1) for safety.
            </span>
          </div>

          <div>
            <label
              htmlFor="settings-bearer-token"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginBottom: '6px',
              }}
            >
              Bearer Auth Secret Token
            </label>
            <input
              id="settings-bearer-token"
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder="Paste token or leave empty if auto-discovered"
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Used by desktop and mobile apps to authenticate against the core REST API.
            </span>
          </div>

          {testResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: testResult.ok ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                color: testResult.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${
                  testResult.ok ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'
                }`,
              }}
            >
              {testResult.ok ? <Check size={16} /> : <AlertCircle size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              <RefreshCw size={14} className={testing ? 'spin' : ''} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleRestartDaemon}
              disabled={restartingDaemon}
              className="btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              <RotateCcw size={14} className={restartingDaemon ? 'spin' : ''} />
              {restartingDaemon ? 'Restarting...' : 'Restart Background Daemon'}
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: System Preferences */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--primary-subtle)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>System & Appearance</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Configure operating system startup behavior and visual preferences.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={runOnStartup}
              onChange={(e) => setRunOnStartup(e.target.checked)}
              style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Run Zapp Core on Windows Startup
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                Launch the Zapp Core daemon in system tray when logging into Windows.
              </div>
            </div>
          </label>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginBottom: '8px',
              }}
            >
              Interface Theme
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    textTransform: 'capitalize',
                    borderRadius: 'var(--radius)',
                    backgroundColor: theme === t ? 'var(--primary)' : 'var(--bg-main)',
                    color: theme === t ? '#ffffff' : 'var(--text-muted)',
                    border: `1px solid ${theme === t ? 'var(--primary)' : 'var(--border-color)'}`,
                    fontWeight: theme === t ? 600 : 500,
                  }}
                >
                  {t} Mode
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: App Updates & Maintenance */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--primary-subtle)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>App Updates</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Check for official releases published via GitHub Releases.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '8px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Installed Version: {appVersion}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Release Channel: Stable • Architecture: x64 Windows
            </div>
          </div>

          {onCheckUpdates && (
            <button
              type="button"
              onClick={onCheckUpdates}
              disabled={checkingUpdates}
              className="btn-secondary"
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <Sparkles size={14} className={checkingUpdates ? 'spin' : ''} />
              {checkingUpdates ? 'Checking Updates...' : 'Check for Updates'}
            </button>
          )}
        </div>
      </div>

      {/* Global Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
        <button
          type="button"
          onClick={handleSave}
          className="btn-primary"
          style={{ padding: '10px 24px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          Save All Changes
        </button>
      </div>
    </div>
  );
};
