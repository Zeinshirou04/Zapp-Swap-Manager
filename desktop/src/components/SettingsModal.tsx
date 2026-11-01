import React, { useState, useEffect } from 'react';
import { getApiConfig, setApiConfig, api } from '../api/client.ts';
import { KeyRound, Server, Check, X, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8765');
  const [bearerToken, setBearerToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = getApiConfig();
      setBaseUrl(cfg.baseUrl);
      setBearerToken(cfg.bearerToken);
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiConfig({ baseUrl, bearerToken });
    onSaved();
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setApiConfig({ baseUrl, bearerToken });
      const health = await api.getHealth();
      setTestResult({
        ok: true,
        message: `Connected! Core v${health.version} is online.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Connection Settings</h2>
          <button onClick={onClose} className="btn-secondary" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="base-url-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              <Server size={14} /> Core Service Address
            </label>
            <input
              id="base-url-input"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8765"
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Core binds exclusively to loopback (127.0.0.1) per safety rules.
            </span>
          </div>

          <div>
            <label
              htmlFor="bearer-token-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              <KeyRound size={14} /> Bearer Auth Secret Token
            </label>
            <input
              id="bearer-token-input"
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder="Paste token or leave empty if unauthenticated"
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
          </div>

          {testResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: testResult.ok
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                color: testResult.ok ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${
                  testResult.ok ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                }`,
              }}
            >
              {testResult.ok ? <Check size={16} /> : <AlertCircle size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-secondary"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={handleSave} className="btn-primary">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
