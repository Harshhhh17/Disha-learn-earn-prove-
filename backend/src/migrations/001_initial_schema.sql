-- ==============================================================================
-- Disha Production Database Schema (PostgreSQL)
-- All financial values are stored as BIGINT integer paise (₹1 = 100 paise)
-- ==============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(100) NOT NULL,
    avatar VARCHAR(20) DEFAULT '👨‍🎓',
    role VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'SUPER_ADMIN')),
    is_kyc_verified BOOLEAN DEFAULT FALSE,
    pan_number VARCHAR(20),
    aadhaar_number VARCHAR(20),
    upi_id VARCHAR(100),
    bank_account JSONB DEFAULT '{}'::jsonb,
    target_exams JSONB DEFAULT '["SSC", "Railways"]'::jsonb,
    language_pref VARCHAR(10) DEFAULT 'hi',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. USER SESSIONS (Server-side token verification)
CREATE TABLE IF NOT EXISTS user_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- 3. OTP REQUESTS (Rate-limited, short-lived, single-use)
CREATE TABLE IF NOT EXISTS otp_requests (
    id VARCHAR(64) PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- phone number or email
    otp_hash VARCHAR(128) NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_requests(identifier);

-- 4. QUESTION CATEGORIES
CREATE TABLE IF NOT EXISTS question_categories (
    id VARCHAR(32) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(20) DEFAULT '📚',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. QUESTIONS (Correct answer kept strictly server-side)
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(64) PRIMARY KEY,
    category_code VARCHAR(32) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    year VARCHAR(100) DEFAULT 'PYQ',
    difficulty VARCHAR(20) DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    question_en TEXT NOT NULL,
    question_hi TEXT NOT NULL,
    options_en JSONB NOT NULL, -- Array of 4 strings
    options_hi JSONB NOT NULL, -- Array of 4 strings
    correct_option_index INTEGER NOT NULL CHECK (correct_option_index BETWEEN 0 AND 3),
    explanation_en TEXT,
    explanation_hi TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_code);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active);

-- 6. QUIZZES & LIVE TOURNAMENTS
CREATE TABLE IF NOT EXISTS quizzes (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(32) NOT NULL,
    prize_pool_paise BIGINT NOT NULL DEFAULT 0, -- e.g. 1000000 = ₹10,000.00
    entry_fee_paise BIGINT NOT NULL DEFAULT 0,
    start_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 300,
    time_per_question_sec INTEGER DEFAULT 15,
    total_questions INTEGER DEFAULT 5,
    registered_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. QUIZ ATTEMPTS (Server-authoritative scoring & time tracking)
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id VARCHAR(64) PRIMARY KEY,
    quiz_id VARCHAR(64) NOT NULL REFERENCES quizzes(id),
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finish_time TIMESTAMP WITH TIME ZONE,
    score INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    total_time_ms INTEGER DEFAULT 0,
    rank INTEGER,
    prize_won_paise BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_quiz ON quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_score ON quiz_attempts(quiz_id, score DESC, total_time_ms ASC);

-- 8. SUBMITTED ANSWERS (Independent server validation)
CREATE TABLE IF NOT EXISTS submitted_answers (
    id VARCHAR(64) PRIMARY KEY,
    attempt_id VARCHAR(64) NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id VARCHAR(64) NOT NULL REFERENCES questions(id),
    selected_option_index INTEGER,
    is_correct BOOLEAN DEFAULT FALSE,
    response_time_ms INTEGER NOT NULL,
    points_awarded INTEGER DEFAULT 0,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submitted_answers_attempt ON submitted_answers(attempt_id);

-- 9. WALLETS (Integer paise with atomic locks)
CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    available_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_paise >= 0),
    total_won_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_won_paise >= 0),
    total_withdrawn_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_withdrawn_paise >= 0),
    locked_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (locked_balance_paise >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- 10. WALLET TRANSACTIONS (Immutable Ledger)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('ENTRY_FEE', 'PRIZE_CREDIT', 'DEPOSIT', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT')),
    amount_paise BIGINT NOT NULL,
    balance_after_paise BIGINT NOT NULL,
    reference_id VARCHAR(100),
    idempotency_key VARCHAR(100) UNIQUE,
    status VARCHAR(20) DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON wallet_transactions(idempotency_key);

-- 11. WITHDRAWALS
CREATE TABLE IF NOT EXISTS withdrawals (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 10000), -- Minimum ₹100
    tds_amount_paise BIGINT DEFAULT 0,
    net_payout_paise BIGINT NOT NULL,
    bank_details JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PROCESSING', 'SUCCESS', 'REJECTED')),
    payout_reference VARCHAR(100),
    processed_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- 12. AUDIT LOGS (Security & Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64),
    actor_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    target_resource VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
