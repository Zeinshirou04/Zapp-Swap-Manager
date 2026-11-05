import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getApiConfig, setApiConfig } from './api/client.ts';
import { readLocalAuthToken, restartCoreDaemon, sleep } from './api/native.ts';
import { Game, HealthResponse, Job, JobType, Library } from './types/api.ts';
import { ConnectView } from './components/ConnectView.tsx';
import { Titlebar } from './components/Titlebar.tsx';
import { Sidebar, NavRoute } from './components/Sidebar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DrivesOverview } from './components/DrivesOverview.tsx';
import { GameList } from './components/GameList.tsx';
import { QueueMonitor } from './components/QueueMonitor.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { LibraryWizardModal } from './components/LibraryWizardModal.tsx';
import { SwapAction, SwapConfirmModal } from './components/SwapConfirmModal.tsx';
import { UpdateNotification } from './components/UpdateNotification.tsx';
import { ActiveTransferBanner } from './components/ActiveTransferBanner.tsx';
import { LogsView } from './components/LogsView.tsx';
import { ToastContainer } from './components/Toast.tsx';
import { ToastMessage } from './types/toast.ts';
import { checkUpdate, UpdateDetails } from './api/updater.ts';
import { AlertTriangle, Gamepad2, Loader2, X, Wand2 } from 'lucide-react';

type ConnectionStatus = 'connecting' | 'disconnected' | 'authenticated';

