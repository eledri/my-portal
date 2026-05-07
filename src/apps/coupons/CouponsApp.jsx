import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, isPast } from 'date-fns'

// ─────────────────────────────────────────────────────────────
// Smart Paste Parser — מזהה קוד קופון, URL, סכום, תאריך
// ─────────────────────────────────────────────────────────────
function parseCouponText(text) {
  const result = { name: '', description: '', code: '', url: '', amount: '', expiryDate: '' }
  if (!text?.trim()) return result

  // URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  if (urlMatch) {
    result.url = urlMatch[0]
    try {
      const u = new URL(urlMatch[0])
      result.name = u.hostname.replace('www.', '').split('.')[0]
      // Capitalize first letter
      result.name = result.name.charAt(0).toUpperCase() + result.name.slice(1)
    } catch (_) {}
  }

  // קוד קופון — חפש אחרי מילות מפתח
  const codePatterns = [
    /(?:קוד|code|coupon|קופון|promo|discount)[:\s]+([A-Z0-9_\-]{3,20})/i,
    /\b([A-Z]{2,}[0-9]{2,}[A-Z0-9]*)\b/,   // e.g. SAVE20, SUMMER2024
    /\b([A-Z0-9]{4,15})\b(?=\s*(?:קוד|code|קופון))/i,
  ]
  for (const p of codePatterns) {
    const m = text.match(p)
    if (m) { result.code = (m[1] || m[0]).toUpperCase(); break }
  }

  // סכום — ₪, ILS, %, NIS
  const amountPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:₪|ILS|nis|שקל)/i,
    /(\d+)\s*%\s*(?:הנחה|off|discount)/i,
    /(?:הנחה|off|discount|save)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:₪|ILS)/i,
  ]
  for (const p of amountPatterns) {
    const m = text.match(p)
    if (m) { result.amount = m[1]; break }
  }

  // תאריך תפוגה
  const datePatterns = [
    /(?:עד|valid until|expires?|תוקף עד)[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ]
  for (const p of datePatterns) {
    const m = text.match(p)
    if (m) {
      // Try to parse the date
      const raw = m[1]
      // Convert DD/MM/YYYY to YYYY-MM-DD
      const parts = raw.split(/[\/\-.]/)
      if (parts.length === 3) {
        let [a, b, c] = parts
        if (c.length === 4) result.expiryDate = `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`
        else if (a.length === 4) result.expiryDate = `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`
      }
      break
    }
  }

  // תיאור — שאר הטקסט אחרי הסרת URL וקוד
  let desc = text
    .replace(urlMatch?.[0] || '', '')
    .replace(result.code, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  result.description = desc

  return result
}

// ─────────────────────────────────────────────────────────────
// Supabase Hook
// ─────────────────────────────────────────────────────────────
function useCoupons() {
  const { user } = useAuth()
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setCoupons(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const add = async (d) => {
    const { data, error } = await supabase
      .from('coupons').insert({ ...d, user_id: user.id }).select().single()
    if (!error) setCoupons(p => [data, ...p])
    return { data, error }
  }

  const update = async (id, d) => {
    const { data, error } = await supabase
      .from('coupons').update(d).eq('id', id).select().single()
    if (!error) setCoupons(p => p.map(c => c.id === id ? data : c))
    return { error }
  }

  const remove = async (id) => {
    const { error } = await supabase.from('coupons').delete().eq('id', id)
    if (!error) setCoupons(p => p.filter(c => c.id !== id))
    return { error }
  }

  const redeem = (id) => update(id, { redeemed: true, redeemed_at: new Date().toISOString() })
  const restore = (id) => update(id, { redeemed: false, redeemed_at: null })

  return { coupons, loading, add, update, remove, redeem, restore }
}

// ─────────────────────────────────────────────────────────────
// Copy to clipboard helper
// ─────────────────────────────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState(null)
  const copy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }
  return { copy, copied }
}

