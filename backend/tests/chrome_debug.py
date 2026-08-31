import subprocess
import time
import json
import urllib.request
import socket
import base64
import os
import struct

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
    if "101" not in res:
        raise Exception("Handshake failed: " + res)
    return s

def send_ws_json(s, obj):
    data = json.dumps(obj).encode()
    length = len(data)
    # Masked frame from client
    frame = bytearray([0x81]) # text frame, FIN
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
    masked_data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
    frame.extend(masked_data)
    s.sendall(frame)

def recv_ws_frame(s):
    header = s.recv(2)
    if not header:
        return None
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", s.recv(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", s.recv(8))[0]
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk:
            break
        data.extend(chunk)
    return json.loads(data.decode(errors='ignore'))

# 1. Start Chrome
cmd = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=C:/Users/Harsh/AppData/Local/Temp/chrome_debug_profile",
    "http://localhost:3000"
]

proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2)

try:
    res = urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5)
    tabs = json.loads(res.read().decode())
    target = None
    for t in tabs:
        if "localhost:3000" in t.get("url", ""):
            target = t
            break
    
    if not target:
        print("Could not find localhost:3000 tab!")
        sys.exit(1)

    ws_url = target["webSocketDebuggerUrl"]
    # parse ws://127.0.0.1:9222/devtools/page/...
    path = "/" + ws_url.split("/", 3)[3]
    s = make_ws_handshake("127.0.0.1", 9222, path)

    # Enable Console and Runtime
    send_ws_json(s, {"id": 1, "method": "Console.enable"})
    send_ws_json(s, {"id": 2, "method": "Runtime.enable"})
    send_ws_json(s, {"id": 3, "method": "Log.enable"})

    # Evaluate document and check errors
    time.sleep(1)
    
    # Send evaluate expression to check views
    eval_req = {
        "id": 10,
        "method": "Runtime.evaluate",
        "params": {
            "expression": """
            (() => {
                const views = ['landing', 'home', 'practice', 'live-quiz', 'wallet', 'profile', 'admin'];
                const status = {};
                for (const v of views) {
                    const el = document.getElementById('view-' + v);
                    status[v] = {
                        exists: !!el,
                        display: el ? el.style.display : null,
                        htmlLength: el ? el.innerHTML.trim().length : 0
                    };
                }
                const appExists = typeof window.DishaApp !== 'undefined';
                const currentRoute = appExists ? window.DishaApp.currentRoute : null;
                const bottomNav = document.getElementById('bottom-nav');
                return {
                    appExists,
                    currentRoute,
                    bottomNavDisplay: bottomNav ? bottomNav.style.display : null,
                    views: status
                };
            })()
            """,
            "returnByValue": True
        }
    }
    send_ws_json(s, eval_req)

    # Listen for messages
    s.settimeout(3.0)
    for _ in range(20):
        try:
            msg = recv_ws_frame(s)
            if not msg:
                break
            if msg.get("id") == 10:
                print("EVAL RESULT:")
                print(json.dumps(msg.get("result", {}).get("result", {}).get("value", {}), indent=2))
            elif msg.get("method") == "Runtime.exceptionThrown":
                print("\n[BROWSER EXCEPTION THROWN]:")
                print(json.dumps(msg.get("params", {}), indent=2))
            elif msg.get("method") == "Console.messageAdded":
                print("[CONSOLE]:", msg.get("params", {}))
        except socket.timeout:
            break

except Exception as e:
    print("Debug error:", e)
finally:
    proc.kill()
