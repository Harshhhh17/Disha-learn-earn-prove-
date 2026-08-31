/* ==============================================================================
   Disha Authentication API Routes
   Rate-limited OTP generation, verification, and JWT session issuance.
   ============================================================================== */

import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Memory store fallback helpers
const mem = db.getMemoryStore();

/**
 * POST /api/auth/request-otp
 * Generates single-use 6-digit OTP with 5-minute TTL
 */
router.post('/request-otp', async (req, res) => {
  try {
    const { identifier, channel } = req.body; // phone or email

    if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 5) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Please provide a valid phone number or email address.'
      });
    }

    const isPhone = /^[+0-9\s\-()]+$/.test(identifier.trim());
    const cleanId = isPhone ? identifier.replace(/[\s\-()]/g, '').trim() : identifier.trim().toLowerCase();

    // Check rate limit: max 5 requests per 5 minutes per identifier
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const otpHistory = await db.query(
      'SELECT count(*) FROM otp_requests WHERE identifier = $1 AND created_at > $2',
      [cleanId, fiveMinsAgo]
    );

    const recentCount = parseInt(otpHistory.rows[0]?.count || 0, 10);
    if (recentCount >= 5) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Maximum OTP requests exceeded. Please wait 5 minutes before trying again.'
      });
    }

    // Generate cryptographically secure 6-digit numeric OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const otpId = 'otp_' + crypto.randomBytes(8).toString('hex');

    // Save to Database
    await db.query(
      'INSERT INTO otp_requests (id, identifier, otp_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [otpId, cleanId, otpHash, expiresAt]
    );

    if (mem) {
      mem.otpRequests.set(cleanId, {
        id: otpId,
        otpHash,
        expiresAt,
        attempts: 0,
        isUsed: false,
        plainOtpDev: otpCode // for local testing only
      });
    }

    // In production, dispatch via Fast2SMS / Twilio / SendGrid
    console.log(`[AUTH SERVICE] OTP generated for ${cleanId.replace(/.(?=.{4})/g, '*')}`);

    res.json({
      success: true,
      message: 'OTP has been sent successfully.',
      validitySeconds: 300,
      // Provide preview in non-production for frictionless testing
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otpCode } : {})
    });
  } catch (err) {
    console.error('[Auth Error /request-otp]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process OTP request.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verifies 6-digit OTP, creates or loads user, creates wallet, and issues JWT
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, otp, termsAccepted = true, termsVersion = '1.0' } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Identifier and 6-digit OTP are required.'
      });
    }

    if (!termsAccepted) {
      return res.status(400).json({
        error: 'Terms Required',
        message: 'You must accept the Terms & Conditions and Privacy Policy to proceed.'
      });
    }

    const isPhone = /^[+0-9\s\-()]+$/.test(identifier.trim());
    const cleanId = isPhone ? identifier.replace(/[\s\-()]/g, '').trim() : identifier.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    // Load active OTP record
    let otpRecord = null;
    const dbOtp = await db.query(
      'SELECT id, otp_hash, attempts, is_used, expires_at FROM otp_requests WHERE identifier = $1 AND is_used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [cleanId]
    );

    if (dbOtp.rows.length > 0) {
      otpRecord = dbOtp.rows[0];
    } else if (mem && mem.otpRequests.has(cleanId)) {
      const m = mem.otpRequests.get(cleanId);
      if (!m.isUsed && m.expiresAt > new Date()) {
        otpRecord = m;
      }
    }

    if (!otpRecord) {
      return res.status(400).json({
        error: 'Invalid or Expired OTP',
        message: 'The OTP code is either invalid, expired, or has already been used.'
      });
    }

    // Check brute-force attempts on this specific OTP (max 5)
    if (otpRecord.attempts >= 5) {
      return res.status(429).json({
        error: 'Max Attempts Exceeded',
        message: 'Too many incorrect attempts on this OTP. Please request a new code.'
      });
    }

    // Verify Hash
    const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otp_hash || otpRecord.otpHash);
    if (!isMatch) {
      // Increment attempt counter
      await db.query('UPDATE otp_requests SET attempts = attempts + 1 WHERE id = $1', [otpRecord.id]);
      if (mem && mem.otpRequests.has(cleanId)) {
        mem.otpRequests.get(cleanId).attempts += 1;
      }

      return res.status(400).json({
        error: 'Incorrect OTP',
        message: 'The OTP entered is incorrect. Please try again.'
      });
    }

    // Invalidate OTP (single use)
    await db.query('UPDATE otp_requests SET is_used = TRUE WHERE id = $1', [otpRecord.id]);
    if (mem && mem.otpRequests.has(cleanId)) {
      mem.otpRequests.get(cleanId).isUsed = true;
    }

    // Find or create User
    let user = null;

    const userCheck = await db.query(
      isPhone ? 'SELECT * FROM users WHERE phone = $1' : 'SELECT * FROM users WHERE email = $1',
      [cleanId]
    );

    if (userCheck.rows.length > 0) {
      user = userCheck.rows[0];
    } else {
      // Create new user
      const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
      const defaultName = isPhone ? `Aspirant_${cleanId.slice(-4)}` : cleanId.split('@')[0];

      await db.query(
        `INSERT INTO users (id, phone, email, name, avatar, role) 
         VALUES ($1, $2, $3, $4, $5, 'USER')`,
        [userId, isPhone ? cleanId : null, isPhone ? null : cleanId, defaultName, '👨‍🎓']
      );

      // Create initialized Wallet with 0 paise
      const walletId = 'wal_' + crypto.randomBytes(6).toString('hex');
      await db.query(
        `INSERT INTO wallets (id, user_id, available_balance_paise, total_won_paise, total_withdrawn_paise) 
         VALUES ($1, $2, 0, 0, 0)`,
        [walletId, userId]
      );

      user = {
        id: userId,
        phone: isPhone ? cleanId : null,
        email: isPhone ? null : cleanId,
        name: defaultName,
        avatar: '👨‍🎓',
        role: 'USER',
        is_kyc_verified: false
      };

      if (mem) {
        mem.users.set(userId, user);
        mem.wallets.set(userId, {
          id: walletId,
          user_id: userId,
          available_balance_paise: 0,
          total_won_paise: 0,
          total_withdrawn_paise: 0,
          locked_balance_paise: 0
        });
      }
    }

    // Generate JWT Token
    const token = AuthMiddleware.generateToken(user);

    res.json({
      success: true,
      message: 'Welcome to Disha',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        isKycVerified: user.is_kyc_verified
      }
    });
  } catch (err) {
    console.error('[Auth Error /verify-otp]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to complete verification.' });
  }
});

/**
 * GET /api/auth/session
 * Returns authenticated session context
 */
router.get('/session', AuthMiddleware.authenticate, async (req, res) => {
  try {
    // Load fresh wallet summary
    const walletRes = await db.query(
      'SELECT available_balance_paise, total_won_paise, total_withdrawn_paise FROM wallets WHERE user_id = $1',
      [req.user.id]
    );

    const wallet = walletRes.rows[0] || (mem && mem.wallets.get(req.user.id)) || {
      available_balance_paise: 0,
      total_won_paise: 0,
      total_withdrawn_paise: 0
    };

    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        phone: req.user.phone,
        email: req.user.email,
        avatar: req.user.avatar,
        role: req.user.role,
        isKycVerified: req.user.is_kyc_verified,
        wallet: {
          availableBalancePaise: parseInt(wallet.available_balance_paise, 10) || 0,
          totalWonPaise: parseInt(wallet.total_won_paise, 10) || 0,
          totalWithdrawnPaise: parseInt(wallet.total_withdrawn_paise, 10) || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve session.' });
  }
});

/**
 * POST /api/auth/accept-terms
 * Records post-login Terms & Conditions and Privacy Policy agreement (Developer Spec Part B)
 */

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('disha_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

export default router;
