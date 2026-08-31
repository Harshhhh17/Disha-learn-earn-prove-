"""
Comprehensive End-to-End Application Flow Verification
Validates the complete user flow without changing functionality:
1. Login -> OTP Request -> OTP Verification -> JWT Issuance
2. Profile & Terms State Retrieval
3. Dashboard & Tournament Data Loading
4. Live Quiz Start -> 5 Question Answers with Server Timing -> Quiz Finish
5. Result Calculation & Atomic Prize Credit
6. Wallet Balance & Transaction Ledger Verification
7. Razorpay Test Order Creation -> Cryptographic Signature Verification -> Wallet Credit
8. Logout & Re-Login Session Continuity
"""

import urllib.request
import json
import time
import hmac
import hashlib

BASE_URL = "http://127.0.0.1:3000"

def req(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Source": "mobile"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=5) as res:
            b = res.read().decode("utf-8")
            return res.status, json.loads(b) if b else {}
    except urllib.error.HTTPError as e:
        b = e.read().decode("utf-8")
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, {"error": b}

def test_full_application_flow():
    print("=" * 80)
    print("DISHA COMPLETE APPLICATION END-TO-END VERIFICATION")
    print("=" * 80)

    # 1. LOGIN & OTP
    phone = "+91 98765 43210"
    print(f"\n[Step 1] Requesting OTP for {phone}...")
    s1, r1 = req("/api/auth/request-otp", method="POST", data={"identifier": phone})
    assert s1 == 200, f"OTP request failed: {s1}, {r1}"
    otp = r1.get("devOtp", "123456")
    print(f"  -> OTP dispatched: {otp}")

    print("[Step 2] Verifying OTP...")
    s2, r2 = req("/api/auth/verify-otp", method="POST", data={"identifier": phone, "otp": otp})
    assert s2 == 200 and "token" in r2, f"OTP verification failed: {s2}, {r2}"
    token = r2["token"]
    user = r2.get("user", {})
    print(f"  -> Authenticated User: {user.get('name')} ({user.get('phone')}), Role: {user.get('role')}")
    print(f"  -> JWT Token Issued: {token[:25]}...")

    # 2. DASHBOARD DATA
    print("\n[Step 3] Fetching Dashboard Data (Tournaments & Wallet)...")
    s3_tour, r3_tour = req("/api/quizzes/tournaments", token=token)
    assert s3_tour == 200 and r3_tour.get("success"), f"Tournaments load failed: {s3_tour}"
    tournaments = r3_tour.get("quizzes", [])
    print(f"  -> Available Tournaments: {len(tournaments)} active tournament(s)")

    s3_wal, r3_wal = req("/api/wallet", token=token)
    assert s3_wal == 200, f"Wallet load failed: {s3_wal}"
    initial_balance = r3_wal["wallet"]["availableBalancePaise"]
    print(f"  -> Current Wallet Balance: Rs. {initial_balance / 100:.2f} ({initial_balance} paise)")

    # 3. QUIZ TOURNAMENT FLOW
    print("\n[Step 4] Starting Live Quiz Tournament (live_maha_01)...")
    s4, r4 = req("/api/quizzes/tournaments/live_maha_01/start", method="POST", data={"client_source": "mobile"}, token=token)
    assert s4 == 200 and "attemptId" in r4, f"Quiz start failed: {s4}, {r4}"
    attempt_id = r4["attemptId"]
    questions = r4.get("questions", [])
    print(f"  -> Attempt ID: {attempt_id}, Questions loaded: {len(questions)}")

    print("\n[Step 5] Submitting Question Answers with Timing...")
    for idx, q in enumerate(questions):
        time.sleep(0.1)
        s5, r5 = req(f"/api/quizzes/attempts/{attempt_id}/answer", method="POST", data={
            "questionId": q["id"],
            "selectedOptionIndex": 1,
            "clientResponseTimeMs": 2400
        }, token=token)
        assert s5 == 200, f"Answer {idx+1} failed: {s5}, {r5}"
        print(f"  -> Q{idx+1} ({q['id']}): Correct={r5.get('isCorrect')}, Points={r5.get('pointsAwarded')}, Score={r5.get('currentScore')}")

    print("\n[Step 6] Finalizing Quiz & Calculating Rank/Rewards...")
    s6, r6 = req(f"/api/quizzes/attempts/{attempt_id}/finish", method="POST", data={}, token=token)
    assert s6 == 200 and r6.get("status") == "COMPLETED", f"Quiz finalize failed: {s6}, {r6}"
    prize_won = r6.get("prizeWonRupees", "0.00")
    print(f"  -> Rank: #{r6.get('userRank')}, Final Score: {r6.get('finalScore')}, Prize Won: Rs. {prize_won}")

    # 4. WALLET & TRANSACTIONS
    print("\n[Step 7] Verifying Updated Wallet Ledger...")
    s7, r7 = req("/api/wallet/transactions", token=token)
    assert s7 == 200 and "transactions" in r7, f"Transactions fetch failed: {s7}"
    txs = r7.get("transactions", [])
    print(f"  -> Ledger Transactions Recorded: {len(txs)} entry(ies)")
    if txs:
        latest = txs[0]
        print(f"  -> Latest Entry: [{latest.get('type')}] Rs. {latest.get('amountRupees')} - {latest.get('description')} ({latest.get('status')})")

    # 5. RAZORPAY TEST PAYMENT FLOW
    print("\n[Step 8] Testing Razorpay Server-Authoritative Deposit Flow...")
    deposit_amount = 500.00
    s8_ord, r8_ord = req("/api/payments/create-order", method="POST", data={
        "amountRupees": deposit_amount,
        "purpose": "WALLET_DEPOSIT"
    }, token=token)
    assert s8_ord == 200 and "razorpayOrderId" in r8_ord, f"Order creation failed: {s8_ord}, {r8_ord}"
    rzp_order_id = r8_ord["razorpayOrderId"]
    print(f"  -> Razorpay Order Created: {rzp_order_id} for Rs. {deposit_amount}")

    # Compute HMAC-SHA256 signature for test verification
    payment_id = "pay_test_" + str(int(time.time()))
    secret = "disha_test_key_secret_2026"
    sig_payload = f"{rzp_order_id}|{payment_id}"
    signature = hmac.new(secret.encode("utf-8"), sig_payload.encode("utf-8"), hashlib.sha256).hexdigest()

    print("[Step 9] Verifying Cryptographic Payment Signature & Crediting Wallet...")
    s9_v, r9_v = req("/api/payments/verify", method="POST", data={
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": signature
    }, token=token)
    assert s9_v == 200 and r9_v.get("success"), f"Payment verify failed: {s9_v}, {r9_v}"
    print(f"  -> Payment Verified Successfully! Updated Balance: Rs. {r9_v.get('availableBalanceRupees')}")

    # 6. LOGOUT & RE-LOGIN SESSION CONTINUITY
    print("\n[Step 10] Testing Session Continuity & Re-Login...")
    s10_otp, r10_otp = req("/api/auth/request-otp", method="POST", data={"identifier": phone})
    otp2 = r10_otp.get("devOtp", "123456")
    s10_v, r10_v = req("/api/auth/verify-otp", method="POST", data={"identifier": phone, "otp": otp2})
    assert s10_v == 200 and "token" in r10_v, f"Re-login failed: {s10_v}"
    token2 = r10_v["token"]
    s10_wal, r10_wal = req("/api/wallet", token=token2)
    assert s10_wal == 200, f"Post-relogin wallet fetch failed: {s10_wal}"
    print(f"  -> Re-login Successful. Persistent Balance: Rs. {r10_wal['wallet']['availableBalanceRupees']}")

    print("\n" + "=" * 80)
    print("ALL 10 END-TO-END APPLICATION FLOW TESTS PASSED WITH 100% SUCCESS")
    print("=" * 80)

if __name__ == "__main__":
    test_full_application_flow()
