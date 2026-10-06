-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables to ensure a clean slate (CAUTION: This deletes existing data in these tables)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS discount_details CASCADE;
DROP TABLE IF EXISTS purchase_details CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Profiles (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  employee_code TEXT UNIQUE,
  role TEXT CHECK (role IN ('ADMIN', 'REQUESTER', 'NARENDRA', 'SANJEEV')),
  department TEXT,
  showroom_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approval Requests (Base table for common fields)
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id TEXT UNIQUE NOT NULL, -- e.g. PUR-2026-00001
  type TEXT CHECK (type IN ('PURCHASE', 'DISCOUNT')),
  requester_id UUID REFERENCES profiles(id),
  status TEXT CHECK (status IN ('PENDING_NARENDRA', 'PENDING_SANJEEV', 'FINAL_APPROVED', 'REJECTED', 'SENT_BACK')),
  priority TEXT CHECK (priority IN ('NORMAL', 'URGENT', 'CRITICAL')),
  reason TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Details
CREATE TABLE purchase_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  supplier TEXT,
  item_category TEXT,
  item_name TEXT,
  sku TEXT,
  quantity INTEGER,
  unit_price DECIMAL,
  total_amount DECIMAL
);

-- Discount Details
CREATE TABLE discount_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_mobile TEXT,
  product_name TEXT,
  brand TEXT,
  sku TEXT,
  original_price DECIMAL,
  discount_amount DECIMAL,
  discount_percentage DECIMAL,
  final_price DECIMAL
);

-- Audit Logs / Approval History
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT, -- 'CREATED', 'APPROVED', 'REJECTED', 'SENT_BACK'
  previous_status TEXT,
  new_status TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS setup (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile, Admins can read all.
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);

-- Everyone authenticated can read profiles (needed to show names)
CREATE POLICY "Everyone can read profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Requests: Requesters can see their own, Narendra/Sanjeev/Admin can see all.
CREATE POLICY "Requesters see own requests" ON requests FOR SELECT TO authenticated USING (
  requester_id = auth.uid()
);
CREATE POLICY "Approvers and Admins see all requests" ON requests FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'NARENDRA', 'SANJEEV'))
);
-- Only Requesters or Admins can insert requests
CREATE POLICY "Insert requests" ON requests FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = requester_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ADMIN')
);
-- Update requests (Admins, or Approvers when changing status)
CREATE POLICY "Update requests" ON requests FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'NARENDRA', 'SANJEEV', 'REQUESTER'))
);

-- Details tables: Inherit from requests
CREATE POLICY "Read purchase details" ON purchase_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert purchase details" ON purchase_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update purchase details" ON purchase_details FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Read discount details" ON discount_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert discount details" ON discount_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update discount details" ON discount_details FOR UPDATE TO authenticated USING (true);

-- Audit logs
CREATE POLICY "Read audit logs" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert audit logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Notifications
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update own notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
