-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create jobs table with RLS
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  app_name TEXT NOT NULL,
  package_id TEXT NOT NULL,
  platforms TEXT[] NOT NULL,
  icon_path TEXT,
  artifact_paths JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for user's jobs
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see and manage their own jobs
CREATE POLICY "Users can view their own jobs"
  ON jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Service role policy for workers to update any job
CREATE POLICY "Service role can update any job"
  ON jobs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can insert any job"
  ON jobs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create storage buckets for icons and artifacts
-- Note: Run this in Supabase dashboard or via API as it requires special permissions
-- CREATE STORAGE BUCKET 'icons' (public = false);
-- CREATE STORAGE BUCKET 'artifacts' (public = false);

-- Storage RLS policies for icons bucket
-- CREATE POLICY "Users can upload their own icons"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'icons' AND (storage.foldername(name))[1] = auth.uid()::text);

-- CREATE POLICY "Users can view their own icons"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'icons' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage RLS policies for artifacts bucket
-- CREATE POLICY "Service role can upload artifacts"
--   ON storage.objects FOR INSERT
--   TO service_role
--   WITH CHECK (bucket_id = 'artifacts');

-- CREATE POLICY "Users can view their own artifacts"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
