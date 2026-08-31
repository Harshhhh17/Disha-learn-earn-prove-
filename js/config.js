/* ==========================================================================
   Disha Environment & Client Configuration Manager
   ========================================================================== */

const runtimeEnv = (typeof window !== 'undefined' && window.__ENV__) || {};

export const Config = {
  // Application Mode - defaults to production (debug OFF)
  ENV: runtimeEnv.NODE_ENV || 'production',
  IS_PRODUCTION: (runtimeEnv.NODE_ENV || 'production') === 'production',
  DEBUG_MODE: false,

  // API Base Endpoint
  API_BASE_URL: runtimeEnv.VITE_API_URL || runtimeEnv.REACT_APP_API_URL || '',

  // Public Gateway Key IDs
  RAZORPAY_KEY_ID: runtimeEnv.VITE_RAZORPAY_KEY_ID || '',
  SUPABASE_URL: runtimeEnv.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: runtimeEnv.VITE_SUPABASE_ANON_KEY || '',

  // Security Defaults & Restrictions
  MIN_WITHDRAWAL_AMOUNT: 100,
  MAX_OTP_ATTEMPTS: 5,
  OTP_VALIDITY_SECONDS: 300,

  // Support Email
  SUPPORT_EMAIL: 'supportatdisha@gmail.com',

  sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clean = Array.isArray(obj) ? [...obj] : { ...obj };
    const sensitiveKeys = ['passcode', 'password', 'token', 'secret', 'key', 'panNumber', 'aadhaarNumber'];
    
    for (const k of Object.keys(clean)) {
      if (sensitiveKeys.some(s => k.toLowerCase().includes(s.toLowerCase()))) {
        clean[k] = '••••••••';
      } else if (typeof clean[k] === 'object') {
        clean[k] = this.sanitize(clean[k]);
      }
    }
    return clean;
  },

  createSafeError(genericMessage = 'A temporary system error occurred. Please try again.') {
    const correlationId = 'ERR-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    return {
      message: genericMessage,
      correlationId: correlationId
    };
  }
};
