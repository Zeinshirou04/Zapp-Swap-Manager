export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  online: boolean;
  last_seen?: string;
  ip_address?: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateDeviceResponse {
  device: Device;
  device_secret: string;
}

export interface ServerSession {
  serverUrl: string;
  token: string;
  user: User;
  deviceId?: string;
  deviceSecret?: string;
}

const SESSION_STORAGE_KEY = 'zapp_server_session';
const SAVED_SERVER_URL_KEY = 'zapp_saved_server_url';

export function getSavedServerUrl(): string {
  try {
    return localStorage.getItem(SAVED_SERVER_URL_KEY) || 'http://localhost:8080';
  } catch {
    return 'http://localhost:8080';
  }
}

export function saveServerUrl(url: string): void {
  try {
    localStorage.setItem(SAVED_SERVER_URL_KEY, url);
  } catch {
    // Ignore storage errors
  }
}

export function getServerSession(): ServerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ServerSession;
  } catch {
    return null;
  }
}

export function saveServerSession(session: ServerSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    saveServerUrl(session.serverUrl);
  } catch {
    // Ignore storage errors
  }
}

export function clearServerSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function normalizeUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  return trimmed;
}

export async function serverLogin(
  serverUrl: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const base = normalizeUrl(serverUrl);
  const resp = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Login failed (${resp.status})`);
  }

  return (await resp.json()) as AuthResponse;
}

export async function serverRegister(
  serverUrl: string,
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResponse> {
  const base = normalizeUrl(serverUrl);
  const resp = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Registration failed (${resp.status})`);
  }

  return (await resp.json()) as AuthResponse;
}

export async function serverListDevices(
  serverUrl: string,
  token: string
): Promise<Device[]> {
  const base = normalizeUrl(serverUrl);
  const resp = await fetch(`${base}/api/devices`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch devices (${resp.status})`);
  }

  const data = await resp.json();
  return data.devices || [];
}

export async function serverRegisterDevice(
  serverUrl: string,
  token: string,
  name: string
): Promise<CreateDeviceResponse> {
  const base = normalizeUrl(serverUrl);
  const resp = await fetch(`${base}/api/devices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || `Device registration failed (${resp.status})`);
  }

  return (await resp.json()) as CreateDeviceResponse;
}
