import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { APPS } from './lib/appRegistry'
import { PORTAL_CONFIG } from './lib/portalConfig'
import LoginPage from './components/LoginPage'
import PortalHome from './components/PortalHome'
import AppShell from './components/AppShell'

export default function App() {
  const { user, loading } = useAuth()
  const [activeApp, setActiveApp] = useState(null)

  // עדכון כותרת הדפדפן דינמית
  useEffect(() => {
    const portalName = localStorage.getItem('portal_name') || PORTAL_CONFIG.name
    const currentApp = APPS.find(a => a.id === activeApp)
    document.title = currentApp
      ? `${currentApp.title} — ${portalName}`
      : portalName
  }, [activeApp])

  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)', gap: 16,
    }}>
      <div style={{ fontSize: 36 }}>{PORTAL_CONFIG.logo}</div>
      <p style={{ color: 'var(--text-muted)', fontFamily: 'Heebo', fontSize: 16 }}>
        טוען...
      </p>
    </div>
  )

  if (!user) return <LoginPage />

  const currentApp = APPS.find(a => a.id === activeApp)

  if (currentApp) {
    const AppComponent = currentApp.component
    return (
      <AppShell app={currentApp} onBack={() => setActiveApp(null)}>
        <AppComponent />
      </AppShell>
    )
  }

  return <PortalHome onOpenApp={setActiveApp} />
}
