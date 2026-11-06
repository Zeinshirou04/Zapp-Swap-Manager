import React, { useState, useEffect } from 'react';
import { HealthResponse } from '../types/api.ts';
import { isTauriEnvironment } from '../api/updater.ts';
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
  Minus,
  Square,
  X,
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
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  currentRoute: _currentRoute,
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
  onMinimize,
  onToggleMaximize,
  onClose,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isOnline = health !== null;

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let isMounted = true;
    let unlistenFn: (() => void) | null = null;

    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const appWin = getCurrentWindow();
        appWin
          .isMaximized()
          .then((max) => {
            if (isMounted) setIsMaximized(max);
          })
          .catch(() => {});

        appWin
          .onResized(() => {
            appWin
              .isMaximized()
              .then((max) => {
                if (isMounted) setIsMaximized(max);
              })
              .catch(() => {});
          })
          .then((unlisten) => {
            unlistenFn = unlisten;
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleMinimize = async () => {
    if (onMinimize) {
      onMinimize();
      return;
    }
    if (isTauriEnvironment()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      } catch (err) {
        console.warn('Failed to minimize window:', err);
      }
    }
  };

  const handleToggleMaximize = async () => {
    if (onToggleMaximize) {
      onToggleMaximize();
      return;
    }
    if (isTauriEnvironment()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
        const max = await getCurrentWindow().isMaximized();
        setIsMaximized(max);
      } catch (err) {
        console.warn('Failed to toggle maximize window:', err);
      }
    }
  };

  const handleClose = async () => {
    if (onClose) {
      onClose();
      return;
    }
    if (isTauriEnvironment()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch (err) {
        console.warn('Failed to close window:', err);
      }
    }
  };

  return (
    <header className="titlebar" data-tauri-drag-region>
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
              color: '#ffffff',
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
      </div>

      {/* Middle: Drag area spacer */}
      <div
        className="titlebar-drag-region"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      />

      {/* Right: Core Status, Settings, and Native Window Controls */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {/* Core Status Dropdown */}
        <div style={{ position: 'relative', marginRight: '6px' }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
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
            padding: '4px 6px',
            border: 'none',
            background: 'transparent',
            borderRadius: 'var(--radius)',
            marginRight: '4px',
          }}
        >
          <Settings size={15} />
        </button>

        {/* Frameless Window Controls (VS Code / Discord style) */}
        <div className="titlebar-window-controls" aria-label="Window Controls">
          <button
            onClick={handleMinimize}
            className="window-control-btn"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleToggleMaximize}
            className="window-control-btn"
            title={isMaximized ? 'Restore Down' : 'Maximize'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2.5" y="0.5" width="8" height="8" rx="1" />
                <path d="M0.5 3.5v7a1 1 0 0 0 1 1h7" />
              </svg>
            ) : (
              <Square size={12} strokeWidth={1.75} />
            )}
          </button>
          <button
            onClick={handleClose}
            className="window-control-btn close"
            title="Close"
            aria-label="Close"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </header>
  );
};
