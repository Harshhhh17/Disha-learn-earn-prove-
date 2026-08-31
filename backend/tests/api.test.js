/* ==============================================================================
   Disha Production Security & Functionality Automated Test Suite
   ============================================================================== */

import app from '../src/server.js';
import http from 'http';

let server;
let port = 4999;
let baseUrl = `http://localhost:${port}`;
let authToken = '';
let testUserId = '';
let attemptId = '';
let questionId = '';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING DISHA SERVER & SECURITY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Health Check Test
    console.log('[Test 1: Health Check Endpoint]');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /health returns status ok');

    // 2. OTP Request Test
    console.log('\n[Test 2: Authentication & OTP Generation]');
    const otpRes = await fetch(`${baseUrl}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '+919876543210' })
    });
    const otpData = await otpRes.json();
    assert(otpRes.status === 200 && otpData.success === true, 'POST /api/auth/request-otp generates OTP');
    const testOtp = otpData.devOtp || '123456';

    // 3. OTP Verification & JWT Issuance Test
    console.log('\n[Test 3: OTP Verification & JWT Issuance]');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '+919876543210', otp: testOtp })
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200 && verifyData.token, 'POST /api/auth/verify-otp returns valid JWT session');
    authToken = verifyData.token;
    testUserId = verifyData.user?.id;

    // 4. Session Context Test
    console.log('\n[Test 4: User Session & Wallet Loading]');
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const sessionData = await sessionRes.json();
    assert(sessionRes.status === 200 && sessionData.authenticated === true, 'GET /api/auth/session validates JWT');

    // 5. Server-Authoritative Quiz Start & Answer Stripping Test
    console.log('\n[Test 5: Quiz Security — Correct Answers Stripped]');
    const quizStartRes = await fetch(`${baseUrl}/api/quizzes/tournaments/live_maha_01/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const quizStartData = await quizStartRes.json();
    assert(quizStartRes.status === 200 && quizStartData.attemptId, 'POST /api/quizzes/tournaments/:id/start creates attempt');
    attemptId = quizStartData.attemptId;
    
    // Check that correct answers are NOT in the payload
    const hasExposedAnswer = quizStartData.questions.some(q => q.correct !== undefined || q.correct_option_index !== undefined);
    assert(!hasExposedAnswer, 'CRITICAL: Correct answers are stripped from client questions payload');
    questionId = quizStartData.questions[0]?.id || 'ssc_01';

    // 6. Server-Authoritative Answer Validation & Speed Bonus Test
    console.log('\n[Test 6: Server-Authoritative Scoring & Speed Bonus]');
    const answerRes = await fetch(`${baseUrl}/api/quizzes/attempts/${attemptId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        questionId: questionId,
        selectedOptionIndex: 2,
        clientResponseTimeMs: 3000
      })
    });
    const answerData = await answerRes.json();
    assert(answerRes.status === 200 && answerData.pointsAwarded !== undefined, 'POST /api/quizzes/attempts/:id/answer calculates score server-side');

    // 7. Tournament Finish & Atomic Prize Credit Test
    console.log('\n[Test 7: Tournament Finish & Prize Distribution]');
    const finishRes = await fetch(`${baseUrl}/api/quizzes/attempts/${attemptId}/finish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const finishData = await finishRes.json();
    assert(finishRes.status === 200 && finishData.status === 'COMPLETED', 'POST /api/quizzes/attempts/:id/finish finalizes attempt');

    // 8. Atomic Wallet & Withdrawal Verification Test
    console.log('\n[Test 8: Atomic Wallet Ledger & Withdrawal Verification]');
    // First deposit ₹500 for withdrawal test
    await fetch(`${baseUrl}/api/wallet/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ amountRupees: 500 })
    });

    const withdrawRes = await fetch(`${baseUrl}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({
        amountRupees: 150,
        bankDetails: { accountNumber: '••••4812', ifsc: 'HDFC0001234' }
      })
    });
    const withdrawData = await withdrawRes.json();
    assert(withdrawRes.status === 200 && withdrawData.success === true, 'POST /api/wallet/withdraw processes atomic withdrawal');

    // 9. Admin RBAC & Unauthorized Rejection Test
    console.log('\n[Test 9: Admin RBAC & Privilege Escalation Defense]');
    // Regular user attempting admin endpoint should receive 403 Forbidden
    const unauthAdminRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert(unauthAdminRes.status === 403, 'Regular user token rejected from /api/admin/stats with 403 Forbidden');

    // Admin Auth Endpoint
    const adminAuthRes = await fetch(`${baseUrl}/api/admin/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'disha@2026' })
    });
    const adminAuthData = await adminAuthRes.json();
    assert(adminAuthRes.status === 200 && adminAuthData.token, 'POST /api/admin/auth verifies master passcode and issues admin JWT');

    console.log('\n====================================================');
    console.log(`🏁 TEST SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test Execution Error:', err);
  } finally {
    if (server) server.close();
  }
}

// Start temporary test server
server = http.createServer(app);
server.listen(port, () => {
  runTests();
});
