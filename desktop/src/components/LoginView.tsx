import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Server,
  Zap,
  Radio,
  Eye,
  EyeOff,
  ArrowRight,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
} from 'lucide-react';
import {
  getSavedServerUrl,
  serverLogin,
  serverRegister,
  saveServerSession,
  serverListDevices,
  serverRegisterDevice,
} from '../api/server.ts';

interface LoginViewProps {
  onConnected: () => void;
  onDirectLocalMode: () => void;
  onManualConnect?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onConnected,
  onDirectLocalMode,
  onManualConnect,
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getSavedServerUrl());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!serverUrl.trim()) {
      setError('Server URL is required');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      let authResp;
      if (isRegister) {
        authResp = await serverRegister(serverUrl, email, password, displayName);
      } else {
        authResp = await serverLogin(serverUrl, email, password);
      }

      // Check or register this desktop device
      let devices = await serverListDevices(serverUrl, authResp.token).catch(() => []);
      let targetDevice = devices[0];
      let deviceSecret: string | undefined;

      if (!targetDevice) {
        const created = await serverRegisterDevice(
          serverUrl,
          authResp.token,
          'Windows Gaming PC'
        ).catch(() => null);
        if (created) {
          targetDevice = created.device;
          deviceSecret = created.device_secret;
        }
      }

      if (rememberMe) {
        saveServerSession({
          serverUrl,
          token: authResp.token,
          user: authResp.user,
          deviceId: targetDevice?.id,
          deviceSecret,
        });
      }

      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--bg-main)',
      }}
    >
      {/* Laravel-Style Split Horizontal Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          minHeight: '560px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.1), 0 10px 15px -5px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}
      >
        {/* Left Panel: Brand Artwork & Identity (42% width) */}
        <div
          style={{
            flex: '1 1 360px',
            background: 'linear-gradient(145deg, #0C0B10 0%, #1C1B20 40%, #2A1475 75%, #6246EA 100%)',
            color: '#ffffff',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle Ambient Glow Circles */}
          <div
            style={{
              position: 'absolute',
              top: '-60px',
              right: '-60px',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(159, 158, 254, 0.25) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-40px',
              left: '-40px',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(98, 70, 234, 0.3) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div>
            {/* Logo & Product Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
                }}
              >
                <Zap size={24} style={{ color: '#9F9EFE' }} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                  Zapp Swap
                </h1>
                <p style={{ fontSize: '0.75rem', color: '#BFC1FE', margin: 0, fontWeight: 500 }}>
                  Gaming PC Storage Manager
                </p>
              </div>
            </div>

            <p
              style={{
                fontSize: '0.925rem',
                lineHeight: 1.6,
                color: '#D4D3D8',
                marginBottom: '32px',
              }}
            >
              Move games between your fast SSD and HDD master storage effortlessly, with instant mobile remote control.
            </p>

            {/* Feature Highlights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} style={{ color: '#9F9EFE' }} />
                <span style={{ fontSize: '0.85rem', color: '#F3F3F6' }}>
                  Real-time WebSocket server relay
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} style={{ color: '#9F9EFE' }} />
                <span style={{ fontSize: '0.85rem', color: '#F3F3F6' }}>
                  Steam & Custom non-Steam game manifests
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} style={{ color: '#9F9EFE' }} />
                <span style={{ fontSize: '0.85rem', color: '#F3F3F6' }}>
                  Zero tunnel configuration or port-forwarding
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Relay Status */}
          <div
            style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={14} style={{ color: '#4ade80' }} />
              <span>Relay Ready</span>
            </div>
            <span>v0.3.1</span>
          </div>
        </div>

        {/* Right Panel: Authentication Form (58% width) */}
        <div
          style={{
            flex: '1 1 420px',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                {isRegister ? 'Create an Account' : 'Sign In'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                style={{
                  fontSize: '0.825rem',
                  color: 'var(--primary)',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 'var(--radius)',
                }}
              >
                {isRegister ? 'Already have an account?' : 'Need an account?'}
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              {isRegister
                ? 'Register your homeserver user account to pair this PC.'
                : 'Enter your homeserver credentials to sync and control swaps remotely.'}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius)',
                color: 'var(--danger)',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Server URL Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-main)',
                }}
              >
                Homeserver Address
              </label>
              <div style={{ position: 'relative' }}>
                <Server
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://zapp.example.com or http://localhost:8080"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    fontSize: '0.875rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Display Name Input (Register Only) */}
            {isRegister && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: 'var(--text-main)',
                  }}
                >
                  Display Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Zein"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      fontSize: '0.875rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Email Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-main)',
                }}
              >
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    fontSize: '0.875rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-main)',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 38px 10px 38px',
                    fontSize: '0.875rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '4px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label
                htmlFor="rememberMe"
                style={{ fontSize: '0.825rem', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Remember this device & session
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '11px',
                fontSize: '0.9rem',
                fontWeight: 600,
                marginTop: '4px',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="spin" size={16} />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span>{isRegister ? 'Create Account' : 'Sign In to Homeserver'}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '24px 0 16px 0',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
            <span style={{ padding: '0 12px', letterSpacing: '0.05em' }}>OR LOCAL USAGE</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
          </div>

          {/* Direct Local LAN Mode Button */}
          <button
            type="button"
            onClick={onDirectLocalMode}
            className="btn-secondary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '0.85rem',
              fontWeight: 500,
              border: '1px solid var(--border-color)',
              gap: '8px',
            }}
          >
            <Monitor size={16} style={{ color: 'var(--primary)' }} />
            <span>Direct Local LAN Mode (Offline)</span>
          </button>

          {onManualConnect && (
            <button
              type="button"
              onClick={onManualConnect}
              style={{
                marginTop: '12px',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                alignSelf: 'center',
                textDecoration: 'underline',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Manual Core & Token Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
