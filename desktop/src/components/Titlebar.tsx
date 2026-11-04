import React, { useState } from 'react';
import { HealthResponse } from '../types/api.ts';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings,
  Gamepad2,
  Activity,
  ChevronDown,
  RotateCw,
  Power,
  Sparkles,
  Lock,
} from 'lucide-react';

export interface TitlebarProps {
  currentRoute: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  loading: boolean;
  onNavigateHome: () => void;
  health: HealthResponse | null;
  onOpenSettings: () => void;
  onRestartCore: () => void;
  onDisconnect: () => void;
  onCheckUpdates?: () => void;
  checkingUpdates?: boolean;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  currentRoute,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onRefresh,
  loading,
  onNavigateHome,
  health,
  onOpenSettings,
  onRestartCore,
  onDisconnect,
  onCheckUpdates,
  checkingUpdates,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnline = health !== null;

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '42px',
        minHeight: '42px',
        backgroundColor: '#0b1120',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 12px',
        userSelect: 'none',
        fontSize: '0.825rem',
      }}
    >
      {/* Left: Navigation and App Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* App Logo / Home Trigger */}
        <button
          onClick={onNavigateHome}
          title="Home / Dashboard"
          aria-label="Home Dashboard"
          className="btn-secondary"
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--primary)',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          <div
            style={{
              background: 'var(--primary)',
              color: '#0f172a',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
          >
            <Gamepad2 size={16} />
          </div>
          <span>Zapp</span>
        </button>

        {/* Browser Navigation Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            aria-label="Back"
            title="Go Back"
            className="btn-secondary"
            style={{
              padding: '4px 6px',
              border: 'none',
              background: 'transparent',
              opacity: canGoBack ? 1 : 0.35,
              cursor: canGoBack ? 'pointer' : 'default',
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            aria-label="Forward"
            title="Go Forward"
            className="btn-secondary"
            style={{
              padding: '4px 6px',
              border: 'none',
              background: 'transparent',
              opacity: canGoForward ? 1 : 0.35,
              cursor: canGoForward ? 'pointer' : 'default',
            }}
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
            title="Reload Data"
            className="btn-secondary"
            style={{
              padding: '4px 6px',
              border: 'none',
              background: 'transparent',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Browser-style Omnibox / Route Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '9999px',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            marginLeft: '6px',
          }}
        >
          <Lock size={12} style={{ color: 'var(--primary)' }} />
          <span>zapp://{currentRoute}</span>
        </div>
      </div>

      {/* Middle: Drag area spacer */}
      <div style={{ flex: 1, height: '100%', cursor: 'default' }} data-tauri-drag-region />

      {/* Right: Core Status & Settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Core Status Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.775rem',
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isOnline ? 'var(--success)' : 'var(--danger)',
                boxShadow: isOnline ? '0 0 6px var(--success)' : 'none',
              }}
            />
            <Activity size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{isOnline ? `Core v${health.version}` : 'Core Offline'}</span>
            <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="card"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                zIndex: 60,
                padding: '6px',
                minWidth: '180px',
                boxShadow: '0 10px 20px -3px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {onCheckUpdates && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onCheckUpdates();
                  }}
                  disabled={checkingUpdates}
                  className="btn-secondary"
                  style={{ justifyContent: 'flex-start', width: '100%', fontSize: '0.8rem' }}
                >
                  <Sparkles size={14} className={checkingUpdates ? 'spin' : ''} />
                  {checkingUpdates ? 'Checking Updates...' : 'Check for Updates'}
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRestartCore();
                }}
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', width: '100%', fontSize: '0.8rem' }}
              >
                <RotateCw size={14} /> Restart Core
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDisconnect();
                }}
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', width: '100%', color: 'var(--danger)', fontSize: '0.8rem' }}
              >
                <Power size={14} /> Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="btn-secondary"
          style={{
            padding: '5px 8px',
            border: 'none',
            background: 'transparent',
            borderRadius: 'var(--radius)',
          }}
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
