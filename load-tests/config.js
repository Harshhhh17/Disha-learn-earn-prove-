/* ==============================================================================
   Disha k6 Load Testing Configuration Module
   Centralized endpoints, headers, thresholds, and realistic pacing helpers.
   Zero hardcoded secrets — all configuration sourced from environment variables.
   ============================================================================== */

export const CONFIG = {
  // Base URL of target environment (Local: http://127.0.0.1:3000, DO: https://api.yourdomain.com)
  BASE_URL: (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, ''),

  // Authentication configuration (Supports token reuse to prevent OTP flood)
  AUTH: {
    DEFAULT_PHONE: __ENV.TEST_PHONE || '+91 9900000001',
    DEFAULT_OTP: __ENV.TEST_OTP || '123456',
    STATIC_TOKEN: __ENV.AUTH_TOKEN || null, // Pre-seeded JWT token if available
    USER_POOL_SIZE: parseInt(__ENV.USER_POOL_SIZE || '100', 10)
  },

  // Target Tournaments & Categories
  QUIZ: {
    DEFAULT_TOURNAMENT_ID: __ENV.TOURNAMENT_ID || 'live_maha_01',
    PRACTICE_CATEGORIES: ['All', 'SSC', 'Railways', 'Banking', 'UPSC']
  },

  // Global SLA & Performance Thresholds
  THRESHOLDS: {
    smoke: {
      http_req_failed: ['rate<0.01'], // < 1% errors
      http_req_duration: ['p(95)<300', 'p(99)<600'] // 95% of requests under 300ms
    },
    load: {
      http_req_failed: ['rate<0.01'], // < 1% errors under normal load
      http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests under 500ms
      'http_req_duration{type:quiz_answer}': ['p(95)<350'],
      'http_req_duration{type:wallet_query}': ['p(95)<250']
    },
    stress: {
      http_req_failed: ['rate<0.05'], // < 5% errors during extreme stress
      http_req_duration: ['p(95)<1200', 'p(99)<2500']
    }
  }
};

/**
 * Generates standardized headers with client source, optional JWT auth,
 * and realistic distributed client IP simulation per VU (e.g. Jio/Airtel 103.21.x.y subnets)
 */
export function getHeaders(token = null, vuId = 1) {
  const subnet = Math.floor(vuId / 250) + 1;
  const host = (vuId % 250) + 1;
  const clientIp = `103.21.${subnet}.${host}`;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Source': 'mobile',
    'X-Forwarded-For': clientIp
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Realistic Student Think Time (Pacing Jitter)
 * Emulates a real aspirant reading a question (1.5s - 3.5s)
 */
export function getRandomThinkTime(minSec = 1.2, maxSec = 3.2) {
  return minSec + Math.random() * (maxSec - minSec);
}
