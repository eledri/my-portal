import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

const MONTH_LABELS = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ']
const COLORS = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899']
const ICONS  = ['📁','💰','💸','🏠','🚗','🛒','🎬','💊','✈️','👕','📱','🏋️','🎓','💼','🍽️','⚡']

// ── hooks ──────────────────────────────────────────────────────────────────
function useFinanceData() {
  const { user } = useAuth()
  const [groupId, setGroupId]       = useState(null)
  const [group,   setGroup]         = useState(null)
  const [groups,  setGroups]        = useState([])
  const [categories, setCategories] = useState([])
  const [records,    setRecords]    = useState([])
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)

  const loadGroupData = useCallback(async (gid) => {
    const [cats, recs, mems] = await Promise.all([
      supabase.from('fin_categories').select('*').eq('group_id', gid).order('name'),
      supabase.from('fin_records').select('*, fin_categories(name,color,icon)').eq('group_id', gid).order('date', { ascending: false }),
      supabase.from('fin_group_members').select('*, users:user_id(email)').eq('group_id', gid),
    ])
    setCategories(cats.data || [])
    setRecords(recs.data || [])
    setMembers(mems.data || [])
  }, [])

  const fetchAll = useCallback(async () => {
    if (!user) return
    const { data: groupsData } = await supabase
      .from('fin_groups')
      .select('*, fin_group_members!inner(role, user_id)')
      .eq('fin_group_members.user_id', user.id)

    if (!groupsData?.length) { setLoading(false); return }

    const first = groupsData[0]
    setGroups(groupsData)
    setGroup(first)
    setGroupId(first.id)
    await loadGroupData(first.id)
    setLoading(false)
  }, [user, loadGroupData])

  useEffect(() => { fetchAll() }, [fetchAll])

  // כשמחליפים מאגר — גם groupId מתעדכן
  const switchGroup = useCallback((g) => {
    setGroup(g)
    setGroupId(g.id)
    loadGroupData(g.id)
  }, [loadGroupData])

  // כל פונקציה מקבלת gid ישירות — אין תלות ב-state
  const addCategory = useCallback(async (d) => {
    if (!groupId) return { error: new Error('אין קבוצה פעילה') }
    const { data, error } = await supabase.from('fin_categories')
      .insert({ ...d, group_id: groupId }).select().single()
    if (!error) setCategories(p => [...p, data])
    return { error }
  }, [groupId])

  const deleteCategory = async (id) => {
    const { error } = await supabase.from('fin_categories').delete().eq('id', id)
    if (!error) setCategories(p => p.filter(c => c.id !== id))
    return { error }
  }

  const addRecord = useCallback(async (d) => {
    if (!groupId) return { error: new Error('אין קבוצה פעילה') }
    const { data, error } = await supabase.from('fin_records')
      .insert({ ...d, group_id: groupId, created_by: user.id })
      .select('*, fin_categories(name,color,icon)').single()
    if (!error) setRecords(p => [data, ...p])
    return { error }
  }, [groupId, user])

  const updateRecord = async (id, d) => {
    const { data, error } = await supabase.from('fin_records')
      .update(d).eq('id', id).select('*, fin_categories(name,color,icon)').single()
    if (!error) setRecords(p => p.map(r => r.id === id ? data : r))
    return { error }
  }

  const deleteRecord = async (id) => {
    const { error } = await supabase.from('fin_records').delete().eq('id', id)
    if (!error) setRecords(p => p.filter(r => r.id !== id))
    return { error }
  }

  const inviteMember = useCallback(async (email) => {
    if (!groupId) return { error: new Error('אין קבוצה פעילה') }
    const { data, error } = await supabase.from('fin_share_invites')
      .insert({ group_id: groupId, invited_email: email, invited_by: user.id })
      .select().single()
    return { data, error }
  }, [groupId, user])

  const acceptInvite = async (token) => {
    const { data: inv, error } = await supabase.from('fin_share_invites')
      .select('*').eq('token', token).eq('status', 'pending').single()
    if (error || !inv) return { error: new Error('טוקן לא תקף') }
    const { error: me } = await supabase.from('fin_group_members')
      .insert({ group_id: inv.group_id, user_id: user.id, role: 'member' })
    if (me) return { error: me }
    await supabase.from('fin_share_invites').update({ status: 'accepted' }).eq('id', inv.id)
    await fetchAll()
    return { data: inv }
  }

  return {
    group, groups, setGroup: switchGroup,
    categories, records, members, loading,
    addCategory, deleteCategory,
    addRecord, updateRecord, deleteRecord,
    inviteMember, acceptInvite
  }
}

