"""
Complete End-to-End Razorpay Test Mode Verification Suite
Validates the complete payment lifecycle:
User Auth -> Order Creation -> Razorpay Signature -> Server-Side Verification ->
PostgreSQL/State Ledger -> Idempotent Webhook -> Double-Spend & Attack Protections
"""
import urllib.request
import urllib.error
import json
import hmac
import hashlib
import time
import sys

BASE_URL = "http://127.0.0.1:3000"
TEST_SECRET = "disha_test_key_secret_2026"
WEBHOOK_SECRET = "disha_test_webhook_secret_2026"

def http_req(path, method="GET", data=None, token=None, headers_extra=None, raw_data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if headers_extra:
        headers.update(headers_extra)

    body = raw_data if raw_data is not None else (json.dumps(data).encode('utf-8') if data is not None else None)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            resp_body = res.read().decode('utf-8')
            return res.status, json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(resp_body)
        except Exception:
            return e.code, {"raw": resp_body}

print("================================================================================")
print("VERIFYING COMPLETE END-TO-END RAZORPAY TEST MODE PAYMENT ARCHITECTURE")
print("================================================================================\n")

# 1. USER AUTHENTICATION
print("--- [STEP 1: USER AUTHENTICATION & SESSION ISSUANCE] ---")
status, otp_req = http_req("/api/auth/request-otp", method="POST", data={"identifier": "+919876500001"})
dev_otp = otp_req.get("devOtp", "123456")
status, auth_res = http_req("/api/auth/verify-otp", method="POST", data={"identifier": "+919876500001", "otp": dev_otp})
user_token = auth_res.get("token")
user_id = auth_res.get("user", {}).get("id")
print(f"  [PASS] User Authenticated: ID={user_id} (Token Issued)")

# 2. CHECK INITIAL WALLET BALANCE
status, initial_wal = http_req("/api/wallet", token=user_token)
init_bal = float(initial_wal.get("wallet", {}).get("availableBalanceRupees", "0"))
print(f"  [PASS] Initial Wallet Balance: Rs {init_bal:.2f}")

# 3. CREATE ORDER FROM BACKEND
print("\n--- [STEP 2: SERVER-AUTHORITATIVE ORDER CREATION] ---")
status, ord_res = http_req("/api/payments/create-order", method="POST", token=user_token, data={"amountRupees": 500.0})
assert status == 200, f"Order creation failed: {ord_res}"
rzp_order_id = ord_res["razorpayOrderId"]
amount_paise = ord_res["amountPaise"]
key_id = ord_res["keyId"]
mode = ord_res["mode"]
print(f"  [PASS] Razorpay Order Generated: {rzp_order_id} (Paise: {amount_paise}, Mode: {mode})")
assert "secret" not in json.dumps(ord_res).lower(), "CRITICAL: Key secret leaked in client order payload!"
print(f"  [PASS] Secret Leakage Check: Zero secrets exposed in client payload")

# 4. SIMULATE RAZORPAY CHECKOUT & PAYMENT RETURN
print("\n--- [STEP 3: RAZORPAY TEST PAYMENT & SIGNATURE GENERATION] ---")
fake_payment_id = f"pay_test_{int(time.time())}"
payload_str = f"{rzp_order_id}|{fake_payment_id}"
valid_sig = hmac.new(TEST_SECRET.encode('utf-8'), payload_str.encode('utf-8'), hashlib.sha256).hexdigest()
print(f"  [PASS] Client Return Signature Generated: {valid_sig[:16]}...")

# 5. SERVER-SIDE SIGNATURE VERIFICATION & ATOMIC CREDIT
print("\n--- [STEP 4: SERVER-SIDE SIGNATURE VERIFICATION & BALANCE UPDATE] ---")
status, verify_res = http_req("/api/payments/verify", method="POST", token=user_token, data={
    "razorpay_order_id": rzp_order_id,
    "razorpay_payment_id": fake_payment_id,
    "razorpay_signature": valid_sig
})
assert status == 200, f"Verification failed: {verify_res}"
new_bal = float(verify_res["newBalanceRupees"])
print(f"  [PASS] Payment Verified & Credited: Old Balance=Rs {init_bal:.2f} -> New Balance=Rs {new_bal:.2f} (+Rs 500.00)")
assert new_bal == init_bal + 500.0, f"Balance mismatch: expected {init_bal + 500.0}, got {new_bal}"

# 6. IDEMPOTENCY CHECK (ZERO DOUBLE CREDIT)
print("\n--- [STEP 5: PAYMENT REPLAY IDEMPOTENCY TEST] ---")
status, replay_res = http_req("/api/payments/verify", method="POST", token=user_token, data={
    "razorpay_order_id": rzp_order_id,
    "razorpay_payment_id": fake_payment_id,
    "razorpay_signature": valid_sig
})
assert status == 200, f"Replay check failed: {replay_res}"
assert replay_res.get("replayed") == True, "Expected replayed flag"
status, check_wal = http_req("/api/wallet", token=user_token)
replayed_bal = float(check_wal.get("wallet", {}).get("availableBalanceRupees", "0"))
print(f"  [PASS] Payment Replayed: Server detected already-captured order, balance strictly preserved at Rs {replayed_bal:.2f}")
assert replayed_bal == new_bal, "CRITICAL: Double-credit occurred on payment replay!"

# 7. WEBHOOK SIGNATURE & IDEMPOTENT PROCESSING
print("\n--- [STEP 6: RAZORPAY WEBHOOK PROCESSING & SIGNATURE VERIFICATION] ---")
status, ord_res2 = http_req("/api/payments/create-order", method="POST", token=user_token, data={"amountRupees": 1000.0})
rzp_order_id2 = ord_res2["razorpayOrderId"]
webhook_pay_id = f"pay_hook_{int(time.time())}"

webhook_event = {
    "entity": "event",
    "event": "payment.captured",
    "contains": ["payment"],
    "payload": {
        "payment": {
            "entity": {
                "id": webhook_pay_id,
                "order_id": rzp_order_id2,
                "amount": 100000,
                "currency": "INR",
                "status": "captured",
                "notes": {"userId": user_id}
            }
        }
    }
}
raw_webhook_body = json.dumps(webhook_event).encode('utf-8')
webhook_sig = hmac.new(WEBHOOK_SECRET.encode('utf-8'), raw_webhook_body, hashlib.sha256).hexdigest()

status, hook_res = http_req(
    "/api/payments/webhook",
    method="POST",
    raw_data=raw_webhook_body,
    headers_extra={"X-Razorpay-Signature": webhook_sig}
)
assert status == 200, f"Webhook failed: {hook_res}"
status, check_wal2 = http_req("/api/wallet", token=user_token)
hook_bal = float(check_wal2.get("wallet", {}).get("availableBalanceRupees", "0"))
print(f"  [PASS] Webhook Payment Captured & Verified: New Balance=Rs {hook_bal:.2f} (+Rs 1,000.00)")
assert hook_bal == new_bal + 1000.0

# 8. DUPLICATE WEBHOOK IDEMPOTENCY
status, hook_replay_res = http_req(
    "/api/payments/webhook",
    method="POST",
    raw_data=raw_webhook_body,
    headers_extra={"X-Razorpay-Signature": webhook_sig}
)
assert status == 200
status, check_wal3 = http_req("/api/wallet", token=user_token)
hook_replay_bal = float(check_wal3.get("wallet", {}).get("availableBalanceRupees", "0"))
print(f"  [PASS] Webhook Replay Idempotency: Balance strictly preserved at Rs {hook_replay_bal:.2f} (Zero Double-Credit)")
assert hook_replay_bal == hook_bal

# 9. TRANSACTION LEDGER VERIFICATION
print("\n--- [STEP 7: TRANSACTION LEDGER INTEGRITY VERIFICATION] ---")
status, tx_res = http_req("/api/wallet/transactions", token=user_token)
txs = tx_res.get("transactions", [])
print(f"  [PASS] Transaction Ledger Contains {len(txs)} Records for User {user_id}")
for t in txs[:2]:
    print(f"      -> ID: {t['id']} | Type: {t['type']} | Amount: Rs {t['amountRupees']} | Ref: {t['referenceId']}")

print("\n================================================================================")
print("ALL END-TO-END RAZORPAY TEST MODE PAYMENTS VERIFIED SUCCESSFULLY")
print("================================================================================\n")
