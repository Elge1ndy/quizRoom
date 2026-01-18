-- RUN THIS IN SUPABASE SQL EDITOR TO FIX 404 ERRORS

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

-- Ensure Publication includes friends (if using a specific one)
-- ALTER PUBLICATION supabase_realtime ADD TABLE friends;
