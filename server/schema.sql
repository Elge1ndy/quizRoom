-- QuizRoom Database Schema for Supabase
-- Run this SQL in Supabase SQL Editor

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  device_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  avatar TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  game_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast nickname lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_players_nickname_lower 
ON players (LOWER(nickname));

-- Create index for last_seen for analytics
CREATE INDEX IF NOT EXISTS idx_players_last_seen 
ON players (last_seen DESC);

-- Optional: Enable Row Level Security (RLS) for security
-- ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Optional: Create policy to allow all operations (adjust as needed)
-- CREATE POLICY "Allow all operations on players" ON players
-- FOR ALL USING (true) WITH CHECK (true);
