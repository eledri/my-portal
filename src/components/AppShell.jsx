import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { PORTAL_CONFIG } from '../lib/portalConfig'

/**
 * AppShell — עטיפת כל כלי
 *
 * Props:
 *   app         — אובייקט הכלי מ-appRegistry
 *   onBack      — חזרה לפורטל
 *   navItems    — מערך { key, icon, label } לניווט
 *   activePage  — ה-key הנוכחי
 *   onNavChange — callback כשבוחרים פריט ניווט
 *   children    — תוכן הדף
 *   extraHeader — אלמנט נוסף בסרגל (אופציונלי)
 */
export default function AppShell({
  app, onBack,
  navItems, activePage, onNavChange,
  children, extraHeader,
}) {
  const { user } = useAuth()
  const portalName = localStorage.getItem('portal_name') || PORTAL_CONFIG.name
  const [drawerOpen, setDrawerOpen] = useState(false)

  const closeDrawer = () => setDrawerOpen(false)

  const handleNav = (key) => {
    onNavChange?.(key)
    closeDrawer()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 12px', display: 'flex', alignItems: 'center',
        height: 52, gap: 8, flexShrink: 0, zIndex: 50,
      }}>
        {/* Burger — מובייל בלבד */}
        {navItems && (
          <button
            className="burger-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="פתח תפריט"
          >
            <span /><span /><span />
          </button>
        )}

        {/* Back */}
        <button onClick={onBack} className="btn btn-ghost"
          style={{ padding: '6px 10px', fontSize: 13, gap: 4, flexShrink: 0 }}>
          ← פורטל
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* App icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: `${app.color}18`, border: `1px solid ${app.color}28`,
            display: 'grid', placeItems: 'center',
            color: app.color, fontFamily: 'Heebo', fontWeight: 900, fontSize: 15,
          }}>{app.icon}</div>
          <span style={{
            fontFamily: 'Heebo', fontWeight: 800, fontSize: 15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{app.title}</span>
        </div>

        <div style={{ flex: 1 }} />

        {extraHeader}
      </header>

      {/* ── Body ── */}
      <div className="app-layout" style={{ flex: 1, overflow: 'hidden' }}>

        {/* Desktop sidebar */}
        {navItems && (
          <aside className="app-sidebar">
            <nav style={{ flex: 1, padding: '10px 8px' }}>
              {navItems.map(n => (
                <NavBtn key={n.key} item={n} active={activePage === n.key}
                  onClick={() => handleNav(n.key)} />
              ))}
            </nav>
          </aside>
        )}

        {/* Main content */}
        <main className="app-main">
          {children}
        </main>
      </div>

      {/* ── Drawer (mobile) ── */}
      {navItems && (
        <>
          {/* Overlay */}
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 300, display: drawerOpen ? 'block' : 'none',
            }}
            onClick={closeDrawer}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(75vw, 280px)',
            background: 'var(--surface)',
            boxShadow: '-4px 0 28px rgba(0,0,0,0.15)',
            zIndex: 301, display: 'flex', flexDirection: 'column',
            transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            overflowY: 'auto',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 14px 12px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: `${app.color}18`, border: `1px solid ${app.color}28`,
                  display: 'grid', placeItems: 'center',
                  color: app.color, fontFamily: 'Heebo', fontWeight: 900, fontSize: 18,
                }}>{app.icon}</div>
                <span style={{ fontFamily: 'Heebo', fontWeight: 800, fontSize: 16 }}>
                  {app.title}
                </span>
              </div>
              <button onClick={closeDrawer} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, width: 34, height: 34, cursor: 'pointer',
                display: 'grid', placeItems: 'center', fontSize: 18,
                color: 'var(--text-muted)',
              }}>✕</button>
            </div>

            {/* Nav items */}
            <nav style={{ flex: 1, padding: '10px 10px' }}>
              {navItems.map(n => (
                <NavBtn key={n.key} item={n} active={activePage === n.key}
                  onClick={() => handleNav(n.key)} large />
              ))}
            </nav>

            {/* User */}
            <div style={{
              padding: '14px 16px',
              borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-muted)',
            }}>
              {portalName} · {user?.email}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NavBtn({ item, active, onClick, large }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: large ? 12 : 8,
        padding: large ? '12px 14px' : '9px 10px',
        borderRadius: 10, border: 'none',
        background: active ? 'rgba(37,99,235,0.08)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'Heebo', fontWeight: active ? 700 : 500,
        fontSize: large ? 15 : 14,
        cursor: 'pointer', textAlign: 'right',
        borderRight: active ? '3px solid var(--accent)' : '3px solid transparent',
        marginBottom: 3, transition: 'all 0.16s',
      }}
    >
      <span style={{ fontSize: large ? 22 : 18 }}>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  )
}
