"""
Adversarial Concurrency & Security Test Suite for Disha Withdrawal Engine
Tests:
1. Simultaneous Multi-threaded Withdrawal Race Attack (Zero Overdraft / Double-Withdrawal)
2. Negative, Zero, and Out-of-Bounds Withdrawal Defense (₹100 - ₹50,000)
3. Cross-User IDOR Protection & Unauthenticated Access Block
4. Immutable Ledger Transaction & Audit Record Verification
"""
import urllib.request
import urllib.error
import json
import time
import concurrent.futures
import threading

BASE_URL = "http://127.0.0.1:3000"

def make_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            content = resp.read().decode('utf-8')
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode('utf-8')
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, {"error": content}
    except Exception as e:
        print(f"Exception in make_request {path}: {type(e)} - {e}")
        return 0, {"error": str(e)}

def create_user_and_fund(phone, initial_deposit_rupees):
    s1, r1 = make_request("/api/auth/request-otp", method="POST", data={"identifier": phone})
    status, auth_res = make_request("/api/auth/verify-otp", method="POST", data={"identifier": phone, "otp": "123456"})
    if status != 200:
        print(f"Auth verify-otp failed: status={status}, r1={r1}, auth_res={auth_res}")
    token = auth_res.get("token")
    user = auth_res.get("user", {})

    # Create & verify test deposit order to fund wallet
    status, ord_res = make_request("/api/payments/create-order", method="POST", data={"amountRupees": initial_deposit_rupees}, token=token)
    if status != 200:
        print(f"Order creation failed: {status}, {ord_res}")
    make_request("/api/payments/verify", method="POST", data={
        "razorpay_order_id": ord_res.get("razorpayOrderId"),
        "razorpay_payment_id": ord_res.get("testPaymentId"),
        "razorpay_signature": ord_res.get("testSignature")
    }, token=token)

    return token, user

print("================================================================================")
print("ADVERSARIAL WITHDRAWAL CONCURRENCY & SECURITY AUDIT")
print("================================================================================\n")

passed_tests = 0
total_tests = 0

def assert_test(condition, title, details=""):
    global passed_tests, total_tests
    total_tests += 1
    if condition:
        passed_tests += 1
        print(f"  [PASS] {title}")
        if details:
            print(f"         -> {details}")
    else:
        print(f"  [FAIL] {title}")
        if details:
            print(f"         -> {details}")

# Setup test user with exact ₹5,000 balance
token_user, user = create_user_and_fund("+919333333333", 5000)

# ------------------------------------------------------------------------------
# DOMAIN 1: CONCURRENT SIMULTANEOUS WITHDRAWAL RACE TEST
# ------------------------------------------------------------------------------
print("--- [DOMAIN 1: CONCURRENT SIMULTANEOUS WITHDRAWAL RACE TEST] ---")

# Initial wallet check
status, bal_init = make_request("/api/wallet", token=token_user)
init_val = float(bal_init.get("wallet", {}).get("availableBalanceRupees", 0))
print(f"  [Info] Initial Wallet Balance: Rs {init_val:.2f}")

# Launch 2 simultaneous requests for Rs 5,000 each (Total attempt = Rs 10,000 from Rs 5,000 wallet)
def do_withdraw():
    return make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 5000}, token=token_user)

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    future1 = executor.submit(do_withdraw)
    future2 = executor.submit(do_withdraw)
    r1_status, r1_res = future1.result()
    r2_status, r2_res = future2.result()

statuses = sorted([r1_status, r2_status])
assert_test(statuses == [200, 400], "Concurrent Race Condition Defense: Exactly 1 request succeeded, 1 rejected (HTTP 200 & HTTP 400)", f"Results: Status1={r1_status}, Status2={r2_status}")

# Verify balance is exactly 0.00 and NEVER negative
status, bal_after = make_request("/api/wallet", token=token_user)
final_val = float(bal_after.get("wallet", {}).get("availableBalanceRupees", 0))
assert_test(final_val == 0.0, f"Wallet Balance strictly bounded: Rs {final_val:.2f} (Zero overdraft, zero double-debit)")

