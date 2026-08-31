-- ==============================================================================
-- Disha Migration 003: Performance Optimization & Audit Hardening
-- Non-destructive, idempotent composite indexes for high-throughput queries
-- ==============================================================================

-- 1. SCHEMA MIGRATION TRACKING TABLE
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. COMPOSITE INDEXES FOR FAST PAGINATED QUERIES
-- Optimized for loading user transaction ledgers in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_transactions_user_created 
    ON wallet_transactions(user_id, created_at DESC);

-- Optimized for live quiz tournament leaderboards (Score DESC, Speed ASC)
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_leaderboard 
    ON quiz_attempts(quiz_id, score DESC, total_time_ms ASC);

-- Optimized for payment order lookups and reconciliation
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created 
    ON payment_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_status 
    ON payment_orders(user_id, status);

-- Optimized for withdrawal history
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created 
    ON withdrawals(user_id, created_at DESC);

-- Optimized for security audit trails
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created 
    ON audit_logs(actor_id, created_at DESC);
