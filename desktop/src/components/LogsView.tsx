import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client.ts';
import { openLogsFolder, isTauri } from '../api/native.ts';
import {
  Terminal,
  RefreshCw,
  Copy,
  Check,
  FolderOpen,
  Search,
  Filter,
  ArrowDownCircle,
} from 'lucide-react';

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getLogs(500);
      setLogs(res.lines || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs from core service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((line) => {
    if (search && !line.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (levelFilter === 'info') return line.includes('level=INFO');
    if (levelFilter === 'warn') return line.includes('level=WARN');
    if (levelFilter === 'error') return line.includes('level=ERROR');
    return true;
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(filteredLogs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs', err);
    }
  };

  const handleOpenFolder = () => {
    if (isTauri()) {
      openLogsFolder().catch((err) => console.error('Failed to open logs folder', err));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Header and Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={22} style={{ color: 'var(--primary, #3b82f6)' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Service & Transfer Logs
            </h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Real-time output from the Zapp Swap Manager background core service and Robocopy engine.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isTauri() && (
            <button
              onClick={handleOpenFolder}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 10px', gap: '6px' }}
              title="Open log directory in Windows File Explorer"
            >
              <FolderOpen size={14} /> Open Logs Folder
            </button>
          )}

          <button
            onClick={handleCopy}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 10px', gap: '6px' }}
            title="Copy filtered logs to clipboard"
          >
            {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Logs'}
          </button>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 10px', gap: '6px' }}
            title="Refresh logs immediately"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '220px' }}>
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search logs by keyword, game ID, or error..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '0.85rem',
            }}
          />
        </div>

        {/* Level Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)', marginRight: '4px' }} />
          {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              style={{
                background: levelFilter === lvl ? 'var(--primary, #3b82f6)' : 'rgba(255, 255, 255, 0.05)',
                color: levelFilter === lvl ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '3px 9px',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Auto Scroll Toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <ArrowDownCircle size={14} /> Auto-scroll
        </label>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Terminal Log Container */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: '400px',
          maxHeight: 'calc(100vh - 280px)',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-sunken, #0C0B10)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius, 8px)',
          padding: '14px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.8rem',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
            {logs.length === 0 ? 'No logs available from core service yet.' : 'No log lines match current filters.'}
          </div>
        ) : (
          filteredLogs.map((line, idx) => {
            let color = '#cbd5e1'; // default slate-300
            if (line.includes('level=ERROR')) {
              color = '#f87171'; // red-400
            } else if (line.includes('level=WARN')) {
              color = '#fbbf24'; // amber-400
            } else if (line.includes('level=INFO')) {
              color = '#60a5fa'; // blue-400
            }

            return (
              <div key={idx} style={{ color }}>
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
