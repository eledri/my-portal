import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { APPS } from '../lib/appRegistry'
import { PORTAL_CONFIG } from '../lib/portalConfig'

export default function PortalHome({ onOpenApp }) {
  const { user, signOut } = useAuth()
  const [portalName, setPortalName] = useState(
    localStorage.getItem('portal_name') || PORTAL_CONFIG.name
  )
  const [editingTitle, setEditingTitle] = useState(false)
  const [nameInput, setNameInput] = useState(portalName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('portal_settings').select('portal_name').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.portal_name) {
          setPortalName(data.portal_name)
          localStorage.setItem('portal_name', data.portal_name)
          document.title = data.portal_name
        }
      })
  }, [user])

  const saveName = async () => {
    const t = nameInput.trim()
    if (!t) { setEditingTitle(false); return }
    setSaving(true)
    await supabase.from('portal_settings')
      .upsert({ user_id: user.id, portal_name: t, updated_at: new Date().toISOString() })
    setPortalName(t)
    localStorage.setItem('portal_name', t)
    document.title = t
    setSaving(false)
    setEditingTitle(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
          }}>{PORTAL_CONFIG.logo}</div>
          <span style={{ fontFamily: 'Heebo', fontWeight: 900, fontSize: 17 }}>
            {portalName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* email hidden on very small screens */}
          <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'none' }}
            className="sm-show">{user?.email}</span>
          <button className="btn btn-ghost" onClick={signOut}
            style={{ padding: '6px 12px', fontSize: 13 }}>יציאה</button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px' }}>

        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>ברוכים הבאים</p>

          {editingTitle ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input autoFocus className="input" value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingTitle(false) }}
                style={{ fontSize: 22, fontFamily: 'Heebo', fontWeight: 900, padding: '10px 14px' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={saveName} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'שומר...' : 'שמור'}
                </button>
                <button className="btn btn-ghost" onClick={() => setEditingTitle(false)} style={{ flex: 1 }}>ביטול</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'clamp(26px, 6vw, 40px)', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1 }}>
                {portalName}
              </h1>
              <button onClick={() => { setNameInput(portalName); setEditingTitle(true) }}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'Heebo', fontWeight: 600,
                }}>✏️ ערוך שם</button>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 15, marginTop: 10 }}>
            הכלים שלנו — בחר כלי להתחיל
          </p>
        </div>

        {/* App Grid */}
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {APPS.map(app => (
            <AppCard key={app.id} app={app} onClick={() => onOpenApp(app.id)} />
          ))}
          <div style={{
            border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
            padding: '28px 20px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 160,
          }}>
            <div style={{ fontSize: 24, opacity: 0.2 }}>＋</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
              כלים נוספים<br />יתווספו בקרוב
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function AppCard({ app, onClick }) {
  return (
    <button onClick={onClick} className="fade-up"
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '22px 18px',
        cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s',
        display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = app.color; e.currentTarget.style.boxShadow = `0 8px 30px ${app.color}20` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: '100%', background: app.gradient, borderRadius: '0 var(--radius) var(--radius) 0' }} />
      <div style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 16, background: `${app.color}18`, border: `1px solid ${app.color}28`, display: 'grid', placeItems: 'center', fontSize: app.id === 'finance' ? 22 : 24, fontFamily: 'Heebo', fontWeight: 900, color: app.color }}>
        {app.icon}
      </div>
      <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 6, color: 'var(--text)' }}>{app.title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{app.description}</p>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {app.tags.map(t => (
          <span key={t} className="badge" style={{ background: `${app.color}12`, color: app.color, border: `1px solid ${app.color}25`, fontSize: 11 }}>{t}</span>
        ))}
      </div>
    </button>
  )
}
