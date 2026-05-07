import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { PORTAL_CONFIG } from '../lib/portalConfig'

export default function LoginPage() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)

  const portalName = localStorage.getItem('portal_name') || PORTAL_CONFIG.name

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    if (mode === 'login') {
      const { error } = await signInWithEmail(email, password)
      if (error) setError('כתובת אימייל או סיסמה שגויים')
    } else {
      const { error } = await signUpWithEmail(email, password)
      if (error) setError('שגיאה בהרשמה — בדוק שהסיסמה לפחות 6 תווים')
      else setSuccess('נרשמת בהצלחה! בדוק את האימייל שלך לאישור.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* אור רקע */}
      <div style={{
        position: 'fixed', width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,119,6,0.05) 0%, transparent 70%)',
        bottom: 0, right: '5%', pointerEvents: 'none',
      }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 420 }}>
        {/* לוגו ושם */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-grid', placeItems: 'center',
            width: 74, height: 74, borderRadius: 20,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: '1px solid rgba(37,99,235,0.3)',
            fontSize: 34, marginBottom: 18,
            boxShadow: '0 0 40px rgba(37,99,235,0.15)',
          }}>{PORTAL_CONFIG.logo}</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 6 }}>
            {portalName}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            הפורטל האישי שלנו
          </p>
        </div>

        {/* כרטיס כניסה */}
        <div className="card" style={{ padding: 32, borderColor: 'var(--border2)' }}>

          {/* טאבים */}
          <div style={{
            display: 'flex', gap: 4, background: 'var(--surface2)',
            borderRadius: 10, padding: 4, marginBottom: 28,
          }}>
            {[['login','כניסה'], ['register','הרשמה']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
                className="btn"
                style={{
                  flex: 1, padding: '8px 0',
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--text-muted)',
                  borderRadius: 8, border: 'none', fontSize: 15,
                }}>{l}</button>
            ))}
          </div>

          {success ? (
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid var(--green)',
              borderRadius: 10, padding: 18, color: 'var(--green)',
              textAlign: 'center', fontSize: 15, lineHeight: 1.6,
            }}>{success}</div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">כתובת אימייל</label>
                <input className="input" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com" />
              </div>
              <div>
                <label className="label">סיסמה</label>
                <input className="input" type="password" required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים" />
              </div>

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, padding: '10px 14px', color: 'var(--red)', fontSize: 14,
                }}>{error}</div>
              )}

              <button type="submit" className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '12px', fontSize: 16, marginTop: 4 }}>
                {loading ? 'מתחבר...' : mode === 'login' ? 'כניסה לפורטל' : 'יצירת חשבון'}
              </button>
            </form>
          )}

          {/* מפריד */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>או התחבר עם</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* כניסה עם Google */}
          <button onClick={signInWithGoogle} className="btn btn-ghost"
            style={{ width: '100%', padding: '11px', fontSize: 15, gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            כניסה עם Google
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 20 }}>
          גישה מורשית למשתמשים מוזמנים בלבד
        </p>
      </div>
    </div>
  )
}
