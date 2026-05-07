import { useEffect } from 'react'

/**
 * Drawer — תפריט נפתח מהצד לניווט במובייל
 *
 * Props:
 *   open       — boolean
 *   onClose    — function
 *   title      — string (שם הכלי)
 *   titleIcon  — string (אימוג'י)
 *   children   — תוכן הניווט (כפתורי NAV)
 */
export default function Drawer({ open, onClose, title, titleIcon, children }) {

  // נעל גלילה כשהדרואר פתוח
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // סגור עם ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-overlay${open ? ' open' : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`drawer-panel${open ? ' open' : ''}`}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {titleIcon && (
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                display: 'grid', placeItems: 'center', fontSize: 18,
              }}>{titleIcon}</div>
            )}
            <span style={{ fontFamily: 'Heebo', fontWeight: 800, fontSize: 16 }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, width: 34, height: 34, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: 'var(--text-muted)',
            }}
          >✕</button>
        </div>

        {/* Nav content */}
        <div style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </>
  )
}