// ─────────────────────────────────────────────────────────────
// Coupon Form Modal
// ─────────────────────────────────────────────────────────────
function CouponModal({ onSave, onClose, initial }) {
  const [tab, setTab] = useState('single')
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [parsing, setParsing] = useState(false)

  const [name, setName]           = useState(initial?.name || '')
  const [desc, setDesc]           = useState(initial?.description || '')
  const [code, setCode]           = useState(initial?.code || '')
  const [url, setUrl]             = useState(initial?.url || '')
  const [amount, setAmount]       = useState(initial?.amount || '')
  const [expiry, setExpiry]       = useState(initial?.expiry_date || '')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  const handlePaste = () => {
    setParsing(true)
    const result = parseCouponText(pasteText)
    setParsed(result)
    if (result.name) setName(result.name)
    if (result.description) setDesc(result.description)
    if (result.code) setCode(result.code)
    if (result.url) setUrl(result.url)
    if (result.amount) setAmount(result.amount)
    if (result.expiryDate) setExpiry(result.expiryDate)
    setParsing(false)
  }

  const save = async () => {
    if (!name.trim() || !code.trim()) return setErr('יש למלא לפחות שם וקוד קופון')
    setSaving(true)
    const { error } = await onSave({
      name: name.trim(),
      description: desc.trim(),
      code: code.trim().toUpperCase(),
      url: url.trim(),
      amount: amount ? +amount : null,
      expiry_date: expiry || null,
      redeemed: false,
    })
    setSaving(false)
    if (error) setErr(error.message); else onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box fade-up" style={{ maxWidth: 500 }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ fontWeight:800, fontSize:18 }}>{initial ? 'עריכת קופון' : 'קופון חדש'}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--text-muted)',lineHeight:1 }}>✕</button>
        </div>

        {/* Tabs */}
        {!initial && (
          <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:9, padding:4, marginBottom:20 }}>
            {[['single','✏️ קופון בודד'],['smart','🤖 הדבקה חכמה']].map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)} className="btn"
                style={{ flex:1, padding:'8px 0', border:'none', borderRadius:7, fontSize:14,
                  background: tab===t ? 'var(--accent)' : 'transparent',
                  color: tab===t ? 'white' : 'var(--text-muted)' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Smart paste tab */}
        {tab === 'smart' && !initial && (
          <div style={{ marginBottom:20 }}>
            <label className="label">הדבק טקסט כאן — אימייל, הודעה, דף אינטרנט...</label>
            <textarea className="input" rows={5} value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="הדבק כאן טקסט עם פרטי הקופון ואנחנו נזהה אותו אוטומטית...&#10;&#10;לדוגמא:&#10;קבל 20% הנחה! השתמש בקוד SUMMER20 עד 31/12/2025&#10;https://example.com/shop"
              style={{ resize:'vertical', fontSize:14, lineHeight:1.6 }} />
            <button className="btn btn-primary" onClick={handlePaste}
              disabled={!pasteText.trim() || parsing}
              style={{ width:'100%', marginTop:10, padding:'11px' }}>
              {parsing ? 'מזהה...' : '🔍 זהה פרטי קופון'}
            </button>
            {parsed && (
              <div style={{ marginTop:12, padding:12, background:'rgba(5,150,105,0.06)', border:'1px solid rgba(5,150,105,0.2)', borderRadius:9 }}>
                <p style={{ fontSize:13, color:'var(--green)', fontWeight:700, marginBottom:6 }}>✅ זוהו הפרטים הבאים — ניתן לערוך למטה:</p>
                <div style={{ fontSize:12, color:'var(--text-muted)', display:'flex', flexWrap:'wrap', gap:'4px 16px' }}>
                  {parsed.name && <span>שם: <b style={{ color:'var(--text)' }}>{parsed.name}</b></span>}
                  {parsed.code && <span>קוד: <b style={{ color:'var(--text)' }}>{parsed.code}</b></span>}
                  {parsed.amount && <span>סכום: <b style={{ color:'var(--text)' }}>₪{parsed.amount}</b></span>}
                  {parsed.expiryDate && <span>תוקף: <b style={{ color:'var(--text)' }}>{parsed.expiryDate}</b></span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fields */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="label">שם הקופון *</label>
              <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Amazon, Zara..." />
            </div>
            <div>
              <label className="label">קוד קופון *</label>
              <input className="input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
                placeholder="SAVE20" style={{ fontFamily:'monospace', letterSpacing:1 }} />
            </div>
          </div>

          <div>
            <label className="label">תיאור</label>
            <input className="input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="20% הנחה על כל הסטור" />
          </div>

          <div>
            <label className="label">קישור (URL)</label>
            <input className="input" type="url" value={url} onChange={e=>setUrl(e.target.value)}
              placeholder="https://..." inputMode="url" />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="label">סכום / הנחה</label>
              <input className="input" type="number" value={amount} onChange={e=>setAmount(e.target.value)}
                placeholder="100" inputMode="numeric" />
            </div>
            <div>
              <label className="label">תאריך תפוגה</label>
              <input className="input" type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} />
            </div>
          </div>
        </div>

        {err && <div style={{ color:'var(--red)', fontSize:13, marginTop:10 }}>{err}</div>}

        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:2 }}>
            {saving ? 'שומר...' : initial ? 'עדכון' : 'הוספה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Expand Modal — הגדלת קופון לצפייה
// ─────────────────────────────────────────────────────────────
function ExpandModal({ coupon, onClose, onCopy, copied }) {
  const isExpired = coupon.expiry_date && isPast(new Date(coupon.expiry_date))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box fade-up" style={{ maxWidth:420, textAlign:'center' }}>
        <button onClick={onClose} style={{ position:'absolute', top:16, left:16, background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--text-muted)' }}>✕</button>

        <div style={{ fontSize:48, marginBottom:8 }}>🎟️</div>
        <h2 style={{ fontWeight:900, fontSize:24, marginBottom:6 }}>{coupon.name}</h2>
        {coupon.description && <p style={{ color:'var(--text-muted)', fontSize:15, marginBottom:16 }}>{coupon.description}</p>}

        {/* קוד גדול */}
        <div style={{
          background:'var(--surface2)', border:'2px dashed var(--border2)',
          borderRadius:12, padding:'20px 24px', margin:'0 0 20px',
        }}>
          <p style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>קוד הקופון</p>
          <div style={{ fontFamily:'monospace', fontSize:32, fontWeight:900, letterSpacing:4, color:'var(--accent)', marginBottom:14 }}>
            {coupon.code}
          </div>
          <button className="btn btn-primary" onClick={() => onCopy(coupon.code, 'expand')}
            style={{ width:'100%', padding:'12px', fontSize:16 }}>
            {copied === 'expand' ? '✅ הועתק!' : '📋 העתק קוד'}
          </button>
        </div>

        <div style={{ display:'flex', justifyContent:'center', gap:24, fontSize:14, color:'var(--text-muted)' }}>
          {coupon.amount && <span>💰 ₪{coupon.amount}</span>}
          {coupon.expiry_date && (
            <span style={{ color: isExpired ? 'var(--red)' : 'inherit' }}>
              📅 {isExpired ? 'פג תוקף' : 'עד'} {format(new Date(coupon.expiry_date), 'dd/MM/yyyy')}
            </span>
          )}
        </div>

        {coupon.url && (
          <a href={coupon.url} target="_blank" rel="noopener noreferrer"
            style={{ display:'block', marginTop:16, color:'var(--accent)', fontSize:14, textDecoration:'none' }}>
            🔗 פתח אתר →
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Coupon Card
// ─────────────────────────────────────────────────────────────
function CouponCard({ coupon, onRedeem, onRestore, onEdit, onDelete, onExpand }) {
  const { copy, copied } = useCopy()
  const isExpired = coupon.expiry_date && isPast(new Date(coupon.expiry_date + 'T23:59:59'))
  const daysLeft = coupon.expiry_date
    ? Math.ceil((new Date(coupon.expiry_date) - new Date()) / (1000*60*60*24))
    : null

  const expiryColor = isExpired ? 'var(--red)' : daysLeft !== null && daysLeft <= 7 ? '#d97706' : 'var(--text-muted)'

  return (
    <div className="card fade-up" style={{
      padding:'16px', opacity: coupon.redeemed ? 0.7 : 1,
      position:'relative', overflow:'hidden',
    }}>
      {/* פס עליון צבעוני */}
      <div style={{ position:'absolute', top:0, right:0, left:0, height:3, background:'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <h3 style={{ fontWeight:800, fontSize:16, margin:0 }}>{coupon.name}</h3>
            {isExpired && <span className="badge" style={{ background:'rgba(220,38,38,0.1)', color:'var(--red)', fontSize:10 }}>פג תוקף</span>}
            {coupon.redeemed && <span className="badge" style={{ background:'rgba(5,150,105,0.1)', color:'var(--green)', fontSize:10 }}>מומש</span>}
          </div>
          {coupon.description && (
            <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:3, lineHeight:1.4 }}>{coupon.description}</p>
          )}
        </div>
        <div style={{ display:'flex', gap:2, flexShrink:0, marginRight:6 }}>
          {!coupon.redeemed && <button onClick={() => onEdit(coupon)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4,color:'var(--text-muted)' }}>✏️</button>}
          <button onClick={() => onDelete(coupon.id)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4,color:'var(--text-muted)' }}>🗑️</button>
        </div>
      </div>

      {/* קוד קופון */}
      <div style={{
        background:'var(--surface2)', border:'1.5px dashed var(--border2)',
        borderRadius:9, padding:'10px 14px', marginBottom:12,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
      }}>
        <span style={{ fontFamily:'monospace', fontSize:17, fontWeight:900, letterSpacing:2, color:'var(--accent)' }}>
          {coupon.code}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => copy(coupon.code, coupon.id)}
            className="btn" style={{
              background: copied===coupon.id ? 'rgba(5,150,105,0.1)' : 'var(--surface)',
              color: copied===coupon.id ? 'var(--green)' : 'var(--text-muted)',
              border:'1px solid var(--border)', padding:'5px 10px', fontSize:12, gap:4,
            }}>
            {copied===coupon.id ? '✅ הועתק' : '📋 העתק'}
          </button>
          <button onClick={() => onExpand(coupon)}
            className="btn" style={{
              background:'var(--surface)', color:'var(--text-muted)',
              border:'1px solid var(--border)', padding:'5px 9px', fontSize:13,
            }} title="הגדל לצפייה">🔍</button>
        </div>
      </div>

      {/* Meta info */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:14, fontSize:13, flexWrap:'wrap' }}>
          {coupon.amount != null && (
            <span style={{ fontWeight:700, color:'var(--green)' }}>₪{(+coupon.amount).toLocaleString()}</span>
          )}
          {coupon.expiry_date && (
            <span style={{ color: expiryColor, fontSize:12 }}>
              📅 {isExpired ? 'פג' : daysLeft <= 7 ? `נותרו ${daysLeft} ימים` : `עד ${format(new Date(coupon.expiry_date),'dd/MM/yy')}`}
            </span>
          )}
          {coupon.url && (
            <a href={coupon.url} target="_blank" rel="noopener noreferrer"
              style={{ color:'var(--accent)', fontSize:12, textDecoration:'none' }}>🔗 אתר</a>
          )}
        </div>

        {coupon.redeemed ? (
          <button onClick={() => onRestore(coupon.id)}
            className="btn" style={{ padding:'6px 12px', fontSize:12, background:'var(--surface2)', color:'var(--text-muted)', border:'1px solid var(--border)' }}>
            ↩️ שחזר
          </button>
        ) : (
          <button onClick={() => confirm('לסמן קופון זה כמומש?') && onRedeem(coupon.id)}
            className="btn btn-primary" style={{ padding:'6px 14px', fontSize:13 }}>
            ✓ מומש
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Group coupons by name (first word = brand)
// ─────────────────────────────────────────────────────────────
function groupByBrand(coupons) {
  const map = {}
  coupons.forEach(c => {
    const brand = c.name.split(/[\s\-_]/)[0].toLowerCase()
    if (!map[brand]) map[brand] = { label: c.name.split(/[\s\-_]/)[0], items: [] }
    map[brand].items.push(c)
  })
  return Object.values(map).sort((a,b) => b.items.length - a.items.length)
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────
export default function CouponsApp({ activePage, onPageChange }) {
  const { coupons, loading, add, update, remove, redeem, restore } = useCoupons()
  const [tab, setTab]         = useState('active')   // 'active' | 'history'
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch]   = useState('')
  const [amountFilter, setAmountFilter] = useState('')
  const [grouped, setGrouped] = useState(false)

  const filtered = useMemo(() => {
    let list = coupons.filter(c => tab === 'active' ? !c.redeemed : c.redeemed)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.code?.toLowerCase().includes(s) ||
        c.description?.toLowerCase().includes(s)
      )
    }
    if (amountFilter) {
      const amt = +amountFilter
      list = list.filter(c => c.amount != null && +c.amount >= amt)
    }
    return list
  }, [coupons, tab, search, amountFilter])

  const groups = useMemo(() => groupByBrand(filtered), [filtered])

  const activeCount  = coupons.filter(c => !c.redeemed).length
  const historyCount = coupons.filter(c => c.redeemed).length
  const expiringSoon = coupons.filter(c => {
    if (!c.expiry_date || c.redeemed) return false
    const days = Math.ceil((new Date(c.expiry_date) - new Date()) / (1000*60*60*24))
    return days >= 0 && days <= 7
  }).length

  if (loading) return (
    <div style={{ display:'grid', placeItems:'center', height:'100%', color:'var(--text-muted)' }}>
      טוען...
    </div>
  )

  return (
    <div className="page-content" style={{ maxWidth:860 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div>
          <h2 style={{ fontWeight:900, fontSize:22, marginBottom:2 }}>הקופונים שלי</h2>
          {expiringSoon > 0 && (
            <p style={{ fontSize:13, color:'#d97706' }}>⚠️ {expiringSoon} קופונים פגים תוקף בשבוע הקרוב</p>
          )}
        </div>
        <button className="btn btn-primary" style={{ padding:'9px 14px', fontSize:13 }}
          onClick={() => { setEditing(null); setModal(true) }}>+ קופון</button>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        {[
          { label:'פעילים', val:activeCount, color:'var(--accent)', bg:'rgba(37,99,235,0.07)' },
          { label:'מומשו', val:historyCount, color:'var(--green)', bg:'rgba(5,150,105,0.07)' },
          { label:'פגים בקרוב', val:expiringSoon, color:'#d97706', bg:'rgba(217,119,6,0.07)' },
        ].map(s => (
          <div key={s.label} className="card fade-up" style={{ padding:'12px 18px', flex:'1 1 100px', minWidth:90 }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:9, padding:4, marginBottom:16 }}>
        {[['active',`פעילים (${activeCount})`],['history',`היסטוריה (${historyCount})`]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} className="btn"
            style={{ flex:1, padding:'9px 0', border:'none', borderRadius:7, fontSize:14,
              background: tab===t ? 'var(--accent)' : 'transparent',
              color: tab===t ? 'white' : 'var(--text-muted)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input className="input" style={{ flex:'1 1 160px', padding:'9px 12px', fontSize:14 }}
          placeholder="חיפוש חופשי..." value={search} onChange={e=>setSearch(e.target.value)} />
        <input className="input" type="number" style={{ flex:'0 1 130px', padding:'9px 12px', fontSize:14 }}
          placeholder="סכום מינ. ₪" value={amountFilter} onChange={e=>setAmountFilter(e.target.value)}
          inputMode="numeric" />
        <button onClick={() => setGrouped(g=>!g)}
          className="btn btn-ghost" style={{ padding:'9px 14px', fontSize:13,
            borderColor: grouped ? 'var(--accent)' : 'var(--border)',
            color: grouped ? 'var(--accent)' : 'var(--text-muted)' }}>
          {grouped ? '🏷️ מקובץ' : '🏷️ קבץ'}
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:14 }}>🎟️</div>
          <p style={{ color:'var(--text-muted)', fontSize:15 }}>
            {tab === 'active' ? 'אין קופונים פעילים — הוסף את הראשון!' : 'אין קופונים בהיסטוריה'}
          </p>
        </div>
      )}

      {/* Grouped view */}
      {grouped && filtered.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {groups.map(group => (
            <div key={group.label}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <h3 style={{ fontWeight:800, fontSize:16 }}>{group.label}</h3>
                <span className="badge" style={{ background:'var(--surface2)', color:'var(--text-muted)', border:'1px solid var(--border)' }}>
                  {group.items.length}
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                {group.items.map(c => (
                  <CouponCard key={c.id} coupon={c}
                    onRedeem={redeem} onRestore={restore}
                    onEdit={c => { setEditing(c); setModal(true) }}
                    onDelete={id => confirm('למחוק קופון זה?') && remove(id)}
                    onExpand={setExpanded} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat view */}
      {!grouped && filtered.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
          {filtered.map(c => (
            <CouponCard key={c.id} coupon={c}
              onRedeem={redeem} onRestore={restore}
              onEdit={c => { setEditing(c); setModal(true) }}
              onDelete={id => confirm('למחוק קופון זה?') && remove(id)}
              onExpand={setExpanded} />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <CouponModal
          initial={editing}
          onSave={d => editing ? update(editing.id, d) : add(d)}
          onClose={() => { setModal(false); setEditing(null) }}
        />
      )}
      {expanded && (
        <ExpandModal
          coupon={expanded}
          onClose={() => setExpanded(null)}
          onCopy={(text, id) => { navigator.clipboard.writeText(text) }}
          copied={null}
        />
      )}
    </div>
  )
}
