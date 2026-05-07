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
  const [nameInput, setNameInput]       = useState(portalName)
  const [saving, setSaving]             = useState(false)

  // טעינת שם הפורטל מה-DB
  useEffect(() => {
    if (!user) return
    supabase
      .from('portal_settings')
      .select('portal_name')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.portal_name) {
          setPortalName(data.portal_name)
          localStorage.setItem('portal_name', data.portal_name)
        }
      })
  }, [user])

  // שמירת שם הפורטל ל-DB
  const saveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed) { setEditingTitle(false); return }
    setSaving(true)
    await supabase
      .from('portal_settings')
      .upsert({ user_id: user.id, portal_name: trimmed, updated_at: new Date().toISOString() })
    setPortalName(trimmed)
    localStorage.setItem('portal_name', trimmed)
    setSaving(false)
    setEditingTitle(false)
    // עדכון כותרת הדפדפן
    document.title = trimmed
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* סרגל עליון */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: '1px solid rgba(37,99,235,0.3)',
            display: 'grid', placeItems: 'center', fontSize: 20,
          }}>{PORTAL_CONFIG.logo}</div>
          <span style={{ fontFamily: 'Heebo', fontWeight: 900, fontSize: 20 }}>
            {portalName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user?.email}</span>
          <button className="btn btn-ghost" onClick={signOut}
            style={{ padding: '7px 14px', fontSize: 13 }}>
            יציאה
          </button>
        </div>
      </header>

      {/* תוכן */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '52px 32px' }}>

        {/* כותרת ראשית */}
        <div style={{ marginBottom: 52 }}>
          <p style={{
            color: 'var(--text-muted)', fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16,
          }}>ברוכים הבאים</p>

          {editingTitle ? (
            /* מצב עריכה */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <input
                autoFocus
                className="input"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                style={{
                  fontSize: 30, fontFamily: 'Heebo', fontWeight: 900,
                  padding: '8px 16px', borderRadius: 10,
                  width: 'min(380px, 100%)', letterSpacing: '-0.5px',
                }}
              />
              <button className="btn btn-primary" onClick={saveName}
                disabled={saving}
                style={{ padding: '10px 22px', fontSize: 15 }}>
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditingTitle(false)}
                style={{ padding: '10px 16px', fontSize: 15 }}>
                ביטול
              </button>
            </div>
          ) : (
            /* מצב תצוגה */
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <h1 style={{
                fontSize: 44, fontWeight: 900, letterSpacing: '-1.5px',
                lineHeight: 1.1, margin: 0,
              }}>
                {portalName}
              </h1>
              <button
                onClick={() => { setNameInput(portalName); setEditingTitle(true) }}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 13, transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Heebo', fontWeight: 600,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent2)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                ✏️ ערוך שם
              </button>
            </div>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: 16, marginTop: 16, lineHeight: 1.6 }}>
            הכלים שלנו — בחר כלי להתחיל
          </p>
        </div>

        {/* רשת כלים */}
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: 22,
        }}>
          {APPS.map(app => (
            <AppCard key={app.id} app={app} onClick={() => onOpenApp(app.id)} />
          ))}

          {/* כרטיס "כלים נוספים בקרוב" */}
          <div className="fade-up" style={{
            background: 'transparent',
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius)',
            padding: '32px 24px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10, minHeight: 210,
          }}>
            <div style={{ fontSize: 30, opacity: 0.2 }}>＋</div>
            <p style={{
              color: 'var(--text-muted)', fontSize: 14,
              textAlign: 'center', lineHeight: 1.7,
            }}>
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
    <button
      className="fade-up"
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '28px 24px',
        cursor: 'pointer', textAlign: 'right', transition: 'all 0.22s',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = app.color
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.boxShadow = `0 14px 44px ${app.color}25`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* פס צבע בצד ימין */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 4, height: '100%',
        background: app.gradient,
        borderRadius: '0 var(--radius) var(--radius) 0',
      }} />

      {/* אייקון */}
      <div style={{
        width: 56, height: 56, borderRadius: 15, marginBottom: 22,
        background: `${app.color}18`,
        border: `1px solid ${app.color}30`,
        display: 'grid', placeItems: 'center',
        fontSize: app.id === 'finance' ? 24 : 28,
        fontFamily: 'Heebo', fontWeight: 900, color: app.color,
      }}>{app.icon}</div>

      {/* שם הכלי */}
      <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8, color: 'var(--text)' }}>
        {app.title}
      </h3>

      {/* תיאור */}
      <p style={{
        color: 'var(--text-muted)', fontSize: 14,
        lineHeight: 1.65, marginBottom: 22, flex: 1,
      }}>
        {app.description}
      </p>

      {/* תגיות */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {app.tags.map(t => (
          <span key={t} className="badge" style={{
            background: `${app.color}15`,
            color: app.color,
            border: `1px solid ${app.color}28`,
            fontSize: 11, padding: '3px 10px',
          }}>{t}</span>
        ))}
      </div>
    </button>
  )
}
