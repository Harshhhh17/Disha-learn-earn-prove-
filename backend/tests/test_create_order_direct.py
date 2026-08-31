import urllib.request
import json

token = "usr_demo:USER:1787999999:sig" # Let's get real token from /api/auth/verify-otp

req = urllib.request.Request("http://127.0.0.1:3000/api/auth/request-otp", data=json.dumps({"identifier": "+919876543210"}).encode(), headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    print("OTP REQUEST:", resp.read().decode())

req = urllib.request.Request("http://127.0.0.1:3000/api/auth/verify-otp", data=json.dumps({"identifier": "+919876543210", "otp": "123456"}).encode(), headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode())
    token = res["token"]
    print("AUTH TOKEN:", token)

req = urllib.request.Request(
    "http://127.0.0.1:3000/api/payments/create-order",
    data=json.dumps({"amountRupees": 500}).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
)
try:
    with urllib.request.urlopen(req) as resp:
        order_data = json.loads(resp.read().decode())
        print("CREATE ORDER SUCCESS:", json.dumps(order_data))

    req_verify = urllib.request.Request(
        "http://127.0.0.1:3000/api/payments/verify",
        data=json.dumps({
            "razorpay_order_id": order_data["razorpayOrderId"],
            "razorpay_payment_id": order_data["testPaymentId"],
            "razorpay_signature": order_data["testSignature"]
        }).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req_verify) as resp:
        verify_data = json.loads(resp.read().decode())
        print("\nVERIFY PAYMENT SUCCESS:", json.dumps(verify_data))

    # Test idempotency by verifying same payment again
    with urllib.request.urlopen(req_verify) as resp:
        replay_data = json.loads(resp.read().decode())
        print("\nIDEMPOTENT REPLAY SUCCESS:", json.dumps(replay_data))

except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code, e.read().decode())
except Exception as e:
    print("EXCEPTION:", e)
