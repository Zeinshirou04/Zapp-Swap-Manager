import React from 'react';
import {
  Home,
  Gamepad2,
  HardDrive,
  ListOrdered,
  Settings,
  Wand2,
} from 'lucide-react';

export type NavRoute = 'dashboard' | 'games' | 'drives' | 'queue' | 'settings';

export interface SidebarProps {
  activeRoute: NavRoute;
  onRouteChange: (route: NavRoute) => void;
  gamesCount: number;
  drivesCount: number;
  queueCount: number;
  steamRunning: boolean;
  appVersion: string;
  onOpenWizard: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onRouteChange,
  gamesCount,
  drivesCount,
  queueCount,
  steamRunning,
  appVersion,
  onOpenWizard,
}) => {
  const navItems: Array<{
    id: NavRoute;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Home size={18} />,
    },
    {
      id: 'games',
      label: 'Games Library',
      icon: <Gamepad2 size={18} />,
      badge: gamesCount,
    },
    {
      id: 'drives',
      label: 'Drives & Storage',
      icon: <HardDrive size={18} />,
      badge: drivesCount,
    },
    {
      id: 'queue',
      label: 'Transfer Queue',
      icon: <ListOrdered size={18} />,
      badge: queueCount,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={18} />,
    },
  ];

  return (
    <aside
      className="sidebar"
      style={{
        width: '220px',
        minWidth: '220px',
        backgroundColor: '#0d1527',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 12px',
        userSelect: 'none',
      }}
    >
      {/* Top Navigation Links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            fontSize: '0.675rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            padding: '4px 8px 8px 8px',
            fontWeight: 600,
          }}
        >
          Navigation
        </div>

        {navItems.map((item) => {
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onRouteChange(item.id)}
              className="btn-secondary"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius)',
                border: 'none',
                backgroundColor: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.85rem',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  style={{
                    backgroundColor: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                    color: isActive ? '#0f172a' : 'var(--text-muted)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '9999px',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Quick Setup Wizard Launcher */}
        <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '16px' }}>
          <button
            onClick={onOpenWizard}
            className="btn-secondary"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: 'var(--radius)',
              fontSize: '0.8rem',
              border: '1px dashed var(--border-color)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              color: 'var(--text-main)',
            }}
          >
            <Wand2 size={15} style={{ color: 'var(--primary)' }} />
            <span>Setup Wizard</span>
          </button>
        </div>
      </div>

      {/* Bottom Environment Status Section */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Steam Client</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: steamRunning ? 'var(--success)' : 'var(--text-muted)',
                boxShadow: steamRunning ? '0 0 6px var(--success)' : 'none',
              }}
            />
            <span style={{ color: steamRunning ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.7rem' }}>
              {steamRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
          <span>App Version</span>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>v{appVersion}</span>
        </div>
      </div>
    </aside>
  );
};
