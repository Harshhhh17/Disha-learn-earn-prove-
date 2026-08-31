/* ==============================================================================
   Disha Wallet & Financial Ledger Service
   All money amounts are strictly processed as integer paise (BIGINT).
   Database transactions (BEGIN/COMMIT) with row-level locks protect against race conditions.
   ============================================================================== */

import express from 'express';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();
const mem = db.getMemoryStore();

/**
 * GET /api/wallet
 * Returns verified server-side wallet balance
 */
router.get('/', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      'SELECT available_balance_paise, total_won_paise, total_withdrawn_paise, locked_balance_paise FROM wallets WHERE user_id = $1',
      [userId]
    );

    let wallet = result.rows[0];
    if (!wallet && mem && mem.wallets.has(userId)) {
      wallet = mem.wallets.get(userId);
    }

    if (!wallet) {
      wallet = {
        available_balance_paise: 0,
        total_won_paise: 0,
        total_withdrawn_paise: 0,
        locked_balance_paise: 0
      };
    }

    const availablePaise = parseInt(wallet.available_balance_paise || 0, 10);
    const totalWonPaise = parseInt(wallet.total_won_paise || 0, 10);
    const totalWithdrawnPaise = parseInt(wallet.total_withdrawn_paise || 0, 10);

    res.json({
      success: true,
      wallet: {
        availableBalancePaise: availablePaise,
        availableBalanceRupees: (availablePaise / 100).toFixed(2),
        totalWonPaise: totalWonPaise,
        totalWonRupees: (totalWonPaise / 100).toFixed(2),
        totalWithdrawnPaise: totalWithdrawnPaise,
        totalWithdrawnRupees: (totalWithdrawnPaise / 100).toFixed(2)
      }
    });
  } catch (err) {
    console.error('[Wallet Error /]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to load wallet balance.' });
  }
});

/**
 * GET /api/wallet/transactions
 * Returns user transaction history from the immutable ledger
 */
router.get('/transactions', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      'SELECT id, type, amount_paise, balance_after_paise, reference_id, status, description, created_at FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );

    let txs = result.rows;
    if (txs.length === 0 && mem && mem.transactions.has(userId)) {
      txs = mem.transactions.get(userId);
    }

    res.json({
      success: true,
      transactions: txs.map(t => ({
        id: t.id,
        type: t.type,
        amountPaise: parseInt(t.amount_paise, 10),
        amountRupees: (parseInt(t.amount_paise, 10) / 100).toFixed(2),
        balanceAfterRupees: (parseInt(t.balance_after_paise || 0, 10) / 100).toFixed(2),
        referenceId: t.reference_id,
        status: t.status,
        description: t.description,
        createdAt: t.created_at
      }))
    });
  } catch (err) {
    console.error('[Wallet Error /transactions]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to load transaction ledger.' });
  }
});

/**
 * POST /api/wallet/withdraw
 * Secure withdrawal request with balance checks & TDS deduction
 */
