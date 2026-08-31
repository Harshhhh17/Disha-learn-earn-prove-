import urllib.request
import json
import traceback

try:
    with urllib.request.urlopen("http://127.0.0.1:3000/health", timeout=3) as resp:
        print("Status:", resp.status)
        print("Body:", resp.read().decode())
except Exception as e:
    print("Error:", e)
    traceback.print_exc()
