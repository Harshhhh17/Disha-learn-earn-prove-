/* ==============================================================================
   Disha Authentication & RBAC Middleware
   Verifies JWT signatures, loads active session, and enforces role boundaries.
   ============================================================================== */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { db } from '../config/db.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'disha_production_jwt_secret_change_in_env_2026';

export const AuthMiddleware = {
  /**
   * Authenticates user via Bearer token or Cookie
   */
  async authenticate(req, res, next) {
    try {
      let token = null;

      // 1. Check Authorization Header
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (req.cookies && req.cookies.disha_token) {
        token = req.cookies.disha_token;
      }

      if (!token) {
        return res.status(401).json({
          error: 'Authentication Required',
          message: 'Please sign in to access this resource.'
        });
      }

      // 2. Verify JWT signature
      const decoded = jwt.verify(token, JWT_SECRET);

      // 3. Load user context from DB
      const result = await db.query(
        'SELECT id, phone, email, name, avatar, role, is_kyc_verified FROM users WHERE id = $1',
        [decoded.userId]
      );

      const user = result.rows[0] || (db.getMemoryStore && db.getMemoryStore().users.get(decoded.userId));

      if (!user) {
        return res.status(401).json({
          error: 'Invalid Session',
          message: 'User account not found or session has been revoked.'
        });
      }

      req.user = user;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Session Expired',
          message: 'Your session has expired. Please sign in again.'
        });
      }
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token.'
      });
    }
  },

  /**
   * Enforces Role-Based Access Control (RBAC)
   * @param {string[]} allowedRoles Array of allowed roles: ['ADMIN', 'SUPER_ADMIN']
   */
  requireRole(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required.'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        // Log unauthorized privilege escalation attempt
        console.warn(`[Security Alert] User ${req.user.id} (${req.user.role}) attempted to access role-protected endpoint: ${req.originalUrl}`);
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access Denied: Insufficient administrative privileges.'
        });
      }

      next();
    };
  },

  /**
   * Generates a signed JWT token for a user
   */
  generateToken(user, expiresIn = '7d') {
    return jwt.sign(
      {
        userId: user.id,
        role: user.role,
        phone: user.phone,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn }
    );
  }
};
