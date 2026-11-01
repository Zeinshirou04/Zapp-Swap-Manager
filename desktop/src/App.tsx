import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/client.ts';
import { Game, HealthResponse, Job, Library } from './types/api.ts';
import { Header } from './components/Header.tsx';
import { DrivesOverview } from './components/DrivesOverview.tsx';
import { GameList } from './components/GameList.tsx';
import { QueueMonitor } from './components/QueueMonitor.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { AlertTriangle, X } from 'lucide-react';

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    loadData();
    // Auto-refresh jobs and health every 3 seconds
    const interval = setInterval(() => {
      api.getHealth().then(setHealth).catch(() => setHealth(null));
      api.listJobs().then(setJobs).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

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

  return (
    <div className="app-container">
      <Header
        health={health}
        loading={loading}
        onRefresh={loadData}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
