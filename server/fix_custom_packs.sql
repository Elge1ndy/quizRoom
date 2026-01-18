-- RUN THIS IN SUPABASE SQL EDITOR TO FIX 404 FOR CUSTOM PACKS

CREATE TABLE IF NOT EXISTS custom_packs (
  id BIGSERIAL PRIMARY KEY,
  creator_id TEXT REFERENCES players(device_id),
  name TEXT NOT NULL,
  category TEXT,
  difficulty TEXT,
  description TEXT,
  icon TEXT,
  data JSONB NOT NULL, -- The questions array
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Realtime for custom_packs
ALTER TABLE custom_packs REPLICA IDENTITY FULL;

-- Disable RLS to allow creation
ALTER TABLE custom_packs DISABLE ROW LEVEL SECURITY;
