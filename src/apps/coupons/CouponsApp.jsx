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

  // תאריך תפוגה — רק כאשר יש מילת מפתח מפורשת (לא מילוי אוטומטי של כל תאריך)
  const datePatterns = [
    /(?:עד|valid until|expires?|תוקף עד|expiry|בתוקף עד)[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /(?:עד|expires?)[:\s]+(\d{4}-\d{2}-\d{2})/i,
  ]
  for (const p of datePatterns) {
    const m = text.match(p)
    if (m) {
      const raw = m[1]
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
  const toggleFavorite = (id, current) => update(id, { is_favorite: !current })

  return { coupons, loading, add, update, remove, redeem, restore, toggleFavorite }
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
    if (!name.trim()) return setErr('יש למלא שם קופון')
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
              <label className="label">קוד קופון</label>
              <input className="input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
                placeholder="SAVE20 (אופציונלי)" style={{ fontFamily:'monospace', letterSpacing:1 }} />
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

        {/* סכום בולט */}
        {coupon.amount != null && (
          <div style={{
            background:'rgba(5,150,105,0.08)', border:'1px solid rgba(5,150,105,0.2)',
            borderRadius:12, padding:'14px 24px', margin:'0 0 16px',
            display:'flex', alignItems:'baseline', justifyContent:'center', gap:4,
          }}>
            <span style={{ fontSize:16, color:'var(--green)', fontWeight:700 }}>₪</span>
            <span style={{ fontSize:40, fontWeight:900, color:'var(--green)', lineHeight:1 }}>
              {(+coupon.amount).toLocaleString()}
            </span>
          </div>
        )}

        {/* קוד גדול — אם קיים */}
        {coupon.code && (
          <div style={{
            background:'var(--surface2)', border:'2px dashed var(--border2)',
            borderRadius:12, padding:'18px 24px', margin:'0 0 16px',
          }}>
            <p style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>קוד הקופון</p>
            <div style={{ fontFamily:'monospace', fontSize:30, fontWeight:900, letterSpacing:4, color:'var(--accent)', marginBottom:14 }}>
              {coupon.code}
            </div>
            <button className="btn btn-primary" onClick={() => onCopy(coupon.code, 'expand')}
              style={{ width:'100%', padding:'12px', fontSize:16 }}>
              {copied === 'expand' ? '✅ הועתק!' : '📋 העתק קוד'}
            </button>
          </div>
        )}

        {/* אתר + תאריך */}
        <div style={{ display:'flex', justifyContent:'center', gap:16, fontSize:14, color:'var(--text-muted)', flexWrap:'wrap', marginBottom: coupon.url ? 12 : 0 }}>
          {coupon.expiry_date && (
            <span style={{ color: isExpired ? 'var(--red)' : 'var(--text-muted)' }}>
              📅 {isExpired ? 'פג תוקף' : 'עד'} {format(new Date(coupon.expiry_date), 'dd/MM/yyyy')}
            </span>
          )}
        </div>

        {coupon.url && (
          <a href={coupon.url} target="_blank" rel="noopener noreferrer"
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              background:'rgba(37,99,235,0.07)', border:'1px solid rgba(37,99,235,0.18)',
              borderRadius:10, padding:'12px 20px', marginTop:4,
              color:'var(--accent)', fontSize:15, fontWeight:700, textDecoration:'none',
            }}>
            🔗 {(() => { try { return new URL(coupon.url).hostname.replace('www.','') } catch { return 'פתח אתר' } })()}
            <span style={{ fontSize:13, opacity:0.6 }}>↗</span>
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Coupon Card
// ─────────────────────────────────────────────────────────────
function CouponCard({ coupon, brandColor, onRedeem, onRestore, onEdit, onDelete, onExpand, onFavorite }) {
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
      {/* פס עליון צבעוני לפי מותג */}
      <div style={{ position:'absolute', top:0, right:0, left:0, height:3, background: brandColor?.bar || 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            {coupon.is_favorite && (
              <span style={{ fontSize:14, color:'#f59e0b' }} title="מועדף">★</span>
            )}
            <h3 style={{ fontWeight:800, fontSize:16, margin:0 }}>{coupon.name}</h3>
            {isExpired && <span className="badge" style={{ background:'rgba(220,38,38,0.1)', color:'var(--red)', fontSize:10 }}>פג תוקף</span>}
            {coupon.redeemed && <span className="badge" style={{ background:'rgba(5,150,105,0.1)', color:'var(--green)', fontSize:10 }}>מומש</span>}
          </div>
          {coupon.description && (
            <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:3, lineHeight:1.4 }}>{coupon.description}</p>
          )}
        </div>
        <div style={{ display:'flex', gap:2, flexShrink:0, marginRight:6 }}>
          <button
            onClick={() => onFavorite?.(coupon.id, coupon.is_favorite)}
            title={coupon.is_favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:17, padding:4,
              color: coupon.is_favorite ? '#f59e0b' : 'var(--text-muted)',
              transition:'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform='scale(1.2)'}
            onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
          >{coupon.is_favorite ? '★' : '☆'}</button>
          {!coupon.redeemed && <button onClick={() => onEdit(coupon)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4,color:'var(--text-muted)' }}>✏️</button>}
          <button onClick={() => onDelete(coupon.id)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4,color:'var(--text-muted)' }}>🗑️</button>
        </div>
      </div>

      {/* קוד קופון — אופציונלי */}
      {coupon.code ? (
        <div style={{
          background:'var(--surface2)', border:'1.5px dashed var(--border2)',
          borderRadius:9, padding:'10px 14px', marginBottom:10,
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
      ) : (
        <div style={{ marginBottom:10, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={() => onExpand(coupon)}
            className="btn" style={{
              background:'var(--surface2)', color:'var(--text-muted)',
              border:'1px solid var(--border)', padding:'5px 10px', fontSize:12,
            }} title="הגדל לצפייה">🔍 פרטים</button>
        </div>
      )}

      {/* סכום בולט */}
      {(coupon.amount != null || coupon.expiry_date || coupon.url) && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            {coupon.amount != null && (
              <div style={{
                background:'rgba(5,150,105,0.08)', border:'1px solid rgba(5,150,105,0.2)',
                borderRadius:8, padding:'6px 14px',
                display:'flex', alignItems:'baseline', gap:3,
              }}>
                <span style={{ fontSize:11, color:'var(--green)', fontWeight:700 }}>₪</span>
                <span style={{ fontSize:22, fontWeight:900, color:'var(--green)', lineHeight:1 }}>
                  {(+coupon.amount).toLocaleString()}
                </span>
              </div>
            )}
            {coupon.expiry_date && (
              <span style={{ color: expiryColor, fontSize:12, fontWeight:600 }}>
                📅 {isExpired ? 'פג תוקף' : daysLeft <= 7 ? `נותרו ${daysLeft} ימים` : `עד ${format(new Date(coupon.expiry_date),'dd/MM/yy')}`}
              </span>
            )}
          </div>
          {coupon.url && (
            <a href={coupon.url} target="_blank" rel="noopener noreferrer"
              style={{
                display:'inline-flex', alignItems:'center', gap:5,
                background:'rgba(37,99,235,0.07)', border:'1px solid rgba(37,99,235,0.18)',
                borderRadius:7, padding:'5px 12px',
                color:'var(--accent)', fontSize:12, fontWeight:700, textDecoration:'none',
                whiteSpace:'nowrap',
              }}>
              🔗 {(() => { try { return new URL(coupon.url).hostname.replace('www.','') } catch { return 'פתח אתר' } })()}
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
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
// פלטת צבעים יפה לקטגוריות
const BRAND_COLORS = [
  { bg:'rgba(99,102,241,0.08)',  border:'rgba(99,102,241,0.25)',  text:'#6366f1',  bar:'linear-gradient(90deg,#6366f1,#8b5cf6)' },
  { bg:'rgba(236,72,153,0.08)', border:'rgba(236,72,153,0.25)', text:'#ec4899',  bar:'linear-gradient(90deg,#ec4899,#f43f5e)' },
  { bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.25)', text:'#d97706',  bar:'linear-gradient(90deg,#f59e0b,#d97706)' },
  { bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.25)', text:'#059669',  bar:'linear-gradient(90deg,#10b981,#059669)' },
  { bg:'rgba(59,130,246,0.08)', border:'rgba(59,130,246,0.25)', text:'#2563eb',  bar:'linear-gradient(90deg,#3b82f6,#2563eb)' },
  { bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.25)',  text:'#dc2626',  bar:'linear-gradient(90deg,#ef4444,#dc2626)' },
  { bg:'rgba(20,184,166,0.08)', border:'rgba(20,184,166,0.25)', text:'#0d9488',  bar:'linear-gradient(90deg,#14b8a6,#0d9488)' },
  { bg:'rgba(249,115,22,0.08)', border:'rgba(249,115,22,0.25)', text:'#ea580c',  bar:'linear-gradient(90deg,#f97316,#ea580c)' },
  { bg:'rgba(139,92,246,0.08)', border:'rgba(139,92,246,0.25)', text:'#7c3aed',  bar:'linear-gradient(90deg,#8b5cf6,#7c3aed)' },
  { bg:'rgba(6,182,212,0.08)',  border:'rgba(6,182,212,0.25)',  text:'#0891b2',  bar:'linear-gradient(90deg,#06b6d4,#0891b2)' },
  { bg:'rgba(132,204,22,0.08)', border:'rgba(132,204,22,0.25)', text:'#65a30d',  bar:'linear-gradient(90deg,#84cc16,#65a30d)' },
  { bg:'rgba(168,85,247,0.08)', border:'rgba(168,85,247,0.25)', text:'#9333ea',  bar:'linear-gradient(90deg,#a855f7,#9333ea)' },
]

function groupByBrand(coupons) {
  const map = {}
  let colorIdx = 0
  coupons.forEach(c => {
    // מפתח לפי מילה ראשונה (לקיבוץ), אבל מציג את השם המלא
    const key = c.name.split(/[\s\-_]/)[0].toLowerCase()
    if (!map[key]) {
      map[key] = {
        label: c.name,   // שם מלא
        color: BRAND_COLORS[colorIdx % BRAND_COLORS.length],
        items: []
      }
      colorIdx++
    } else {
      // אם כבר קיים — בחר את השם הקצר יותר כברירת מחדל (או השאר הראשון)
      // בכל מקרה — הצג את השם המלא של הרשומה הראשונה שנרשמה
    }
    map[key].items.push(c)
  })
  return Object.values(map).sort((a,b) => b.items.length - a.items.length)
}

// ─────────────────────────────────────────────────────────────
// Grouped Accordion — קטגוריות עם קפל/פתח
// ─────────────────────────────────────────────────────────────
function GroupedCoupons({ groups, onRedeem, onRestore, onEdit, onDelete, onExpand, onFavorite }) {
  // כל הקטגוריות סגורות בהתחלה — רק הראשונה פתוחה
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {}
    if (groups.length > 0) init[groups[0].label] = true
    return init
  })

  const toggle = (label) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const expandAll = () => {
    const all = {}
    groups.forEach(g => { all[g.label] = true })
    setOpenGroups(all)
  }

  const collapseAll = () => setOpenGroups({})

  const anyOpen = groups.some(g => openGroups[g.label])

  return (
    <div>
      {/* כפתורי פתח/סגור הכל */}
      <div style={{ display:'flex', gap:8, marginBottom:14, justifyContent:'flex-end' }}>
        <button onClick={anyOpen ? collapseAll : expandAll}
          style={{
            background:'none', border:'1px solid var(--border)', borderRadius:7,
            padding:'5px 12px', fontSize:12, fontWeight:600, color:'var(--text-muted)',
            cursor:'pointer', display:'flex', alignItems:'center', gap:5,
          }}>
          {anyOpen ? '⊟ סגור הכל' : '⊞ פתח הכל'}
        </button>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {groups.map(group => {
          const isOpen = !!openGroups[group.label]
          return (
            <div key={group.label} style={{
              border: `1px solid ${group.color.border}`,
              borderRadius:12, overflow:'hidden',
            }}>
              {/* כותרת קטגוריה — לחיצה לקפל/פתח */}
              <button
                onClick={() => toggle(group.label)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'12px 16px',
                  background: isOpen ? group.color.bg : 'var(--surface)',
                  border:'none', cursor:'pointer',
                  borderRight: `4px solid ${group.color.text}`,
                  transition:'background 0.18s',
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <h3 style={{ fontWeight:800, fontSize:16, color: group.color.text, margin:0 }}>
                    {group.label}
                  </h3>
                  <span style={{
                    background: group.color.bg,
                    border: `1px solid ${group.color.border}`,
                    color: group.color.text,
                    borderRadius:99, padding:'1px 9px', fontSize:11, fontWeight:800,
                  }}>
                    {group.items.length}
                  </span>
                </div>
                <span style={{
                  fontSize:18, color: group.color.text,
                  transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition:'transform 0.22s',
                  display:'block', lineHeight:1,
                }}>▾</span>
              </button>

              {/* תוכן — מוצג רק כשפתוח */}
              {isOpen && (
                <div style={{
                  padding:'12px 14px 14px',
                  background:'var(--bg)',
                  borderTop: `1px solid ${group.color.border}`,
                }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(270px,1fr))', gap:10 }}>
                    {group.items.map(c => (
                      <CouponCard key={c.id} coupon={c}
                        brandColor={group.color}
                        onRedeem={onRedeem} onRestore={onRestore}
                        onEdit={onEdit} onDelete={onDelete} onExpand={onExpand}
                        onFavorite={onFavorite} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────
export default function CouponsApp({ activePage, onPageChange }) {
  const { coupons, loading, add, update, remove, redeem, restore, toggleFavorite } = useCoupons()
  const [tab, setTab]         = useState('active')   // 'active' | 'history'
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch]   = useState('')
  const [amountFilter, setAmountFilter] = useState('')
  const [grouped, setGrouped] = useState(true)

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
    // מועדפים תמיד ראשונים
    list.sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0))
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

      {/* Grouped view — מועדפים נעוצים + accordion */}
      {grouped && filtered.length > 0 && (
        <div>
          {/* מועדפים — נעוצים תמיד בראש */}
          {filtered.some(c => c.is_favorite) && (
            <div style={{ marginBottom:18 }}>
              <div style={{
                display:'flex', alignItems:'center', gap:8, marginBottom:10,
                padding:'9px 14px',
                background:'rgba(245,158,11,0.08)',
                border:'1px solid rgba(245,158,11,0.25)',
                borderRadius:10,
                borderRight:'4px solid #f59e0b',
              }}>
                <span style={{ fontSize:16 }}>★</span>
                <h3 style={{ fontWeight:800, fontSize:15, color:'#d97706', margin:0 }}>מועדפים</h3>
                <span style={{
                  background:'rgba(245,158,11,0.15)', color:'#d97706',
                  borderRadius:99, padding:'1px 8px', fontSize:11, fontWeight:800,
                }}>
                  {filtered.filter(c => c.is_favorite).length}
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(270px,1fr))', gap:10 }}>
                {filtered.filter(c => c.is_favorite).map(c => (
                  <CouponCard key={c.id} coupon={c}
                    brandColor={{ bg:'rgba(245,158,11,0.06)', border:'rgba(245,158,11,0.2)', text:'#d97706', bar:'linear-gradient(90deg,#f59e0b,#d97706)' }}
                    onRedeem={redeem} onRestore={restore}
                    onEdit={c => { setEditing(c); setModal(true) }}
                    onDelete={id => confirm('למחוק קופון זה?') && remove(id)}
                    onExpand={setExpanded}
                    onFavorite={(id, cur) => toggleFavorite(id, cur)} />
                ))}
              </div>
            </div>
          )}
          <GroupedCoupons
            groups={groups}
            onRedeem={redeem} onRestore={restore}
            onEdit={c => { setEditing(c); setModal(true) }}
            onDelete={id => confirm('למחוק קופון זה?') && remove(id)}
            onExpand={setExpanded}
            onFavorite={(id, cur) => toggleFavorite(id, cur)}
          />
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
              onExpand={setExpanded}
              onFavorite={(id, cur) => toggleFavorite(id, cur)} />
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
