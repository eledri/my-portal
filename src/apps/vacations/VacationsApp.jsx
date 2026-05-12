import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { format, eachDayOfInterval, differenceInDays, isPast, isFuture, isToday } from 'date-fns'
import { he } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────
// Unsplash — תמונת יעד אוטומטית
// ─────────────────────────────────────────────────────────────
const UNSPLASH_ACCESS_KEY = 'your_unsplash_key' // ← אופציונלי, עובד גם בלי

async function fetchDestinationPhoto(destination) {
  try {
    const query = encodeURIComponent(`${destination} travel landmark`)
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape&client_id=${UNSPLASH_ACCESS_KEY}`
    )
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.urls?.regular || null
  } catch {
    // Fallback: use a placeholder based on destination name
    const hash = destination.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const colors = ['1a1a2e','16213e','0f3460','533483','2b2d42','8d99ae']
    const color = colors[hash % colors.length]
    return `https://via.placeholder.com/800x400/${color}/ffffff?text=${encodeURIComponent(destination)}`
  }
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
function useVacations() {
  const { user } = useAuth()
  const [vacations, setVacations] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('vacations')
      .select('*, vacation_schedule(*), vacation_checklist(*)')
      .eq('user_id', user.id)
      .order('start_date', { ascending: true })
    setVacations(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const add = async (d) => {
    // קבל תמונה אוטומטית
    const photo = await fetchDestinationPhoto(d.destination)
    const { data, error } = await supabase.from('vacations')
      .insert({ ...d, user_id: user.id, photo_url: photo })
      .select('*, vacation_schedule(*), vacation_checklist(*)').single()
    if (!error) {
      // צור ימי לוז אוטומטית
      if (d.start_date && d.end_date) {
        const days = eachDayOfInterval({ start: new Date(d.start_date), end: new Date(d.end_date) })
        const scheduleRows = days.map((day, i) => ({
          vacation_id: data.id,
          user_id: user.id,
          day_date: format(day, 'yyyy-MM-dd'),
          day_number: i + 1,
          title: `יום ${i + 1}`,
          activities: '',
        }))
        const { data: sched } = await supabase.from('vacation_schedule').insert(scheduleRows).select()
        data.vacation_schedule = sched || []
      }
      // צור צ'קליסט ברירת מחדל
      const defaultChecklist = [
        'דרכון בתוקף', 'ביטוח נסיעות', 'כרטיסי טיסה', 'הזמנת מלון',
        'החלפת מטבע', 'הורדת מפות אופליין', 'חיסונים נדרשים', 'כרטיס אשראי בינלאומי',
      ]
      const checkRows = defaultChecklist.map(t => ({ vacation_id: data.id, user_id: user.id, task: t, done: false }))
      const { data: checks } = await supabase.from('vacation_checklist').insert(checkRows).select()
      data.vacation_checklist = checks || []
      setVacations(p => [...p, data])
    }
    return { data, error }
  }

  const update = async (id, d) => {
    const { data, error } = await supabase.from('vacations').update(d).eq('id', id)
      .select('*, vacation_schedule(*), vacation_checklist(*)').single()
    if (!error) setVacations(p => p.map(v => v.id === id ? data : v))
    return { error }
  }

  const remove = async (id) => {
    const { error } = await supabase.from('vacations').delete().eq('id', id)
    if (!error) setVacations(p => p.filter(v => v.id !== id))
    return { error }
  }

  const updateScheduleDay = async (dayId, updates) => {
    const { data, error } = await supabase.from('vacation_schedule').update(updates).eq('id', dayId).select().single()
    if (!error) {
      setVacations(p => p.map(v => ({
        ...v,
        vacation_schedule: v.vacation_schedule?.map(d => d.id === dayId ? data : d)
      })))
    }
    return { error }
  }

  const toggleCheckItem = async (itemId, done) => {
    const { data, error } = await supabase.from('vacation_checklist').update({ done }).eq('id', itemId).select().single()
    if (!error) {
      setVacations(p => p.map(v => ({
        ...v,
        vacation_checklist: v.vacation_checklist?.map(c => c.id === itemId ? data : c)
      })))
    }
    return { error }
  }

  const addCheckItem = async (vacationId, task) => {
    const { data, error } = await supabase.from('vacation_checklist')
      .insert({ vacation_id: vacationId, user_id: user.id, task, done: false }).select().single()
    if (!error) {
      setVacations(p => p.map(v => v.id === vacationId
        ? { ...v, vacation_checklist: [...(v.vacation_checklist || []), data] }
        : v
      ))
    }
    return { error }
  }

  const deleteCheckItem = async (itemId, vacationId) => {
    const { error } = await supabase.from('vacation_checklist').delete().eq('id', itemId)
    if (!error) {
      setVacations(p => p.map(v => v.id === vacationId
        ? { ...v, vacation_checklist: v.vacation_checklist?.filter(c => c.id !== itemId) }
        : v
      ))
    }
  }

  return { vacations, loading, add, update, remove, updateScheduleDay, toggleCheckItem, addCheckItem, deleteCheckItem }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function vacationStatus(v) {
  const now = new Date()
  const start = new Date(v.start_date)
  const end   = new Date(v.end_date)
  if (isFuture(start)) {
    const days = differenceInDays(start, now)
    return { label: days === 0 ? 'מחר!' : `עוד ${days} ימים`, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' }
  }
  if (isPast(end)) return { label: 'הסתיימה', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' }
  return { label: '✈️ בחופשה עכשיו!', color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
}

// ─────────────────────────────────────────────────────────────
// Vacation Form Modal
// ─────────────────────────────────────────────────────────────
function VacationModal({ onSave, onClose, initial }) {
  const [destination, setDestination] = useState(initial?.destination || '')
  const [startDate, setStartDate]     = useState(initial?.start_date || '')
  const [endDate, setEndDate]         = useState(initial?.end_date || '')
  const [notes, setNotes]             = useState(initial?.notes || '')
  // טיסה
  const [flightOut, setFlightOut]     = useState(initial?.flight_out || '')
  const [flightBack, setFlightBack]   = useState(initial?.flight_back || '')
  const [airline, setAirline]         = useState(initial?.airline || '')
  const [flightNotes, setFlightNotes] = useState(initial?.flight_notes || '')
  // רכב
  const [hasCar, setHasCar]           = useState(initial?.has_car || false)
  const [carCompany, setCarCompany]   = useState(initial?.car_company || '')
  const [carNotes, setCarNotes]       = useState(initial?.car_notes || '')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState('')
  const [section, setSection]         = useState('basic') // basic | flight | car

  const nights = startDate && endDate
    ? differenceInDays(new Date(endDate), new Date(startDate))
    : 0

  const save = async () => {
    if (!destination.trim() || !startDate || !endDate) return setErr('יש למלא יעד ותאריכים')
    if (new Date(endDate) <= new Date(startDate)) return setErr('תאריך סיום חייב להיות אחרי ההתחלה')
    setSaving(true)
    const { error } = await onSave({
      destination: destination.trim(), start_date: startDate, end_date: endDate, notes,
      flight_out: flightOut, flight_back: flightBack, airline, flight_notes: flightNotes,
      has_car: hasCar, car_company: carCompany, car_notes: carNotes,
    })
    setSaving(false)
    if (error) setErr(error.message); else onClose()
  }

  const tabs = [['basic','✈️ בסיסי'],['flight','🛫 טיסה'],['car','🚗 רכב']]

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box fade-up" style={{ maxWidth:520 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ fontWeight:800, fontSize:18 }}>{initial ? 'עריכת חופשה' : 'חופשה חדשה'}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:22,color:'var(--text-muted)' }}>✕</button>
        </div>

        {/* Section tabs */}
        <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:9, padding:4, marginBottom:20 }}>
          {tabs.map(([t,l]) => (
            <button key={t} onClick={() => setSection(t)} className="btn"
              style={{ flex:1, padding:'8px 0', border:'none', borderRadius:7, fontSize:13,
                background: section===t ? 'var(--accent)' : 'transparent',
                color: section===t ? 'white' : 'var(--text-muted)' }}>{l}</button>
          ))}
        </div>

        {section === 'basic' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label className="label">יעד *</label>
              <input className="input" value={destination} onChange={e=>setDestination(e.target.value)} placeholder="פריז, ניו יורק, תאילנד..." />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="label">תאריך יציאה *</label>
                <input className="input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="label">תאריך חזרה *</label>
                <input className="input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
              </div>
            </div>
            {nights > 0 && (
              <div style={{ background:'rgba(59,130,246,0.07)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:8, padding:'8px 14px', fontSize:13, color:'var(--accent)', fontWeight:700 }}>
                🌙 {nights} לילות
              </div>
            )}
            <div>
              <label className="label">הערות כלליות</label>
              <textarea className="input" value={notes} onChange={e=>setNotes(e.target.value)} rows={3} style={{ resize:'vertical' }} placeholder="מלון, תוכניות, הערות..." />
            </div>
          </div>
        )}

        {section === 'flight' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label className="label">חברת תעופה</label>
              <input className="input" value={airline} onChange={e=>setAirline(e.target.value)} placeholder="אל על, ראיאנאייר..." />
            </div>
            <div>
              <label className="label">פרטי טיסת יציאה</label>
              <input className="input" value={flightOut} onChange={e=>setFlightOut(e.target.value)} placeholder="LY315 — 06:30 → 09:45" />
            </div>
            <div>
              <label className="label">פרטי טיסת חזרה</label>
              <input className="input" value={flightBack} onChange={e=>setFlightBack(e.target.value)} placeholder="LY316 — 11:00 → 14:30" />
            </div>
            <div>
              <label className="label">הערות טיסה</label>
              <textarea className="input" value={flightNotes} onChange={e=>setFlightNotes(e.target.value)} rows={3} style={{ resize:'vertical' }} placeholder="מספרי מושב, מזוודות, מסוף..." />
            </div>
          </div>
        )}

        {section === 'car' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', padding:'12px 14px', background:'var(--surface2)', borderRadius:10, border: hasCar ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
              <input type="checkbox" checked={hasCar} onChange={e=>setHasCar(e.target.checked)}
                style={{ width:18, height:18, accentColor:'var(--accent)' }} />
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>שוכרים רכב</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>רכב שכור בחופשה</div>
              </div>
            </label>
            {hasCar && (
              <>
                <div>
                  <label className="label">חברת השכרה</label>
                  <input className="input" value={carCompany} onChange={e=>setCarCompany(e.target.value)} placeholder="Hertz, Avis, Budget..." />
                </div>
                <div>
                  <label className="label">פרטים נוספים</label>
                  <textarea className="input" value={carNotes} onChange={e=>setCarNotes(e.target.value)} rows={3} style={{ resize:'vertical' }} placeholder="סוג רכב, מספר הזמנה, מקום איסוף..." />
                </div>
              </>
            )}
          </div>
        )}

        {err && <div style={{ color:'var(--red)', fontSize:13, marginTop:10 }}>{err}</div>}
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex:1 }}>ביטול</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:2 }}>
            {saving ? '⏳ שומר ויוצר לוח שנה...' : initial ? 'עדכון' : 'צור חופשה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Schedule Editor — לוז יומי
// ─────────────────────────────────────────────────────────────
function ScheduleEditor({ schedule, onUpdate }) {
  const [editingDay, setEditingDay] = useState(null)
  const [titleVal, setTitleVal]     = useState('')
  const [activVal, setActivVal]     = useState('')
  const [saving, setSaving]         = useState(false)

  const startEdit = (day) => {
    setEditingDay(day.id)
    setTitleVal(day.title || '')
    setActivVal(day.activities || '')
  }

  const saveDay = async (id) => {
    setSaving(true)
    await onUpdate(id, { title: titleVal, activities: activVal })
    setSaving(false)
    setEditingDay(null)
  }

  const sorted = [...(schedule || [])].sort((a,b) => new Date(a.day_date) - new Date(b.day_date))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {sorted.map((day, i) => {
        const d = new Date(day.day_date)
        const isEditing = editingDay === day.id
        const dayIsToday = isToday(d)

        return (
          <div key={day.id} style={{
            border: dayIsToday ? '2px solid var(--accent)' : '1px solid var(--border)',
            borderRadius:10, overflow:'hidden',
            boxShadow: dayIsToday ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none',
          }}>
            {/* Day header */}
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px',
              background: dayIsToday ? 'rgba(37,99,235,0.06)' : 'var(--surface2)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{
                  width:32, height:32, borderRadius:8,
                  background: dayIsToday ? 'var(--accent)' : 'var(--border)',
                  color: dayIsToday ? 'white' : 'var(--text-muted)',
                  display:'grid', placeItems:'center',
                  fontWeight:800, fontSize:13,
                }}>{i+1}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>
                    {isEditing ? (
                      <input value={titleVal} onChange={e=>setTitleVal(e.target.value)}
                        className="input" style={{ padding:'4px 8px', fontSize:13, width:160 }} />
                    ) : day.title || `יום ${i+1}`}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {format(d, 'EEEE, d בMMMM', { locale: he })}
                    {dayIsToday && <span style={{ color:'var(--accent)', fontWeight:700, marginRight:6 }}>• היום</span>}
                  </div>
                </div>
              </div>
              {isEditing ? (
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-primary" onClick={() => saveDay(day.id)} disabled={saving}
                    style={{ padding:'5px 12px', fontSize:12 }}>{saving?'...':'שמור'}</button>
                  <button className="btn btn-ghost" onClick={() => setEditingDay(null)}
                    style={{ padding:'5px 10px', fontSize:12 }}>ביטול</button>
                </div>
              ) : (
                <button onClick={() => startEdit(day)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:15,color:'var(--text-muted)',padding:4 }}>✏️</button>
              )}
            </div>

            {/* Activities */}
            <div style={{ padding:'10px 14px', background:'var(--surface)' }}>
              {isEditing ? (
                <textarea value={activVal} onChange={e=>setActivVal(e.target.value)}
                  className="input" rows={3} style={{ fontSize:13, resize:'vertical' }}
                  placeholder="תוכנית היום, מסעדות, אטרקציות..." />
              ) : (
                <p style={{ fontSize:13, color: day.activities ? 'var(--text)' : 'var(--text-muted)', lineHeight:1.6, margin:0, whiteSpace:'pre-wrap' }}>
                  {day.activities || 'לחץ ✏️ להוספת תוכנית...'}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Checklist
// ─────────────────────────────────────────────────────────────
function Checklist({ items, vacationId, onToggle, onAdd, onDelete }) {
  const [newTask, setNewTask] = useState('')
  const [adding, setAdding]  = useState(false)

  const handleAdd = async () => {
    if (!newTask.trim()) return
    setAdding(true)
    await onAdd(vacationId, newTask.trim())
    setNewTask('')
    setAdding(false)
  }

  const done  = (items||[]).filter(i => i.done).length
  const total = (items||[]).length
  const pct   = total > 0 ? Math.round(done/total*100) : 0

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:13, color:'var(--text-muted)', fontWeight:600 }}>
          {done}/{total} הושלמו
        </span>
        <span style={{ fontSize:13, fontWeight:800, color: pct===100 ? 'var(--green)' : 'var(--accent)' }}>
          {pct}%
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ height:6, background:'var(--surface2)', borderRadius:3, marginBottom:14 }}>
        <div style={{ height:'100%', width:`${pct}%`, background: pct===100 ? 'var(--green)' : 'var(--accent)', borderRadius:3, transition:'width 0.4s' }} />
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
        {(items||[]).map(item => (
          <div key={item.id} style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'8px 10px', borderRadius:8,
            background: item.done ? 'rgba(5,150,105,0.05)' : 'var(--surface2)',
            border: `1px solid ${item.done ? 'rgba(5,150,105,0.15)' : 'var(--border)'}`,
            transition:'all 0.2s',
          }}>
            <input type="checkbox" checked={item.done} onChange={e=>onToggle(item.id, e.target.checked)}
              style={{ width:16, height:16, accentColor:'var(--green)', flexShrink:0 }} />
            <span style={{ flex:1, fontSize:14, color: item.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>
              {item.task}
            </span>
            <button onClick={() => onDelete(item.id, vacationId)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14,padding:2 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <input className="input" value={newTask} onChange={e=>setNewTask(e.target.value)}
          placeholder="הוסף פריט..." style={{ fontSize:13, padding:'8px 12px' }}
          onKeyDown={e => e.key==='Enter' && handleAdd()} />
        <button className="btn btn-primary" onClick={handleAdd} disabled={adding}
          style={{ padding:'8px 14px', fontSize:13 }}>+</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Vacation Card (expandable)
// ─────────────────────────────────────────────────────────────
function VacationCard({ vacation, onEdit, onDelete, onUpdateSchedule, onToggleCheck, onAddCheck, onDeleteCheck }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab]           = useState('schedule') // schedule | flight | car | checklist

  const status = vacationStatus(vacation)
  const nights = differenceInDays(new Date(vacation.end_date), new Date(vacation.start_date))
  const checkDone  = (vacation.vacation_checklist||[]).filter(c=>c.done).length
  const checkTotal = (vacation.vacation_checklist||[]).length

  return (
    <div className="card fade-up" style={{ overflow:'hidden', marginBottom:16 }}>
      {/* Photo header */}
      <div style={{
        height: 180, position:'relative', overflow:'hidden',
        background: 'linear-gradient(135deg, #1e3a5f, #0f1117)',
        cursor:'pointer',
      }} onClick={() => setExpanded(e=>!e)}>
        {vacation.photo_url && (
          <img src={vacation.photo_url} alt={vacation.destination}
            style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.85 }}
            onError={e => e.target.style.display='none'} />
        )}
        {/* Gradient overlay */}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 60%)' }} />

        {/* Status badge */}
        <div style={{ position:'absolute', top:14, right:14 }}>
          <span className="badge" style={{ background: status.bg, color: status.color, backdropFilter:'blur(8px)', border:`1px solid ${status.color}40` }}>
            {status.label}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ position:'absolute', top:12, left:12, display:'flex', gap:6 }}>
          <button onClick={e=>{e.stopPropagation();onEdit(vacation)}}
            style={{ background:'rgba(255,255,255,0.2)', backdropFilter:'blur(8px)', border:'none', borderRadius:8, padding:'5px 8px', cursor:'pointer', color:'white', fontSize:14 }}>✏️</button>
          <button onClick={e=>{e.stopPropagation();confirm('למחוק חופשה זו?')&&onDelete(vacation.id)}}
            style={{ background:'rgba(255,255,255,0.2)', backdropFilter:'blur(8px)', border:'none', borderRadius:8, padding:'5px 8px', cursor:'pointer', color:'white', fontSize:14 }}>🗑️</button>
        </div>

        {/* Destination info */}
        <div style={{ position:'absolute', bottom:0, right:0, left:0, padding:'14px 18px' }}>
          <h2 style={{ color:'white', fontWeight:900, fontSize:24, margin:0, textShadow:'0 2px 8px rgba(0,0,0,0.5)' }}>
            {vacation.destination}
          </h2>
          <div style={{ color:'rgba(255,255,255,0.85)', fontSize:13, display:'flex', gap:14, marginTop:4 }}>
            <span>📅 {format(new Date(vacation.start_date),'dd/MM/yyyy')} — {format(new Date(vacation.end_date),'dd/MM/yyyy')}</span>
            <span>🌙 {nights} לילות</span>
            {vacation.has_car && <span>🚗 עם רכב</span>}
            {vacation.airline && <span>✈️ {vacation.airline}</span>}
          </div>
        </div>

        {/* Expand arrow */}
        <div style={{ position:'absolute', bottom:14, left:14, color:'rgba(255,255,255,0.7)', fontSize:20, transform: expanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.25s' }}>▾</div>
      </div>

      {/* Quick stats bar */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
        {checkTotal > 0 && (
          <div style={{ flex:1, padding:'10px 16px', borderLeft:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginBottom:3 }}>צ'קליסט</div>
            <div style={{ fontWeight:800, fontSize:15 }}>{checkDone}/{checkTotal}</div>
          </div>
        )}
        <div style={{ flex:1, padding:'10px 16px', borderLeft:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginBottom:3 }}>ימי לוז</div>
          <div style={{ fontWeight:800, fontSize:15 }}>{(vacation.vacation_schedule||[]).length}</div>
        </div>
        <div style={{ flex:1, padding:'10px 16px' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, marginBottom:3 }}>לילות</div>
          <div style={{ fontWeight:800, fontSize:15 }}>{nights}</div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="fade-in">
          {/* Tab navigation */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
            {[
              ['schedule','📅 לוח שנה'],
              ['checklist',`✅ צ'קליסט`],
              ['flight','🛫 טיסה'],
              ['car','🚗 רכב'],
              ['notes','📝 הערות'],
            ].map(([t,l]) => (
              <button key={t} onClick={()=>setTab(t)} style={{
                padding:'11px 16px', border:'none', cursor:'pointer', whiteSpace:'nowrap',
                background: tab===t ? 'var(--accent-glow)' : 'transparent',
                color: tab===t ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent',
                fontFamily:'Heebo', fontWeight: tab===t ? 700 : 500, fontSize:13,
                transition:'all 0.15s',
              }}>{l}</button>
            ))}
          </div>

          <div style={{ padding:'18px 18px' }}>
            {tab === 'schedule' && (
              <ScheduleEditor
                schedule={vacation.vacation_schedule}
                onUpdate={(dayId, updates) => onUpdateSchedule(dayId, updates)}
              />
            )}

            {tab === 'checklist' && (
              <Checklist
                items={vacation.vacation_checklist}
                vacationId={vacation.id}
                onToggle={onToggleCheck}
                onAdd={onAddCheck}
                onDelete={onDeleteCheck}
              />
            )}

            {tab === 'flight' && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {vacation.airline && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--surface2)', borderRadius:10 }}>
                    <span style={{ fontSize:20 }}>✈️</span>
                    <div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>חברת תעופה</div>
                      <div style={{ fontWeight:800, fontSize:16 }}>{vacation.airline}</div>
                    </div>
                  </div>
                )}
                {[
                  { label:'טיסת יציאה 🛫', val: vacation.flight_out },
                  { label:'טיסת חזרה 🛬', val: vacation.flight_back },
                  { label:'הערות', val: vacation.flight_notes },
                ].map(({ label, val }) => val ? (
                  <div key={label}>
                    <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600, marginBottom:4 }}>{label}</div>
                    <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 14px', fontSize:14, whiteSpace:'pre-wrap', lineHeight:1.6 }}>{val}</div>
                  </div>
                ) : null)}
                {!vacation.flight_out && !vacation.flight_back && !vacation.airline && (
                  <p style={{ color:'var(--text-muted)', fontSize:14 }}>אין פרטי טיסה — לחץ ✏️ להוספה</p>
                )}
              </div>
            )}

            {tab === 'car' && (
              <div>
                <div style={{
                  display:'flex', alignItems:'center', gap:12, padding:'14px',
                  background: vacation.has_car ? 'rgba(16,185,129,0.08)' : 'var(--surface2)',
                  border: `1px solid ${vacation.has_car ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                  borderRadius:10, marginBottom:14,
                }}>
                  <span style={{ fontSize:28 }}>{vacation.has_car ? '🚗' : '🚶'}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15 }}>{vacation.has_car ? 'שוכרים רכב' : 'ללא רכב שכור'}</div>
                    {vacation.has_car && vacation.car_company && (
                      <div style={{ fontSize:13, color:'var(--text-muted)' }}>{vacation.car_company}</div>
                    )}
                  </div>
                </div>
                {vacation.has_car && vacation.car_notes && (
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600, marginBottom:4 }}>פרטים</div>
                    <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 14px', fontSize:14, whiteSpace:'pre-wrap', lineHeight:1.6 }}>{vacation.car_notes}</div>
                  </div>
                )}
              </div>
            )}

            {tab === 'notes' && (
              <div>
                {vacation.notes ? (
                  <p style={{ fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{vacation.notes}</p>
                ) : (
                  <p style={{ color:'var(--text-muted)', fontSize:14 }}>אין הערות — לחץ ✏️ להוספה</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────
export default function VacationsApp({ activePage, onPageChange }) {
  const { vacations, loading, add, update, remove, updateScheduleDay, toggleCheckItem, addCheckItem, deleteCheckItem } = useVacations()
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter]   = useState('all') // all | upcoming | past

  const filtered = useMemo(() => {
    const now = new Date()
    return vacations.filter(v => {
      if (filter === 'upcoming') return isFuture(new Date(v.start_date)) || isToday(new Date(v.start_date))
      if (filter === 'past') return isPast(new Date(v.end_date))
      return true
    })
  }, [vacations, filter])

  const upcoming = vacations.filter(v => isFuture(new Date(v.start_date))).length
  const active   = vacations.filter(v => !isFuture(new Date(v.start_date)) && !isPast(new Date(v.end_date))).length
  const past     = vacations.filter(v => isPast(new Date(v.end_date))).length

  if (loading) return (
    <div style={{ display:'grid', placeItems:'center', height:'100%', color:'var(--text-muted)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>✈️</div>
        <p>טוען חופשות...</p>
      </div>
    </div>
  )

  return (
    <div className="page-content" style={{ maxWidth:800 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ fontWeight:900, fontSize:22, marginBottom:2 }}>החופשות שלי</h2>
          {active > 0 && <p style={{ fontSize:13, color:'var(--green)', fontWeight:700 }}>✈️ אתה בחופשה עכשיו!</p>}
        </div>
        <button className="btn btn-primary" style={{ padding:'9px 16px', fontSize:13 }}
          onClick={() => { setEditing(null); setModal(true) }}>+ חופשה חדשה</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        {[
          { label:'קרובות', val:upcoming, icon:'🗓️', color:'var(--accent)' },
          { label:'עכשיו', val:active, icon:'✈️', color:'var(--green)' },
          { label:'עברו', val:past, icon:'📸', color:'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} className="card fade-up" style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:5 }}>{s.label}</div>
                <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
              </div>
              <span style={{ fontSize:22 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:6, marginBottom:18 }}>
        {[['all','הכל'],['upcoming','קרובות'],['past','עברו']].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            padding:'7px 14px', borderRadius:8, border:`1px solid ${filter===v?'var(--accent)':'var(--border)'}`,
            background: filter===v ? 'rgba(37,99,235,0.08)' : 'transparent',
            color: filter===v ? 'var(--accent)' : 'var(--text-muted)',
            cursor:'pointer', fontFamily:'Heebo', fontWeight:600, fontSize:13,
          }}>{l}</button>
        ))}
      </div>

      {/* Vacation cards */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:16 }}>✈️</div>
          <p style={{ color:'var(--text-muted)', fontSize:15 }}>
            {filter==='all' ? 'אין חופשות — תכנן את הראשונה!' : 'אין חופשות בסינון זה'}
          </p>
        </div>
      ) : filtered.map(v => (
        <VacationCard key={v.id} vacation={v}
          onEdit={v => { setEditing(v); setModal(true) }}
          onDelete={remove}
          onUpdateSchedule={updateScheduleDay}
          onToggleCheck={toggleCheckItem}
          onAddCheck={addCheckItem}
          onDeleteCheck={deleteCheckItem}
        />
      ))}

      {modal && (
        <VacationModal
          initial={editing}
          onSave={d => editing ? update(editing.id, d) : add(d)}
          onClose={() => { setModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