# ------------------------------------------------------------------------------
# DOMAIN 2: WITHDRAWAL BOUNDS & FINANCIAL SANITIZATION
# ------------------------------------------------------------------------------
print("\n--- [DOMAIN 2: WITHDRAWAL BOUNDS & FINANCIAL SANITIZATION] ---")

# Re-fund wallet with ₹1,000 for bounds testing
token_bounds, _ = create_user_and_fund("+919444444444", 1000)

# 2.1 Zero Amount (Rs 0)
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 0}, token=token_bounds)
assert_test(status == 400, "Zero amount withdrawal rejected (HTTP 400)")

# 2.2 Negative Amount (-Rs 500)
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": -500}, token=token_bounds)
assert_test(status == 400, "Negative amount withdrawal rejected (HTTP 400)")

# 2.3 Under minimum bound (Rs 99 < Rs 100)
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 99}, token=token_bounds)
assert_test(status == 400, "Under-minimum withdrawal (< Rs 100) rejected (HTTP 400)")

# 2.4 Over maximum bound (Rs 50,001 > Rs 50,000)
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 50001}, token=token_bounds)
assert_test(status == 400, "Over-maximum single withdrawal (> Rs 50,000) rejected (HTTP 400)")

# 2.5 Non-numeric string payload
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": "INVALID_AMOUNT"}, token=token_bounds)
assert_test(status == 400, "Non-numeric string payload rejected (HTTP 400)")

# ------------------------------------------------------------------------------
# DOMAIN 3: USER AUTHORIZATION & IDOR ISOLATION
# ------------------------------------------------------------------------------
print("\n--- [DOMAIN 3: USER AUTHORIZATION & IDOR ISOLATION] ---")

token_victim, victim = create_user_and_fund("+919555555555", 1000)
token_attacker, attacker = create_user_and_fund("+919666666666", 100)

# Attacker tries to withdraw by spoofing victim's user ID in payload
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 500, "userId": victim["id"]}, token=token_attacker)
assert_test(status == 400 and "exceeds" in res.get("message", "").lower(), "Attacker cannot withdraw victim's balance via spoofed userId (HTTP 400 Insufficient Funds)")

# Unauthenticated withdrawal attempt
status, res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 500})
assert_test(status == 401, "Unauthenticated withdrawal rejected (HTTP 401)")

# ------------------------------------------------------------------------------
# DOMAIN 4: AUDIT TRAIL & TEST RAIL VERIFICATION
# ------------------------------------------------------------------------------
print("\n--- [DOMAIN 4: AUDIT TRAIL & TEST RAIL VERIFICATION] ---")

# Valid withdrawal of Rs 500
status, wd_res = make_request("/api/wallet/withdraw", method="POST", data={"amountRupees": 500}, token=token_victim)
assert_test(status == 200 and wd_res.get("success"), "Legitimate withdrawal executed successfully")
assert_test(wd_res.get("payoutMode") == "TEST_SIMULATED_RAIL", "Payout Rail explicitly labeled TEST_SIMULATED_RAIL (Zero real money risk)")
assert_test(wd_res.get("withdrawalId", "").startswith("WD-"), f"Unique Withdrawal ID generated: {wd_res.get('withdrawalId')}")

# Verify immutable transaction ledger
status, tx_res = make_request("/api/wallet/transactions", token=token_victim)
txs = tx_res.get("transactions", [])
wd_tx = [t for t in txs if t["type"] == "WITHDRAWAL"]
assert_test(len(wd_tx) > 0 and wd_tx[0]["referenceId"] == wd_res.get("withdrawalId"), "Transaction ledger records withdrawal with exact reference ID")

print("\n================================================================================")
print(f"AUDIT SUMMARY: {passed_tests}/{total_tests} WITHDRAWAL SECURITY TESTS PASSED ({(passed_tests/total_tests)*100:.1f}%)")
print("================================================================================\n")
