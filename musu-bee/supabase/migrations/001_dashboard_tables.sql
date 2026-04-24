-- Dashboard tables for musu.pro web dashboard
-- Run via Supabase SQL Editor when ready for remote access
-- For local development, dashboard uses bridge API directly

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline',
  cpu_pct REAL,
  gpu_pct REAL,
  ram_pct REAL,
  gpu_model TEXT,
  roles TEXT[],
  agents TEXT[],
  tasks_running INTEGER DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_name TEXT,
  channel TEXT,
  instruction TEXT,
  status TEXT DEFAULT 'pending',
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  node_name TEXT,
  agent_name TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own devices" ON devices
  FOR SELECT USING (account_id = auth.uid()::text);

ALTER TABLE device_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own tasks" ON device_tasks
  FOR SELECT USING (account_id = auth.uid()::text);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own activity" ON activity_log
  FOR SELECT USING (account_id = auth.uid()::text);
