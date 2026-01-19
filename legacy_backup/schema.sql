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

-- --- SERVERLESS ROOM SYSTEM ---

-- Enable Realtime for the database
-- Note: This is usually done in the Supabase UI but helpful to have here
-- ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
-- ALTER PUBLICATION supabase_realtime ADD TABLE room_players;

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  host_id TEXT REFERENCES players(device_id),
  state TEXT DEFAULT 'waiting', -- waiting, playing, intermission, finished
  settings JSONB DEFAULT '{}'::jsonb,
  current_question_index INTEGER DEFAULT 0,
  timer_end_at TIMESTAMPTZ,
  pack_data JSONB, -- Stores the full pack questions for syncing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create room_players junction table
CREATE TABLE IF NOT EXISTS room_players (
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(device_id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  is_ready BOOLEAN DEFAULT FALSE,
  last_answer TEXT,
  is_correct BOOLEAN,
  status TEXT DEFAULT 'active', -- active, waiting-next-round
  team_id TEXT,
  teammate_id TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, player_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  sender_id TEXT REFERENCES players(device_id),
  sender_nickname TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'user', -- user, system
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friends (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES players(device_id),
  friend_id TEXT REFERENCES players(device_id),
  status TEXT DEFAULT 'pending', -- pending, accepted
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Enable Realtime for friends
ALTER TABLE friends REPLICA IDENTITY FULL;

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

-- Enable Realtime for rooms, room_players and chat_messages
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- Index for fast room lookups
CREATE INDEX IF NOT EXISTS idx_room_players_room_code ON room_players(room_code);

-- Optional: Enable Row Level Security (RLS) for security
-- ALTER TABLE players ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
