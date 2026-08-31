import urllib.request
import json
import time
import socketserver
import threading
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from server import UnifiedProductionHandler

PORT = 3001
base = f'http://127.0.0.1:{PORT}'

def start_test_server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), UnifiedProductionHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)
    return httpd

def test():
    print("==================================================")
    print("TEST: DISHA SERVER-AUTHORITATIVE LOCAL TEST SUITE")
    print("==================================================")

    print("\n[1/6] Testing /health...")
    req = urllib.request.Request(f"{base}/health")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        assert data.get('status') == 'ok', 'Health check failed'
        print("  [PASS] GET /health: OK")

    print("\n[2/6] Testing OTP Generation (/api/auth/request-otp)...")
    req = urllib.request.Request(
        f"{base}/api/auth/request-otp",
        data=json.dumps({'identifier': '+919876543210'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        assert data.get('success') is True, 'OTP request failed'
        otp = data.get('devOtp') or '123456'
        print(f"  [PASS] POST /api/auth/request-otp (devOtp: {otp})")

    print("\n[3/6] Testing OTP Verification (/api/auth/verify-otp)...")
    req = urllib.request.Request(
        f"{base}/api/auth/verify-otp",
        data=json.dumps({'identifier': '+919876543210', 'otp': otp}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        token = data.get('token')
        assert token, 'No token returned'
        print("  [PASS] POST /api/auth/verify-otp: JWT issued")

    print("\n[4/6] Testing Server-Authoritative Quiz Start & Answer Stripping...")
    req = urllib.request.Request(
        f"{base}/api/quizzes/tournaments/live_maha_01/start",
        data=b'{}',
        headers={'Content-Type': 'application/json', 'Authorization': f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        attempt_id = data.get('attemptId')
        questions = data.get('questions', [])
        for q in questions:
            assert 'correct' not in q and 'correct_option_index' not in q, 'SECURITY FAILURE: Correct answer exposed!'
        print("  [PASS] POST /api/quizzes/tournaments/:id/start (Correct answers stripped from client payload)")

    print("\n[5/6] Testing Server-Authoritative Answer Evaluation & Speed Bonus...")
    q0 = questions[0]
    req = urllib.request.Request(
        f"{base}/api/quizzes/attempts/{attempt_id}/answer",
        data=json.dumps({'questionId': q0['id'], 'selectedOptionIndex': 2, 'clientResponseTimeMs': 2400}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Authorization': f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        assert 'pointsAwarded' in data, 'Points calculation missing'
        print(f"  [PASS] POST /api/quizzes/attempts/:id/answer (Score: {data.get('currentScore')})")

    print("\n[6/6] Testing Wallet Ledger & Balance...")
    req = urllib.request.Request(
        f"{base}/api/wallet",
        headers={'Authorization': f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        assert 'availableBalancePaise' in data.get('wallet', {}), 'Wallet balance missing'
        print(f"  [PASS] GET /api/wallet (Balance: Rs {data['wallet']['availableBalanceRupees']})")

    print("\n==================================================")
    print("SUCCESS: ALL 6/6 PRODUCTION READINESS TESTS PASSED!")
    print("==================================================")

if __name__ == '__main__':
    httpd = start_test_server()
    try:
        test()
    finally:
        httpd.shutdown()
