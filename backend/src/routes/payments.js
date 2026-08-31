/* ==============================================================================
   Disha Payment Routes (Razorpay Gateway Integration)
   Handles server-authoritative order creation, HMAC signature verification,
   and idempotent webhook processing with PostgreSQL ledger transactions.
   ============================================================================== */

import express from 'express';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { AuthMiddleware } from '../middleware/auth.js';
import { RazorpayService } from '../services/razorpay.js';

const router = express.Router();
const mem = db.getMemoryStore();

// Ensure memory store has paymentOrders map
if (mem && !mem.paymentOrders) {
  mem.paymentOrders = new Map();
}

/**
 * POST /api/payments/create-order
 * Authenticated order creation with server-validated bounds
 */
router.post('/create-order', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amountRupees, purpose = 'WALLET_DEPOSIT', referenceId = null } = req.body;

    const amt = parseFloat(amountRupees);
    if (purpose === 'DONATION') {
      if (isNaN(amt) || !isFinite(amt) || amt < 10 || amt > 100000) {
        return res.status(400).json({
          error: 'Invalid Amount',
          message: 'Donation amount must be between ₹10.00 and ₹1,00,000.00.'
        });
      }
    } else {
      if (isNaN(amt) || !isFinite(amt) || amt < 50 || amt > 100000) {
        return res.status(400).json({
          error: 'Invalid Amount',
          message: 'Deposit amount must be between ₹50.00 and ₹1,00,000.00.'
        });
      }
    }

    const amountPaise = Math.round(amt * 100);
    const orderReceipt = 'rcpt_' + crypto.randomBytes(6).toString('hex');

    // 1. Create order via Razorpay Service
    const rzpOrder = await RazorpayService.createOrder({
      amountPaise,
      currency: 'INR',
      receipt: orderReceipt,
      notes: {
        userId,
        purpose,
        referenceId: referenceId || ''
      }
    });

    const internalOrderId = 'pay_ord_' + crypto.randomBytes(8).toString('hex');

    // 2. Persist order into PostgreSQL payment_orders table
    await db.query(
      `INSERT INTO payment_orders (id, user_id, razorpay_order_id, amount_paise, currency, purpose, reference_id, status)
       VALUES ($1, $2, $3, $4, 'INR', $5, $6, 'CREATED')`,
      [internalOrderId, userId, rzpOrder.id, amountPaise, purpose, referenceId]
    );

    if (mem) {
      mem.paymentOrders.set(rzpOrder.id, {
        id: internalOrderId,
        userId,
        razorpayOrderId: rzpOrder.id,
        amountPaise,
        currency: 'INR',
        purpose,
        referenceId,
        status: 'CREATED',
        createdAt: new Date()
      });
    }

    // 3. Return client payload (Zero secrets exposed)
    res.json({
      success: true,
      orderId: internalOrderId,
      razorpayOrderId: rzpOrder.id,
      amountPaise,
      amountRupees: (amountPaise / 100).toFixed(2),
      currency: 'INR',
      purpose,
      keyId: RazorpayService.getKeyId(),
      mode: RazorpayService.getPaymentMode()
    });
  } catch (err) {
    console.error('[Payment Error /create-order]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initialize payment order.' });
  }
});

/**
 * POST /api/payments/verify
 * Verifies client return signature and atomically credits wallet balance
 */
