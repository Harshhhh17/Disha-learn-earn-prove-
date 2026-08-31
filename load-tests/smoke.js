/* ==============================================================================
   Disha k6 Smoke Test Suite (Updated with Token Caching & Expected 401 Status)
   Validates basic API health, route availability, authentication, and core read flows.
   Target: 3 Virtual Users (VUs) for 30 seconds.
   ============================================================================== */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG, getHeaders, getRandomThinkTime } from './config.js';

export const options = {
  vus: 3,
  duration: '30s',
  thresholds: CONFIG.THRESHOLDS.smoke
};

// Global Setup: Issue test tokens in advance
export function setup() {
  const baseUrl = CONFIG.BASE_URL;
  const tokens = {};

  for (let i = 1; i <= 5; i++) {
    const phone = `+91990000000${i}`;
    const reqOtp = http.post(
      `${baseUrl}/api/auth/request-otp`,
      JSON.stringify({ identifier: phone }),
      { headers: getHeaders() }
    );
    let otpCode = CONFIG.AUTH.DEFAULT_OTP;
    try {
      const b = JSON.parse(reqOtp.body);
      if (b.devOtp) otpCode = b.devOtp;
    } catch (e) {}

    const vRes = http.post(
      `${baseUrl}/api/auth/verify-otp`,
      JSON.stringify({ identifier: phone, otp: otpCode }),
      { headers: getHeaders() }
    );

    if (vRes.status === 200) {
      try {
        tokens[i] = JSON.parse(vRes.body).token;
      } catch (e) {}
    }
  }

  return { tokens };
}

export default function (data) {
  const baseUrl = CONFIG.BASE_URL;
  const vuId = ((__VU - 1) % 5) + 1;
  const authToken = (data && data.tokens && data.tokens[vuId]) || CONFIG.AUTH.STATIC_TOKEN;

  // 1. Health Check Endpoint
  const healthRes = http.get(`${baseUrl}/health`, {
    headers: getHeaders(),
    tags: { name: 'HealthCheck' }
  });
  check(healthRes, {
    'Health Check is HTTP 200': (r) => r.status === 200,
    'Health Check Status is healthy/ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'healthy' || body.status === 'ok';
      } catch (e) {
        return false;
      }
    }
  });

  sleep(0.3);

  // 2. Fetch Active Tournaments
  const tourRes = http.get(`${baseUrl}/api/quizzes/tournaments`, {
    headers: getHeaders(),
    tags: { name: 'GetTournaments' }
  });
  check(tourRes, {
    'Tournaments endpoint is HTTP 200': (r) => r.status === 200,
    'Tournaments list is returned': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.quizzes);
      } catch (e) {
        return false;
      }
    }
  });

  sleep(0.3);

  // 3. Fetch Practice Questions
  const practiceRes = http.get(`${baseUrl}/api/quizzes/practice?category=SSC`, {
    headers: getHeaders(),
    tags: { name: 'GetPracticeQuestions' }
  });
  check(practiceRes, {
    'Practice endpoint is HTTP 200': (r) => r.status === 200,
    'Practice questions array returned': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.questions);
      } catch (e) {
        return false;
      }
    }
  });

  sleep(0.3);

  // 4. Authenticated Wallet Query
  if (authToken) {
    const walletRes = http.get(`${baseUrl}/api/wallet`, {
      headers: getHeaders(authToken),
      tags: { name: 'GetWallet', type: 'wallet_query' }
    });
    check(walletRes, {
      'Wallet endpoint is HTTP 200': (r) => r.status === 200,
      'Wallet balance object is present': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true && body.wallet !== undefined;
        } catch (e) {
          return false;
        }
      }
    });

    // 5. Authenticated Transaction Ledger Query
    const txRes = http.get(`${baseUrl}/api/wallet/transactions`, {
      headers: getHeaders(authToken),
      tags: { name: 'GetTransactions' }
    });
    check(txRes, {
      'Transactions endpoint is HTTP 200': (r) => r.status === 200
    });
  }

  // 6. Security Boundary Check (Unauthenticated request must be rejected with 401)
  const unauthRes = http.post(
    `${baseUrl}/api/payments/create-order`,
    JSON.stringify({ amountRupees: 500 }),
    {
      headers: getHeaders(null),
      tags: { name: 'SecurityBoundaryCheck' },
      responseCallback: http.expectedStatuses(401)
    }
  );
  check(unauthRes, {
    'Unauthenticated payment route is rejected with HTTP 401': (r) => r.status === 401
  });

  sleep(getRandomThinkTime(1.0, 2.0));
}
