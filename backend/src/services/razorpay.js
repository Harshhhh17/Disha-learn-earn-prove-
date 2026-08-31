/* ==============================================================================
   Disha Razorpay Payment Service (Test & Live Mode Support)
   Handles server-authoritative order creation, HMAC-SHA256 signature validation,
   and webhook signature verification. Secrets never exposed to client.
   ============================================================================== */

import crypto from 'crypto';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_disha_dummy_key';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'disha_test_key_secret_2026';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'disha_test_webhook_secret_2026';
const PAYMENT_MODE = process.env.PAYMENT_MODE || 'test'; // 'test' or 'live'

export const RazorpayService = {
  getKeyId() {
    return RAZORPAY_KEY_ID;
  },

  getPaymentMode() {
    return PAYMENT_MODE;
  },

  /**
   * Create an Order with Razorpay API (or test-mode generator)
   * @param {Object} params - { amountPaise, currency, receipt, notes }
   * @returns {Promise<Object>} Order details
   */
  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    if (!amountPaise || amountPaise <= 0) {
      throw new Error('Invalid order amount.');
    }

    // If live/real test API credentials are provided (non-dummy)
    if (RAZORPAY_KEY_ID && !RAZORPAY_KEY_ID.includes('dummy') && RAZORPAY_KEY_SECRET && !RAZORPAY_KEY_SECRET.includes('dummy')) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          amount: amountPaise,
          currency,
          receipt: receipt || ('rcpt_' + Date.now()),
          notes
        });

        const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const options = {
          hostname: 'api.razorpay.com',
          port: 443,
          path: '/v1/orders',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': authHeader
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({
                  id: json.id,
                  amount: json.amount,
                  currency: json.currency,
                  receipt: json.receipt,
                  status: json.status,
                  createdAt: json.created_at
                });
              } else {
                reject(new Error(json.error?.description || `Razorpay Order Error (HTTP ${res.statusCode})`));
              }
            } catch (err) {
              reject(err);
            }
          });
        });

        req.on('error', (e) => reject(e));
        req.write(payload);
        req.end();
      });
    }

    // Local Test Mode Generator (Predictable, cryptographically compliant test orders)
    const testOrderId = 'order_' + crypto.randomBytes(10).toString('hex');
    return {
      id: testOrderId,
      amount: amountPaise,
      currency,
      receipt: receipt || ('rcpt_' + Date.now()),
      status: 'created',
      createdAt: Math.floor(Date.now() / 1000)
    };
  },

  /**
   * Verify Client Payment Signature
   * Signature = HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return false;
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(razorpay_signature, 'utf8')
    );
  },

  /**
   * Generate valid signature helper for test mode client/test suites
   */
  generateTestPaymentSignature(orderId, paymentId) {
    const payload = `${orderId}|${paymentId}`;
    return crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');
  },

  /**
   * Verify Razorpay Webhook Signature
   * Signature = HMAC-SHA256(raw_body, webhook_secret)
   */
  verifyWebhookSignature({ rawBody, signature }) {
    if (!rawBody || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  },

  /**
   * Generate valid webhook signature for test mode / test suite
   */
  generateTestWebhookSignature(rawBody) {
    return crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
  }
};
