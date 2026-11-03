import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client.ts';
import { restartCoreDaemon, sleep } from './api/native.ts';
import { Game, HealthResponse, Job, Library } from './types/api.ts';
import { ConnectView } from './components/ConnectView.tsx';
import { Header } from './components/Header.tsx';
import { DrivesOverview } from './components/DrivesOverview.tsx';
import { GameList } from './components/GameList.tsx';
import { QueueMonitor } from './components/QueueMonitor.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // At startup probe /health once: reachable -> dashboard, otherwise Connect screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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

  const handlePromote = async (appId: string, targetLibraryId: string) => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.createJob({
        type: 'promote',
        app_id: appId,
        target_library_id: targetLibraryId,
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to queue promote');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvict = async (appId: string, targetLibraryId: string) => {
    if (!window.confirm(`Are you sure you want to evict game #${appId} to HDD? Files on SSD will only be deleted once the HDD copy is verified.`)) {
      return;
    }
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.createJob({
        type: 'evict',
        app_id: appId,
        target_library_id: targetLibraryId,
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to queue evict');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackup = async (appId: string, targetLibraryId: string) => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.createJob({
        type: 'backup',
        app_id: appId,
        target_library_id: targetLibraryId,
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to queue backup');
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
        onPromote={handlePromote}
        onEvict={handleEvict}
        onBackup={handleBackup}
        actionLoading={actionLoading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={loadData}
      />
    </div>
  );
};

export default App;
