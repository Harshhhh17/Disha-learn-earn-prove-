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

# Launch clean Chrome
cmd = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=C:/Users/Harsh/AppData/Local/Temp/chrome_real_user_test",
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

    ws_url = target["webSocketDebuggerUrl"]
    path = "/" + ws_url.split("/", 3)[3]
    s = make_ws_handshake("127.0.0.1", 9222, path)

    send_ws_json(s, {"id": 1, "method": "Runtime.enable"})
    send_ws_json(s, {"id": 2, "method": "Log.enable"})
    send_ws_json(s, {"id": 3, "method": "Page.enable"})

    # Explicitly navigate to http://localhost:3000
    send_ws_json(s, {"id": 4, "method": "Page.navigate", "params": {"url": "http://localhost:3000/"}})
    
    # Wait for page load and module execution
    time.sleep(3)

    # Check DOM state
    send_ws_json(s, {
        "id": 10,
        "method": "Runtime.evaluate",
        "params": {
            "expression": """
            (() => {
                const home = document.getElementById('view-home');
                const landing = document.getElementById('view-landing');
                const app = window.DishaApp;
                return {
                    url: window.location.href,
                    appDefined: typeof app !== 'undefined',
                    currentRoute: app ? app.currentRoute : null,
                    homeDisplay: home ? home.style.display : null,
                    homeLength: home ? home.innerHTML.length : 0,
                    landingDisplay: landing ? landing.style.display : null,
                    landingLength: landing ? landing.innerHTML.length : 0
                };
            })()
            """,
            "returnByValue": True
        }
    })

    s.settimeout(3.0)
    for _ in range(30):
        try:
            msg = recv_ws_frame(s)
            if not msg:
                break
            if msg.get("id") == 10:
                print("LOAD STATE AFTER 3 SECONDS:")
                print(json.dumps(msg.get("result", {}).get("result", {}).get("value", {}), indent=2))
            elif msg.get("method") == "Runtime.exceptionThrown":
                print("[BROWSER RUNTIME EXCEPTION]:", json.dumps(msg["params"], indent=2))
            elif msg.get("method") == "Log.entryAdded":
                print("[LOG ENTRY]:", msg["params"])
        except socket.timeout:
            break

    s.settimeout(2.0)
    for _ in range(30):
        try:
            msg = recv_ws_frame(s)
            if not msg:
                break
            if msg.get("id") == 10:
                print("INITIAL LOAD STATE:")
                print(json.dumps(msg.get("result", {}).get("result", {}).get("value", {}), indent=2))
            elif msg.get("method") == "Runtime.exceptionThrown":
                print("[EXCEPTION]:", msg["params"])
            elif msg.get("method") == "Log.entryAdded":
                print("[LOG]:", msg["params"])
        except socket.timeout:
            break

except Exception as e:
    print("Test Error:", e)
finally:
    proc.kill()
