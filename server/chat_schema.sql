-- Chat Messages Persistence Schema
-- Run this in Supabase SQL Editor

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  sender_nickname TEXT NOT NULL,
  sender_device_id TEXT,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'user' CHECK (message_type IN ('user', 'system', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching room messages (most common query)
CREATE INDEX IF NOT EXISTS idx_chat_room_code 
ON chat_messages (room_code, created_at DESC);

-- Index for user message history
CREATE INDEX IF NOT EXISTS idx_chat_sender 
ON chat_messages (sender_device_id, created_at DESC);

-- Optional: Add foreign key to players table
-- ALTER TABLE chat_messages 
-- ADD CONSTRAINT fk_sender_device 
-- FOREIGN KEY (sender_device_id) 
-- REFERENCES players(device_id) ON DELETE SET NULL;
