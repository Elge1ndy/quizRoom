-- Database Migration: Add missing stats columns to players table
-- Run this in Supabase SQL Editor

ALTER TABLE players 
ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_games INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_correct INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS game_history JSONB DEFAULT '[]'::jsonb;

-- Optional: Add an index on total_points for leaderboard functionality later
CREATE INDEX IF NOT EXISTS idx_players_total_points ON players (total_points DESC);
