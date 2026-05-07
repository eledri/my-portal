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
      if (error) setError('שגיאה — בדוק שהסיסמה לפחות 6 תווים')
      else setSuccess('נרשמת! בדוק את האימייל לאישור.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '16px',
    }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-grid', placeItems: 'center',
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            fontSize: 30, marginBottom: 14,
            boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
          }}>{PORTAL_CONFIG.logo}</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>{portalName}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>הפורטל האישי שלנו</p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '24px 20px' }}>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: 4, background: 'var(--surface2)',
            borderRadius: 9, padding: 4, marginBottom: 22,
          }}>
            {[['login','כניסה'],['register','הרשמה']].map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
                className="btn" style={{
                  flex: 1, padding: '8px 0', border: 'none',
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--text-muted)',
                  borderRadius: 7, fontSize: 15,
                }}>{l}</button>
            ))}
          </div>

          {success ? (
            <div style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid var(--green)', borderRadius: 9, padding: 16, color: 'var(--green)', textAlign: 'center', fontSize: 14, lineHeight: 1.6 }}>
              {success}
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">כתובת אימייל</label>
                <input className="input" type="email" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="name@example.com"
                  autoComplete="email" inputMode="email" />
              </div>
              <div>
                <label className="label">סיסמה</label>
                <input className="input" type="password" required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </div>
              {error && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 14px', color: 'var(--red)', fontSize: 14 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading}
                style={{ width: '100%', padding: '13px', fontSize: 16, marginTop: 2 }}>
                {loading ? 'מתחבר...' : mode === 'login' ? 'כניסה לפורטל' : 'יצירת חשבון'}
              </button>
            </form>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>או</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button onClick={signInWithGoogle} className="btn btn-ghost"
            style={{ width: '100%', padding: '12px', fontSize: 15, gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            כניסה עם Google
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>
          גישה למשתמשים מוזמנים בלבד
        </p>
      </div>
    </div>
  )
}
