// ============================================================
// רשימת הכלים בפורטל
// להוספת כלי חדש — הוסף אובייקט לרשימה הזו
// ============================================================

import FinanceApp   from '../apps/finance/FinanceApp.jsx'
import InsuranceApp from '../apps/insurance/InsuranceApp.jsx'

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
