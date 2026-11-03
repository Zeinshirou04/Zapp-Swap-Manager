import React, { useState } from 'react';
import { HealthResponse } from '../types/api.ts';
import { RefreshCw, Settings, Gamepad2, ShieldCheck, Activity, ChevronDown, RotateCw, Power } from 'lucide-react';

interface HeaderProps {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onRestartCore: () => void;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loading,
  onRefresh,
  onOpenSettings,
  onRestartCore,
  onDisconnect,
}) => {
  const isOnline = health !== null;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            background: 'var(--primary)',
            color: '#0f172a',
            padding: '8px',
            borderRadius: 'var(--radius)',
            display: 'flex',
          }}
        >
          <Gamepad2 size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Zapp Swap Manager
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            High-Performance Steam Cache & Backup Controller
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Core daemon status badge with quick-action dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: 'var(--radius)',
              fontSize: '0.825rem',
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isOnline ? 'var(--success)' : 'var(--danger)',
                boxShadow: isOnline ? '0 0 8px var(--success)' : 'none',
              }}
            />
            <Activity size={14} style={{ color: 'var(--text-muted)' }} />
            <span>{isOnline ? `Core: Online (v${health.version})` : 'Core Offline'}</span>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="card"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                zIndex: 30,
                padding: '6px',
                minWidth: '180px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRestartCore();
                }}
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', width: '100%' }}
              >
                <RotateCw size={14} /> Restart Core
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDisconnect();
                }}
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', width: '100%', color: 'var(--danger)' }}
              >
                <Power size={14} /> Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Steam running indicator */}
        {isOnline && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius)',
              fontSize: '0.825rem',
            }}
          >
            <ShieldCheck
              size={14}
              style={{
                color: health.steam_running ? 'var(--warning)' : 'var(--success)',
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Steam:</span>
            <span style={{ fontWeight: 600 }}>
              {health.steam_running ? 'Active (Moves Safe)' : 'Idle'}
            </span>
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="btn-secondary"
          title="Refresh All Data"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>

        <button
          onClick={onOpenSettings}
          className="btn-secondary"
          title="Connection Settings"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
};
