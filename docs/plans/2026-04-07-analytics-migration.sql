-- Analytics Events Table Migration
-- Run this in Supabase SQL Editor

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  event text NOT NULL,
  path text NOT NULL,
  musician_id text,
  metadata jsonb,
  referrer text,
  screen_size text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert analytics events"
  ON analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX idx_analytics_events_event ON analytics_events (event);
CREATE INDEX idx_analytics_events_created_at ON analytics_events (created_at);
CREATE INDEX idx_analytics_events_musician_id ON analytics_events (musician_id);
CREATE INDEX idx_analytics_events_session_id ON analytics_events (session_id);
