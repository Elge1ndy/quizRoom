-- ============================================
-- QuizRoom Migration 006: Admin Auth via DB
-- Date: 2026-09-03
-- Run in: Supabase SQL Editor
-- ============================================
-- PROBLEM: Admin password 'admin123' is hardcoded in Frontend
-- FIX: Store admin secret in DB and verify server-side

-- Create admin_config table
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin secret (CHANGE THIS!)
INSERT INTO admin_config (key, value) 
VALUES ('admin_secret', 'CHANGE_ME_TO_A_STRONG_PASSWORD')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

-- Only allow read from server (not client)
-- In practice, admin auth should go through an Edge Function
CREATE POLICY "No public read on admin_config" ON admin_config
  FOR SELECT USING (false);

-- Function to verify admin secret (call from Edge Function or client)
CREATE OR REPLACE FUNCTION verify_admin_secret(secret TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  stored_secret TEXT;
BEGIN
  SELECT value INTO stored_secret FROM admin_config WHERE key = 'admin_secret';
  RETURN stored_secret = secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
