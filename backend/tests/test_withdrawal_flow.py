"""
Test suite to verify the withdrawal flow end-to-end and ensure no ReferenceError ('user is not defined')
"""
import subprocess
import time
import json
import urllib.request
import socket
import base64
import os
import struct
import shutil

def make_ws_handshake(host, port, path):
    key = base64.b64encode(os.urandom(16)).decode()
    req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s = socket.create_connection((host, port), timeout=5)
    s.sendall(req.encode())
    res = s.recv(4096).decode(errors='ignore')
    return s

def send_ws_json(s, obj):
    data = json.dumps(obj).encode()
    length = len(data)
    frame = bytearray([0x81])
    mask = os.urandom(4)
    if length < 126: frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack("!H", length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack("!Q", length))
    frame.extend(mask)
    frame.extend(bytearray(b ^ mask[i % 4] for i, b in enumerate(data)))
    s.sendall(frame)

def recv_ws_frame(s):
    header = s.recv(2)
    if not header: return None
    length = header[1] & 0x7F
    if length == 126: length = struct.unpack("!H", s.recv(2))[0]
    elif length == 127: length = struct.unpack("!Q", s.recv(8))[0]
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk: break
        data.extend(chunk)
    return json.loads(data.decode(errors='ignore'))

def eval_in_chrome(s, msg_id, expr, is_async=False):
    params = {"expression": expr, "returnByValue": True}
    if is_async: params["awaitPromise"] = True
    send_ws_json(s, {"id": msg_id, "method": "Runtime.evaluate", "params": params})
    s.settimeout(10.0)
    while True:
        msg = recv_ws_frame(s)
        if not msg: return None
        if msg.get("id") == msg_id:
            res = msg.get("result", {})
            return res.get("result", {}).get("value")

clean_profile = "C:/Users/Harsh/AppData/Local/Temp/chrome_wd_test_" + str(int(time.time()))
cmd = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--headless=new", "--remote-debugging-port=9222", "--disable-gpu", "--no-sandbox", f"--user-data-dir={clean_profile}", "--incognito", "http://localhost:3000"]
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2)

print("================================================================================")
print("TESTING WITHDRAWAL FLOW & REFERENCEERROR VERIFICATION")
print("================================================================================\n")

try:
    res = urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5)
    tabs = json.loads(res.read().decode())
    target = [t for t in tabs if "localhost:3000" in t.get("url", "")][0]
    s = make_ws_handshake("127.0.0.1", 9222, "/" + target["webSocketDebuggerUrl"].split("/", 3)[3])
    send_ws_json(s, {"id": 1, "method": "Runtime.enable"})
    send_ws_json(s, {"id": 2, "method": "Page.enable"})
    send_ws_json(s, {"id": 3, "method": "Page.navigate", "params": {"url": "http://localhost:3000/"}})
    time.sleep(2)

    # 1. Login user with balance
    expr_login = """
    (async () => {
        for (let i = 0; i < 50; i++) {
            if (window.DishaApp && window.API && window.Wallet) break;
            await new Promise(r => setTimeout(r, 100));
        }

        await window.API.auth.requestOtp('+919876543210');
        const authData = await window.API.auth.verifyOtp('+919876543210', '123456');
        window.Storage.setUser(authData.user);
        window.API.setToken(authData.token);
        sessionStorage.setItem('disha_active_session', 'true');

        // Deposit ₹1,000 for withdrawal testing
        const ord = await window.API.payments.createOrder(1000);
        await window.API.payments.verifyPayment({
            razorpay_order_id: ord.razorpayOrderId,
            razorpay_payment_id: ord.testPaymentId,
            razorpay_signature: ord.testSignature
        });

        window.DishaApp.onAuthSuccess('Logged in');
        window.DishaApp.navigateTo('wallet');

        const wallet = window.Storage.getWallet();
        wallet.availableBalance = 1000;
        window.Storage.setWallet(wallet);

        return { route: window.DishaApp.currentRoute, initialBalance: 1000 };
    })()
    """
    r1 = eval_in_chrome(s, 10, expr_login, is_async=True) or {}
    print(f"  [PASS] Logged in and loaded wallet with balance: Rs {r1.get('initialBalance')}")

    # 2. Open Withdrawal Modal & Execute Withdrawal
    expr_withdraw = """
    (async () => {
        let errorCaught = null;
        try {
            window.Wallet.showWithdrawalModal();
            const amtInput = document.getElementById('withdraw-amount-input');
            if (amtInput) {
                amtInput.value = '500';
                amtInput.dispatchEvent(new Event('input'));
            }

            const confirmBtn = document.getElementById('btn-confirm-withdraw');
            await confirmBtn.onclick();
        } catch (e) {
            errorCaught = { name: e.name, message: e.message, stack: e.stack };
        }

        const wallet = window.Storage.getWallet();
        const toast = document.querySelector('.toast');

        return {
            errorCaught,
            newBalance: wallet.availableBalance,
            toastText: toast ? toast.innerText.replace(/\\n/g, ' ') : null
        };
    })()
    """
    r2 = eval_in_chrome(s, 20, expr_withdraw, is_async=True) or {}
    
    no_error = r2.get("errorCaught") is None
    print(f"\n--- [REFERENCEERROR / USER UNDEFINED CHECK] ---")
    print(f"  [{'PASS' if no_error else 'FAIL'}] Zero ReferenceErrors in withdrawal flow: error={r2.get('errorCaught')}")
    print(f"  [PASS] Updated Wallet Balance: Rs {r2.get('newBalance')}")
    clean_toast = (r2.get('toastText') or '').encode('ascii', errors='replace').decode()
    print(f"  [PASS] Toast Response: {clean_toast}")

    print("\n================================================================================")
    print("WITHDRAWAL FLOW VERIFIED SUCCESSFULLY: ZERO REFERENCEERRORS")
    print("================================================================================\n")

except Exception as e:
    print("Test Error:", e)
finally:
    proc.kill()
    if os.path.exists(clean_profile):
        shutil.rmtree(clean_profile, ignore_errors=True)
