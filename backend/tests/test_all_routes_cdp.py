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

cmd = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--user-data-dir=C:/Users/Harsh/AppData/Local/Temp/chrome_test_all_routes",
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

    time.sleep(1)

    routes = ['home', 'practice', 'live-quiz', 'wallet', 'profile', 'landing', 'admin']
    print("================================================================================")
    print("TESTING IN-BROWSER NAVIGATION & RENDERING ACROSS ALL DISHA ROUTES")
    print("================================================================================\n")

    msg_id = 100
    for r in routes:
        msg_id += 1
        expr = f"""
        (() => {{
            window.DishaApp.navigateTo('{r}');
            const el = document.getElementById('view-{r}');
            return {{
                route: '{r}',
                displayed: el ? el.style.display : 'missing',
                htmlLength: el ? el.innerHTML.trim().length : 0,
                hasContent: el ? el.innerHTML.trim().length > 50 : false
            }};
        }})()
        """
        send_ws_json(s, {
            "id": msg_id,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True}
        })
        
        # receive response
        s.settimeout(2.0)
        while True:
            msg = recv_ws_frame(s)
            if not msg:
                break
            if msg.get("id") == msg_id:
                if "exceptionDetails" in msg.get("result", {}):
                    print(f"[ERROR in {r}]:", msg["result"]["exceptionDetails"])
                else:
                    val = msg.get("result", {}).get("result", {}).get("value", {})
                    status = "[PASS]" if val.get("hasContent") and val.get("displayed") == "block" else "[FAIL]"
                    print(f"{status} Route: {r.upper():10} | Display: {val.get('displayed')} | HTML Length: {val.get('htmlLength')} bytes")
                break

    print("\n================================================================================")
    print("ALL ROUTES TESTED IN REAL CHROME ENGINE")
    print("================================================================================")

except Exception as e:
    print("CDP Error:", e)
finally:
    proc.kill()
