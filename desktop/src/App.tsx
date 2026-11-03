import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, getApiConfig, setApiConfig } from './api/client.ts';
import { readLocalAuthToken, restartCoreDaemon, sleep } from './api/native.ts';
import { Game, HealthResponse, Job, JobType, Library } from './types/api.ts';
import { ConnectView } from './components/ConnectView.tsx';
import { Header } from './components/Header.tsx';
import { DrivesOverview } from './components/DrivesOverview.tsx';
import { GameList } from './components/GameList.tsx';
import { QueueMonitor } from './components/QueueMonitor.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { LibraryWizardModal } from './components/LibraryWizardModal.tsx';
import { SwapAction, SwapConfirmModal } from './components/SwapConfirmModal.tsx';
import { UpdateNotification } from './components/UpdateNotification.tsx';
import { checkUpdate, UpdateDetails } from './api/updater.ts';
import { AlertTriangle, Gamepad2, Loader2, X } from 'lucide-react';

type ConnectionStatus = 'connecting' | 'disconnected' | 'authenticated';

export const App: React.FC = () => {
  const [conn, setConn] = useState<ConnectionStatus>('connecting');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<SwapAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateDetails | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);
  const wizardShownRef = useRef(false);
  const updateCheckDoneRef = useRef(false);

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

  // Guided wizard auto-opens once when the core has no libraries configured.
  useEffect(() => {
    if (conn === 'authenticated' && !loading && libraries.length === 0 && !wizardShownRef.current) {
      wizardShownRef.current = true;
      setIsWizardOpen(true);
    }
  }, [conn, loading, libraries.length]);

  const handleDisconnect = () => {
    setHealth(null);
    setConn('disconnected');
  };

  const handleRestartCore = async () => {
    try {
      setConn('connecting');
      await restartCoreDaemon();
      // Retry health until core is back (it may hard-stop then restart if we own the process).
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
      // Keep the modal open; show what the core rejected.
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
    <div className="app-container">
      <Header
        health={health}
        loading={loading}
        onRefresh={loadData}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRestartCore={handleRestartCore}
        onDisconnect={handleDisconnect}
        onConfigureLibraries={() => setIsWizardOpen(true)}
        onCheckUpdates={() => handleCheckUpdates(true)}
        checkingUpdates={checkingUpdates}
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

      <DrivesOverview libraries={libraries} />

      <QueueMonitor
        jobs={jobs}
        onCancelJob={handleCancelJob}
        cancelling={actionLoading}
      />

      <GameList
        games={games}
        libraries={libraries}
        onAction={requestSwap}
        actionLoading={actionLoading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={loadData}
        onCheckUpdates={() => handleCheckUpdates(true)}
        checkingUpdates={checkingUpdates}
      />

      <LibraryWizardModal
        open={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSaved={() => {
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
    </div>
  );
};

export default App;
