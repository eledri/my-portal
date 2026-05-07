# 🧩 כיצד להוסיף כלי חדש לפורטל

## זה פשוט מאוד — 3 שלבים בלבד!

---

## שלב 1 — צור את קובץ הכלי

צור תיקייה וקובץ חדשים:
```
src/apps/MY_TOOL/MyToolApp.jsx
```

הקומפוננטה חייבת להיות export default:
```jsx
export default function MyToolApp() {
  return (
    <div style={{ padding: 28 }}>
      <h2>הכלי שלי</h2>
      {/* ... */}
    </div>
  )
}
```

---

## שלב 2 — הוסף לרג'יסטרי

פתח את `src/lib/appRegistry.js` והוסף אובייקט:

```js
import MyToolApp from '../apps/MY_TOOL/MyToolApp.jsx'

export const APPS = [
  // ... כלים קיימים ...
  {
    id:          'my-tool',          // מזהה ייחודי
    title:       'שם הכלי',          // שם שיוצג
    description: 'תיאור קצר',        // תיאור
    icon:        '🔧',               // אימוג'י או טקסט
    color:       '#10b981',          // צבע הכרטיסייה
    gradient:    'linear-gradient(135deg, #10b981, #059669)',
    component:   MyToolApp,          // ← הקומפוננטה
    tags:        ['תג1', 'תג2'],
  },
]
```

---

## שלב 3 — הוסף טבלאות SQL (אם צריך)

ב-Supabase SQL Editor הוסף את הטבלאות שלך עם RLS:

```sql
CREATE TABLE my_tool_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- שדות שלך כאן
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE my_tool_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own data" ON my_tool_data
  FOR ALL USING (user_id = auth.uid());
```

---

## זהו! הכלי יופיע אוטומטית בפורטל 🎉

---

## דוגמאות לכלים נוספים שניתן לבנות:

| כלי | תיאור |
|-----|-------|
| ✅ מנהל משימות | רשימת ToDo עם תאריכי יעד |
| 📅 לוח שנה | אירועים ותזכורות |
| 📊 מנהל השקעות | מניות, קרנות, ביצועים |
| 🔑 מנהל סיסמאות | שמירת פרטי כניסה מוצפנים |
| 🏥 מעקב בריאות | תרופות, בדיקות, רופאים |
| 📦 מלאי | ניהול מוצרים ומלאי |
| 📞 ספר כתובות | אנשי קשר עם פרטים |

רוצה אחד מאלה? שאל אותי ואבנה אותו! 🚀
