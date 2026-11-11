import React, { useState, useEffect, useMemo } from 'react';
import { getApiConfig, setApiConfig, api } from '../api/client.ts';
import { Preferences } from '../types/api.ts';
import { restartCoreDaemon } from '../api/native.ts';
import { ZappIcon } from './ZappIcon.tsx';
import {
  Check,
  AlertCircle,
  Sparkles,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

interface SettingsViewProps {
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
  onSaved?: () => void;
  appVersion?: string;
  steamRunning?: boolean;
  onThemeChange?: (theme: 'system' | 'light' | 'dark') => void;
  onDirtyChange?: (dirty: boolean) => void;
  shakeTrigger?: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onCheckUpdates,
  checkingUpdates = false,
  onSaved,
  appVersion = 'v0.3.3-beta.1',
  steamRunning = false,
  onThemeChange,
  onDirtyChange,
  shakeTrigger = 0,
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

  // Robocopy engine configuration
  const [robocopyThreads, setRobocopyThreads] = useState<number>(8);
  const [robocopyRetries, setRobocopyRetries] = useState<number>(2);
  const [robocopyWaitSeconds, setRobocopyWaitSeconds] = useState<number>(2);
  const [robocopyUnbuffered, setRobocopyUnbuffered] = useState<boolean>(false);

  const [initialValues, setInitialValues] = useState<{
    baseUrl: string;
    bearerToken: string;
    closeSteamOnTransfer: boolean;
    relaunchSteamAfterTransfer: boolean;
    runOnStartup: boolean;
    theme: 'system' | 'light' | 'dark';
    robocopyThreads: number;
    robocopyRetries: number;
    robocopyWaitSeconds: number;
    robocopyUnbuffered: boolean;
  } | null>(null);

  const [shaking, setShaking] = useState(false);
  const [subTab, setSubTab] = useState<'all' | 'preferences' | 'appearance' | 'robocopy' | 'core' | 'updates'>('all');

  useEffect(() => {
    if (shakeTrigger && shakeTrigger > 0) {
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 500);
      return () => clearTimeout(t);
    }
  }, [shakeTrigger]);

  useEffect(() => {
    const cfg = getApiConfig();
    setBaseUrl(cfg.baseUrl);
    setBearerToken(cfg.bearerToken);

    api
      .getPreferences()
      .then((prefs) => {
        const loadedTheme = prefs.theme || 'light';
        const closeSteam = !!prefs.close_steam_on_transfer;
        const relaunchSteam = !!prefs.relaunch_steam_after_transfer;
        const startup = !!prefs.run_on_startup;
        const threads = prefs.robocopy_threads ?? 8;
        const retries = prefs.robocopy_retries ?? 2;
        const waitSecs = prefs.robocopy_wait_seconds ?? 2;
        const unbuffered = !!prefs.robocopy_unbuffered;

        setCloseSteamOnTransfer(closeSteam);
        setRelaunchSteamAfterTransfer(relaunchSteam);
        setRunOnStartup(startup);
        setTheme(loadedTheme);
        setRobocopyThreads(threads);
        setRobocopyRetries(retries);
        setRobocopyWaitSeconds(waitSecs);
        setRobocopyUnbuffered(unbuffered);
        onThemeChange?.(loadedTheme);

        setInitialValues({
          baseUrl: cfg.baseUrl,
          bearerToken: cfg.bearerToken,
          closeSteamOnTransfer: closeSteam,
          relaunchSteamAfterTransfer: relaunchSteam,
          runOnStartup: startup,
          theme: loadedTheme,
          robocopyThreads: threads,
          robocopyRetries: retries,
          robocopyWaitSeconds: waitSecs,
          robocopyUnbuffered: unbuffered,
        });
      })
      .catch(() => {
        setInitialValues({
          baseUrl: cfg.baseUrl,
          bearerToken: cfg.bearerToken,
          closeSteamOnTransfer: false,
          relaunchSteamAfterTransfer: false,
          runOnStartup: false,
          theme: 'light',
          robocopyThreads: 8,
          robocopyRetries: 2,
          robocopyWaitSeconds: 2,
          robocopyUnbuffered: false,
        });
      });
  }, [onThemeChange]);

  const isDirty = useMemo(() => {
    if (!initialValues) return false;
    return (
      baseUrl !== initialValues.baseUrl ||
      bearerToken !== initialValues.bearerToken ||
      closeSteamOnTransfer !== initialValues.closeSteamOnTransfer ||
      relaunchSteamAfterTransfer !== initialValues.relaunchSteamAfterTransfer ||
      runOnStartup !== initialValues.runOnStartup ||
      theme !== initialValues.theme ||
      robocopyThreads !== initialValues.robocopyThreads ||
      robocopyRetries !== initialValues.robocopyRetries ||
      robocopyWaitSeconds !== initialValues.robocopyWaitSeconds ||
      robocopyUnbuffered !== initialValues.robocopyUnbuffered
    );
  }, [
    initialValues,
    baseUrl,
    bearerToken,
    closeSteamOnTransfer,
    relaunchSteamAfterTransfer,
    runOnStartup,
    theme,
    robocopyThreads,
    robocopyRetries,
    robocopyWaitSeconds,
    robocopyUnbuffered,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleDiscard = () => {
    if (!initialValues) return;
    setBaseUrl(initialValues.baseUrl);
    setBearerToken(initialValues.bearerToken);
    setCloseSteamOnTransfer(initialValues.closeSteamOnTransfer);
    setRelaunchSteamAfterTransfer(initialValues.relaunchSteamAfterTransfer);
    setRunOnStartup(initialValues.runOnStartup);
    setTheme(initialValues.theme);
    setRobocopyThreads(initialValues.robocopyThreads);
    setRobocopyRetries(initialValues.robocopyRetries);
    setRobocopyWaitSeconds(initialValues.robocopyWaitSeconds);
    setRobocopyUnbuffered(initialValues.robocopyUnbuffered);
    onThemeChange?.(initialValues.theme);
  };

  const handleThemeChange = (t: 'system' | 'light' | 'dark') => {
    setTheme(t);
    onThemeChange?.(t);
  };

  const handleSave = async () => {
    setSaveSuccess(false);
    setSaveError(null);
    const clampedThreads = Math.max(1, Math.min(128, Number(robocopyThreads) || 8));
    const clampedRetries = Math.max(0, Math.min(20, Number(robocopyRetries) || 0));
    const clampedWait = Math.max(0, Math.min(60, Number(robocopyWaitSeconds) || 0));

    try {
      setApiConfig({ baseUrl, bearerToken });
      const updatedPrefs: Preferences = {
        close_steam_on_transfer: closeSteamOnTransfer,
        relaunch_steam_after_transfer: relaunchSteamAfterTransfer,
        run_on_startup: runOnStartup,
        theme,
        robocopy_threads: clampedThreads,
        robocopy_retries: clampedRetries,
        robocopy_wait_seconds: clampedWait,
        robocopy_unbuffered: robocopyUnbuffered,
      };
      await api.updatePreferences(updatedPrefs).catch((err) => {
        console.warn('Failed to persist preferences to core:', err);
      });
      localStorage.setItem('zapp_theme', theme);
      setRobocopyThreads(clampedThreads);
      setRobocopyRetries(clampedRetries);
      setRobocopyWaitSeconds(clampedWait);
      setInitialValues({
        baseUrl,
        bearerToken,
        closeSteamOnTransfer,
        relaunchSteamAfterTransfer,
        runOnStartup,
        theme,
        robocopyThreads: clampedThreads,
        robocopyRetries: clampedRetries,
        robocopyWaitSeconds: clampedWait,
        robocopyUnbuffered,
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

  const showSection = (id: 'preferences' | 'appearance' | 'robocopy' | 'core' | 'updates') =>
    subTab === 'all' || subTab === id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}>
      {/* Page Header & Borderless Sub-Settings Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: 0 }}>
          Settings & Preferences
        </h2>

        <nav
          aria-label="Settings sections"
          style={{
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'preferences', label: 'Preferences' },
              { id: 'appearance', label: 'Appearance' },
              { id: 'robocopy', label: 'Robocopy Config' },
              { id: 'core', label: 'Core Service' },
              { id: 'updates', label: 'Updates' },
            ] as const
          ).map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderRadius: 0,
                  padding: '8px 2px',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--primary-text, var(--primary))' : 'var(--text-muted)',
                  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: '-1px',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {isDirty && (
        <div
          className={`danger-banner ${shaking ? 'shake-danger' : ''}`}
          style={{ transition: 'all 0.2s ease' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>Unsaved Changes</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                You have unsaved changes. Please save or discard them before leaving this page.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDiscard}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                borderColor: 'var(--danger)',
                color: 'var(--danger)',
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary"
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--danger)',
                borderColor: 'var(--danger)',
              }}
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

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

      {/* Sub-Section 1: Preferences (Steam Transfer Lifecycle & Startup) */}
      {showSection('preferences') && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ZappIcon name="preferences" size={20} style={{ color: 'var(--primary-text)' }} />
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Steam Transfer Lifecycle</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  Steam process automation and startup preferences.
                </p>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: steamRunning ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              Steam: {steamRunning ? 'Running' : 'Closed'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '4px' }}>
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
          </div>
        </section>
      )}

      {/* Sub-Section 2: Appearance */}
      {showSection('appearance') && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ZappIcon name="appearance" size={20} style={{ color: 'var(--primary-text)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>System & Appearance</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Interface theme and contrast preferences.
              </p>
            </div>
          </div>

          <div style={{ paddingTop: '4px' }}>
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
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleThemeChange(t)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    textTransform: 'capitalize',
                    borderRadius: 'var(--radius)',
                    backgroundColor: theme === t ? 'var(--primary)' : 'transparent',
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
        </section>
      )}

      {/* Sub-Section 3: Robocopy Config */}
      {showSection('robocopy') && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={20} style={{ color: 'var(--primary-text)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Robocopy Transfer Engine</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Tune multithreading cores, retry thresholds, and disk I/O behavior during file transfers.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '4px' }}>
            <div>
              <label
                htmlFor="settings-robocopy-threads"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '6px',
                }}
              >
                Multithreaded Threads / Cores (<code>/MT:N</code>)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  id="settings-robocopy-threads"
                  type="number"
                  min={1}
                  max={128}
                  value={robocopyThreads}
                  onChange={(e) => setRobocopyThreads(Math.max(1, Math.min(128, Number(e.target.value) || 1)))}
                  style={{
                    width: '100px',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[4, 8, 16, 32, 64].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRobocopyThreads(preset)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        borderRadius: 'var(--radius)',
                        border: `1px solid ${robocopyThreads === preset ? 'var(--primary)' : 'var(--border-color)'}`,
                        backgroundColor: robocopyThreads === preset ? 'var(--primary-subtle)' : 'transparent',
                        color: robocopyThreads === preset ? 'var(--primary-text, var(--primary))' : 'var(--text-muted)',
                        fontWeight: robocopyThreads === preset ? 600 : 500,
                      }}
                    >
                      {preset} {preset === 8 ? '(Default)' : 'threads'}
                    </button>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                Number of concurrent threads Robocopy allocates (1–128). Higher values accelerate folders with many small files on SSDs.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <label
                  htmlFor="settings-robocopy-retries"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    marginBottom: '6px',
                  }}
                >
                  Retry Attempts (<code>/R:N</code>)
                </label>
                <input
                  id="settings-robocopy-retries"
                  type="number"
                  min={0}
                  max={20}
                  value={robocopyRetries}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setRobocopyRetries(Number.isNaN(v) ? 0 : Math.max(0, Math.min(20, v)));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Retries on locked files before failing (default 2).
                </span>
              </div>

              <div>
                <label
                  htmlFor="settings-robocopy-wait"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    marginBottom: '6px',
                  }}
                >
                  Retry Wait Delay Seconds (<code>/W:N</code>)
                </label>
                <input
                  id="settings-robocopy-wait"
                  type="number"
                  min={0}
                  max={60}
                  value={robocopyWaitSeconds}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setRobocopyWaitSeconds(Number.isNaN(v) ? 0 : Math.max(0, Math.min(60, v)));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.875rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Pause between retry attempts in seconds (default 2s).
                </span>
              </div>
            </div>

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
                checked={robocopyUnbuffered}
                onChange={(e) => setRobocopyUnbuffered(e.target.checked)}
                style={{ marginTop: '3px', cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Use Unbuffered Disk I/O (<code>/J</code>)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Recommended for large game packages to copy directly without saturating Windows standby RAM cache.
                </div>
              </div>
            </label>
          </div>
        </section>
      )}

      {/* Sub-Section 4: Core Daemon Connection & Tokens */}
      {showSection('core') && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ZappIcon name="core-service" size={20} style={{ color: 'var(--primary-text)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Core Service & Security</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Background daemon connection parameters.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', paddingTop: '4px' }}>
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
                  background: 'transparent',
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
                  background: 'transparent',
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

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
        </section>
      )}

      {/* Sub-Section 5: App Updates & Maintenance */}
      {showSection('updates') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ZappIcon name="app-updates" size={20} style={{ color: 'var(--primary-text)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>App Updates</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Official releases via GitHub Releases.
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '4px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Installed Version: {appVersion}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Architecture: x64 Windows
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
        </section>
      )}

      {/* Global Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
        {isDirty && (
          <button
            type="button"
            onClick={handleDiscard}
            className="btn-secondary"
            style={{ padding: '10px 18px', fontSize: '0.9rem' }}
          >
            Discard Changes
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="btn-primary"
          style={{
            padding: '10px 24px',
            fontSize: '0.9rem',
            fontWeight: 600,
            ...(isDirty ? { boxShadow: '0 0 0 2px var(--primary-border)' } : {}),
          }}
        >
          Save All Changes
        </button>
      </div>
    </div>
  );
};