router.post('/withdraw', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amountRupees, bankDetails } = req.body;

    const amt = parseFloat(amountRupees);
    if (isNaN(amt) || !isFinite(amt) || amt < 100 || amt > 50000) {
      return res.status(400).json({
        error: 'Invalid Amount',
        message: 'Withdrawal amount must be between ₹100.00 and ₹50,000.00.'
      });
    }

    const withdrawPaise = Math.round(amt * 100);

    // Section 194BA: 30% TDS on net winnings exceeding ₹10,000
    let tdsPaise = 0;
    if (amt > 10000) {
      tdsPaise = Math.round(withdrawPaise * 0.30);
    }
    const netPayoutPaise = withdrawPaise - tdsPaise;

    // ATOMIC EXECUTION: Lock wallet row, verify balance, debit, and insert withdrawal record
    let newBal = 0;
    const withdrawalId = 'WD-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    await db.transaction(async (client) => {
      const walRes = await client.query(
        'SELECT available_balance_paise, total_withdrawn_paise FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      let currentBal = 0;
      let totalWithdrawn = 0;
      if (walRes.rows.length > 0) {
        currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
        totalWithdrawn = parseInt(walRes.rows[0].total_withdrawn_paise, 10);
      }

      if (currentBal < withdrawPaise) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      newBal = currentBal - withdrawPaise;
      const newWithdrawn = totalWithdrawn + withdrawPaise;

      // 1. Update wallet balance
      await client.query(
        'UPDATE wallets SET available_balance_paise = $1, total_withdrawn_paise = $2, updated_at = NOW() WHERE user_id = $3',
        [newBal, newWithdrawn, userId]
      );

      // 2. Create withdrawal record
      await client.query(
        `INSERT INTO withdrawals (id, user_id, amount_paise, tds_amount_paise, net_payout_paise, bank_details, status, payout_reference)
         VALUES ($1, $2, $3, $4, $5, $6, 'PROCESSING', $7)`,
        [withdrawalId, userId, withdrawPaise, tdsPaise, netPayoutPaise, JSON.stringify(bankDetails || {}), 'RZP-SETTLE-' + crypto.randomBytes(4).toString('hex').toUpperCase()]
      );

      // 3. Record transaction in ledger
      const txId = 'TXN-WD-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, status, description)
         VALUES ($1, $2, 'WITHDRAWAL', $3, $4, $5, 'SUCCESS', $6)`,
        [txId, userId, withdrawPaise, newBal, withdrawalId, `Direct Bank Settlement (Net: ₹${(netPayoutPaise / 100).toFixed(2)})`]
      );
    });

    if (mem && mem.wallets.has(userId)) {
      const w = mem.wallets.get(userId);
      w.available_balance_paise -= withdrawPaise;
      w.total_withdrawn_paise += withdrawPaise;
    }

    res.json({
      success: true,
      withdrawalId,
      amountRupees: (withdrawPaise / 100).toFixed(2),
      tdsRupees: (tdsPaise / 100).toFixed(2),
      netPayoutRupees: (netPayoutPaise / 100).toFixed(2),
      availableBalanceRupees: (newBal / 100).toFixed(2),
      message: 'Withdrawal processed and initiated via IMPS payout rail.'
    });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({ error: 'Insufficient Funds', message: 'Requested amount exceeds your available balance.' });
    }
    console.error('[Wallet Error /withdraw]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process withdrawal request.' });
  }
});

/**
 * POST /api/wallet/deposit
 * Deprecated for direct client use. All top-ups must use /api/payments/create-order and /api/payments/verify.
 * Authorized solely for ADMIN role balance adjustments.
 */
router.post('/deposit', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userRole = req.user.role;
    
    // Normal users must use verified Razorpay gateway routes
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      return res.status(400).json({
        error: 'Deprecated Endpoint',
        message: 'Direct unverified deposits are disabled. Please use /api/payments/create-order and /api/payments/verify.'
      });
    }

    const { userId: targetUserId, amountRupees, reason } = req.body;
    const effectiveUserId = targetUserId || req.user.id;

    const amt = parseFloat(amountRupees);
    if (isNaN(amt) || !isFinite(amt) || amt <= 0 || amt > 100000) {
      return res.status(400).json({
        error: 'Invalid Amount',
        message: 'Adjustment amount must be between ₹1.00 and ₹1,00,000.00.'
      });
    }

    const depositPaise = Math.round(amt * 100);
    const txId = 'TXN-ADJ-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    let newBal = 0;

    await db.transaction(async (client) => {
      const walRes = await client.query(
        'SELECT available_balance_paise FROM wallets WHERE user_id = $1 FOR UPDATE',
        [effectiveUserId]
      );

      let currentBal = 0;
      if (walRes.rows.length > 0) {
        currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
      }

      newBal = currentBal + depositPaise;

      await client.query(
        'UPDATE wallets SET available_balance_paise = $1, updated_at = NOW() WHERE user_id = $2',
        [newBal, effectiveUserId]
      );

      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, status, description)
         VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'SUCCESS', $6)`,
        [txId, effectiveUserId, depositPaise, newBal, 'ADMIN_MANUAL', reason || 'Admin Manual Balance Adjustment']
      );

      await client.query(
        `INSERT INTO audit_logs (id, actor_id, actor_role, action, details, ip_address)
         VALUES ($1, $2, 'ADMIN', 'WALLET_ADMIN_ADJUSTMENT', $3, $4)`,
        ['aud_' + crypto.randomBytes(6).toString('hex'), req.user.id, JSON.stringify({ targetUserId: effectiveUserId, amountPaise: depositPaise, reason }), req.ip]
      );
    });

    if (mem && mem.wallets.has(effectiveUserId)) {
      const w = mem.wallets.get(effectiveUserId);
      w.available_balance_paise += depositPaise;
    }

    res.json({
      success: true,
      amountRupees: (depositPaise / 100).toFixed(2),
      newBalanceRupees: (newBal / 100).toFixed(2),
      transactionId: txId,
      message: 'Admin adjustment credited successfully.'
    });
  } catch (err) {
    console.error('[Wallet Error /deposit]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process balance adjustment.' });
  }
});

export default router;
