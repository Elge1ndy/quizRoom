-- ============================================
-- QuizRoom Migration 003: consecutive_correct for combo tracking
-- Date: 2026-08-18
-- Run in: Supabase SQL Editor
-- ============================================

-- Add consecutive_correct column to room_players
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS consecutive_correct INTEGER DEFAULT 0;

-- Add speed_bonus column to answers for tracking
ALTER TABLE answers ADD COLUMN IF NOT EXISTS speed_bonus BOOLEAN DEFAULT FALSE;
ALTER TABLE answers ADD COLUMN IF NOT EXISTS combo_bonus BOOLEAN DEFAULT FALSE;
