import subprocess, time, json, urllib.request, socket, base64, os, struct

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
    if length < 126:
        frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack("!H", length))
    frame.extend(mask)
    frame.extend(bytearray(b ^ mask[i % 4] for i, b in enumerate(data)))
    s.sendall(frame)

def recv_ws_frame(s):
    header = s.recv(2)
    if not header: return None
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", s.recv(2))[0]
    data = bytearray()
    while len(data) < length:
        chunk = s.recv(length - len(data))
        if not chunk: break
        data.extend(chunk)
    return json.loads(data.decode(errors='ignore'))

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
    send_ws_json(s, {"id": 2, "method": "Page.enable"})
    send_ws_json(s, {"id": 3, "method": "Page.navigate", "params": {"url": "http://localhost:3000/"}})
    time.sleep(2)

    send_ws_json(s, {
        "id": 10,
        "method": "Runtime.evaluate",
        "params": {
            "expression": """
            (() => {
                try {
                    window.DishaApp.navigateTo('live-quiz');
                    const el = document.getElementById('view-live-quiz');
                    return {
                        success: true,
                        display: el.style.display,
                        len: el.innerHTML.length
                    };
                } catch (e) {
                    return { success: false, error: e.message, stack: e.stack };
                }
            })()
            """,
            "returnByValue": True
        }
    })
    s.settimeout(2.0)
    while True:
        msg = recv_ws_frame(s)
        if not msg: break
        if msg.get("id") == 10:
            print("LIVE-QUIZ EVAL RESULT:", json.dumps(msg.get("result", {}), indent=2))
            break
finally:
    proc.kill()
