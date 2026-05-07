import { useAuth } from '../contexts/AuthContext'
import { PORTAL_CONFIG } from '../lib/portalConfig'

export default function AppShell({ app, onBack, children }) {
  const { user } = useAuth()
  const portalName = localStorage.getItem('portal_name') || PORTAL_CONFIG.name

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 14px', display: 'flex', alignItems: 'center',
        height: 50, gap: 10, position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        <button onClick={onBack} className="btn btn-ghost"
          style={{ padding: '6px 10px', fontSize: 13, gap: 4, flexShrink: 0 }}>
          ← פורטל
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, fontSize: 14, flexShrink: 0,
            background: `${app.color}18`, border: `1px solid ${app.color}28`,
            display: 'grid', placeItems: 'center', color: app.color,
            fontFamily: 'Heebo', fontWeight: 900,
          }}>{app.icon}</div>
          <span style={{ fontFamily: 'Heebo', fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>
            {app.title}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, display: 'none' }}>
          {user?.email}
        </span>
      </header>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
