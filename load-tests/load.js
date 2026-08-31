/* ==============================================================================
   Disha k6 Multi-Stage Production-Safe Load Test
   Simulates realistic peak live quiz concurrency (50 -> 100 -> 250 -> 500 -> 1,000 VUs)
   Realistic User Journey: Auth Check -> Tournaments -> Start Quiz -> 5 Question Answers -> Finish -> Wallet Ledger
   ============================================================================== */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG, getHeaders, getRandomThinkTime } from './config.js';

// Custom Application Performance Metrics
const quizLifecycleTrend = new Trend('quiz_lifecycle_duration');
const answerSubmitTrend = new Trend('answer_submit_duration');
const walletQueryTrend = new Trend('wallet_query_duration');
const successfulQuizzes = new Counter('successful_quizzes_completed');
const errorRate = new Rate('custom_error_rate');

export const options = __ENV.VUS ? {
  vus: parseInt(__ENV.VUS, 10),
  duration: __ENV.DURATION || '30s',
  thresholds: CONFIG.THRESHOLDS.load
} : {
  stages: [
    // Stage 1: Baseline Ramp & Hold (50 VUs)
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },

    // Stage 2: Medium Load (100 VUs)
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },

    // Stage 3: High Load (250 VUs)
    { duration: '30s', target: 250 },
    { duration: '1m', target: 250 },

    // Stage 4: Peak Tournament Load (500 VUs)
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },

    // Stage 5: Stress Tournament Load (1,000 VUs)
    { duration: '30s', target: 1000 },
    { duration: '1m', target: 1000 },

    // Recovery & Ramp Down
    { duration: '30s', target: 0 }
  ],
  thresholds: CONFIG.THRESHOLDS.load
};

// Setup: Generate or verify master test JWT token once in advance
export function setup() {
  const baseUrl = CONFIG.BASE_URL;
  if (CONFIG.AUTH.STATIC_TOKEN) {
    return { token: CONFIG.AUTH.STATIC_TOKEN };
  }

  const phone = '+919900000001';
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

  let token = null;
  if (vRes.status === 200) {
    try {
      token = JSON.parse(vRes.body).token;
    } catch (e) {}
  }

  return { token };
}

export default function (data) {
  const baseUrl = CONFIG.BASE_URL;
  const authToken = (data && data.token) || CONFIG.AUTH.STATIC_TOKEN;

  if (!authToken) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  // -------------------------------------------------------------
  // 1. EXPLORE DASHBOARD & TOURNAMENTS
  // -------------------------------------------------------------
  const tStart = Date.now();

  const tourRes = http.get(`${baseUrl}/api/quizzes/tournaments`, {
    headers: getHeaders(authToken, __VU),
    tags: { name: 'GetTournaments' }
  });
  check(tourRes, {
    'Tournaments loaded': (r) => r.status === 200
  });

  // Query User Wallet
  const wStart = Date.now();
  const walletRes = http.get(`${baseUrl}/api/wallet`, {
    headers: getHeaders(authToken, __VU),
    tags: { name: 'GetWallet', type: 'wallet_query' }
  });
  walletQueryTrend.add(Date.now() - wStart);
  check(walletRes, {
    'Wallet balance loaded': (r) => r.status === 200
  });

  sleep(getRandomThinkTime(0.3, 0.8));

  // -------------------------------------------------------------
  // 2. START LIVE TOURNAMENT QUIZ
  // -------------------------------------------------------------
  const tournamentId = CONFIG.QUIZ.DEFAULT_TOURNAMENT_ID;
  const startQuizRes = http.post(
    `${baseUrl}/api/quizzes/tournaments/${tournamentId}/start`,
    JSON.stringify({ client_source: 'mobile' }),
    { headers: getHeaders(authToken, __VU), tags: { name: 'StartQuiz' } }
  );

  const startOk = check(startQuizRes, {
    'Quiz attempt started successfully': (r) => r.status === 200
  });

  if (!startOk) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  let attemptData = null;
  try {
    attemptData = JSON.parse(startQuizRes.body);
  } catch (e) {
    errorRate.add(1);
    return;
  }

  const attemptId = attemptData.attemptId;
  const questions = attemptData.questions || [];

  // -------------------------------------------------------------
  // 3. ANSWER QUESTIONS IN SEQUENCE (REALISTIC STUDENT PACING)
  // -------------------------------------------------------------
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    
    // Think Time: Reading question & calculating answer (0.4s - 1.2s for benchmark)
    const thinkSec = getRandomThinkTime(0.4, 1.2);
    sleep(thinkSec);

    const clientResponseTimeMs = Math.round(thinkSec * 1000);
    const selectedOptionIndex = Math.floor(Math.random() * 4);

    const aStart = Date.now();
    const ansRes = http.post(
      `${baseUrl}/api/quizzes/attempts/${attemptId}/answer`,
      JSON.stringify({
        questionId: q.id,
        selectedOptionIndex,
        clientResponseTimeMs
      }),
      { headers: getHeaders(authToken, __VU), tags: { name: 'SubmitAnswer', type: 'quiz_answer' } }
    );
    answerSubmitTrend.add(Date.now() - aStart);

    check(ansRes, {
      'Answer graded successfully': (r) => r.status === 200
    });
  }

  // -------------------------------------------------------------
  // 4. FINALIZE QUIZ ATTEMPT & REWARD TRANSACTION
  // -------------------------------------------------------------
  const finishRes = http.post(
    `${baseUrl}/api/quizzes/attempts/${attemptId}/finish`,
    JSON.stringify({}),
    { headers: getHeaders(authToken, __VU), tags: { name: 'FinishQuiz' } }
  );

  const finishOk = check(finishRes, {
    'Quiz finalized and rank computed': (r) => r.status === 200
  });

  if (finishOk) {
    successfulQuizzes.add(1);
    quizLifecycleTrend.add(Date.now() - tStart);
  } else {
    errorRate.add(1);
  }

  // -------------------------------------------------------------
  // 5. VIEW UPDATED WALLET TRANSACTIONS
  // -------------------------------------------------------------
  sleep(0.3);
  const txRes = http.get(`${baseUrl}/api/wallet/transactions`, {
    headers: getHeaders(authToken, __VU),
    tags: { name: 'GetTransactions' }
  });
  check(txRes, {
    'Transactions ledger retrieved': (r) => r.status === 200
  });

  // Pacing before next iteration
  sleep(getRandomThinkTime(0.5, 1.5));
}
