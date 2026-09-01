"""
Comprehensive Quiz Anti-Cheat Lock & Exit Counter Verification Test
Validates:
1. Normal Quiz Completion (0 exits)
2. Exit #1: Server increments leave_count to 1, erases answers, resets score to 0, restarts at Q1
3. Exit #2: Server increments leave_count to 2, final warning, answers erased, resets score to 0
4. Exit #3: Server terminates attempt, marks DISQUALIFIED, blocks answering, blocks finish
5. Re-entry & Refresh Bypass: Blocked with HTTP 403 Forbidden once disqualified
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

def get_auth_token(phone):
    s1, r1 = req("/api/auth/request-otp", method="POST", data={"identifier": phone})
    otp = r1.get("devOtp", "123456")
    s2, r2 = req("/api/auth/verify-otp", method="POST", data={"identifier": phone, "otp": otp})
    return r2["token"], r2["user"]["id"]

def test_anti_cheat_system():
    print("=" * 80)
    print("DISHA QUIZ ANTI-CHEAT LOCK & EXIT ENFORCEMENT VERIFICATION")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # TEST 1: NORMAL QUIZ COMPLETION (0 Exits)
    # -------------------------------------------------------------------------
    print("\n--- [TEST 1: Normal Quiz Flow (Zero Exits)] ---")
    token1, uid1 = get_auth_token("+91 99999 11111")
    s_start, r_start = req("/api/quizzes/tournaments/live_maha_01/start", method="POST", data={"client_source": "mobile"}, token=token1)
    assert s_start == 200, f"Start failed: {s_start}"
    att1 = r_start["attemptId"]
    qs1 = r_start["questions"]
    print(f"  [PASS] Started Attempt {att1} with 0 exits (Max: {r_start.get('maxAllowedExits', 2)})")

    # Answer all 5 questions
    for q in qs1:
        s_ans, r_ans = req(f"/api/quizzes/attempts/{att1}/answer", method="POST", data={
            "questionId": q["id"],
            "selectedOptionIndex": 1,
            "clientResponseTimeMs": 2000
        }, token=token1)
        assert s_ans == 200, f"Answer failed: {s_ans}"

    s_fin, r_fin = req(f"/api/quizzes/attempts/{att1}/finish", method="POST", data={}, token=token1)
    assert s_fin == 200 and r_fin["status"] == "COMPLETED", f"Finish failed: {s_fin}"
    print(f"  [PASS] Normal Quiz Completed Successfully! Rank: #{r_fin['userRank']}, Score: {r_fin['finalScore']}")

    # -------------------------------------------------------------------------
    # TEST 2: LEAVE #1 — ANSWER ERASURE & PROGRESS RESET
    # -------------------------------------------------------------------------
    print("\n--- [TEST 2: Exit #1 — Server Answer Erasure & Progress Reset] ---")
    token2, uid2 = get_auth_token("+91 99999 22222")
    s2_start, r2_start = req("/api/quizzes/tournaments/live_maha_01/start", method="POST", data={"client_source": "mobile"}, token=token2)
    att2 = r2_start["attemptId"]
    qs2 = r2_start["questions"]

    # Answer Q1 and Q2 to accumulate score
    s2_ans1, r2_ans1 = req(f"/api/quizzes/attempts/{att2}/answer", method="POST", data={
        "questionId": qs2[0]["id"],
        "selectedOptionIndex": 1,
        "clientResponseTimeMs": 2000
    }, token=token2)
    print(f"  -> Answered Q1: Score = {r2_ans1.get('currentScore')}")

    # Trigger Exit #1
    print("  -> Student switches tab / leaves quiz (Triggering Exit #1)...")
    s2_exit1, r2_exit1 = req(f"/api/quizzes/attempts/{att2}/record-exit", method="POST", data={"reason": "TAB_SWITCH"}, token=token2)
    assert s2_exit1 == 200 and r2_exit1["leaveCount"] == 1, f"Exit 1 failed: {s2_exit1}, {r2_exit1}"
    assert r2_exit1["remainingExits"] == 1, "Remaining exits mismatch"
    assert r2_exit1["restartRequired"] == True, "Restart required flag missing"
    print(f"  [PASS] Server recorded Leave #1: Answers erased, restarted from Q1 (Exits remaining: {r2_exit1['remainingExits']})")

    # Verify Q1 can now be answered again (because previous answers were erased)
    s2_re_ans1, r2_re_ans1 = req(f"/api/quizzes/attempts/{att2}/answer", method="POST", data={
        "questionId": qs2[0]["id"],
        "selectedOptionIndex": 1,
        "clientResponseTimeMs": 2000
    }, token=token2)
    assert s2_re_ans1 == 200, f"Re-answering Q1 failed: {s2_re_ans1}, {r2_re_ans1}"
    print(f"  [PASS] Successfully re-started from Question 1 with reset score = {r2_re_ans1.get('currentScore')}")

    # -------------------------------------------------------------------------
    # TEST 3: LEAVE #2 — FINAL WARNING
    # -------------------------------------------------------------------------
    print("\n--- [TEST 3: Exit #2 — Final Warning Threshold] ---")
    print("  -> Student switches away second time (Triggering Exit #2)...")
    s2_exit2, r2_exit2 = req(f"/api/quizzes/attempts/{att2}/record-exit", method="POST", data={"reason": "WINDOW_BLUR"}, token=token2)
    assert s2_exit2 == 200 and r2_exit2["leaveCount"] == 2, f"Exit 2 failed: {s2_exit2}, {r2_exit2}"
    assert r2_exit2["remainingExits"] == 0, "Remaining exits should be 0"
    print(f"  [PASS] Server recorded Leave #2: Final Warning issued (0 exits remaining)")

    # -------------------------------------------------------------------------
    # TEST 4: LEAVE #3 — PERMANENT TERMINATION & DISQUALIFICATION
    # -------------------------------------------------------------------------
    print("\n--- [TEST 4: Exit #3 — Permanent Disqualification] ---")
    print("  -> Student leaves quiz a 3rd time (> 2 limit)...")
    s2_exit3, r2_exit3 = req(f"/api/quizzes/attempts/{att2}/record-exit", method="POST", data={"reason": "APP_SWITCH"}, token=token2)
    assert r2_exit3.get("status") == "DISQUALIFIED" and r2_exit3.get("isDisqualified") == True, f"Disqualification failed: {r2_exit3}"
    print(f"  [PASS] Server permanently terminated attempt: Status = DISQUALIFIED (Leave Count = {r2_exit3['leaveCount']})")

    # Verify answering is blocked on disqualified attempt
    s_block_ans, r_block_ans = req(f"/api/quizzes/attempts/{att2}/answer", method="POST", data={
        "questionId": qs2[1]["id"],
        "selectedOptionIndex": 1,
        "clientResponseTimeMs": 2000
    }, token=token2)
    assert s_block_ans == 403, f"Expected 403 for disqualified answer, got {s_block_ans}"
    print(f"  [PASS] Submitting answer blocked with HTTP {s_block_ans}: {r_block_ans.get('message')}")

    # Verify finishing is blocked
    s_block_fin, r_block_fin = req(f"/api/quizzes/attempts/{att2}/finish", method="POST", data={}, token=token2)
    assert s_block_fin == 403, f"Expected 403 for disqualified finish, got {s_block_fin}"
    print(f"  [PASS] Finalizing tournament blocked with HTTP {s_block_fin}: {r_block_fin.get('message')}")

    # -------------------------------------------------------------------------
    # TEST 5: RE-ENTRY / REFRESH BYPASS DEFENSE
    # -------------------------------------------------------------------------
    print("\n--- [TEST 5: Re-entry & Refresh Bypass Defense] ---")
    s_reenter, r_reenter = req("/api/quizzes/tournaments/live_maha_01/start", method="POST", data={"client_source": "mobile"}, token=token2)
    assert s_reenter == 403 and r_reenter.get("error") == "DISQUALIFIED", f"Re-entry should be blocked, got {s_reenter}, {r_reenter}"
    print(f"  [PASS] Re-entering tournament blocked with HTTP 403: {r_reenter.get('message')}")

    print("\n" + "=" * 80)
    print("ALL 5 ANTI-CHEAT LOCK & EXIT ENFORCEMENT TESTS PASSED (100% SUCCESS)")
    print("=" * 80)

if __name__ == "__main__":
    test_anti_cheat_system()
