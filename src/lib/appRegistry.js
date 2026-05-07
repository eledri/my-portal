// ============================================================
// רשימת הכלים בפורטל
// להוספת כלי חדש — הוסף אובייקט לרשימה הזו
// ============================================================

import FinanceApp   from '../apps/finance/FinanceApp.jsx'
import InsuranceApp from '../apps/insurance/InsuranceApp.jsx'
import CouponsApp   from '../apps/coupons/CouponsApp.jsx'

export const APPS = [
  {
    id:          'finance',
    title:       'הכסף שלי',
    description: 'מעקב הכנסות והוצאות, קטגוריות, גרפים ואנליזה',
    icon:        '₪',
    color:       '#f59e0b',
    gradient:    'linear-gradient(135deg, #f59e0b, #d97706)',
    component:   FinanceApp,
    tags:        ['כספים', 'תקציב', 'גרפים'],
    navItems: [
      { key:'dashboard',  icon:'📊', label:'לוח בקרה' },
      { key:'records',    icon:'📝', label:'רשומות' },
      { key:'categories', icon:'🗂️', label:'קטגוריות' },
      { key:'analytics',  icon:'📈', label:'אנליזה' },
      { key:'sharing',    icon:'👥', label:'שיתוף' },
    ],
  },
  {
    id:          'insurance',
    title:       'הביטוחים שלי',
    description: 'ניהול פוליסות, תאריכים, עלויות ומסמכים',
    icon:        '🛡️',
    color:       '#3b82f6',
    gradient:    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    component:   InsuranceApp,
    tags:        ['ביטוח', 'פוליסות', 'מסמכים'],
    navItems: [
      { key:'policies',   icon:'🛡️', label:'פוליסות' },
      { key:'categories', icon:'🗂️', label:'קטגוריות' },
    ],
  },
  {
    id:          'coupons',
    title:       'הקופונים שלי',
    description: 'ניהול קופונים, הדבקה חכמה, מעקב תוקף והיסטוריה',
    icon:        '🎟️',
    color:       '#8b5cf6',
    gradient:    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    component:   CouponsApp,
    tags:        ['קופונים', 'הנחות'],
  },
  // ── הוסף כלים נוספים כאן ──
  // {
  //   id:          'tasks',
  //   title:       'המשימות שלי',
  //   description: 'ניהול משימות ותזכורות',
  //   icon:        '✅',
  //   color:       '#10b981',
  //   gradient:    'linear-gradient(135deg, #10b981, #059669)',
  //   component:   TasksApp,
  //   tags:        ['משימות', 'תזכורות'],
  // },
]
