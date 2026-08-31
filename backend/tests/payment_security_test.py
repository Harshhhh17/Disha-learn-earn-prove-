"""
Disha Razorpay Payment Gateway & Security Verification Test Suite
Adversarial testing of order creation, signature verification, webhook processing,
idempotency, IDOR protection, and balance credit atomicity.
"""
import urllib.request
import urllib.error
import json
import time
import socketserver
import threading
import sys
import os
import hmac
import hashlib
import concurrent.futures

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from server import UnifiedProductionHandler, STATE, make_token, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

PORT = 3004
BASE_URL = f'http://127.0.0.1:{PORT}'

results = []

def record_test(name, passed, severity, evidence):
    status_str = "PASS" if passed else "FAIL"
    clean_ev = str(evidence).replace('\u20b9', 'Rs ').encode('ascii', errors='replace').decode('ascii')
    results.append({
        "test": name,
        "result": status_str,
        "severity": severity,
        "evidence": clean_ev
    })
    prefix = "[PASS]" if passed else "[FAIL]"
    print(f"  {prefix} {name}: {clean_ev}")

def http_req(path, method="GET", data=None, headers=None, raw_body=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    
    if raw_body is not None:
        body_bytes = raw_body if isinstance(raw_body, bytes) else raw_body.encode('utf-8')
    elif data is not None:
        body_bytes = json.dumps(data).encode('utf-8')
        if 'Content-Type' not in headers:
            headers['Content-Type'] = 'application/json'
    else:
        body_bytes = None
    
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)
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

def generate_payment_signature(order_id, payment_id):
    payload = f"{order_id}|{payment_id}".encode('utf-8')
    return hmac.new(RAZORPAY_KEY_SECRET.encode('utf-8'), payload, hashlib.sha256).hexdigest()

def generate_webhook_signature(raw_payload):
    payload = raw_payload.encode('utf-8') if isinstance(raw_payload, str) else raw_payload
    return hmac.new(RAZORPAY_WEBHOOK_SECRET.encode('utf-8'), payload, hashlib.sha256).hexdigest()

