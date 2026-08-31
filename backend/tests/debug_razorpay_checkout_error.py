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
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s = socket.create_connection((host, port), timeout=5)
    s.sendall(req.encode())
    res = s.recv(4096).decode(errors='ignore')
    return s

def send_ws_json(s, obj):
    data = json.dumps(obj).encode()
    length = len(data)
    frame = bytearray([0x81])
    mask = os.urandom(4)
    if length < 126:
        frame.append(0x80 | length)
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
    if length == 126:
        length = struct.unpack("!H", s.recv(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", s.recv(8))[0]
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk: break
        data.extend(chunk)
    return json.loads(data.decode(errors='ignore'))

# Ensure server is running
cmd = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new", "--remote-debugging-port=9222", "--disable-gpu", "--no-sandbox",
    "--incognito", "http://localhost:3000"
]
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2)

try:
    res = urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5)
    tabs = json.loads(res.read().decode())
    target = [t for t in tabs if "localhost:3000" in t.get("url", "")][0]
    s = make_ws_handshake("127.0.0.1", 9222, "/" + target["webSocketDebuggerUrl"].split("/", 3)[3])

    send_ws_json(s, {"id": 1, "method": "Runtime.enable"})
    send_ws_json(s, {"id": 2, "method": "Log.enable"})
    send_ws_json(s, {"id": 3, "method": "Network.enable"})
    send_ws_json(s, {"id": 4, "method": "Page.navigate", "params": {"url": "http://localhost:3000/"}})
    time.sleep(2)

    # 1. Login user & open Add Cash
    expr = """
    (async () => {
        const user = { id: 'usr_test_user_01', name: 'Rohan Sharma', phone: '+919876543210', avatar: '👨‍🎓', role: 'USER' };
        localStorage.setItem('disha_user_session', JSON.stringify(user));
        localStorage.setItem('disha_auth_token', 'usr_test_user_01:USER:' + (Date.now() + 86400000) + ':sig');
        sessionStorage.setItem('disha_active_session', 'true');
        window.DishaApp.onAuthSuccess('Logged in');
        window.DishaApp.navigateTo('wallet');
        
        // Trigger Add cash modal
        window.Wallet.showAddCashModal();
        const input = document.getElementById('addcash-amount-input');
        if (input) input.value = '500';

        // Listen for all window error & razorpay events
        window._rzp_debug_logs = [];
        window.addEventListener('error', (e) => {
            window._rzp_debug_logs.push({ type: 'window.error', msg: e.message, filename: e.filename });
        });

        // Click Add Cash to trigger order creation & Razorpay Checkout
        const addBtn = document.getElementById('btn-confirm-addcash');
        if (addBtn) addBtn.click();

        return { triggered: true };
    })()
    """
    send_ws_json(s, {
        "id": 10,
        "method": "Runtime.evaluate",
        "params": {"expression": expr, "awaitPromise": True, "returnByValue": True}
    })

    # Collect console logs & network requests for 5 seconds
    time.sleep(5)

    send_ws_json(s, {
        "id": 20,
        "method": "Runtime.evaluate",
        "params": {
            "expression": """
            (() => {
                const rzpIframe = document.querySelector('iframe.razorpay-checkout-frame');
                const toast = document.querySelector('.toast');
                return {
                    rzpIframePresent: !!rzpIframe,
                    iframeSrc: rzpIframe ? rzpIframe.src : null,
                    toastText: toast ? toast.innerText : null,
                    debugLogs: window._rzp_debug_logs || []
                };
            })()
            """,
            "returnByValue": True
        }
    })

    s.settimeout(3.0)
    failed_requests = []
    console_messages = []
    eval_result = {}

    while True:
        try:
            msg = recv_ws_frame(s)
            if not msg: break
            if msg.get("id") == 20:
                eval_result = msg.get("result", {}).get("result", {}).get("value", {})
            elif msg.get("method") == "Network.responseReceived":
                resp = msg["params"]["response"]
                if resp["status"] >= 400:
                    failed_requests.append({
                        "url": resp["url"],
                        "status": resp["status"],
                        "statusText": resp["statusText"]
                    })
            elif msg.get("method") == "Log.entryAdded":
                console_messages.append(msg["params"]["entry"])
        except socket.timeout:
            break

    print("================================================================================")
    print("RAZORPAY CHECKOUT DEBUG ANALYSIS")
    print("================================================================================")
    print("Iframe & UI State:", json.dumps(eval_result, indent=2))
    print("\nFailed Network Requests:", json.dumps(failed_requests, indent=2))
    print("\nConsole Messages:", json.dumps(console_messages, indent=2))

finally:
    proc.kill()
