"""
Verification Runner for k6 Load Testing Endpoints
Executes the exact request sequence simulated in load.js against the active server:
1. Health Check
2. Tournaments Browse
3. Auth & Token Generation
4. Wallet Balance Query
5. Live Quiz Start
6. 5-Question Answer Grading Sequence
7. Quiz Finalize & Leaderboard Reward Calculation
8. Transaction Ledger Verification
9. Unauthenticated Security Boundary Check
"""

import urllib.request
import json
import time

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
    except Exception as e:
        return 0, {"error": str(e)}

def test_full_k6_user_journey():
    print("=" * 70)
    print("TESTING K6 LOAD-TEST USER JOURNEY AGAINST LIVE SERVER")
    print("=" * 70)

    # 1. Health
    s1, r1 = req("/health")
    assert s1 == 200 and r1.get("status") in ("healthy", "ok"), f"Health failed: {s1}, {r1}"
    print("[PASS] Step 1: Health Check (HTTP 200)")

    # 2. Tournaments
    s2, r2 = req("/api/quizzes/tournaments")
    assert s2 == 200 and r2.get("success") is True, f"Tournaments failed: {s2}, {r2}"
    print(f"[PASS] Step 2: Tournaments Listing (Found {len(r2.get('quizzes', []))} tournaments)")

    # 3. Auth
    phone = "+91 9900000042"
    s3_otp, r3_otp = req("/api/auth/request-otp", method="POST", data={"identifier": phone})
    otp = r3_otp.get("devOtp", "123456")
    s3_v, r3_v = req("/api/auth/verify-otp", method="POST", data={"identifier": phone, "otp": otp})
    assert s3_v == 200 and "token" in r3_v, f"Auth failed: {s3_v}, {r3_v}"
    token = r3_v["token"]
    print(f"[PASS] Step 3: Auth & JWT Issuance (Token={token[:20]}...)")

    # 4. Wallet
    s4, r4 = req("/api/wallet", token=token)
    assert s4 == 200 and "wallet" in r4, f"Wallet failed: {s4}, r4"
    print(f"[PASS] Step 4: Wallet Query (AvailablePaise={r4['wallet']['availableBalancePaise']})")

    # 5. Start Quiz
    s5, r5 = req("/api/quizzes/tournaments/live_maha_01/start", method="POST", data={"client_source": "mobile"}, token=token)
    assert s5 == 200 and "attemptId" in r5, f"Start failed: {s5}, {r5}"
    attempt_id = r5["attemptId"]
    questions = r5.get("questions", [])
    print(f"[PASS] Step 5: Quiz Started (AttemptId={attempt_id}, Questions={len(questions)})")

    # 6. Answer 5 Questions
    for idx, q in enumerate(questions):
        time.sleep(0.1)
        s6, r6 = req(f"/api/quizzes/attempts/{attempt_id}/answer", method="POST", data={
            "questionId": q["id"],
            "selectedOptionIndex": 1,
            "clientResponseTimeMs": 2500
        }, token=token)
        assert s6 == 200, f"Answer {idx} failed: {s6}, {r6}"
        print(f"  [PASS] Answered Q{idx+1} ({q['id']}): isCorrect={r6.get('isCorrect')}, Score={r6.get('currentScore')}")

    # 7. Finish Quiz
    s7, r7 = req(f"/api/quizzes/attempts/{attempt_id}/finish", method="POST", data={}, token=token)
    assert s7 == 200 and r7.get("status") == "COMPLETED", f"Finish failed: {s7}, {r7}"
    print(f"[PASS] Step 7: Quiz Finalized (Rank=#{r7.get('userRank')}, Score={r7.get('finalScore')}, PrizeWon={r7.get('prizeWonRupees')})")

    # 8. Transactions Ledger
    s8, r8 = req("/api/wallet/transactions", token=token)
    assert s8 == 200 and "transactions" in r8, f"Transactions failed: {s8}, {r8}"
    print(f"[PASS] Step 8: Transaction Ledger Retrieved ({len(r8['transactions'])} transactions)")

    # 9. Security Boundary Check
    s9, _ = req("/api/payments/create-order", method="POST", data={"amountRupees": 500})
    assert s9 == 401, f"Security check failed: Expected 401, got {s9}"
    print("[PASS] Step 9: Unauthenticated Security Guard Verified (HTTP 401)")

    print("=" * 70)
    print("ALL K6 LOAD TESTING ENDPOINT SEQUENCES VALIDATED WITH 100% SUCCESS")
    print("=" * 70)

if __name__ == "__main__":
    test_full_k6_user_journey()
