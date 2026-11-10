import React, { useState, useEffect } from 'react';
import { api, getApiConfig, setApiConfig } from '../api/client.ts';
import {
  CoreStatus,
  getCoreStatus,
  readLocalAuthToken,
  sleep,
  startCoreDaemon,
} from '../api/native.ts';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Home,
  Loader2,
  Monitor,
  Play,
  Server,
} from 'lucide-react';

type Tab = 'local' | 'remote';
type Stage = 'idle' | 'starting' | 'connecting' | 'connected' | 'error';

interface ConnectViewProps {
  onConnected: () => void;
  onBackToLogin?: () => void;
}

const LOCAL_BASE_URL = 'http://127.0.0.1:8765';

const stageLabel = (stage: Stage): string => {
  switch (stage) {
    case 'starting':
      return 'Starting Core Service...';
    case 'connecting':
      return 'Checking health & authenticating...';
    case 'connected':
      return 'Connected';
    default:
      return '';
  }
};

export const ConnectView: React.FC<ConnectViewProps> = ({ onConnected, onBackToLogin }) => {
  const [tab, setTab] = useState<Tab>('local');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [core, setCore] = useState<CoreStatus | null>(null);
  const [localToken, setLocalToken] = useState(() => getApiConfig().bearerToken || '');
  const [showManualToken, setShowManualToken] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteToken, setRemoteToken] = useState('');

  useEffect(() => {
    getCoreStatus()
      .then(setCore)
      .catch(() => setCore(null));
    readLocalAuthToken()
      .then((token) => {
        if (token) setLocalToken(token);
      })
      .catch(() => {});
  }, []);

  const connectLocal = async () => {
    setError(null);
    try {
      setStage('starting');
      if (!core?.running) {
        await startCoreDaemon().catch((err) => {
          console.warn('startCoreDaemon warning:', err);
        });
      }
      setStage('connecting');

      let lastErr: Error | null = null;
      for (let i = 0; i < 30; i++) {
        try {
          // Zero-config local pairing: auto-detect token on each attempt in case core was generating it
          let token = localToken.trim();
          if (!token) {
            token = (await readLocalAuthToken().catch(() => null)) ?? '';
            if (token) setLocalToken(token);
          }
          setApiConfig({ baseUrl: LOCAL_BASE_URL, bearerToken: token });
          await api.getHealth();
          setStage('connected');
          onConnected();
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error(String(err));
          await sleep(500);
        }
      }

      if (lastErr && lastErr.message.toLowerCase().includes('unauthorized')) {
        setShowManualToken(true);
        throw new Error(
          'Authentication failed (401 Unauthorized). The core requires a Bearer token. Enter the token from %APPDATA%/Zapp-Swap-Manager/auth.token below.'
        );
      }
      throw lastErr ?? new Error('Core service did not respond after starting.');
    } catch (err) {
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const connectRemote = async () => {
    setError(null);
    setStage('connecting');
    setApiConfig({
      baseUrl: remoteUrl.trim().replace(/\/+$/, ''),
      bearerToken: remoteToken.trim(),
    });
    try {
      await api.getHealth();
      setStage('connected');
      onConnected();
    } catch (err) {
      setStage('error');
      setError(
        err instanceof Error ? err.message : 'Connection failed. Check the host URL and token.'
      );
    }
  };

  const busy = stage === 'starting' || stage === 'connecting';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '460px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              background: 'var(--primary)',
              color: 'var(--on-primary, #ffffff)',
              padding: '12px',
              borderRadius: 'var(--radius)',
              display: 'inline-flex',
              marginBottom: '12px',
            }}
          >
            <Home size={28} />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Zapp Swap Manager
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Connect to your Core service
          </p>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
          }}
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={tab === 'local'}
            onClick={() => setTab('local')}
            className={tab === 'local' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1 }}
          >
            <Monitor size={15} /> Local Mode
          </button>
          <button
            role="tab"
            aria-selected={tab === 'remote'}
            onClick={() => setTab('remote')}
            className={tab === 'remote' ? 'btn-primary' : 'btn-secondary'}
            style={{ flex: 1 }}
          >
            <Globe size={15} /> Remote Mode
          </button>
        </div>

        {tab === 'local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
              }}
            >
              <Server size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Core Service:</span>
              <span style={{ fontWeight: 600 }}>
                {core === null
                  ? 'Unknown'
                  : core.running
                    ? `Active (port ${core.port})`
                    : 'Not Running'}
              </span>
            </div>
            <button
              onClick={connectLocal}
              disabled={busy}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
              {core?.running ? 'Connect to Running Core' : 'Start Core & Connect'}
            </button>

            <div style={{ marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowManualToken((s) => !s)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {showManualToken ? 'Hide token settings' : 'Advanced: Configure local token'}
              </button>
            </div>

            {showManualToken && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label
                  htmlFor="local-token-input"
                  style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                >
                  Local Bearer Token (%APPDATA%/Zapp-Swap-Manager/auth.token)
                </label>
                <input
                  id="local-token-input"
                  type="password"
                  value={localToken}
                  onChange={(e) => setLocalToken(e.target.value)}
                  placeholder="Auto-detected if empty"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'remote' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="remote-url-input"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
            >
              Core Host URL
            </label>
            <input
              id="remote-url-input"
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://tunnel.example.com or http://192.168.1.10:8765"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
            />
            <label
              htmlFor="remote-token-input"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
            >
              Bearer Token
            </label>
            <input
              id="remote-token-input"
              type="password"
              value={remoteToken}
              onChange={(e) => setRemoteToken(e.target.value)}
              placeholder="Paste the core's auth token"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
            />
            <button
              onClick={connectRemote}
              disabled={busy || !remoteUrl.trim()}
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Globe size={16} />}
              Connect
            </button>
          </div>
        )}

        {(busy || stage === 'connected') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'center',
              marginTop: '14px',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
            }}
          >
            {stage === 'connected' ? (
              <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
            ) : (
              <Loader2 size={15} className="spin" />
            )}
            <span>{stageLabel(stage)}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              fontSize: '0.85rem',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--danger)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {onBackToLogin && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={onBackToLogin}
              style={{
                fontSize: '0.8rem',
                color: 'var(--primary)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ← Back to Homeserver Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
