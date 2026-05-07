import { useAuth } from '../contexts/AuthContext'
import { PORTAL_CONFIG } from '../lib/portalConfig'

export default function AppShell({ app, onBack, children }) {
  const { user } = useAuth()
  const portalName = localStorage.getItem('portal_name') || PORTAL_CONFIG.name

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* סרגל ניווט עליון */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        height: 56, gap: 0, position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
      }}>
        {/* שם פורטל */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
          <span style={{ fontSize: 16 }}>{PORTAL_CONFIG.logo}</span>
          <span style={{ fontFamily: 'Heebo', fontWeight: 700, fontSize: 14, color: 'var(--text-muted)' }}>
            {portalName}
          </span>
        </div>

        {/* מפריד */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 16px' }} />

        {/* שם הכלי הנוכחי */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, fontSize: 15,
            background: `${app.color}18`, border: `1px solid ${app.color}30`,
            display: 'grid', placeItems: 'center',
            fontFamily: 'Heebo', fontWeight: 900, color: app.color,
          }}>{app.icon}</div>
          <span style={{ fontFamily: 'Heebo', fontWeight: 800, fontSize: 15 }}>{app.title}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* אימייל משתמש */}
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 16 }}>{user?.email}</span>

        {/* מפריד */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 16px' }} />

        {/* חזרה לפורטל */}
        <button onClick={onBack} className="btn btn-ghost"
          style={{ padding: '6px 14px', fontSize: 13, gap: 6 }}>
          ← חזרה לפורטל
        </button>
      </header>

      {/* תוכן הכלי */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
