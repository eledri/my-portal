import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, differenceInDays, isPast } from 'date-fns'

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useInsuranceData() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [policies, setPolicies]     = useState([])
  const [loading, setLoading]       = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    const [cats, pols] = await Promise.all([
      supabase.from('ins_categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('ins_policies').select('*, ins_categories(name,color,icon), ins_documents(*)').eq('user_id', user.id).order('end_date'),
    ])
    setCategories(cats.data || [])
    setPolicies(pols.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const addCategory = async (d) => {
    const { data, error } = await supabase.from('ins_categories').insert({ ...d, user_id: user.id }).select().single()
    if (!error) setCategories(p => [...p, data])
    return { error }
  }
  const deleteCategory = async (id) => {
    const { error } = await supabase.from('ins_categories').delete().eq('id', id)
    if (!error) setCategories(p => p.filter(c => c.id !== id))
    return { error }
  }

  const addPolicy = async (d) => {
    const { data, error } = await supabase.from('ins_policies').insert({ ...d, user_id: user.id })
      .select('*, ins_categories(name,color,icon), ins_documents(*)').single()
    if (!error) setPolicies(p => [...p, data])
    return { data, error }
  }
  const updatePolicy = async (id, d) => {
    const { data, error } = await supabase.from('ins_policies').update(d).eq('id', id)
      .select('*, ins_categories(name,color,icon), ins_documents(*)').single()
    if (!error) setPolicies(p => p.map(x => x.id === id ? data : x))
    return { error }
  }
  const deletePolicy = async (id) => {
    // delete documents from storage
    const policy = policies.find(p => p.id === id)
    if (policy?.ins_documents?.length) {
      const paths = policy.ins_documents.map(d => d.storage_path)
      await supabase.storage.from('insurance-docs').remove(paths)
    }
    const { error } = await supabase.from('ins_policies').delete().eq('id', id)
    if (!error) setPolicies(p => p.filter(x => x.id !== id))
    return { error }
  }

  const uploadDocument = async (policyId, file) => {
    const ext  = file.name.split('.').pop()
    const path = `${user.id}/${policyId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('insurance-docs').upload(path, file)
    if (upErr) return { error: upErr }
    const { data, error } = await supabase.from('ins_documents').insert({
      policy_id: policyId, user_id: user.id,
      filename: file.name, storage_path: path, size: file.size, mime_type: file.type,
    }).select().single()
    if (!error) {
      setPolicies(p => p.map(x => x.id === policyId ? { ...x, ins_documents: [...(x.ins_documents || []), data] } : x))
    }
    return { data, error }
  }

  const deleteDocument = async (doc, policyId) => {
    await supabase.storage.from('insurance-docs').remove([doc.storage_path])
    const { error } = await supabase.from('ins_documents').delete().eq('id', doc.id)
    if (!error) {
      setPolicies(p => p.map(x => x.id === policyId ? { ...x, ins_documents: x.ins_documents.filter(d => d.id !== doc.id) } : x))
    }
    return { error }
  }

  const getDocumentUrl = async (storagePath) => {
    // נסה signed URL קודם
    const { data, error } = await supabase.storage
      .from('insurance-docs')
      .createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) return { url: data.signedUrl, error: null }
    return { url: null, error: error?.message || 'שגיאה ביצירת קישור' }
  }

  return { categories, policies, loading, addCategory, deleteCategory, addPolicy, updatePolicy, deletePolicy, uploadDocument, deleteDocument, getDocumentUrl }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusInfo(endDate) {
  if (!endDate) return { label: '—', color: 'var(--text-muted)', bg: 'var(--surface2)' }
  const days = differenceInDays(new Date(endDate), new Date())
  if (days < 0)  return { label: 'פג תוקף', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }
  if (days < 30) return { label: `נגמר בעוד ${days} ימים`, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
  return { label: 'פעיל', color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
}

function fmt(n) { return n ? `₪${(+n).toLocaleString()}` : '—' }

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316']
const ICONS  = ['🛡️','🚗','🏠','❤️','✈️','📋','🏥','🔑','💼','🌊']

// ── Policy Modal ──────────────────────────────────────────────────────────────
function PolicyModal({ categories, onSave, onClose, initial }) {
  const [catId, setCatId]         = useState(initial?.category_id || '')
  const [company, setCompany]     = useState(initial?.company_name || '')
  const [policyNum, setPolicyNum] = useState(initial?.policy_number || '')
  const [vehicleNum, setVehicleNum] = useState(initial?.vehicle_number || '')
  const [startDate, setStartDate] = useState(initial?.start_date || '')
  const [endDate, setEndDate]     = useState(initial?.end_date || '')
  const [costMandatory, setCostMandatory] = useState(initial?.cost_mandatory || '')
  const [costComprehensive, setCostComprehensive] = useState(initial?.cost_comprehensive || '')
  const [notes, setNotes]         = useState(initial?.notes || '')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  const total = (+costMandatory || 0) + (+costComprehensive || 0)

  const save = async () => {
    if (!company.trim()) return setErr('יש למלא שם חברה')
    setSaving(true)
    const { error } = await onSave({
      category_id: catId || null,
      company_name: company.trim(),
      policy_number: policyNum,
      vehicle_number: vehicleNum,
      start_date: startDate || null,
      end_date: endDate || null,
      cost_mandatory: costMandatory ? +costMandatory : null,
      cost_comprehensive: costComprehensive ? +costComprehensive : null,
      total_cost: total || null,
      notes,
    })
    setSaving(false)
    if (error) setErr(error.message); else onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box fade-up" style={{ maxWidth:540 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <h3 style={{ fontWeight:800, fontSize:18 }}>{initial ? 'עריכת ביטוח' : 'ביטוח חדש'}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:20 }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label className="label">קטגוריה</label>
            <select className="input" value={catId} onChange={e=>setCatId(e.target.value)}>
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="label">שם חברת הביטוח *</label>
              <input className="input" value={company} onChange={e=>setCompany(e.target.value)} placeholder="כלל, מגדל, הפניקס..." />
            </div>
            <div>
              <label className="label">מספר פוליסה</label>
              <input className="input" value={policyNum} onChange={e=>setPolicyNum(e.target.value)} placeholder="12345678" />
            </div>
          </div>
          <div>
            <label className="label">מספר רכב (אם רלוונטי)</label>
            <input className="input" value={vehicleNum} onChange={e=>setVehicleNum(e.target.value)} placeholder="12-345-67" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="label">תאריך התחלה</label>
              <input className="input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">תאריך סיום</label>
              <input className="input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Costs */}
          <div style={{ background:'var(--surface2)', borderRadius:12, padding:16, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 }}>עלויות</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label className="label">עלות חובה (₪)</label>
                <input className="input" type="number" value={costMandatory} onChange={e=>setCostMandatory(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label">עלות מקיף (₪)</label>
                <input className="input" type="number" value={costComprehensive} onChange={e=>setCostComprehensive(e.target.value)} placeholder="0" />
              </div>
            </div>
            {total > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', background:'var(--surface)', borderRadius:8, padding:'10px 14px', border:'1px solid var(--border)' }}>
                <span style={{ fontWeight:600, fontSize:14 }}>סה"כ</span>
                <span style={{ fontWeight:900, fontSize:16, color:'var(--accent2)' }}>₪{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div>
            <label className="label">הערות</label>
            <textarea className="input" value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{ resize:'vertical' }} placeholder="פרטים נוספים..." />
          </div>
        </div>
        {err && <div style={{ color:'var(--red)',fontSize:13,marginTop:12 }}>{err}</div>}
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:2 }}>{saving?'...':initial?'עדכון':'שמירה'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Documents Section ─────────────────────────────────────────────────────────
function DocumentsSection({ policy, uploadDocument, deleteDocument, getDocumentUrl }) {
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(null)

  const onFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const { error } = await uploadDocument(policy.id, file)
    setUploading(false)
    if (error) alert('שגיאה בהעלאה: ' + error.message)
    e.target.value = ''
  }

  const download = async (doc) => {
    setDownloading(doc.id)
    const { url, error } = await getDocumentUrl(doc.storage_path)
    setDownloading(null)
    if (error || !url) {
      alert('שגיאה בהורדה: ' + (error || 'קישור לא נוצר'))
      return
    }
    // פתח בטאב חדש (עובד בכל דפדפן כולל מובייל)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const docs = policy.ins_documents || []
  const fileIcon = (mime) => {
    if (mime?.includes('pdf')) return '📄'
    if (mime?.includes('image')) return '🖼️'
    if (mime?.includes('word') || mime?.includes('doc')) return '📝'
    return '📎'
  }
  const fmtSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`

  return (
    <div style={{ marginTop:16, borderTop:'1px solid var(--border)', paddingTop:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)' }}>📎 מסמכים ({docs.length})</span>
        <label style={{
          cursor:'pointer', fontSize:12, fontWeight:700, color:'var(--accent2)',
          border:'1px solid var(--border)', borderRadius:6, padding:'5px 10px',
          background:'var(--accent-glow)', display:'flex', alignItems:'center', gap:6,
          opacity: uploading ? 0.5 : 1,
        }}>
          {uploading ? 'מעלה...' : '+ העלה מסמך'}
          <input type="file" style={{ display:'none' }} onChange={onFileChange} disabled={uploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xlsx" />
        </label>
      </div>
      {docs.length === 0 ? (
        <p style={{ color:'var(--text-muted)', fontSize:13, fontStyle:'italic' }}>אין מסמכים מצורפים</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              display:'flex', alignItems:'center', gap:10,
              background:'var(--surface2)', borderRadius:8, padding:'8px 12px',
            }}>
              <span style={{ fontSize:20 }}>{fileIcon(doc.mime_type)}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.filename}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{fmtSize(doc.size)}</div>
              </div>
              <button onClick={() => download(doc)} disabled={downloading === doc.id}
                style={{ background:'var(--accent-glow)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 10px',color:'var(--accent)',cursor:'pointer',fontSize:12,fontWeight:700,opacity:downloading===doc.id?0.6:1 }}>
                {downloading === doc.id ? '⏳ טוען...' : '⬇ הורד'}
              </button>
              <button onClick={() => confirm('למחוק מסמך זה?') && deleteDocument(doc, policy.id)}
                style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:15 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Policy Card ───────────────────────────────────────────────────────────────
function PolicyCard({ policy, onEdit, onDelete, uploadDocument, deleteDocument, getDocumentUrl }) {
  const [expanded, setExpanded] = useState(false)
  const status = statusInfo(policy.end_date)

  return (
    <div className="card fade-up" style={{ padding:0, overflow:'hidden' }}>
      {/* Top color strip */}
      {policy.ins_categories && (
        <div style={{ height:3, background: policy.ins_categories.color }} />
      )}
      <div style={{ padding:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:44, height:44, borderRadius:12, fontSize:22,
              background: policy.ins_categories ? `${policy.ins_categories.color}20` : 'var(--surface2)',
              display:'grid', placeItems:'center',
            }}>
              {policy.ins_categories?.icon || '🛡️'}
            </div>
            <div>
              <h3 style={{ fontWeight:800, fontSize:17, marginBottom:2 }}>{policy.company_name}</h3>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                {policy.ins_categories?.name || 'ללא קטגוריה'}
                {policy.policy_number && ` • פוליסה: ${policy.policy_number}`}
                {policy.vehicle_number && ` • רכב: ${policy.vehicle_number}`}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span className="badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
            <button onClick={() => onEdit(policy)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:16 }}>✏️</button>
            <button onClick={() => confirm('למחוק ביטוח זה?') && onDelete(policy.id)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:16 }}>🗑️</button>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
          {[
            { label:'התחלה', value: policy.start_date ? format(new Date(policy.start_date),'dd/MM/yyyy') : '—' },
            { label:'סיום',  value: policy.end_date   ? format(new Date(policy.end_date),'dd/MM/yyyy') : '—' },
            { label:'חובה',  value: fmt(policy.cost_mandatory) },
            { label:'מקיף',  value: fmt(policy.cost_comprehensive) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginBottom:3 }}>{label}</div>
              <div style={{ fontWeight:700, fontSize:14 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Total */}
        {policy.total_cost > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            background:'var(--surface2)', borderRadius:8, padding:'10px 14px', marginBottom:14, border:'1px solid var(--border)' }}>
            <span style={{ fontWeight:600, fontSize:13 }}>סה"כ עלות</span>
            <span style={{ fontWeight:900, fontSize:18, color:'var(--accent2)' }}>₪{(+policy.total_cost).toLocaleString()}</span>
          </div>
        )}

        {/* Notes */}
        {policy.notes && (
          <p style={{ fontSize:13, color:'var(--text-muted)', background:'var(--surface2)', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>
            {policy.notes}
          </p>
        )}

        {/* Toggle documents */}
        <button onClick={() => setExpanded(e => !e)}
          style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'6px 14px',
            color:'var(--text-muted)', cursor:'pointer', fontSize:13, fontWeight:600, width:'100%' }}>
          {expanded ? '▲ סגור מסמכים' : `▼ מסמכים (${(policy.ins_documents||[]).length})`}
        </button>

        {expanded && (
          <DocumentsSection
            policy={policy}
            uploadDocument={uploadDocument}
            deleteDocument={deleteDocument}
            getDocumentUrl={getDocumentUrl}
          />
        )}
      </div>
    </div>
  )
}

// ── Categories Page ───────────────────────────────────────────────────────────
function CategoriesPage({ categories, policies, addCategory, deleteCategory }) {
  const [name, setName]   = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [icon, setIcon]   = useState('🛡️')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    await addCategory({ name: name.trim(), color, icon })
    setSaving(false); setName('')
  }

  const policyCount = (id) => policies.filter(p => p.category_id === id).length

  return (
    <div className="page-content">
      <h2 style={{ fontWeight:900, fontSize:24, marginBottom:22 }}>קטגוריות ביטוח</h2>
      <div className="card" style={{ padding:20, marginBottom:22 }}>
        <h3 style={{ fontWeight:700, marginBottom:16, fontSize:15 }}>קטגוריה חדשה</h3>
        <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 180px' }}>
            <label className="label">שם</label>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="לדוגמא: ביטוח רכב" onKeyDown={e=>e.key==='Enter'&&add()} />
          </div>
          <div>
            <label className="label">צבע</label>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap', maxWidth:200 }}>
              {COLORS.map(c => <button key={c} onClick={()=>setColor(c)} style={{ width:26,height:26,borderRadius:7,border:`3px solid ${color===c?'white':'transparent'}`,background:c,cursor:'pointer' }} />)}
            </div>
          </div>
          <div>
            <label className="label">אייקון</label>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxWidth:220 }}>
              {ICONS.map(ic => <button key={ic} onClick={()=>setIcon(ic)} style={{ width:30,height:30,borderRadius:6,border:`2px solid ${icon===ic?'var(--accent)':'transparent'}`,background:icon===ic?'var(--accent-glow)':'var(--surface2)',cursor:'pointer',fontSize:16 }}>{ic}</button>)}
            </div>
          </div>
          <button className="btn btn-primary" onClick={add} disabled={saving}>{saving?'...':'+ הוסף'}</button>
        </div>
      </div>
      <div className="cat-grid">
        {categories.map(cat => (
          <div key={cat.id} className="card fade-up" style={{ padding:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:42,height:42,borderRadius:10,background:`${cat.color}20`,display:'grid',placeItems:'center',fontSize:20 }}>{cat.icon}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{cat.name}</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)' }}>{policyCount(cat.id)} פוליסות</div>
                </div>
              </div>
              <button onClick={() => confirm(`למחוק "${cat.name}"?`) && deleteCategory(cat.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)' }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────
function SummaryBar({ policies }) {
  const total      = policies.reduce((s,p) => s + (+p.total_cost||0), 0)
  const expiring   = policies.filter(p => p.end_date && differenceInDays(new Date(p.end_date), new Date()) < 30 && differenceInDays(new Date(p.end_date), new Date()) >= 0).length
  const expired    = policies.filter(p => p.end_date && isPast(new Date(p.end_date))).length

  return (
    <div className="stat-grid stagger" style={{ marginBottom:18 }}>
      {[
        { label:'פוליסות', value: policies.length, color:'var(--accent2)', icon:'🛡️' },
        { label:'עלות כוללת', value: `₪${total.toLocaleString()}`, color:'var(--text)', icon:'💰' },
        { label:'פגות תוקף בקרוב', value: expiring, color:'#f59e0b', icon:'⚠️' },
        { label:'פגות תוקף', value: expired, color:'var(--red)', icon:'❌' },
      ].map(({ label, value, color, icon }) => (
        <div key={label} className="card fade-up" style={{ flex:1, padding:'16px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:11,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:22,fontWeight:900,color }}>{value}</div>
            </div>
            <div style={{ fontSize:22 }}>{icon}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Insurance App ────────────────────────────────────────────────────────
const NAV = [
  { k:'policies',   icon:'🛡️', label:'פוליסות' },
  { k:'categories', icon:'🗂️', label:'קטגוריות' },
]

export default function InsuranceApp({ activePage, onPageChange }) {
  const page    = activePage || 'policies'
  const setPage = onPageChange
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterCat, setFilterCat] = useState('')
  const data = useInsuranceData()

  if (data.loading) return <div style={{ display:'grid',placeItems:'center',height:'100%',color:'var(--text-muted)' }}>טוען...</div>

  const filtered = filterCat ? data.policies.filter(p => p.category_id === filterCat) : data.policies

  return (
    <div style={{ height:'100%', overflowY:'auto' }}>
        {page === 'categories' ? (
          <CategoriesPage categories={data.categories} policies={data.policies} addCategory={data.addCategory} deleteCategory={data.deleteCategory} />
        ) : (
          <div className="page-content">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <h2 style={{ fontWeight:900, fontSize:22 }}>ניהול ביטוחים</h2>
              <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true) }}>+ ביטוח חדש</button>
            </div>

            <SummaryBar policies={data.policies} />

            {/* Filter */}
            {data.categories.length > 0 && (
              <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
                <button onClick={() => setFilterCat('')}
                  style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${!filterCat ? 'var(--accent)' : 'var(--border)'}`,
                    background: !filterCat ? 'var(--accent-glow)' : 'transparent',
                    color: !filterCat ? 'var(--accent2)' : 'var(--text-muted)', cursor:'pointer', fontFamily:'Heebo', fontWeight:600, fontSize:13 }}>
                  הכל ({data.policies.length})
                </button>
                {data.categories.map(c => (
                  <button key={c.id} onClick={() => setFilterCat(c.id)}
                    style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${filterCat===c.id ? c.color : 'var(--border)'}`,
                      background: filterCat===c.id ? `${c.color}18` : 'transparent',
                      color: filterCat===c.id ? c.color : 'var(--text-muted)', cursor:'pointer', fontFamily:'Heebo', fontWeight:600, fontSize:13 }}>
                    {c.icon} {c.name} ({data.policies.filter(p=>p.category_id===c.id).length})
                  </button>
                ))}
              </div>
            )}

            {/* Category totals */}
            {data.categories.length > 0 && (
              <div style={{ display:'flex', gap:10, marginBottom:22, flexWrap:'wrap' }}>
                {data.categories.map(c => {
                  const catPolicies = data.policies.filter(p => p.category_id === c.id)
                  const sum = catPolicies.reduce((s,p) => s + (+p.total_cost||0), 0)
                  if (catPolicies.length === 0) return null
                  return (
                    <div key={c.id} style={{ background:`${c.color}12`, border:`1px solid ${c.color}30`, borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:18 }}>{c.icon}</span>
                      <div>
                        <div style={{ fontSize:12, color:c.color, fontWeight:700 }}>{c.name}</div>
                        <div style={{ fontSize:14, fontWeight:900 }}>₪{sum.toLocaleString()}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {filtered.length === 0 ? (
              <div style={{ padding:48, textAlign:'center', color:'var(--text-muted)' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🛡️</div>
                <p>אין פוליסות ביטוח עדיין</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {filtered.map(policy => (
                  <PolicyCard key={policy.id} policy={policy}
                    onEdit={p => { setEditing(p); setModal(true) }}
                    onDelete={data.deletePolicy}
                    uploadDocument={data.uploadDocument}
                    deleteDocument={data.deleteDocument}
                    getDocumentUrl={data.getDocumentUrl}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      {modal && (
        <PolicyModal
          categories={data.categories}
          initial={editing}
          onSave={d => editing ? data.updatePolicy(editing.id, d) : data.addPolicy(d)}
          onClose={() => { setModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
