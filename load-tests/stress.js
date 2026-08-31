/* ==============================================================================
   Disha k6 High-Concurrency Stress & Breakpoint Test
   Pushes the system from 250 to 2,500 VUs to determine breaking points,
   App Platform autoscaling response time, and PostgreSQL connection pool limits.
   ============================================================================== */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { CONFIG, getHeaders, getRandomThinkTime } from './config.js';

const stressDurationTrend = new Trend('stress_req_duration');
const stressErrorRate = new Rate('stress_error_rate');

export const options = {
  stages: [
    // Step 1: Rapid ramp to 250 VUs
    { duration: '1m', target: 250 },
    { duration: '2m', target: 250 },

    // Step 2: Push to 750 VUs (Trigger 1st Autoscale)
    { duration: '1m', target: 750 },
    { duration: '2m', target: 750 },

    // Step 3: Push to 1,500 VUs (Trigger Max Autoscale)
    { duration: '1m', target: 1500 },
    { duration: '2m', target: 1500 },

    // Step 4: Peak Stress (2,500 VUs)
    { duration: '1m', target: 2500 },
    { duration: '2m', target: 2500 },

    // Step 5: Cool down & Recovery
    { duration: '2m', target: 0 }
  ],
  thresholds: CONFIG.THRESHOLDS.stress
};

export default function () {
  const baseUrl = CONFIG.BASE_URL;
  const vuId = (__VU % CONFIG.AUTH.USER_POOL_SIZE) + 1;
  const testPhone = `+91990000${String(vuId).padStart(4, '0')}`;

  // 1. Health Probe
  const hRes = http.get(`${baseUrl}/health`, { headers: getHeaders(), tags: { name: 'Health' } });
  check(hRes, { 'Health ok': (r) => r.status === 200 });

  // 2. High-Frequency Tournament & Practice Browse
  const tRes = http.get(`${baseUrl}/api/quizzes/tournaments`, { headers: getHeaders(), tags: { name: 'Tournaments' } });
  check(tRes, { 'Tournaments ok': (r) => r.status === 200 });

  const cat = CONFIG.QUIZ.PRACTICE_CATEGORIES[Math.floor(Math.random() * CONFIG.QUIZ.PRACTICE_CATEGORIES.length)];
  const pRes = http.get(`${baseUrl}/api/quizzes/practice?category=${cat}`, { headers: getHeaders(), tags: { name: 'Practice' } });
  check(pRes, { 'Practice ok': (r) => r.status === 200 });

  // 3. User Session Auth & Wallet Check
  let token = CONFIG.AUTH.STATIC_TOKEN;
  if (!token) {
    const vRes = http.post(
      `${baseUrl}/api/auth/verify-otp`,
      JSON.stringify({ identifier: testPhone, otp: CONFIG.AUTH.DEFAULT_OTP }),
      { headers: getHeaders(), tags: { name: 'AuthVerify' } }
    );
    if (vRes.status === 200) {
      try { token = JSON.parse(vRes.body).token; } catch (e) {}
    }
  }

  if (token) {
    const start = Date.now();
    const wRes = http.get(`${baseUrl}/api/wallet`, { headers: getHeaders(token), tags: { name: 'Wallet' } });
    stressDurationTrend.add(Date.now() - start);

    const ok = check(wRes, { 'Wallet ok': (r) => r.status === 200 });
    if (!ok) {
      stressErrorRate.add(1);
    }
  }

  sleep(getRandomThinkTime(0.5, 2.0));
}
