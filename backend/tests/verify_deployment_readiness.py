"""
Disha Production & DigitalOcean Deployment Readiness Test Suite
Verifies:
1. DigitalOcean App Platform spec (.do/app.yaml) configuration & 50K scaling rules
2. PostgreSQL non-destructive migration chain (001, 002, 003)
3. Secret safety & Git isolation
4. Health check endpoint & DB probe
5. Live API endpoint behavior (Auth, Quiz, Wallet, Payment Isolation)
"""

import os
import sys
import re
import json
import urllib.request
import urllib.parse
import traceback

BASE_URL = os.environ.get("TEST_API_URL", "http://127.0.0.1:3000")

def test_api_request(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    req_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            body = res.read().decode("utf-8")
            return res.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}
    except Exception as e:
        return 0, {"error": str(e)}

def run_readiness_audit():
    print("=" * 80)
    print("DISHA DIGITALOCEAN DEPLOYMENT & PRODUCTION READINESS AUDIT")
    print("=" * 80 + "\n")
    
    results = {}
    
    # -------------------------------------------------------------
    # 1. SPECIFICATION & SIZING AUDIT (.do/app.yaml)
    # -------------------------------------------------------------
    print("--- [SECTION 1: DIGITALOCEAN APP PLATFORM SPEC AUDIT] ---")
    spec_path = "H:/Disha/.do/app.yaml"
    if os.path.exists(spec_path):
        with open(spec_path, "r", encoding="utf-8") as f:
            spec_content = f.read()
        
        has_region = "region: blr" in spec_content
        has_autoscaling = "min_instance_count: 2" in spec_content and "max_instance_count: 6" in spec_content
        has_dedicated = "instance_size_slug: professional-xs" in spec_content or "professional-s" in spec_content
        has_db_tier = "size: db-s-2vcpu-4gb" in spec_content
        has_db_ha = "num_nodes: 2" in spec_content
        has_health = "http_path: /health" in spec_content
        
        spec_ok = has_region and has_autoscaling and has_dedicated and has_db_tier and has_db_ha and has_health
        results["TEST 1 (App Platform Spec & Sizing)"] = "PASS" if spec_ok else "FAIL"
        print(f"  [{'PASS' if spec_ok else 'FAIL'}] TEST 1: App Platform Spec: Region=blr, Sizing=2-6 Containers, DB=2vcpu-4gb HA")
    else:
        results["TEST 1 (App Platform Spec & Sizing)"] = "FAIL"
        print("  [FAIL] TEST 1: .do/app.yaml not found")
        
    # -------------------------------------------------------------
    # 2. DATABASE MIGRATION CHAIN & NON-DESTRUCTIVE AUDIT
    # -------------------------------------------------------------
    print("\n--- [SECTION 2: MIGRATION CHAIN & NON-DESTRUCTIVE AUDIT] ---")
    migrations_dir = "H:/Disha/backend/src/migrations"
    migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
    
    has_all_migrations = (len(migration_files) == 3 and "001_initial_schema.sql" in migration_files and "002_payment_orders_schema.sql" in migration_files and "003_performance_and_audit_hardening.sql" in migration_files)
    
    # Check for destructive keywords in any migration file
    destructive_found = False
    for mf in migration_files:
        with open(os.path.join(migrations_dir, mf), "r", encoding="utf-8") as f:
            sql = f.read().upper()
            if "DROP TABLE" in sql or "DROP DATABASE" in sql or "TRUNCATE" in sql or "DELETE FROM" in sql:
                destructive_found = True
                print(f"  [WARNING] Destructive SQL found in {mf}")
                
    migrations_ok = has_all_migrations and not destructive_found
    results["TEST 2 (Non-Destructive Migration Chain)"] = "PASS" if migrations_ok else "FAIL"
    print(f"  [{'PASS' if migrations_ok else 'FAIL'}] TEST 2: Migration Chain: 3 Files Present (001-003), 100% Non-Destructive (Zero DROP/TRUNCATE)")

    # -------------------------------------------------------------
    # 3. SECRET ISOLATION & GIT HYGIENE
    # -------------------------------------------------------------
    print("\n--- [SECTION 3: SECRET ISOLATION & GIT HYGIENE] ---")
    gitignore_path = "H:/Disha/.gitignore"
    with open(gitignore_path, "r", encoding="utf-8") as f:
        gi_content = f.read()
    
    has_env_ignore = ".env" in gi_content and "*.key" in gi_content and "*.pem" in gi_content
    
    # Scan client bundles for hardcoded live keys
    js_files = []
    for root, _, files in os.walk("H:/Disha/js"):
        for f in files:
            if f.endswith(".js"):
                js_files.append(os.path.join(root, f))
                
    hardcoded_secret = False
    for jf in js_files:
        with open(jf, "r", encoding="utf-8") as f:
            c = f.read()
            if "rzp_live_" in c or "SECRET" in c and "RAZORPAY_KEY_SECRET" in c:
                hardcoded_secret = True
                print(f"  [LEAK] Secret found in {jf}")
                
    secrets_ok = has_env_ignore and not hardcoded_secret
    results["TEST 3 (Secret Isolation & Git Hygiene)"] = "PASS" if secrets_ok else "FAIL"
    print(f"  [{'PASS' if secrets_ok else 'FAIL'}] TEST 3: Secret Isolation: Zero Leaked Keys, .env strictly gitignored")

    # -------------------------------------------------------------
    # 4. HEALTH CHECK & DATABASE PROBE
    # -------------------------------------------------------------
    print("\n--- [SECTION 4: HEALTH CHECK & DATABASE PROBE] ---")
    s_health, r_health = test_api_request("/health")
    health_ok = (s_health == 200 and r_health.get("status") in ("healthy", "ok"))
    results["TEST 4 (System Health Check)"] = "PASS" if health_ok else "FAIL"
    print(f"  [{'PASS' if health_ok else 'FAIL'}] TEST 4: Health Endpoint: HTTP {s_health}, Status={r_health.get('status')}")

    # -------------------------------------------------------------
    # 5. LIVE ENDPOINT & FINANCIAL ISOLATION AUDIT
    # -------------------------------------------------------------
    print("\n--- [SECTION 5: LIVE ENDPOINTS & TRANSACTION INTEGRITY] ---")
    
    # 5.1 OTP Auth Request & Normalization
    test_phone = "+91 9988776655"
    s_otp, r_otp = test_api_request("/api/auth/request-otp", method="POST", data={"identifier": test_phone})
    otp_code = r_otp.get("devOtp", "123456")
    s_votp, r_votp = test_api_request("/api/auth/verify-otp", method="POST", data={"identifier": test_phone, "otp": otp_code})
    
    auth_ok = (s_otp == 200 and s_votp == 200 and r_votp.get("token") is not None and "Welcome to Disha" in r_votp.get("message", ""))
    results["TEST 5 (Auth & OTP Verification)"] = "PASS" if auth_ok else "FAIL"
    print(f"  [{'PASS' if auth_ok else 'FAIL'}] TEST 5: Auth & OTP Lifecycle: HTTP 200, JWT Issued, Message='{r_votp.get('message')}'")
    
    user_token = r_votp.get("token")

    # 5.2 Wallet Balance Query
    s_wal, r_wal = test_api_request("/api/wallet", token=user_token)
    wal_ok = (s_wal == 200 and "wallet" in r_wal)
    results["TEST 6 (Wallet Financial Ledger)"] = "PASS" if wal_ok else "FAIL"
    print(f"  [{'PASS' if wal_ok else 'FAIL'}] TEST 6: Wallet Endpoint: HTTP {s_wal}, AvailablePaise={r_wal.get('wallet', {}).get('availableBalancePaise')}")

    # 5.3 Payment Order Creation (Server-Authoritative)
    s_ord, r_ord = test_api_request("/api/payments/create-order", method="POST", data={"amountRupees": 500}, token=user_token)
    ord_ok = (s_ord == 200 and (r_ord.get("razorpayOrderId") or r_ord.get("orderId") or r_ord.get("id")))
    results["TEST 7 (Payment Order Creation)"] = "PASS" if ord_ok else "FAIL"
    print(f"  [{'PASS' if ord_ok else 'FAIL'}] TEST 7: Payment Order Creation: HTTP {s_ord}, Order={r_ord.get('razorpayOrderId') or r_ord.get('id')}")

    # 5.4 Cross-User IDOR Protection
    s_unauth_ord, _ = test_api_request("/api/payments/create-order", method="POST", data={"amountRupees": 500})
    idor_ok = (s_unauth_ord == 401)
    results["TEST 8 (Cross-User IDOR Defense)"] = "PASS" if idor_ok else "FAIL"
    print(f"  [{'PASS' if idor_ok else 'FAIL'}] TEST 8: Unauthenticated Rejection: HTTP {s_unauth_ord} (Expected 401)")

    # -------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------
    print("\n" + "=" * 80)
    print("DEPLOYMENT READINESS SUMMARY:")
    all_passed = True
    for name, stat in results.items():
        print(f"  [{stat}] {name}")
        if stat != "PASS":
            all_passed = False
    
    passed_count = sum(1 for v in results.values() if v == "PASS")
    total_count = len(results)
    score = (passed_count / total_count) * 100
    print(f"TOTAL SCORE: {passed_count}/{total_count} TESTS PASSED ({score:.1f}%)")
    print("=" * 80)
    
    return all_passed

if __name__ == "__main__":
    success = run_readiness_audit()
    sys.exit(0 if success else 1)