export const App: React.FC = () => {
  const [conn, setConn] = useState<ConnectionStatus>('connecting');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<SwapAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateDetails | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const prevJobsRef = useRef<Record<string, string>>({});
  const wizardShownRef = useRef(false);
  const updateCheckDoneRef = useRef(false);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [...prev, toast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Browser-style navigation history stack
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [history, setHistory] = useState<NavRoute[]>(['dashboard']);
  const [historyIndex, setHistoryIndex] = useState(0);

  const navigate = useCallback((route: NavRoute) => {
    setActiveRoute(route);
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      if (next[next.length - 1] !== route) {
        next.push(route);
      }
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setActiveRoute(history[newIndex]);
    }
  }, [historyIndex, history]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setActiveRoute(history[newIndex]);
    }
  }, [historyIndex, history]);

  // Check for updates (background on startup, or manual via button)
  const handleCheckUpdates = useCallback(async (manual = false) => {
    try {
      setCheckingUpdates(true);
      if (manual) setUpdateStatusMsg(null);
      const update = await checkUpdate();
      if (update) {
        setAvailableUpdate(update);
      } else if (manual) {
        setUpdateStatusMsg("You're running the latest version of Zapp Swap Manager!");
        setTimeout(() => setUpdateStatusMsg(null), 4000);
      }
    } catch (err) {
      if (manual) {
        setUpdateStatusMsg(err instanceof Error ? err.message : 'Failed to check for updates');
      }
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  // Background check on startup once
  useEffect(() => {
    if (!updateCheckDoneRef.current) {
      updateCheckDoneRef.current = true;
      handleCheckUpdates(false);
    }
  }, [handleCheckUpdates]);

  // At startup probe /health: auto-read local auth token if targeting loopback, reachable -> dashboard, otherwise Connect screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = getApiConfig();
        if (!cfg.bearerToken && (cfg.baseUrl.includes('127.0.0.1') || cfg.baseUrl.includes('localhost'))) {
          const localToken = await readLocalAuthToken().catch(() => null);
          if (localToken) {
            setApiConfig({ baseUrl: cfg.baseUrl, bearerToken: localToken });
          }
        }
        const h = await api.getHealth();
        if (!cancelled) {
          setHealth(h);
          setConn('authenticated');
        }
      } catch {
        if (!cancelled) setConn('disconnected');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [h, libs, g, j] = await Promise.all([
        api.getHealth().catch(() => null),
        api.listLibraries().catch(() => []),
        api.listGames().catch(() => []),
        api.listJobs().catch(() => []),
      ]);
      setHealth(h);
      setLibraries(libs);
      setGames(g);
      setJobs(j);
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []);

  useEffect(() => {
    if (conn !== 'authenticated') return;
    loadData();
    // Auto-refresh jobs and health every 3 seconds
    const interval = setInterval(() => {
      api.getHealth().then(setHealth).catch(() => setHealth(null));
      api.listJobs().then(setJobs).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [conn, loadData]);

  // Request notification permissions once on startup if supported
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Monitor job state transitions for completion and failure toasts
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;

    jobs.forEach((job) => {
      const prev = prevJobsRef.current[job.id];
      if (prev && prev !== job.status) {
        const game = games.find((g) => String(g.app_id) === String(job.app_id));
        const gameName = game ? game.name : `App ID ${job.app_id}`;

        if (job.status === 'succeeded' && prev === 'running') {
          const actionText =
            job.type === 'promote'
              ? 'moved to fast SSD'
              : job.type === 'evict'
              ? 'evicted to HDD master'
              : 'backed up to HDD master';
          const msg = `${gameName} was successfully ${actionText}.`;
          addToast({
            id: `success-${job.id}-${Date.now()}`,
            type: 'success',
            title: 'Transfer Completed',
            message: msg,
          });
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('Transfer Complete', { body: msg });
            } catch (err) {
              console.debug('Notification dispatch failed', err);
            }
          }
        } else if (job.status === 'failed') {
          const errMsg = job.error || 'Transfer encountered an error.';
          addToast({
            id: `error-${job.id}-${Date.now()}`,
            type: 'error',
            title: 'Transfer Failed',
            message: `${gameName}: ${errMsg}`,
            actionLabel: 'View Logs',
            onAction: () => navigate('logs'),
          });
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('Transfer Failed', { body: `${gameName}: ${errMsg}` });
            } catch (err) {
              console.debug('Notification dispatch failed', err);
            }
          }
        }
      }
      prevJobsRef.current[job.id] = job.status;
    });
  }, [jobs, games, addToast, navigate]);

  // Guided wizard auto-opens once ONLY when initial load completes and core has no libraries.
  useEffect(() => {
    if (conn === 'authenticated' && initialLoadDone && libraries.length === 0 && !wizardShownRef.current) {
      const dismissed = localStorage.getItem('zapp_wizard_dismissed') === 'true';
      if (!dismissed) {
        wizardShownRef.current = true;
        setIsWizardOpen(true);
      }
    }
  }, [conn, initialLoadDone, libraries.length]);

  const handleDisconnect = () => {
    setHealth(null);
    setConn('disconnected');
  };

  const handleRestartCore = async () => {
    try {
      setConn('connecting');
      await restartCoreDaemon();
      for (let i = 0; i < 30; i++) {
        try {
          setHealth(await api.getHealth());
          setConn('authenticated');
          return;
        } catch {
          await sleep(500);
        }
      }
      setConn('disconnected');
    } catch {
      setConn('disconnected');
    }
  };

  // The confirmation modal routes every transfer through one queueing call.
  const requestSwap = (game: Game, type: JobType) => {
    const libType = type === 'promote' ? 'ssd_cache' : 'hdd_master';
    const target = libraries.find((l) => l.type === libType);
    if (!target) {
      setErrorMsg(`No ${libType === 'ssd_cache' ? 'SSD cache' : 'HDD master'} library is configured.`);
      return;
    }
    setErrorMsg(null);
    setActionError(null);
    setPendingAction({
      type,
      appId: game.app_id,
      title: game.name,
      sizeBytes: game.size_bytes,
      targetLibraryId: target.id,
    });
  };

  const confirmSwap = async () => {
    if (!pendingAction) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.createJob({
        type: pendingAction.type,
        app_id: String(pendingAction.appId),
        target_library_id: pendingAction.targetLibraryId,
      });
      setPendingAction(null);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to queue transfer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.cancelJob(jobId);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to cancel job');
    } finally {
      setActionLoading(false);
    }
  };

  if (conn === 'connecting') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <Gamepad2 size={32} style={{ color: 'var(--primary)' }} />
        <Loader2 className="spin" size={20} />
        <span>Connecting to Core Service...</span>
      </div>
    );
  }

  if (conn === 'disconnected') {
    return <ConnectView onConnected={() => setConn('authenticated')} />;
  }

  return (
    <div className="dashboard-root">
      {/* Top Browser / IDE Style Titlebar */}
      <Titlebar
        currentRoute={activeRoute}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        onGoBack={goBack}
        onGoForward={goForward}
        onRefresh={loadData}
        loading={loading}
        onNavigateHome={() => navigate('dashboard')}
        health={health}
        onOpenSettings={() => navigate('settings')}
        onRestartCore={handleRestartCore}
        onDisconnect={handleDisconnect}
        onCheckUpdates={() => handleCheckUpdates(true)}
        checkingUpdates={checkingUpdates}
      />

      {/* Main Dashboard Layout: Sidebar + Dynamic Content Pane */}
      <div className="dashboard-body">
        <Sidebar
          activeRoute={activeRoute}
          onRouteChange={(route) => navigate(route)}
          gamesCount={games.length}
          drivesCount={libraries.length}
          queueCount={jobs.filter((j) => j.status === 'running' || j.status === 'queued').length}
          steamRunning={health?.steam_running ?? false}
          appVersion="0.2.9"
          onOpenWizard={() => setIsWizardOpen(true)}
        />

        <main className="content-pane" role="main">
          {/* Active Transfer Progress Banner */}
          <ActiveTransferBanner
            runningJob={jobs.find((j) => j.status === 'running')}
            games={games}
            onCancel={handleCancelJob}
            onNavigateQueue={() => navigate('queue')}
            cancelling={actionLoading}
          />

          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--danger)',
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="btn-secondary"
                style={{ padding: '4px', border: 'none' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* View 1: Dashboard Home Overview */}
          {activeRoute === 'dashboard' && (
            <DashboardView
              games={games}
              libraries={libraries}
              jobs={jobs}
              onNavigate={navigate}
              onAction={requestSwap}
              actionLoading={actionLoading}
              onOpenWizard={() => setIsWizardOpen(true)}
            />
          )}

          {/* View 2: Games Library */}
          {activeRoute === 'games' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    Games Library
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    All Steam and non-Steam games detected across your configured libraries.
                  </p>
                </div>
              </div>
              <GameList
                games={games}
                libraries={libraries}
                jobs={jobs}
                onAction={requestSwap}
                actionLoading={actionLoading}
                onRefresh={loadData}
              />
            </div>
          )}

          {/* View 3: Drives & Storage */}
          {activeRoute === 'drives' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                    Drives & Steam Libraries
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Configured SSD cache and HDD master storage paths with real-time disk metrics.
                  </p>
                </div>
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Wand2 size={16} /> Launch Setup Wizard
                </button>
              </div>

              <DrivesOverview libraries={libraries} games={games} />

              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>
                  Configured Storage Paths ({libraries.length})
                </h3>
                {libraries.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No libraries configured yet. Run the setup wizard to assign fast SSD and HDD directories.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {libraries.map((lib) => (
                      <div
                        key={lib.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          backgroundColor: 'var(--bg-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{lib.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({lib.type === 'ssd_cache' ? 'Fast SSD' : 'Storage HDD'})
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          ID: {lib.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View 4: Transfer Job Queue */}
          {activeRoute === 'queue' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  Transfer Job Queue
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Monitor queued and active game migrations between SSD cache and HDD master storage.
                </p>
              </div>

              <QueueMonitor
                jobs={jobs}
                onCancelJob={handleCancelJob}
                cancelling={actionLoading}
              />
            </div>
          )}

          {/* View 5: Logs */}
          {activeRoute === 'logs' && <LogsView />}

          {/* View 6: Settings */}
          {activeRoute === 'settings' && (
            <SettingsView
              appVersion={health?.version ? `v${health.version}` : 'v0.2.9'}
              steamRunning={!!health?.steam_running}
              onCheckUpdates={() => handleCheckUpdates(true)}
              checkingUpdates={checkingUpdates}
              onSaved={loadData}
            />
          )}
        </main>
      </div>

      {/* Global Modals & Dialogs */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={loadData}
        onCheckUpdates={() => handleCheckUpdates(true)}
        checkingUpdates={checkingUpdates}
      />

      <LibraryWizardModal
        open={isWizardOpen}
        onClose={() => {
          localStorage.setItem('zapp_wizard_dismissed', 'true');
          setIsWizardOpen(false);
        }}
        onSaved={() => {
          localStorage.setItem('zapp_wizard_dismissed', 'true');
          setIsWizardOpen(false);
          loadData();
        }}
      />

      <SwapConfirmModal
        action={pendingAction}
        libraries={libraries}
        loading={actionLoading}
        error={actionError}
        onConfirm={confirmSwap}
        onCancel={() => {
          setPendingAction(null);
          setActionError(null);
        }}
      />

      <UpdateNotification
        update={availableUpdate}
        onDismiss={() => setAvailableUpdate(null)}
        statusMessage={updateStatusMsg}
        onClearStatus={() => setUpdateStatusMsg(null)}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