def run_payment_security_suite():
    print("================================================================================")
    print("AUDIT: DISHA RAZORPAY PAYMENT GATEWAY & SECURITY VERIFICATION SUITE")
    print("================================================================================\n")

    user_a_token = make_token("usr_pay_a", "USER")
    user_b_token = make_token("usr_pay_b", "USER")
    admin_token = make_token("usr_admin_master", "ADMIN")

    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    headers_b = {"Authorization": f"Bearer {user_b_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Initialize wallets
    STATE["wallets"]["usr_pay_a"] = {"available_balance_paise": 10000, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0} # Rs 100
    STATE["wallets"]["usr_pay_b"] = {"available_balance_paise": 5000, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0}  # Rs 50

    # -------------------------------------------------------------------------
    # TEST 1: Order Creation Bounds & Authentication
    # -------------------------------------------------------------------------
    print("--- [DOMAIN 1: SERVER-AUTHORITATIVE ORDER CREATION] ---")
    
    # 1A: Unauthenticated order creation
    status, data, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 500})
    record_test("Unauthenticated Order Creation Rejection", status == 401, "HIGH", f"HTTP {status}: {data.get('message')}")

    # 1B: Order below minimum limit (Rs 40 < Rs 50)
    status, data, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 40}, headers_a)
    record_test("Under-Limit Order Creation Defense (Min Rs 50)", status == 400, "MEDIUM", f"HTTP {status}: {data.get('message')}")

    # 1C: Order above maximum limit (Rs 2,00,000 > Rs 1,00,000)
    status, data, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 200000}, headers_a)
    record_test("Over-Limit Order Creation Defense (Max Rs 1,00,000)", status == 400, "MEDIUM", f"HTTP {status}: {data.get('message')}")

    # 1D: Legitimate Order Creation (Rs 500)
    status, data_ord, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 500}, headers_a)
    rzp_order_id = data_ord.get("razorpayOrderId")
    order_id = data_ord.get("orderId")
    has_key_id = "keyId" in data_ord and not "secret" in str(data_ord).lower()
    record_test("Legitimate Order Creation (Zero Secret Leakage)", status == 200 and bool(rzp_order_id) and has_key_id, "CRITICAL", f"HTTP {status}: Created {rzp_order_id} (Paise: {data_ord.get('amountPaise')})")

    # -------------------------------------------------------------------------
    # TEST 2: Payment Signature Verification & Anti-Tampering
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 2: PAYMENT SIGNATURE VERIFICATION & TAMPERING RESILIENCE] ---")

    # 2A: Forged Payment Signature Attack
    forged_sig = "fake_hmac_sha256_hash_9999999999999999"
    status, data, _ = http_req("/api/payments/verify", "POST", {
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": "pay_fake_12345",
        "razorpay_signature": forged_sig
    }, headers_a)
    record_test("Forged Signature Attack Rejection", status == 400, "CRITICAL", f"HTTP {status}: {data.get('message')}")

    # 2B: Confirm wallet was NOT credited after forged attack
    bal_a_before = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Wallet Untouched After Forgery Attack", bal_a_before == 10000, "CRITICAL", f"Balance: Rs {bal_a_before/100:.2f}")

    # 2C: IDOR Attack: User B attempting to verify User A's order
    legit_payment_id = "pay_legit_test_8877"
    valid_sig = generate_payment_signature(rzp_order_id, legit_payment_id)
    status, data, _ = http_req("/api/payments/verify", "POST", {
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": legit_payment_id,
        "razorpay_signature": valid_sig
    }, headers_b)
    record_test("IDOR Attack Defense: Cross-User Verification Hijack", status == 403, "CRITICAL", f"HTTP {status}: {data.get('message')}")

    # 2D: Valid Signature Verification by User A
    status, data_verify, _ = http_req("/api/payments/verify", "POST", {
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": legit_payment_id,
        "razorpay_signature": valid_sig
    }, headers_a)
    bal_a_after = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Valid Payment Signature Verification & Credit", status == 200 and bal_a_after == 60000, "CRITICAL", f"HTTP {status}: New Balance Rs {bal_a_after/100:.2f} (Credited Rs 500)")

    # 2E: Verification Replay Attack (Idempotency Check)
    status_replay, data_replay, _ = http_req("/api/payments/verify", "POST", {
        "razorpay_order_id": rzp_order_id,
        "razorpay_payment_id": legit_payment_id,
        "razorpay_signature": valid_sig
    }, headers_a)
    bal_a_replay = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Payment Verification Replay Idempotency (Zero Double-Credit)", status_replay == 200 and data_replay.get("replayed") == True and bal_a_replay == 60000, "CRITICAL", f"Replayed: {data_replay.get('replayed')}, Balance unchanged at Rs {bal_a_replay/100:.2f}")

    # -------------------------------------------------------------------------
    # TEST 3: Server-to-Server Razorpay Webhook Verification
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 3: RAZORPAY WEBHOOK PROCESSING & SIGNATURE DEFENSE] ---")

    # Create a fresh order for webhook testing (Rs 1,000 = 100000 paise)
    _, data_ord_wh, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 1000}, headers_a)
    wh_order_id = data_ord_wh["razorpayOrderId"]

    webhook_event = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_wh_test_9900",
                    "order_id": wh_order_id,
                    "amount": 100000,
                    "currency": "INR",
                    "status": "captured",
                    "method": "upi"
                }
            }
        }
    }
    raw_wh_payload = json.dumps(webhook_event)

    # 3A: Webhook with forged / missing signature
    status, data, _ = http_req("/api/payments/webhook", "POST", raw_body=raw_wh_payload, headers={
        "Content-Type": "application/json",
        "X-Razorpay-Signature": "forged_webhook_signature_123"
    })
    record_test("Webhook Forged Signature Rejection", status == 400, "CRITICAL", f"HTTP {status}: {data.get('message')}")

    # 3B: Webhook with legitimate HMAC-SHA256 signature
    valid_wh_sig = generate_webhook_signature(raw_wh_payload)
    status, data, _ = http_req("/api/payments/webhook", "POST", raw_body=raw_wh_payload, headers={
        "Content-Type": "application/json",
        "X-Razorpay-Signature": valid_wh_sig
    })
    bal_a_wh = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Verified Webhook Payment Capture & Balance Credit", status == 200 and bal_a_wh == 160000, "CRITICAL", f"HTTP {status}: New Balance Rs {bal_a_wh/100:.2f} (Credited Rs 1,000)")

    # 3C: Duplicate / Replayed Webhook Event Idempotency
    status_wh_dup, data_wh_dup, _ = http_req("/api/payments/webhook", "POST", raw_body=raw_wh_payload, headers={
        "Content-Type": "application/json",
        "X-Razorpay-Signature": valid_wh_sig
    })
    bal_a_wh_dup = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Webhook Duplicate Event Idempotency (Zero Double-Credit)", status_wh_dup == 200 and bal_a_wh_dup == 160000, "CRITICAL", f"HTTP {status_wh_dup}: Balance strictly preserved at Rs {bal_a_wh_dup/100:.2f}")

    # 3D: Webhook Payment Failed Event Handling
    _, data_ord_fail, _ = http_req("/api/payments/create-order", "POST", {"amountRupees": 200}, headers_a)
    fail_order_id = data_ord_fail["razorpayOrderId"]
    fail_event = {
        "event": "payment.failed",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_failed_4400",
                    "order_id": fail_order_id,
                    "error_code": "BAD_REQUEST_ERROR",
                    "error_description": "User cancelled payment transaction"
                }
            }
        }
    }
    raw_fail_payload = json.dumps(fail_event)
    fail_sig = generate_webhook_signature(raw_fail_payload)
    status_fail, _, _ = http_req("/api/payments/webhook", "POST", raw_body=raw_fail_payload, headers={
        "Content-Type": "application/json",
        "X-Razorpay-Signature": fail_sig
    })
    order_status = STATE["payment_orders"][fail_order_id]["status"]
    record_test("Webhook Payment Failure State Tracking", status_fail == 200 and order_status == "FAILED", "HIGH", f"Order status transitioned to: {order_status}")

    # -------------------------------------------------------------------------
    # TEST 4: Direct Deposit Isolation & Hardening
    # -------------------------------------------------------------------------
    print("\n--- [DOMAIN 4: DIRECT DEPOSIT ISOLATION & RBAC] ---")

    # 4A: Normal user calling direct /api/wallet/deposit must be rejected
    status_dep, data_dep, _ = http_req("/api/wallet/deposit", "POST", {"amountRupees": 500}, headers_a)
    record_test("Unverified Direct Client Deposit Deprecation", status_dep == 400, "CRITICAL", f"HTTP {status_dep}: {data_dep.get('message')}")

    # 4B: Authorized Admin Manual Adjustment
    status_adj, data_adj, _ = http_req("/api/wallet/deposit", "POST", {
        "userId": "usr_pay_a",
        "amountRupees": 250,
        "reason": "Test Promotion Bonus"
    }, headers_admin)
    bal_a_admin = STATE["wallets"]["usr_pay_a"]["available_balance_paise"]
    record_test("Authorized Admin Manual Adjustment Execution", status_adj == 200 and bal_a_admin == 185000, "HIGH", f"HTTP {status_adj}: New Balance Rs {bal_a_admin/100:.2f} (Credited Rs 250)")

    print("\n================================================================================")
    passed_cnt = sum(1 for r in results if r["result"] == "PASS")
    total_cnt = len(results)
    print(f"RESULT: PAYMENT GATEWAY VERIFICATION COMPLETE: {passed_cnt}/{total_cnt} TESTS PASSED")
    print("================================================================================\n")

def start_server_and_run():
    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = ReusableTCPServer(('127.0.0.1', PORT), UnifiedProductionHandler)
    srv_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    srv_thread.start()
    time.sleep(0.5)

    try:
        run_payment_security_suite()
    finally:
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    start_server_and_run()
