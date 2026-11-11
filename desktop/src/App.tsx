import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getApiConfig, setApiConfig } from './api/client.ts';
import { readLocalAuthToken, restartCoreDaemon, startCoreDaemon, sleep } from './api/native.ts';
import { Game, HealthResponse, Job, JobType, Library, LibraryInput } from './types/api.ts';
import { ConnectView } from './components/ConnectView.tsx';
import { LoginView } from './components/LoginView.tsx';
import { Titlebar } from './components/Titlebar.tsx';
import { Sidebar, NavRoute } from './components/Sidebar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DrivesOverview } from './components/DrivesOverview.tsx';
import { DriveDetailView } from './components/DriveDetailView.tsx';
import { GameList } from './components/GameList.tsx';
import { GameDetailView } from './components/GameDetailView.tsx';
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
import { matchTargetLibrary } from './utils/libraryMatcher.ts';
import { AlertTriangle, Gamepad2, Loader2, X, Wand2 } from 'lucide-react';

type ConnectionStatus = 'connecting' | 'disconnected' | 'authenticated';

const CACHE_KEY_GAMES = 'zapp_cache_games';
const CACHE_KEY_LIBRARIES = 'zapp_cache_libraries';

function getInitialCached<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as T;
      }
    }
  } catch {
    // fallback
  }
  return fallback;
}

