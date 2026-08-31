# Disha Load & Performance Testing System (k6)

This directory contains the production-safe, automated performance and load-testing suite for the **Disha Learn Earn Pro** platform built with [Grafana k6](https://k6.io/).

---

## 1. Directory Structure

```
load-tests/
├── config.js              # Centralized configuration, endpoints, SLAs & pacing helpers
├── smoke.js               # Smoke test (3 VUs, 30s) for health and route validation
├── load.js                # Multi-stage load test (50 -> 100 -> 250 -> 500 -> 1,000 VUs)
├── stress.js              # High-concurrency stress test (up to 2,500 VUs)
├── README.md              # Documentation & execution guide
└── LOAD_TEST_REPORT.md    # Test execution results & bottleneck analysis template
```

---

## 2. Installation of k6

### Windows (winget / Chocolatey):
```powershell
winget install k6 --source winget
# or
choco install k6
```

### macOS (Homebrew):
```bash
brew install k6
```

### Linux (Debian / Ubuntu):
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Docker (Zero-Install):
```bash
docker run --rm -i -v ${PWD}/load-tests:/load-tests grafana/k6 run /load-tests/smoke.js
```

---

## 3. Test Suites & Commands

### A. Smoke Test (Sanity & Connectivity Verification)
Verifies that all API routes, health probes, authentication mechanisms, and wallet endpoints respond correctly before increasing traffic.
```powershell
# Against Local / Staging
k6 run load-tests/smoke.js

# Against DigitalOcean Staging / Production
k6 run -e BASE_URL=https://disha-api-xxx.ondigitalocean.app load-tests/smoke.js
```

### B. Multi-Stage Load Test (Realistic Quiz Tournament Flow)
Simulates full end-to-end user journeys:
`User Auth Check → Browse Tournaments → Start Quiz → 5 Question Submissions (1.5s–3.5s Think Time) → Finish Quiz & Leaderboard → Check Ledger`.

```powershell
# Execute 15-minute multi-stage load progression (50 -> 100 -> 250 -> 500 -> 1,000 VUs)
k6 run -e BASE_URL=https://disha-api-xxx.ondigitalocean.app load-tests/load.js
```

### C. Stress & Breakpoint Test
Pushes traffic up to 2,500 VUs to determine the breaking point and verify that DigitalOcean App Platform autoscaling triggers reliably.
```powershell
k6 run -e BASE_URL=https://disha-api-xxx.ondigitalocean.app load-tests/stress.js
```

---

## 4. Environment Variables Configuration

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:3000` | Target backend URL without trailing slash. |
| `TEST_PHONE` | `+91 9900000001` | Test phone number seed for synthetic load generation. |
| `TEST_OTP` | `123456` | Test OTP code for verification. |
| `AUTH_TOKEN` | `null` | Optional pre-generated JWT token to bypass repeated OTP requests during tests. |
| `USER_POOL_SIZE` | `100` | Size of the synthetic user pool across VUs. |

---

## 5. Performance Thresholds (SLAs)

| Metric | Target SLA | Description |
| :--- | :--- | :--- |
| `http_req_failed` | `< 1.0%` | Less than 1% failed requests under normal load. |
| `http_req_duration` (p95) | `< 500ms` | 95% of API requests completed within 500 milliseconds. |
| `http_req_duration` (p99) | `< 1000ms` | 99% of API requests completed within 1.0 second. |
| `quiz_answer` (p95) | `< 350ms` | Sub-second question evaluation and speed bonus computation. |
| `wallet_query` (p95) | `< 250ms` | Fast financial ledger balance lookups. |

---

## 6. DigitalOcean Monitoring Checklist During Load Testing

While executing load tests, monitor the DigitalOcean Control Panel in real time:

1. **App Platform (`disha-api`):**
   - **CPU Utilization:** Ensure CPU stays below 70% per container. Verify that CPU > 70% triggers autoscaling from 2 to 6 containers.
   - **Memory (RAM):** Verify zero memory leaks across sustained test stages.
   - **Response Latency & 5xx:** Verify zero 502/504 Bad Gateway errors from the load balancer.
2. **Managed PostgreSQL (`disha-postgres`):**
   - **Active Connections:** Confirm PgBouncer handles client connections smoothly without exhausting backend database limits.
   - **Database CPU & Memory:** Ensure DB CPU remains < 60% during heavy tournament write operations.
   - **Slow Query Log:** Confirm all quiz attempts and answer queries utilize composite indexes (`idx_transactions_user_created`, `idx_quiz_attempts_leaderboard`).

---

## 7. Production Safety Rules

- **Zero Real Financial Transactions:** Load tests only perform simulated order validation checks; zero real Razorpay transactions are initiated.
- **Controlled Progression:** Never jump directly to 1,000+ VUs without running the 50 VU and 100 VU stages first.
- **Isolated User Pool:** Synthetic users use designated test prefixes (`+91 990000xxxx`) to prevent pollution of real user records.
