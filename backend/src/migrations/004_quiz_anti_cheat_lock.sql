-- ==============================================================================
-- Disha Migration 004: Quiz Anti-Cheat Lock & Exit Enforcement Schema
-- Tracks client blur/leave count and disqualifications server-side
-- ==============================================================================

ALTER TABLE quiz_attempts 
ADD COLUMN IF NOT EXISTS leave_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_leaves_allowed INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_leave_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS disqualified_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_status 
ON quiz_attempts(user_id, status);