export const App: React.FC = () => {
  const [conn, setConn] = useState<ConnectionStatus>('connecting');
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [libraries, setLibraries] = useState<Library[]>(() => getInitialCached(CACHE_KEY_LIBRARIES, []));
  const [games, setGames] = useState<Game[]>(() => getInitialCached(CACHE_KEY_GAMES, []));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(() => {
    try {
      const g = localStorage.getItem(CACHE_KEY_GAMES);
      return !!(g && JSON.parse(g).length > 0);
    } catch {
      return false;
    }
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<Library | null>(null);
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
  const initialJobsTrackedRef = useRef(false);
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
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [shakeSettingsTrigger, setShakeSettingsTrigger] = useState(0);

  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    return (localStorage.getItem('zapp_theme') as any) || 'light';
  });

  const handleThemeChange = useCallback((newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    if (newTheme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    localStorage.setItem('zapp_theme', newTheme);
  }, []);

  useEffect(() => {
    handleThemeChange(theme);
  }, [handleThemeChange, theme]);

  const navigate = useCallback((route: NavRoute) => {
    if (activeRoute === 'settings' && route !== 'settings' && settingsDirty) {
      setShakeSettingsTrigger((prev) => prev + 1);
      return;
    }
    setActiveRoute(route);
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      if (next[next.length - 1] !== route) {
        next.push(route);
      }
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [activeRoute, historyIndex, settingsDirty]);

  const goBack = useCallback(() => {
    if (activeRoute === 'settings' && settingsDirty) {
      setShakeSettingsTrigger((prev) => prev + 1);
      return;
    }
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setActiveRoute(history[newIndex]);
    }
  }, [activeRoute, historyIndex, history, settingsDirty]);

  const goForward = useCallback(() => {
    if (activeRoute === 'settings' && settingsDirty) {
      setShakeSettingsTrigger((prev) => prev + 1);
      return;
    }
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setActiveRoute(history[newIndex]);
    }
  }, [activeRoute, historyIndex, history, settingsDirty]);

  const handleSelectDrive = useCallback(
    (lib: Library) => {
      setSelectedDrive(lib);
      navigate('drive-detail');
    },
    [navigate]
  );

  const handleUpdateLibraryPath = useCallback(
    async (libraryId: string, newPath: string) => {
      const updatedInputs: LibraryInput[] = libraries.map((lib) => ({
        id: lib.id,
        type: lib.type,
        path: (lib.id === libraryId ? newPath.trim() : lib.path) || '',
      }));
      const updatedLibs = await api.registerLibraries(updatedInputs);
      setLibraries(updatedLibs);
      const updatedSelected = updatedLibs.find((l) => l.id === libraryId);
      if (updatedSelected) {
        setSelectedDrive(updatedSelected);
      }
      addToast({
        id: String(Date.now()),
        type: 'success',
        title: 'Library Path Updated',
        message: `Library path successfully updated to ${newPath}`,
      });
    },
    [libraries, addToast]
  );

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
        const isLoopback = cfg.baseUrl.includes('127.0.0.1') || cfg.baseUrl.includes('localhost');
        if (!cfg.bearerToken && isLoopback) {
          const localToken = await readLocalAuthToken().catch(() => null);
          if (localToken) {
            setApiConfig({ baseUrl: cfg.baseUrl, bearerToken: localToken });
          }
        }
        let h = null;
        try {
          h = await api.getHealth();
        } catch {
          if (isLoopback) {
            await startCoreDaemon().catch(() => null);
            await sleep(400);
            const token = (await readLocalAuthToken().catch(() => null)) || '';
            if (token) {
              setApiConfig({ baseUrl: cfg.baseUrl, bearerToken: token });
            }
            h = await api.getHealth().catch(() => null);
          }
        }
        if (h && !cancelled) {
          setHealth(h);
          setConn('authenticated');
        } else if (!cancelled) {
          setConn('disconnected');
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
      const [h, libs, g, j] = await Promise.all([
        api.getHealth().catch(() => null),
        api.listLibraries().catch(() => []),
        api.listGames().catch(() => []),
        api.listJobs().catch(() => []),
      ]);
      setHealth(h);
      if (libs) {
        setLibraries(libs);
        try {
          localStorage.setItem(CACHE_KEY_LIBRARIES, JSON.stringify(libs));
        } catch {
          // ignore storage quota issues
        }
      }
      if (g) {
        setGames(g);
        setSelectedGame((currentSelected) => {
          if (!currentSelected) return null;
          const matched = g.find((game) => String(game.app_id) === String(currentSelected.app_id));
          return matched || currentSelected;
        });
        try {
          localStorage.setItem(CACHE_KEY_GAMES, JSON.stringify(g));
        } catch {
          // ignore storage quota issues
        }
      }
      if (j) {
        setJobs(j);
      }
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, []);

  useEffect(() => {
    if (conn !== 'authenticated') return;
    loadData();
    // Auto-refresh jobs and health every 3 seconds, plus periodic background revalidation
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      api.getHealth().then(setHealth).catch(() => setHealth(null));
      api.listJobs().then(setJobs).catch(() => {});
      // Every 30 seconds (10 ticks * 3s), revalidate games & libraries quietly in background
      if (ticks % 10 === 0) {
        api.listLibraries().then(setLibraries).catch(() => {});
        api.listGames().then((g) => {
          if (g) {
            setGames(g);
            setSelectedGame((currentSelected) => {
              if (!currentSelected) return null;
              const matched = g.find((game) => String(game.app_id) === String(currentSelected.app_id));
              return matched || currentSelected;
            });
          }
        }).catch(() => {});
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [conn, loadData]);

  // Request notification permissions once on startup if supported
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Monitor job state transitions for completion/failure toasts + hot data reload
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;

    if (!initialJobsTrackedRef.current) {
      initialJobsTrackedRef.current = true;
      jobs.forEach((job) => {
        prevJobsRef.current[job.id] = job.status;
      });
      return;
    }

    let shouldReloadData = false;

    jobs.forEach((job) => {
      const prev = prevJobsRef.current[job.id];
      if (prev && prev !== job.status) {
        const game = games.find((g) => String(g.app_id) === String(job.app_id));
        const gameName = game ? game.name : `App ID ${job.app_id}`;

        if (job.status === 'succeeded') {
          shouldReloadData = true;
          if (prev === 'running') {
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
          }
        } else if (job.status === 'failed') {
          shouldReloadData = true;
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
        } else if (job.status === 'cancelled') {
          shouldReloadData = true;
        }
      } else if (!prev && (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled')) {
        shouldReloadData = true;
      }
      prevJobsRef.current[job.id] = job.status;
    });

    if (shouldReloadData) {
      loadData();
    }
  }, [jobs, games, addToast, navigate, loadData]);

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
    setShowManualConnect(false);
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
    const target = matchTargetLibrary(game, libType, libraries);
    if (!target) {
      setErrorMsg(`No matching ${libType === 'ssd_cache' ? 'SSD cache' : 'HDD master'} library is configured.`);
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
      sourceLibraryId: game.current_library_id,
      hasHddBackup: game.has_hdd_backup,
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

  const handleGameUpdated = useCallback((updated: Game) => {
    setSelectedGame(updated);
    setGames((prev) => prev.map((g) => (String(g.app_id) === String(updated.app_id) ? updated : g)));
    loadData();
  }, [loadData]);

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
    return (
      <>
        {showManualConnect ? (
          <ConnectView
            onConnected={() => {
              setShowManualConnect(false);
              setConn('authenticated');
              loadData();
            }}
            onBackToLogin={() => setShowManualConnect(false)}
          />
        ) : (
          <LoginView
            onConnected={async () => {
              try {
                const h = await api.getHealth();
                setHealth(h);
              } catch {
                // Server mode
              }
              setConn('authenticated');
              loadData();
            }}
            onDirectLocalMode={async () => {
              try {
                await startCoreDaemon().catch(() => null);
                await sleep(400);
                const localToken = (await readLocalAuthToken().catch(() => null)) || '';
                setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: localToken });
                const h = await api.getHealth();
                setHealth(h);
                setConn('authenticated');
                loadData();
              } catch {
                addToast({
                  id: 'direct-connect-fail',
                  type: 'error',
                  title: 'Local Core Unreachable',
                  message: 'Could not connect to local core at 127.0.0.1:8765. Make sure zapp-core is running.',
                });
              }
            }}
            onManualConnect={() => setShowManualConnect(true)}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
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
          appVersion="0.3.3-beta.2"
          onOpenWizard={() => {
            if (activeRoute === 'settings' && settingsDirty) {
              setShakeSettingsTrigger((prev) => prev + 1);
              return;
            }
            setIsWizardOpen(true);
          }}
        />

        <main className="content-pane" role="main">
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
              onSelectGame={(g) => {
                setSelectedGame(g);
                navigate('game-detail');
              }}
              onSelectDrive={handleSelectDrive}
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
                onGameUpdated={handleGameUpdated}
                onSelectGame={(g) => {
                  setSelectedGame(g);
                  navigate('game-detail');
                }}
              />
            </div>
          )}

          {/* View 2b: Dedicated Game Detail Page */}
          {activeRoute === 'game-detail' && selectedGame && (
            <GameDetailView
              game={games.find((g) => String(g.app_id) === String(selectedGame.app_id)) || selectedGame}
              libraries={libraries}
              jobs={jobs}
              onBack={() => {
                if (historyIndex > 0) {
                  goBack();
                } else {
                  navigate('games');
                }
              }}
              onAction={requestSwap}
              actionLoading={actionLoading}
              onGameUpdated={handleGameUpdated}
            />
          )}

          {/* View 3: Drives & Storage */}
          {activeRoute === 'drives' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                    Drives & Storage
                  </h2>
                </div>
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Wand2 size={16} /> Launch Setup Wizard
                </button>
              </div>

              <DrivesOverview
                libraries={libraries}
                games={games}
                onSelectDrive={handleSelectDrive}
              />
            </div>
          )}

          {/* View 3b: Dedicated Drive Detail Page */}
          {activeRoute === 'drive-detail' && selectedDrive && (
            <DriveDetailView
              library={libraries.find((l) => l.id === selectedDrive.id) || selectedDrive}
              games={games}
              allLibraries={libraries}
              jobs={jobs}
              onBack={() => {
                if (historyIndex > 0) {
                  goBack();
                } else {
                  navigate('drives');
                }
              }}
              onAction={requestSwap}
              actionLoading={actionLoading}
              onUpdatePath={handleUpdateLibraryPath}
              onSelectGame={(g) => {
                setSelectedGame(g);
                navigate('game-detail');
              }}
            />
          )}

          {/* View 4: Transfer Job Queue */}
          {activeRoute === 'queue' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                  Transfer Queue
                </h2>
              </div>

              <QueueMonitor
                jobs={jobs}
                games={games}
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
              appVersion={health?.version ? `v${health.version}` : 'v0.3.3-beta.2'}
              steamRunning={!!health?.steam_running}
              onCheckUpdates={() => handleCheckUpdates(true)}
              checkingUpdates={checkingUpdates}
              onSaved={loadData}
              onThemeChange={handleThemeChange}
              onDirtyChange={setSettingsDirty}
              shakeTrigger={shakeSettingsTrigger}
            />
          )}
        </main>

        {/* Floating Bottom-Right Transfer Progress Widget */}
        <ActiveTransferBanner
          runningJob={jobs.find((j) => j.status === 'running')}
          games={games}
          onCancel={handleCancelJob}
          onNavigateQueue={() => navigate('queue')}
          cancelling={actionLoading}
        />
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
        hasActiveJobs={jobs.some((j) => j.status === 'running')}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
