-- ==============================================================================
-- Disha Migration 002: Payment Orders & Razorpay Gateway Schema
-- Tracks server-authoritative payment lifecycle (CREATED -> AUTHORIZED -> CAPTURED / FAILED)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payment_orders (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id VARCHAR(100) UNIQUE NOT NULL,
    razorpay_payment_id VARCHAR(100) UNIQUE,
    razorpay_signature VARCHAR(255),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    purpose VARCHAR(50) NOT NULL DEFAULT 'WALLET_DEPOSIT' CHECK (purpose IN ('WALLET_DEPOSIT', 'TOURNAMENT_ENTRY', 'COURSE_PURCHASE')),
    reference_id VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED')),
    payment_method VARCHAR(50),
    error_code VARCHAR(50),
    error_description TEXT,
    webhook_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp_order ON payment_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp_payment ON payment_orders(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
