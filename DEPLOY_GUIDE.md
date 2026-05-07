# 🚀 מדריך פריסה — MyPortal

## שלב 1 — GitHub

```bash
cd my-portal
npm install
git init
git add .
git commit -m "Initial portal"
git remote add origin https://github.com/YOUR_USER/my-portal.git
git push -u origin main
```

---

## שלב 2 — Supabase

1. supabase.com → New Project → בחר שם ואזור (Frankfurt)
2. SQL Editor → New Query → העתק את כל `supabase-schema.sql` → Run
3. **Storage**: Dashboard → Storage → New Bucket:
   - Name: `insurance-docs`
   - Public: ❌ (Private)
4. Settings → API → העתק:
   - `Project URL`
   - `anon public` key

### Google OAuth (אופציונלי):
- Authentication → Providers → Google → הפעל
- Redirect URL: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`

---

## שלב 3 — Vercel

1. vercel.com → New Project → Import מ-GitHub
2. Environment Variables:
   ```
   VITE_SUPABASE_URL      = https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY = YOUR_KEY
   ```
3. Deploy → קיבלת URL! 🎉

### לאחר הפריסה:
- Supabase → Authentication → URL Configuration
- Site URL: `https://your-portal.vercel.app`

---

## שלב 4 — פיתוח מקומי

```bash
cp .env.example .env.local
# ערוך .env.local עם ה-keys
npm run dev
# → http://localhost:5173
```

---

## מבנה הפרויקט

```
my-portal/
├── src/
│   ├── apps/
│   │   ├── finance/       ← כלי פיננסי
│   │   │   └── FinanceApp.jsx
│   │   └── insurance/     ← כלי ביטוחים
│   │       └── InsuranceApp.jsx
│   ├── components/
│   │   ├── LoginPage.jsx  ← דף כניסה
│   │   ├── PortalHome.jsx ← דף הבית (רשת כלים)
│   │   └── AppShell.jsx   ← עטיפת כל כלי
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── lib/
│   │   ├── supabase.js
│   │   └── appRegistry.js ← ← ← כאן מוסיפים כלים
│   └── App.jsx
├── supabase-schema.sql
├── HOW_TO_ADD_TOOLS.md
└── vercel.json
```

---

## להוספת כלי חדש

ראה `HOW_TO_ADD_TOOLS.md` — זה 3 שלבים פשוטים בלבד!
