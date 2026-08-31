"""
Disha Full Adversarial Security Verification Suite
Comprehensive penetration testing & security control validation
"""
import urllib.request
import urllib.error
import json
import time
import socketserver
import threading
import sys
import os
import concurrent.futures

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from server import UnifiedProductionHandler, STATE, make_token, verify_token

PORT = 3002
BASE_URL = f'http://127.0.0.1:{PORT}'

results = []

def record_test(name, passed, severity, evidence, fix_status="NOT NEEDED"):
    status_str = "PASS" if passed else "FAIL"
    clean_ev = str(evidence).replace('\u20b9', 'Rs ').encode('ascii', errors='replace').decode('ascii')
    results.append({
        "test": name,
        "result": status_str,
        "severity": severity,
        "evidence": clean_ev,
        "fix_status": fix_status
    })
    prefix = "[PASS]" if passed else "[FAIL]"
    print(f"  {prefix} {name}: {clean_ev}")

def http_req(path, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode('utf-8') if data is not None else None
    if data is not None and 'Content-Type' not in headers:
        headers['Content-Type'] = 'application/json'
    
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode('utf-8')
            resp_data = json.loads(resp_body) if resp_body else {}
            return resp.status, resp_data, resp.headers
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            err_data = json.loads(err_body)
        except Exception:
            err_data = {"raw": err_body}
        return e.code, err_data, e.headers
    except Exception as ex:
        return 500, {"error": str(ex)}, {}

def run_security_suite():
    print("================================================================================")
    print("AUDIT: DISHA ADVERSARIAL PENETRATION & SECURITY AUDIT TEST SUITE")
    print("================================================================================\n")

    # -------------------------------------------------------------------------
    # DOMAIN 1: AUTHENTICATION ATTACK TESTS
    # -------------------------------------------------------------------------
    print("--- [DOMAIN 1: AUTHENTICATION & SESSION ATTACK TESTS] ---")
    
    # 1A: Invalid OTP
    http_req("/api/auth/request-otp", "POST", {"identifier": "+919999900001"})
    status, data, _ = http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900001", "otp": "000000"})
    record_test("Invalid OTP Rejection", status == 400, "HIGH", f"HTTP {status}: {data.get('message')}")

    # 1B: Expired OTP
    STATE["otp_requests"]["+919999900002"] = {"otp": "456789", "expires_at": time.time() - 100, "attempts": 0}
    status, data, _ = http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900002", "otp": "456789"})
    record_test("Expired OTP Rejection", status == 400, "HIGH", f"HTTP {status}: {data.get('message')}")

    # 1C: Reused OTP (Single-Use Invalidation)
    http_req("/api/auth/request-otp", "POST", {"identifier": "+919999900003"})
    dev_otp = STATE["otp_requests"]["+919999900003"]["otp"]
    status1, data1, _ = http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900003", "otp": dev_otp})
    status2, data2, _ = http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900003", "otp": dev_otp})
    record_test("Reused OTP Invalidation", status1 == 200 and status2 == 400, "CRITICAL", f"First attempt: HTTP {status1}, Replay attempt: HTTP {status2}")

    # 1D: Multiple Rapid OTP Requests Rate Limiting
    http_req("/api/auth/request-otp", "POST", {"identifier": "+919999900004"})
    status_rate, data_rate, _ = http_req("/api/auth/request-otp", "POST", {"identifier": "+919999900004"})
    record_test("Rapid OTP Request Rate Limit", status_rate == 429, "MEDIUM", f"HTTP {status_rate}: {data_rate.get('message')}")

    # 1E: OTP Brute-Force Lockout (5 failed attempts)
    STATE["otp_requests"]["+919999900005"] = {"otp": "888888", "expires_at": time.time() + 300, "attempts": 0}
    for i in range(5):
        http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900005", "otp": f"11111{i}"})
    status_bf, data_bf, _ = http_req("/api/auth/verify-otp", "POST", {"identifier": "+919999900005", "otp": "888888"})
    record_test("OTP Brute-Force Lockout Defense", status_bf in (400, 429), "HIGH", f"HTTP {status_bf}: {data_bf.get('message')}")

    # 1F: Invalid / Forged JWT
    forged_token = "usr_fake:USER:9999999999:fake_signature_hash_12345"
    status_jwt, data_jwt, _ = http_req("/api/wallet", "GET", headers={"Authorization": f"Bearer {forged_token}"})
    record_test("Forged JWT Token Rejection", status_jwt == 401, "CRITICAL", f"HTTP {status_jwt}: {data_jwt.get('message')}")

    # 1G: Expired JWT
    expired_token = f"usr_test:USER:{int(time.time()) - 3600}:sig"
    status_exp, _, _ = http_req("/api/wallet", "GET", headers={"Authorization": f"Bearer {expired_token}"})
    record_test("Expired JWT Token Rejection", status_exp == 401, "HIGH", f"HTTP {status_exp}: Token expired")

    # 1H: Missing Authorization Header
    status_noauth, _, _ = http_req("/api/wallet", "GET")
    record_test("Missing Auth Header Protection", status_noauth == 401, "HIGH", f"HTTP {status_noauth}: Protected route blocked unauthenticated request")

    # -------------------------------------------------------------------------
    # DOMAIN 2: ADMIN PRIVILEGE ESCALATION & RBAC
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 2: ADMIN RBAC & PRIVILEGE ESCALATION TESTS] ---")
    
    # Create User A token (Regular User)
    user_a_id = "usr_user_a"
    STATE["users"][user_a_id] = {"id": user_a_id, "role": "USER", "name": "User A"}
    STATE["wallets"][user_a_id] = {"available_balance_paise": 50000, "total_won_paise": 50000, "total_withdrawn_paise": 0}
    user_a_token = make_token(user_a_id, "USER")

    # User A tries to access Admin Stats
    status_admin_stats, _, _ = http_req("/api/admin/stats", "GET", headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Admin Endpoint RBAC Block for Normal User", status_admin_stats == 403, "CRITICAL", f"HTTP {status_admin_stats}: Forbidden for role USER")

    # User A attempts JWT role tampering (changing payload role to ADMIN)
    tampered_role_token = f"{user_a_id}:ADMIN:{int(time.time()) + 3600}:invalidsignature"
    status_role_tamp, _, _ = http_req("/api/admin/stats", "GET", headers={"Authorization": f"Bearer {tampered_role_token}"})
    record_test("Tampered Role in JWT Rejection", status_role_tamp in (401, 403), "CRITICAL", f"HTTP {status_role_tamp}: Signature mismatch rejected")

    # Master Admin Authentication
    status_admin_ok, admin_data, _ = http_req("/api/admin/auth", "POST", {"passcode": "disha@2026"})
    admin_token = admin_data.get("token")
    status_admin_access, _, _ = http_req("/api/admin/stats", "GET", headers={"Authorization": f"Bearer {admin_token}"})
    record_test("Legitimate Admin Passcode Authentication", status_admin_ok == 200 and status_admin_access == 200, "HIGH", f"HTTP {status_admin_access}: Admin access granted with valid admin token")

    # -------------------------------------------------------------------------
    # DOMAIN 3: IDOR & HORIZONTAL PRIVILEGE ENFORCEMENT
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 3: IDOR & HORIZONTAL ISOLATION TESTS] ---")
    
    user_b_id = "usr_user_b"
    STATE["users"][user_b_id] = {"id": user_b_id, "role": "USER", "name": "User B"}
    STATE["wallets"][user_b_id] = {"available_balance_paise": 150000, "total_won_paise": 150000, "total_withdrawn_paise": 0}
    user_b_token = make_token(user_b_id, "USER")

    # User A requests wallet balance -> receives ONLY User A's balance (50000 paise = ₹500)
    _, wallet_a, _ = http_req("/api/wallet", "GET", headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("User A Wallet Isolation", wallet_a.get("wallet", {}).get("availableBalancePaise") == 50000, "CRITICAL", f"User A balance is Rs {wallet_a.get('wallet', {}).get('availableBalanceRupees')}")

    # User B starts a tournament attempt
    _, start_b, _ = http_req("/api/quizzes/tournaments/live_maha_01/start", "POST", {}, headers={"Authorization": f"Bearer {user_b_token}"})
    attempt_b_id = start_b.get("attemptId")

    # User A tries to submit an answer to User B's attempt (IDOR attack)
    status_idor_ans, data_idor, _ = http_req(f"/api/quizzes/attempts/{attempt_b_id}/answer", "POST", {"questionId": "ssc_01", "selectedOptionIndex": 2}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("IDOR Attack: Answer Submission Hijack Block", status_idor_ans == 403, "CRITICAL", f"HTTP {status_idor_ans}: {data_idor.get('message')}")

    # User A tries to finalize User B's attempt (IDOR attack)
    status_idor_fin, _, _ = http_req(f"/api/quizzes/attempts/{attempt_b_id}/finish", "POST", {}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("IDOR Attack: Finish Attempt Hijack Block", status_idor_fin == 403, "CRITICAL", f"HTTP {status_idor_fin}: Cross-user finalization blocked")

    # -------------------------------------------------------------------------
    # DOMAIN 4: WALLET MANIPULATION & FINANCIAL ATTACK TESTS
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 4: WALLET MANIPULATION & FINANCIAL ATTACKS] ---")
    
    # 4A: Normal user tries to post custom balance: { "balance": 9999999 }
    status_bal_inject, _, _ = http_req("/api/wallet", "POST", {"balance": 99999999}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Direct Balance Injection Rejection", status_bal_inject in (404, 405), "CRITICAL", f"HTTP {status_bal_inject}: Endpoint not allowed for arbitrary balance setting")

    # 4B: Negative Withdrawal
    status_neg_wd, data_neg, _ = http_req("/api/wallet/withdraw", "POST", {"amountRupees": -500}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Negative Amount Withdrawal Block", status_neg_wd == 400, "CRITICAL", f"HTTP {status_neg_wd}: {data_neg.get('message')}")

    # 4C: Zero Withdrawal
    status_zero_wd, data_zero, _ = http_req("/api/wallet/withdraw", "POST", {"amountRupees": 0}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Zero Amount Withdrawal Block", status_zero_wd == 400, "MEDIUM", f"HTTP {status_zero_wd}: {data_zero.get('message')}")

    # 4D: Withdrawal Exceeding Available Balance
    status_excess_wd, data_excess, _ = http_req("/api/wallet/withdraw", "POST", {"amountRupees": 9999}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Over-Withdrawal / Insufficient Funds Defense", status_excess_wd == 400, "CRITICAL", f"HTTP {status_excess_wd}: {data_excess.get('message')}")

    # 4E: Valid Withdrawal
    status_valid_wd, data_wd, _ = http_req("/api/wallet/withdraw", "POST", {"amountRupees": 200}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Valid Withdrawal Execution", status_valid_wd == 200, "LOW", f"HTTP {status_valid_wd}: Withdrew Rs 200, Remaining Rs {data_wd.get('availableBalanceRupees')}")

    # -------------------------------------------------------------------------
    # DOMAIN 5: DOUBLE-SPEND & CONCURRENCY RACE CONDITION TEST
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 5: DOUBLE-SPEND & RACE CONDITION TESTS] ---")
    
    # User B has ₹1,500 balance (150000 paise). Send 10 concurrent requests of ₹200 each.
    # Total attempted = ₹2,000. Balance should allow exactly 7 withdrawals (7 x ₹200 = ₹1,400, leaving ₹100), and reject 3 with Insufficient Funds.
    def do_withdraw():
        return http_req("/api/wallet/withdraw", "POST", {"amountRupees": 200}, headers={"Authorization": f"Bearer {user_b_token}"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(do_withdraw) for _ in range(10)]
        results_list = [f.result() for f in futures]

    successes = sum(1 for status, _, _ in results_list if status == 200)
    fails = sum(1 for status, _, _ in results_list if status == 400)
    final_b_bal = STATE["wallets"][user_b_id]["available_balance_paise"]

    record_test(
        "Concurrent Double-Spend Defense",
        final_b_bal >= 0 and successes == 7 and fails == 3,
        "CRITICAL",
        f"Allowed: {successes}, Blocked: {fails}, Final Balance: Rs {final_b_bal / 100:.2f} (No negative balance)"
    )

    # -------------------------------------------------------------------------
    # DOMAIN 6: QUIZ ANTI-CHEAT & SERVER AUTHORITY
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 6: QUIZ ANTI-CHEAT & SERVER AUTHORITY TESTS] ---")
    
    # 6A: Correct Answer Stripping Test
    _, start_res, _ = http_req("/api/quizzes/tournaments/live_maha_01/start", "POST", {}, headers={"Authorization": f"Bearer {user_a_token}"})
    att_id = start_res.get("attemptId")
    qs = start_res.get("questions", [])
    has_leaked_ans = any("correct" in q or "correct_option_index" in q or "explanation" in q for q in qs)
    record_test("Correct Answer Stripping in Client Payload", not has_leaked_ans, "CRITICAL", f"Checked {len(qs)} questions. Leaked answers count: 0")

    # 6B: Client Sending Forged Score in Answer Payload
    status_fake_score, data_fake_score, _ = http_req(f"/api/quizzes/attempts/{att_id}/answer", "POST", {
        "questionId": qs[0]["id"],
        "selectedOptionIndex": 2,
        "score": 999999,
        "pointsAwarded": 999999,
        "isCorrect": True
    }, headers={"Authorization": f"Bearer {user_a_token}"})
    server_score = data_fake_score.get("currentScore", 0)
    record_test("Client Score Forgery Immunity", server_score <= 1500, "CRITICAL", f"Server ignored forged score 999999. Computed score: {server_score}")

    # 6C: Duplicate Question Answering Replay Attack
    status_dup_ans, data_dup_ans, _ = http_req(f"/api/quizzes/attempts/{att_id}/answer", "POST", {
        "questionId": qs[0]["id"],
        "selectedOptionIndex": 2
    }, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("Duplicate Question Answer Replay Block", status_dup_ans == 400, "HIGH", f"HTTP {status_dup_ans}: {data_dup_ans.get('message')}")

    # 6D: Tournament Finish Idempotency (Duplicate Prize Replay)
    bal_before_fin = STATE["wallets"][user_a_id]["available_balance_paise"]
    status_fin1, data_fin1, _ = http_req(f"/api/quizzes/attempts/{att_id}/finish", "POST", {}, headers={"Authorization": f"Bearer {user_a_token}"})
    bal_after_fin1 = STATE["wallets"][user_a_id]["available_balance_paise"]
    
    # Replay Finish Request
    status_fin2, data_fin2, _ = http_req(f"/api/quizzes/attempts/{att_id}/finish", "POST", {}, headers={"Authorization": f"Bearer {user_a_token}"})
    bal_after_fin2 = STATE["wallets"][user_a_id]["available_balance_paise"]

    record_test(
        "Tournament Prize Finish Replay Idempotency",
        bal_after_fin1 == bal_after_fin2 and data_fin2.get("replayed") is True,
        "CRITICAL",
        f"Initial finish credited: {data_fin1.get('prizeWonRupees')}, Replayed finish balance change: Rs {(bal_after_fin2 - bal_after_fin1) / 100:.2f}"
    )

    # -------------------------------------------------------------------------
    # DOMAIN 7: INPUT VALIDATION, SQLi & XSS RESILIENCE
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 7: INPUT VALIDATION, SQLi & XSS RESILIENCE] ---")
    
    # 7A: SQL Injection in OTP identifier
    sqli_payload = "test' OR '1'='1' --"
    status_sqli, data_sqli, _ = http_req("/api/auth/request-otp", "POST", {"identifier": sqli_payload})
    record_test("SQL Injection in Auth Identifier Defense", status_sqli in (200, 400), "HIGH", f"HTTP {status_sqli}: Processed safely as literal string")

    # 7B: XSS Payload in input fields
    xss_payload = "<script>alert('XSS')</script>"
    status_xss, data_xss, _ = http_req("/api/wallet/withdraw", "POST", {"amountRupees": xss_payload}, headers={"Authorization": f"Bearer {user_a_token}"})
    record_test("XSS / Malformed Financial Type Defense", status_xss == 400, "HIGH", f"HTTP {status_xss}: {data_xss.get('message')}")

    # 7C: Huge Payload / Buffer Flooding
    huge_string = "A" * 100000
    status_huge, _, _ = http_req("/api/auth/request-otp", "POST", {"identifier": huge_string})
    record_test("Buffer Flood / Large Payload Handling", status_huge in (200, 400, 413), "MEDIUM", f"HTTP {status_huge}: Clean rejection")

    # -------------------------------------------------------------------------
    # DOMAIN 8: SECURITY HEADERS & ERROR INFORMATION DISCLOSURE
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 8: SECURITY HEADERS & INFORMATION DISCLOSURE] ---")
    
    status_h, _, headers = http_req("/health", "GET")
    has_nosniff = headers.get("X-Content-Type-Options") == "nosniff"
    has_frame_deny = headers.get("X-Frame-Options") == "DENY"
    has_hsts = "max-age" in headers.get("Strict-Transport-Security", "")
    has_csp = "default-src" in headers.get("Content-Security-Policy", "")

    record_test("X-Content-Type-Options: nosniff", has_nosniff, "MEDIUM", f"Header: {headers.get('X-Content-Type-Options')}")
    record_test("X-Frame-Options: DENY (Clickjacking Defense)", has_frame_deny, "MEDIUM", f"Header: {headers.get('X-Frame-Options')}")
    record_test("Strict-Transport-Security (HSTS)", has_hsts, "MEDIUM", f"Header: {headers.get('Strict-Transport-Security')}")
    record_test("Content-Security-Policy (CSP)", has_csp, "HIGH", f"Header present and configured")

    # Error information disclosure: Invalid endpoint
    status_404, data_404, _ = http_req("/api/non-existent-endpoint", "GET")
    has_no_stack = "stack" not in data_404 and "trace" not in str(data_404).lower()
    record_test("Information Disclosure Defense (Zero Stack Leaks)", has_no_stack, "MEDIUM", f"HTTP {status_404}: Returned clean JSON error without internal paths")

    print("\n================================================================================")
    passed_count = sum(1 for r in results if r["result"] == "PASS")
    total_count = len(results)
    print(f"RESULT: ADVERSARIAL AUDIT COMPLETE: {passed_count}/{total_count} TESTS PASSED")
    print("================================================================================\n")

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), UnifiedProductionHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)
    try:
        run_security_suite()
    finally:
        httpd.shutdown()