// ── Sidebar / Bottom Nav ──────────────────────────────────────────────────
const NAV = [
  { k:'dashboard', icon:'📊', label:'בקרה' },
  { k:'records',   icon:'📝', label:'רשומות' },
  { k:'categories',icon:'🗂️', label:'קטגוריות' },
  { k:'analytics', icon:'📈', label:'אנליזה' },
  { k:'sharing',   icon:'👥', label:'שיתוף' },
]
function Sidebar({ page, setPage, groups, group, setGroup }) {
  return (
    <aside className="app-sidebar">
      {groups.length > 1 && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <select className="input" style={{ padding: '7px 10px', fontSize: 13 }}
            value={group?.id || ''} onChange={e => setGroup(groups.find(g => g.id === e.target.value))}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column' }}>
        {NAV.map(n => (
          <button key={n.k} onClick={() => setPage(n.k)}
            className={`nav-btn${page === n.k ? ' active' : ''}`}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 9, border: 'none',
              background: page === n.k ? 'rgba(37,99,235,0.08)' : 'transparent',
              color: page === n.k ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'Heebo', fontWeight: page === n.k ? 700 : 500,
              fontSize: 14, cursor: 'pointer', textAlign: 'right',
              borderRight: page === n.k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: 2, transition: 'all 0.16s', flexShrink: 0,
            }}>
            <span className="nav-icon" style={{ fontSize: 18 }}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ records }) {
  const now = new Date()
  const start = startOfMonth(now), end = endOfMonth(now)
  const month = records.filter(r => isWithinInterval(new Date(r.date), { start, end }))
  const income  = month.filter(r => r.type === 'income').reduce((s,r) => s + +r.amount, 0)
  const expense = month.filter(r => r.type === 'expense').reduce((s,r) => s + +r.amount, 0)
  const balance = income - expense

  const bycat = useMemo(() => {
    const m = {}
    month.filter(r => r.type === 'expense').forEach(r => {
      const k = r.category_id || 'x'
      if (!m[k]) m[k] = { name: r.fin_categories?.name || '—', color: r.fin_categories?.color || '#666', icon: r.fin_categories?.icon || '📁', total: 0 }
      m[k].total += +r.amount
    })
    return Object.values(m).sort((a,b) => b.total - a.total).slice(0,5)
  }, [month])

  const Stat = ({ label, val, color, icon }) => (
    <div className="card fade-up" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform:'uppercase', letterSpacing:0.4, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 'clamp(18px,4vw,24px)', fontWeight: 900, color }}> ₪{Math.abs(val).toLocaleString()}</div>
        </div>
        <div style={{ fontSize: 20, width: 38, height: 38, borderRadius: 10, background: `${color}18`, display:'grid', placeItems:'center', flexShrink:0 }}>{icon}</div>
      </div>
    </div>
  )

  return (
    <div className="page-content">
      <h2 style={{ fontWeight: 900, fontSize: 22, marginBottom: 4 }}>לוח בקרה</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>{format(now, 'MMMM yyyy')}</p>
      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <Stat label="הכנסות" val={income} color="var(--green)" icon="💰" />
        <Stat label="הוצאות" val={expense} color="var(--red)" icon="💸" />
        <Stat label="מאזן" val={balance} color={balance >= 0 ? 'var(--green)' : 'var(--red)'} icon="⚖️" />
      </div>
      <div className="two-col">
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>הוצאות לפי קטגוריה</h3>
          {bycat.length === 0 ? <p style={{ color:'var(--text-muted)', fontSize:14 }}>אין הוצאות</p> :
            bycat.map((c,i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:4 }}>
                  <span>{c.icon} {c.name}</span>
                  <span style={{ fontWeight:700 }}>₪{c.total.toLocaleString()}</span>
                </div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3 }}>
                  <div style={{ height:'100%', width:`${expense > 0 ? (c.total/expense)*100 : 0}%`, background:c.color, borderRadius:3 }} />
                </div>
              </div>
            ))
          }
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>אחרונות</h3>
          {records.slice(0,7).map(r => (
            <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:13 }}>{r.fin_categories?.icon || '📁'} {r.title}</div>
              <span style={{ fontWeight:800, fontSize:14, color: r.type==='income' ? 'var(--green)' : 'var(--red)' }}>
                {r.type==='income' ? '+' : '-'}₪{(+r.amount).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Record Modal ──────────────────────────────────────────────────────────────
function RecordModal({ categories, onSave, onClose, initial }) {
  const [type, setType]   = useState(initial?.type || 'expense')
  const [title, setTitle] = useState(initial?.title || '')
  const [amount, setAmount] = useState(initial?.amount || '')
  const [catId, setCatId] = useState(initial?.category_id || '')
  const [date, setDate]   = useState(initial?.date || new Date().toISOString().slice(0,10))
  const [notes, setNotes] = useState(initial?.notes || '')
  const [recurring, setRecurring] = useState(initial?.is_recurring || false)
  const [instTotal, setInstTotal] = useState(initial?.installments_total || 1)
  const [instPaid, setInstPaid]   = useState(initial?.installments_paid || 1)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const save = async () => {
    if (!title.trim() || !amount) return setErr('יש למלא כותרת וסכום')
    setSaving(true)
    const { error } = await onSave({ type, title: title.trim(), amount: +amount, category_id: catId||null, date, notes, is_recurring: recurring, installments_total: recurring ? +instTotal : 1, installments_paid: recurring ? +instPaid : 1 })
    setSaving(false)
    if (error) setErr(error.message); else onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box fade-up" style={{ maxWidth:460 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <h3 style={{ fontWeight:800, fontSize:18 }}>{initial ? 'עריכה' : 'רשומה חדשה'}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:20 }}>✕</button>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:18 }}>
          {[['expense','💸 הוצאה','var(--red)'],['income','💰 הכנסה','var(--green)']].map(([t,l,c]) => (
            <button key={t} onClick={() => setType(t)}
              style={{ flex:1, padding:'9px', borderRadius:10, border:`2px solid ${type===t ? c : 'var(--border)'}`,
                background: type===t ? `${c.replace('var(','').replace(')','')==='' ? c : c}18` : 'transparent',
                color: type===t ? c : 'var(--text-muted)', fontFamily:'Heebo', fontWeight:700, cursor:'pointer', fontSize:14 }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><label className="label">כותרת</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="תיאור" /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div><label className="label">סכום ₪</label><input className="input" type="number" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
            <div><label className="label">תאריך</label><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
          </div>
          <div>
            <label className="label">קטגוריה</label>
            <select className="input" value={catId} onChange={e=>setCatId(e.target.value)}>
              <option value="">ללא קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div><label className="label">הערות</label><textarea className="input" value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{ resize:'vertical' }} /></div>
          <div style={{ background:'var(--surface2)', borderRadius:10, padding:14, border: recurring ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom: recurring ? 12 : 0 }}>
              <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{ accentColor:'var(--accent)', width:16, height:16 }} />
              <span style={{ fontWeight:600, fontSize:14 }}>תשלומים / חיוב חוזר</span>
            </label>
            {recurring && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="label">סה"כ תשלומים</label><input className="input" type="number" min="1" value={instTotal} onChange={e=>setInstTotal(e.target.value)} /></div>
                <div><label className="label">תשלום מספר</label><input className="input" type="number" min="1" max={instTotal} value={instPaid} onChange={e=>setInstPaid(e.target.value)} /></div>
              </div>
            )}
          </div>
        </div>
        {err && <div style={{ color:'var(--red)', fontSize:13, marginTop:12 }}>{err}</div>}
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:2 }}>{saving ? '...' : initial ? 'עדכון' : 'שמירה'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Records Page ──────────────────────────────────────────────────────────────
function RecordsPage({ records, categories, addRecord, updateRecord, deleteRecord }) {
  const [modal, setModal]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [ft, setFt]         = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let l = [...records]
    if (ft !== 'all') l = l.filter(r => r.type === ft)
    if (search) l = l.filter(r => r.title.toLowerCase().includes(search.toLowerCase()))
    return l
  }, [records, ft, search])

  return (
    <div className="page-content">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <h2 style={{ fontWeight:900, fontSize:22 }}>רשומות</h2>
        <button className="btn btn-primary" style={{ padding:'9px 14px', fontSize:13 }}
          onClick={() => { setEditing(null); setModal(true) }}>+ חדשה</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input className="input" style={{ flex:'1 1 140px', padding:'8px 12px', fontSize:14 }}
          placeholder="חיפוש..." value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:5 }}>
          {[['all','הכל'],['income','💰'],['expense','💸']].map(([v,l]) => (
            <button key={v} onClick={() => setFt(v)} style={{
              padding:'8px 12px', borderRadius:8, border:`1px solid ${ft===v ? 'var(--accent)' : 'var(--border)'}`,
              background: ft===v ? 'rgba(37,99,235,0.08)' : 'transparent',
              color: ft===v ? 'var(--accent)' : 'var(--text-muted)',
              cursor:'pointer', fontFamily:'Heebo', fontWeight:600, fontSize:13 }}>{l}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:'center', color:'var(--text-muted)' }}>📭 אין רשומות</div>
      ) : (<>
        {/* Desktop table */}
        <div className="card table-wrap" style={{ overflow:'hidden', padding:0 }}>
          <table className="data-table">
            <thead>
              <tr>
                {['תאריך','כותרת','קטגוריה','תשלומים','סכום',''].map((h,i) => (
                  <th key={i} style={{ textAlign: i===4?'left':'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{format(new Date(r.date),'dd/MM/yy')}</td>
                  <td style={{ fontWeight:600 }}>{r.title}</td>
                  <td>{r.fin_categories ? <span className="badge" style={{ background:`${r.fin_categories.color}18`, color:r.fin_categories.color, border:`1px solid ${r.fin_categories.color}28` }}>{r.fin_categories.icon} {r.fin_categories.name}</span> : <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{r.is_recurring ? `${r.installments_paid}/${r.installments_total}` : '—'}</td>
                  <td style={{ fontWeight:800, textAlign:'left', color: r.type==='income' ? 'var(--green)' : 'var(--red)' }}>
                    {r.type==='income' ? '+' : '-'}₪{(+r.amount).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:3 }}>
                      <button onClick={() => { setEditing(r); setModal(true) }} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4 }}>✏️</button>
                      <button onClick={() => confirm('למחוק?') && deleteRecord(r.id)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,padding:4 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="record-cards">
          {filtered.map(r => (
            <div key={r.id} className="card" style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:3 }}>{r.title}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span>{format(new Date(r.date),'dd/MM/yy')}</span>
                    {r.fin_categories && <span>{r.fin_categories.icon} {r.fin_categories.name}</span>}
                    {r.is_recurring && <span>תשלום {r.installments_paid}/{r.installments_total}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontWeight:900, fontSize:16, color: r.type==='income' ? 'var(--green)' : 'var(--red)' }}>
                    {r.type==='income' ? '+' : '-'}₪{(+r.amount).toLocaleString()}
                  </span>
                  <button onClick={() => { setEditing(r); setModal(true) }} style={{ background:'none',border:'none',cursor:'pointer',fontSize:16,padding:4 }}>✏️</button>
                  <button onClick={() => confirm('למחוק?') && deleteRecord(r.id)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:16,padding:4 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>)}

      {modal && <RecordModal categories={categories} initial={editing}
        onSave={d => editing ? updateRecord(editing.id, d) : addRecord(d)}
        onClose={() => { setModal(false); setEditing(null) }} />}
    </div>
  )
}

// ── Categories Page ──────────────────────────────────────────────────────────
function CategoriesPage({ categories, records, addCategory, deleteCategory }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [icon, setIcon]   = useState('📁')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    await addCategory({ name: name.trim(), color, icon })
    setSaving(false); setName('')
  }

  const stats = (id) => {
    const rs = records.filter(r => r.category_id === id)
    return { count: rs.length, income: rs.filter(r=>r.type==='income').reduce((s,r)=>s+(+r.amount),0), expense: rs.filter(r=>r.type==='expense').reduce((s,r)=>s+(+r.amount),0) }
  }

  return (
    <div className="page-content">
      <h2 style={{ fontWeight:900, fontSize:22, marginBottom:18 }}>קטגוריות</h2>
      <div className="card" style={{ padding:20, marginBottom:22 }}>
        <h3 style={{ fontWeight:700, marginBottom:16, fontSize:15 }}>קטגוריה חדשה</h3>
        <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 180px' }}>
            <label className="label">שם</label>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="שם הקטגוריה" onKeyDown={e=>e.key==='Enter'&&add()} />
          </div>
          <div>
            <label className="label">צבע</label>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap', maxWidth:200 }}>
              {COLORS.map(c => <button key={c} onClick={()=>setColor(c)} style={{ width:26,height:26,borderRadius:7,border:`3px solid ${color===c?'white':'transparent'}`,background:c,cursor:'pointer' }} />)}
            </div>
          </div>
          <div>
            <label className="label">אייקון</label>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxWidth:200 }}>
              {ICONS.map(ic => <button key={ic} onClick={()=>setIcon(ic)} style={{ width:30,height:30,borderRadius:6,border:`2px solid ${icon===ic?'var(--accent)':'transparent'}`,background:icon===ic?'var(--accent-glow)':'var(--surface2)',cursor:'pointer',fontSize:15 }}>{ic}</button>)}
            </div>
          </div>
          <button className="btn btn-primary" onClick={add} disabled={saving}>{saving ? '...' : '+ הוסף'}</button>
        </div>
      </div>
      <div className="cat-grid">
        {categories.map(cat => {
          const s = stats(cat.id)
          return (
            <div key={cat.id} className="card fade-up" style={{ padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:40,height:40,borderRadius:10,background:`${cat.color}20`,display:'grid',placeItems:'center',fontSize:19 }}>{cat.icon}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{cat.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.count} רשומות</div>
                  </div>
                </div>
                <button onClick={() => confirm(`למחוק "${cat.name}"?`) && deleteCategory(cat.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:16 }}>✕</button>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {s.income > 0 && <div style={{ flex:1,background:'rgba(16,185,129,0.1)',borderRadius:8,padding:'6px 10px' }}><div style={{ fontSize:10,color:'var(--green)',fontWeight:700 }}>הכנסות</div><div style={{ fontSize:14,fontWeight:700,color:'var(--green)' }}>₪{s.income.toLocaleString()}</div></div>}
                {s.expense > 0 && <div style={{ flex:1,background:'rgba(239,68,68,0.1)',borderRadius:8,padding:'6px 10px' }}><div style={{ fontSize:10,color:'var(--red)',fontWeight:700 }}>הוצאות</div><div style={{ fontSize:14,fontWeight:700,color:'var(--red)' }}>₪{s.expense.toLocaleString()}</div></div>}
                {s.count===0 && <span style={{ color:'var(--text-muted)',fontSize:13 }}>אין רשומות</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsPage({ records }) {
  const now = new Date()
  const monthly = Array.from({length:6},(_,i) => {
    const m = subMonths(now,5-i)
    const s = startOfMonth(m), e = endOfMonth(m)
    const rs = records.filter(r => isWithinInterval(new Date(r.date),{start:s,end:e}))
    return { month: MONTH_LABELS[m.getMonth()], הכנסות: rs.filter(r=>r.type==='income').reduce((s,r)=>s+(+r.amount),0), הוצאות: rs.filter(r=>r.type==='expense').reduce((s,r)=>s+(+r.amount),0) }
  })
  monthly.forEach(m => m.מאזן = m.הכנסות - m.הוצאות)

  const pie = useMemo(() => {
    const s = startOfMonth(now), e = endOfMonth(now), m = {}
    records.filter(r=>r.type==='expense'&&isWithinInterval(new Date(r.date),{start:s,end:e})).forEach(r => {
      const k = r.category_id||'x'
      if (!m[k]) m[k]={ name: r.fin_categories?.name||'—', color: r.fin_categories?.color||'#666', value:0 }
      m[k].value += +r.amount
    })
    return Object.values(m).filter(d=>d.value>0).sort((a,b)=>b.value-a.value)
  }, [records])

  const tt = { contentStyle:{ background:'#fff',border:'1px solid var(--border)',borderRadius:8,fontFamily:'Assistant',color:'var(--text)',boxShadow:'0 4px 12px rgba(0,0,0,0.1)' } }

  return (
    <div className="page-content">
      <h2 style={{ fontWeight:900, fontSize:22, marginBottom:18 }}>אנליזה</h2>
      <div className="card" style={{ padding:20, marginBottom:20 }}>
        <h3 style={{ fontWeight:700, marginBottom:16, fontSize:15 }}>הכנסות מול הוצאות — 6 חודשים</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fill:'var(--text-muted)',fontFamily:'Assistant',fontSize:13 }} />
            <YAxis tick={{ fill:'var(--text-muted)',fontSize:12 }} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`} />
            <Tooltip {...tt} formatter={(v,n) => [`₪${v.toLocaleString()}`,n]} />
            <Bar dataKey="הכנסות" fill="var(--green)" radius={[4,4,0,0]} />
            <Bar dataKey="הוצאות" fill="var(--red)" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="two-col">
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontWeight:700, marginBottom:16, fontSize:15 }}>מאזן חודשי</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill:'var(--text-muted)',fontSize:12 }} />
              <YAxis tick={{ fill:'var(--text-muted)',fontSize:11 }} tickFormatter={v=>`₪${(v/1000).toFixed(0)}k`} />
              <Tooltip {...tt} formatter={v=>[`₪${v.toLocaleString()}`,'מאזן']} />
              <Line type="monotone" dataKey="מאזן" stroke="var(--gold)" strokeWidth={2.5} dot={{ fill:'var(--gold)', r:4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontWeight:700, marginBottom:16, fontSize:15 }}>הוצאות לפי קטגוריה</h3>
          {pie.length===0 ? <p style={{ color:'var(--text-muted)',fontSize:14 }}>אין נתונים</p> : (
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <PieChart width={130} height={130}>
                <Pie data={pie} cx={65} cy={65} innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                  {pie.map((e,i) => <Cell key={i} fill={e.color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex:1 }}>
                {pie.map((d,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:8,height:8,borderRadius:'50%',background:d.color }} />{d.name}
                    </div>
                    <span style={{ fontWeight:700 }}>₪{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sharing ────────────────────────────────────────────────────────────────
function SharingPage({ group, members, inviteMember, acceptInvite }) {
  const { user } = useAuth()
  const [tab, setTab]     = useState('invite')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const isOwner = members.find(m=>m.user_id===user?.id)?.role==='owner'

  const doInvite = async () => {
    if (!email.trim()) return
    setLoading(true)
    const { data, error } = await inviteMember(email.trim())
    setLoading(false)
    setResult(error ? { error: error.message } : { token: data.token })
    setEmail('')
  }
  const doJoin = async () => {
    if (!token.trim()) return
    setLoading(true)
    const { error } = await acceptInvite(token.trim())
    setLoading(false)
    setResult(error ? { error: error.message } : { joined: true })
  }

  return (
    <div className="page-content">
      <h2 style={{ fontWeight:900, fontSize:24, marginBottom:22 }}>שיתוף מאגר</h2>
      <div className="card" style={{ padding:18, marginBottom:20 }}>
        <h3 style={{ fontWeight:700, marginBottom:14, fontSize:15 }}>חברי המאגר: {group?.name}</h3>
        {members.map(m => (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px', background:'var(--surface2)', borderRadius:10, marginBottom:8 }}>
            <div style={{ width:34,height:34,borderRadius:8,background:'var(--border)',display:'grid',placeItems:'center',fontWeight:700,fontSize:14 }}>
              {m.users?.email?.[0]?.toUpperCase()||'?'}
            </div>
            <div>
              <div style={{ fontSize:13,fontWeight:600 }}>{m.users?.email}</div>
              <div style={{ fontSize:11,color:'var(--text-muted)' }}>{m.user_id===user?.id?'אתה • ':''}{m.role==='owner'?'👑 בעלים':'👤 חבר'}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:10, padding:4, marginBottom:18 }}>
        {[['invite','📨 הזמן'],['join','🔑 הצטרף']].map(([t,l]) => (
          <button key={t} onClick={()=>{setTab(t);setResult(null)}}
            style={{ flex:1,padding:'8px',borderRadius:8,border:'none',fontFamily:'Heebo',fontWeight:700,fontSize:14,cursor:'pointer',
              background: tab===t ? 'var(--surface)' : 'transparent', color: tab===t ? 'var(--text)' : 'var(--text-muted)' }}>{l}</button>
        ))}
      </div>
      {tab==='invite' ? (
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', gap:10 }}>
            <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="אימייל משתמש" />
            <button className="btn btn-primary" onClick={doInvite} disabled={loading||!isOwner}>{loading?'...':'הזמן'}</button>
          </div>
          {!isOwner && <p style={{ fontSize:12,color:'var(--text-muted)',marginTop:8 }}>רק בעלים יכול להזמין</p>}
          {result && (
            <div style={{ marginTop:14,padding:14,borderRadius:10,background:result.error?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',border:`1px solid ${result.error?'var(--red)':'var(--green)'}` }}>
              {result.error ? <span style={{ color:'var(--red)',fontSize:14 }}>{result.error}</span> : (
                <>
                  <p style={{ color:'var(--green)',fontWeight:700,marginBottom:8 }}>✅ ההזמנה נוצרה!</p>
                  <div style={{ background:'var(--surface2)',padding:'10px 14px',borderRadius:8,fontFamily:'monospace',fontSize:12,wordBreak:'break-all',color:'var(--accent2)' }}>{result.token}</div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <input className="input" value={token} onChange={e=>setToken(e.target.value)} placeholder="הכנס טוקן הזמנה" />
            <button className="btn btn-primary" onClick={doJoin} disabled={loading}>{loading?'...':'הצטרף'}</button>
          </div>
          {result && (
            <div style={{ marginTop:14,padding:12,borderRadius:10,background:result.error?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',border:`1px solid ${result.error?'var(--red)':'var(--green)'}` }}>
              <span style={{ color:result.error?'var(--red)':'var(--green)',fontSize:14 }}>{result.error||'✅ הצטרפת בהצלחה!'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Finance App ─────────────────────────────────────────────────────────
export default function FinanceApp({ activePage, onPageChange }) {
  const page = activePage || 'dashboard'
  const setPage = onPageChange
  const data = useFinanceData()

  if (data.loading) return (
    <div style={{ display:'grid', placeItems:'center', height:'100%', color:'var(--text-muted)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:10 }}>₪</div>
        <span style={{ fontSize:15 }}>טוען נתונים...</span>
      </div>
    </div>
  )

  return (
    <div style={{ height:'100%', overflowY:'auto' }}>
      {page==='dashboard'  && <Dashboard records={data.records} />}
      {page==='records'    && <RecordsPage records={data.records} categories={data.categories} addRecord={data.addRecord} updateRecord={data.updateRecord} deleteRecord={data.deleteRecord} />}
      {page==='categories' && <CategoriesPage categories={data.categories} records={data.records} addCategory={data.addCategory} deleteCategory={data.deleteCategory} />}
      {page==='analytics'  && <AnalyticsPage records={data.records} />}
      {page==='sharing'    && <SharingPage group={data.group} members={data.members} inviteMember={data.inviteMember} acceptInvite={data.acceptInvite} />}
    </div>
  )
}
