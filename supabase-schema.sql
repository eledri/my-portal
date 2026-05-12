-- ============================================================
-- MY PORTAL - SUPABASE SQL SCHEMA
-- הרץ את הקוד הזה ב-Supabase SQL Editor
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- הגדרות פורטל
-- ════════════════════════════════════════════════════════════

CREATE TABLE portal_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  portal_name TEXT DEFAULT 'הפורטל שלי',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_settings_own" ON portal_settings
  FOR ALL USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- FINANCE MODULE (fin_*)
-- ════════════════════════════════════════════════════════════

CREATE TABLE fin_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fin_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES fin_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE fin_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES fin_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fin_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES fin_groups(id) ON DELETE CASCADE,
  category_id UUID REFERENCES fin_categories(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  installments_total INTEGER DEFAULT 1,
  installments_paid INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fin_share_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES fin_groups(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- ════════════════════════════════════════════════════════════
-- INSURANCE MODULE (ins_*)
-- ════════════════════════════════════════════════════════════

CREATE TABLE ins_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '🛡️',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ins_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES ins_categories(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  policy_number TEXT,
  vehicle_number TEXT,
  start_date DATE,
  end_date DATE,
  cost_mandatory NUMERIC(10,2),
  cost_comprehensive NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ins_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID REFERENCES ins_policies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

-- Finance
ALTER TABLE fin_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_share_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_groups_select" ON fin_groups FOR SELECT USING (
  id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid()));
CREATE POLICY "fin_groups_insert" ON fin_groups FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "fin_groups_update" ON fin_groups FOR UPDATE USING (
  id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "fin_members_select" ON fin_group_members FOR SELECT USING (
  group_id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid()));
CREATE POLICY "fin_members_insert" ON fin_group_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "fin_members_delete" ON fin_group_members FOR DELETE USING (
  user_id = auth.uid() OR
  group_id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "fin_categories_all" ON fin_categories FOR ALL USING (
  group_id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid()));

CREATE POLICY "fin_records_all" ON fin_records FOR ALL USING (
  group_id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid()));

CREATE POLICY "fin_invites_select" ON fin_share_invites FOR SELECT USING (
  invited_by = auth.uid() OR invited_email = auth.email());
CREATE POLICY "fin_invites_insert" ON fin_share_invites FOR INSERT WITH CHECK (
  invited_by = auth.uid() AND
  group_id IN (SELECT group_id FROM fin_group_members WHERE user_id = auth.uid()));
CREATE POLICY "fin_invites_update" ON fin_share_invites FOR UPDATE USING (invited_by = auth.uid());

-- Insurance
ALTER TABLE ins_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ins_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ins_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ins_categories_own" ON ins_categories FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ins_policies_own"   ON ins_policies   FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ins_documents_own"  ON ins_documents  FOR ALL USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- STORAGE BUCKET for insurance documents
-- ════════════════════════════════════════════════════════════
-- Run this separately in Supabase Dashboard → Storage → New bucket
-- Name: insurance-docs
-- Private: YES

-- Then add storage policies:
INSERT INTO storage.buckets (id, name, public) VALUES ('insurance-docs', 'insurance-docs', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "users can upload own docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'insurance-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can view own docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'insurance-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users can delete own docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'insurance-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ════════════════════════════════════════════════════════════
-- TRIGGER: יצירת קבוצה פיננסית אוטומטית למשתמש חדש
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_portal_user()
RETURNS TRIGGER AS $$
DECLARE new_group UUID;
BEGIN
  INSERT INTO fin_groups (name, created_by) VALUES ('הכספים שלי', NEW.id) RETURNING id INTO new_group;
  INSERT INTO fin_group_members (group_id, user_id, role) VALUES (new_group, NEW.id, 'owner');
  INSERT INTO fin_categories (group_id, name, color, icon) VALUES
    (new_group, 'משכורת',   '#10b981', '💰'),
    (new_group, 'דיור',     '#f59e0b', '🏠'),
    (new_group, 'מזון',     '#ef4444', '🛒'),
    (new_group, 'תחבורה',   '#3b82f6', '🚗'),
    (new_group, 'בידור',    '#8b5cf6', '🎬'),
    (new_group, 'בריאות',   '#06b6d4', '💊');

  INSERT INTO ins_categories (user_id, name, color, icon) VALUES
    (NEW.id, 'ביטוח רכב',    '#3b82f6', '🚗'),
    (NEW.id, 'ביטוח בית',    '#f59e0b', '🏠'),
    (NEW.id, 'ביטוח חיים',   '#ef4444', '❤️'),
    (NEW.id, 'ביטוח בריאות', '#10b981', '🏥');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_portal_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_portal_user();

-- ════════════════════════════════════════════════════════════
-- COUPONS MODULE (coupons)
-- ════════════════════════════════════════════════════════════

CREATE TABLE coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  code TEXT,
  url TEXT,
  amount NUMERIC(10,2),
  expiry_date DATE,
  redeemed BOOLEAN DEFAULT FALSE,
  redeemed_at TIMESTAMPTZ,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_own" ON coupons FOR ALL USING (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════
-- תיקון Storage Policies — הרץ אם יש בעיות הורדה
-- ════════════════════════════════════════════════════════════

-- מחק policies ישנים ויצור חדשים נכונים
DROP POLICY IF EXISTS "users can upload own docs" ON storage.objects;
DROP POLICY IF EXISTS "users can view own docs" ON storage.objects;
DROP POLICY IF EXISTS "users can delete own docs" ON storage.objects;

CREATE POLICY "insurance upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'insurance-docs' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "insurance select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'insurance-docs' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

CREATE POLICY "insurance delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'insurance-docs' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- ════════════════════════════════════════════════════════════
-- VACATIONS MODULE
-- ════════════════════════════════════════════════════════════

CREATE TABLE vacations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  photo_url TEXT,
  -- טיסה
  airline TEXT,
  flight_out TEXT,
  flight_back TEXT,
  flight_notes TEXT,
  -- רכב
  has_car BOOLEAN DEFAULT FALSE,
  car_company TEXT,
  car_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vacation_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_id UUID REFERENCES vacations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  day_date DATE NOT NULL,
  day_number INTEGER NOT NULL,
  title TEXT DEFAULT '',
  activities TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vacation_checklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_id UUID REFERENCES vacations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacation_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacation_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vacations_own"          ON vacations          FOR ALL USING (user_id = auth.uid());
CREATE POLICY "vacation_schedule_own"  ON vacation_schedule  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "vacation_checklist_own" ON vacation_checklist FOR ALL USING (user_id = auth.uid());