router.post('/verify', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Order ID, Payment ID, and Signature are required for verification.'
      });
    }

    // 1. Fetch order record from Database
    let order = null;
    const dbOrder = await db.query(
      'SELECT id, user_id, amount_paise, purpose, status FROM payment_orders WHERE razorpay_order_id = $1',
      [razorpay_order_id]
    );

    if (dbOrder.rows.length > 0) {
      order = dbOrder.rows[0];
    } else if (mem && mem.paymentOrders.has(razorpay_order_id)) {
      order = mem.paymentOrders.get(razorpay_order_id);
    }

    if (!order) {
      return res.status(404).json({ error: 'Not Found', message: 'Payment order not found.' });
    }

    // 2. IDOR Ownership Check
    if (order.user_id !== userId && order.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You cannot verify another user’s payment order.' });
    }

    const orderAmountPaise = parseInt(order.amount_paise || order.amountPaise, 10);
    const orderPurpose = order.purpose || 'WALLET_DEPOSIT';

    // 3. Idempotency Check: If already captured, return success without double credit
    if (order.status === 'CAPTURED') {
      let currentBal = 0;
      const walRes = await db.query('SELECT available_balance_paise FROM wallets WHERE user_id = $1', [userId]);
      if (walRes.rows.length > 0) {
        currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
      }
      return res.json({
        success: true,
        replayed: true,
        purpose: orderPurpose,
        amountRupees: (orderAmountPaise / 100).toFixed(2),
        availableBalanceRupees: (currentBal / 100).toFixed(2),
        message: 'Payment was already verified.'
      });
    }

    // 4. Verify Cryptographic Signature
    const isValid = RazorpayService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValid) {
      // Mark as failed
      await db.query(
        'UPDATE payment_orders SET status = $1, error_code = $2, error_description = $3, updated_at = NOW() WHERE razorpay_order_id = $4',
        ['FAILED', 'INVALID_SIGNATURE', 'HMAC-SHA256 signature verification failed', razorpay_order_id]
      );
      if (mem && mem.paymentOrders.has(razorpay_order_id)) {
        mem.paymentOrders.get(razorpay_order_id).status = 'FAILED';
      }
      return res.status(400).json({ error: 'Invalid Signature', message: 'Payment signature verification failed.' });
    }

    // 5. ATOMIC WALLET CREDIT OR ISOLATED DONATION LEDGER
    let newBal = 0;
    const txId = (orderPurpose === 'DONATION' ? 'TXN-DON-' : 'TXN-DEP-') + crypto.randomBytes(4).toString('hex').toUpperCase();

    await db.transaction(async (client) => {
      // Mark order captured
      await client.query(
        `UPDATE payment_orders 
         SET status = 'CAPTURED', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = NOW() 
         WHERE razorpay_order_id = $3`,
        [razorpay_payment_id, razorpay_signature, razorpay_order_id]
      );

      // Lock and fetch wallet
      const walRes = await client.query(
        'SELECT available_balance_paise FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      let currentBal = 0;
      if (walRes.rows.length > 0) {
        currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
      }

      if (orderPurpose === 'DONATION') {
        newBal = currentBal; // No playable wallet credit for voluntary donations
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, idempotency_key, status, description)
           VALUES ($1, $2, 'DONATION', $3, $4, $5, $6, 'SUCCESS', 'Voluntary Support / Donation to Disha')`,
          [txId, userId, orderAmountPaise, newBal, razorpay_payment_id, 'rzp_ord_' + razorpay_order_id]
        );
      } else {
        newBal = currentBal + orderAmountPaise;
        await client.query(
          'UPDATE wallets SET available_balance_paise = $1, updated_at = NOW() WHERE user_id = $2',
          [newBal, userId]
        );

        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, idempotency_key, status, description)
           VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, $6, 'SUCCESS', 'Wallet Top-up via Razorpay')`,
          [txId, userId, orderAmountPaise, newBal, razorpay_payment_id, 'rzp_ord_' + razorpay_order_id]
        );
      }

      // Log to audit trail
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, actor_role, action, details, ip_address)
         VALUES ($1, $2, 'USER', 'PAYMENT_CAPTURED', $3, $4)`,
        [
          'aud_' + crypto.randomBytes(6).toString('hex'),
          userId,
          JSON.stringify({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, amountPaise: orderAmountPaise, purpose: orderPurpose }),
          req.ip
        ]
      );
    });

    if (mem) {
      if (mem.paymentOrders.has(razorpay_order_id)) {
        mem.paymentOrders.get(razorpay_order_id).status = 'CAPTURED';
      }
      if (orderPurpose !== 'DONATION' && mem.wallets.has(userId)) {
        mem.wallets.get(userId).available_balance_paise = newBal;
      }
    }

    res.json({
      success: true,
      purpose: orderPurpose,
      transactionId: txId,
      amountRupees: (orderAmountPaise / 100).toFixed(2),
      availableBalanceRupees: (newBal / 100).toFixed(2),
      message: orderPurpose === 'DONATION'
        ? 'Thank you for voluntarily supporting Disha! Your contribution helps keep our educational platform running.'
        : 'Payment verified and wallet credited successfully.'
    });
    return;

    if (mem) {
      if (mem.paymentOrders.has(razorpay_order_id)) {
        const o = mem.paymentOrders.get(razorpay_order_id);
        o.status = 'CAPTURED';
        o.razorpayPaymentId = razorpay_payment_id;
      }
      if (mem.wallets.has(userId)) {
        const w = mem.wallets.get(userId);
        w.available_balance_paise = (w.available_balance_paise || 0) + orderAmountPaise;
      }
    }

    res.json({
      success: true,
      amountRupees: (orderAmountPaise / 100).toFixed(2),
      newBalanceRupees: (newBal / 100).toFixed(2),
      transactionId: txId,
      message: 'Payment verified and wallet credited successfully.'
    });
  } catch (err) {
    console.error('[Payment Error /verify]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify payment.' });
  }
});

/**
 * POST /api/payments/webhook
 * Razorpay server-to-server webhook handler
 * Verifies X-Razorpay-Signature and idempotently processes payment events
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({ error: 'Bad Request', message: 'Missing Razorpay webhook signature.' });
    }

    // 1. Verify Webhook HMAC Signature
    const isValid = RazorpayService.verifyWebhookSignature({
      rawBody,
      signature
    });

    if (!isValid) {
      console.warn('[Razorpay Webhook] Signature verification failed from IP:', req.ip);
      return res.status(400).json({ error: 'Invalid Signature', message: 'Webhook signature verification failed.' });
    }

    const event = req.body;
    const eventType = event.event;
    console.log(`[Razorpay Webhook] Received verified event: ${eventType}`);

    // 2. Process Event
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity || {};
      const rzpOrderId = paymentEntity.order_id || event.payload?.order?.entity?.id;
      const rzpPaymentId = paymentEntity.id;
      const paymentMethod = paymentEntity.method || 'upi';

      if (rzpOrderId) {
        // Fetch order from DB
        const dbOrder = await db.query(
          'SELECT id, user_id, amount_paise, status FROM payment_orders WHERE razorpay_order_id = $1',
          [rzpOrderId]
        );

        if (dbOrder.rows.length > 0) {
          const order = dbOrder.rows[0];
          const userId = order.user_id;
          const orderAmountPaise = parseInt(order.amount_paise, 10);

          // Idempotent check: Credit ONLY if not already captured
          if (order.status !== 'CAPTURED') {
            const txId = 'TXN-DEP-' + crypto.randomBytes(4).toString('hex').toUpperCase();

            await db.transaction(async (client) => {
              await client.query(
                `UPDATE payment_orders 
                 SET status = 'CAPTURED', razorpay_payment_id = $1, payment_method = $2, webhook_payload = $3, updated_at = NOW() 
                 WHERE razorpay_order_id = $4`,
                [rzpPaymentId, paymentMethod, JSON.stringify(event), rzpOrderId]
              );

              const walRes = await client.query(
                'SELECT available_balance_paise FROM wallets WHERE user_id = $1 FOR UPDATE',
                [userId]
              );

              let currentBal = 0;
              if (walRes.rows.length > 0) {
                currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
              }

              const newBal = currentBal + orderAmountPaise;

              await client.query(
                'UPDATE wallets SET available_balance_paise = $1, updated_at = NOW() WHERE user_id = $2',
                [newBal, userId]
              );

              await client.query(
                `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, idempotency_key, status, description)
                 VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, $6, 'SUCCESS', 'Wallet Top-up via Razorpay Webhook')
                 ON CONFLICT (idempotency_key) DO NOTHING`,
                [txId, userId, orderAmountPaise, newBal, rzpPaymentId, 'rzp_ord_' + rzpOrderId]
              );

              await client.query(
                `INSERT INTO audit_logs (id, actor_id, actor_role, action, details, ip_address)
                 VALUES ($1, $2, 'SYSTEM', 'WEBHOOK_PAYMENT_CAPTURED', $3, $4)`,
                ['aud_' + crypto.randomBytes(6).toString('hex'), userId, JSON.stringify({ rzpOrderId, rzpPaymentId }), req.ip]
              );
            });

            console.log(`[Razorpay Webhook] Successfully credited ₹${orderAmountPaise / 100} to user ${userId}`);
          }
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = event.payload?.payment?.entity || {};
      const rzpOrderId = paymentEntity.order_id;
      const errCode = paymentEntity.error_code || 'PAYMENT_FAILED';
      const errDesc = paymentEntity.error_description || 'Payment failed at gateway';

      if (rzpOrderId) {
        await db.query(
          `UPDATE payment_orders 
           SET status = 'FAILED', error_code = $1, error_description = $2, webhook_payload = $3, updated_at = NOW() 
           WHERE razorpay_order_id = $4`,
          [errCode, errDesc, JSON.stringify(event), rzpOrderId]
        );
      }
    }

    res.json({ status: 'ok', message: 'Webhook event processed.' });
  } catch (err) {
    console.error('[Razorpay Webhook Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to process webhook.' });
  }
});

/**
 * GET /api/payments/orders/:orderId
 * Retrieve order status
 */
router.get('/orders/:orderId', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const result = await db.query(
      'SELECT id, razorpay_order_id, razorpay_payment_id, amount_paise, status, purpose, created_at FROM payment_orders WHERE (id = $1 OR razorpay_order_id = $1) AND user_id = $2',
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Order not found.' });
    }

    const o = result.rows[0];
    res.json({
      success: true,
      order: {
        id: o.id,
        razorpayOrderId: o.razorpay_order_id,
        razorpayPaymentId: o.razorpay_payment_id,
        amountRupees: (parseInt(o.amount_paise, 10) / 100).toFixed(2),
        status: o.status,
        purpose: o.purpose,
        createdAt: o.created_at
      }
    });
  } catch (err) {
    console.error('[Payment Error /orders/:orderId]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch order.' });
  }
});

export default router;
