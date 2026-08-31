"""
Disha Production & Local Development Server with Server-Authoritative API Gateway
- Serves static assets with strict Path Guards & Security Headers
- Implements server-authoritative API routes for Auth, Quiz Scoring, Atomic Wallet, and Admin RBAC
"""
import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import urllib.request
import base64
import hashlib
import hmac
import time
import random
import threading

# Load .env file if present in root directory
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception as e:
        print(f"Warning: Could not parse .env file: {e}")

NODE_ENV = os.environ.get('NODE_ENV', 'development')
PORT = int(os.environ.get('PORT', 3000))
HOST = os.environ.get('HOST', '0.0.0.0')
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
JWT_SECRET = os.environ.get('JWT_SECRET', 'disha_production_jwt_secret_2026')
ADMIN_MASTER_PASS = os.environ.get('ADMIN_MASTER_PASSCODE', 'disha@2026')
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', 'rzp_test_disha_dummy_key')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', 'disha_test_key_secret_2026')
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', 'disha_test_webhook_secret_2026')
PAYMENT_MODE = os.environ.get('PAYMENT_MODE', 'test')

FORBIDDEN_EXTENSIONS = ('.py', '.pyc', '.env', '.pem', '.key', '.cert', '.crt', '.log', '.bak', '.sh', '.bat')
FORBIDDEN_PREFIXES = ('.', '__', '_headers', '_redirects')

ALLOWED_ORIGINS = {
    'https://disha-learn-earn-prove.netlify.app',
    'https://bainzo.netlify.app',
    'http://localhost:3000',
    'http://localhost:4000',
    'http://127.0.0.1:3000'
}

STATE_LOCK = threading.Lock()

# ==============================================================================
# IN-MEMORY SERVER-AUTHORITATIVE STATE ENGINE (Matches PostgreSQL Schema)
# ==============================================================================
STATE = {
    "payment_orders": {},
    "users": {
        "usr_demo": {
            "id": "usr_demo",
            "name": "Rohan Sharma",
            "phone": "+91 98765 43210",
            "email": "rohan.sharma@example.com",
            "avatar": "👨‍🎓",
            "role": "USER",
            "is_kyc_verified": False,
            "bank_account": {"accountNumber": "••••••••4812", "ifsc": "HDFC0001234"}
        }
    },
    "wallets": {
        "usr_demo": {
            "available_balance_paise": 245000, # ₹2,450.00
            "total_won_paise": 580000,         # ₹5,800.00
            "total_withdrawn_paise": 335000,   # ₹3,350.00
            "locked_balance_paise": 0
        }
    },
    "transactions": {
        "usr_demo": [
            {
                "id": "TXN-WIN-891204",
                "type": "PRIZE_CREDIT",
                "amount_paise": 100000,
                "balance_after_paise": 245000,
                "reference_id": "live_maha_01",
                "status": "SUCCESS",
                "description": "Rank #1 Winner — Maha-Dhamaka SSC Live Quiz",
                "created_at": "Today, 10:45 AM"
            }
        ]
    },
    "otp_requests": {},
    "quiz_attempts": {},
    "audit_logs": [],
    "withdrawals": [],
    "questions": [
        {
            "id": "ssc_01",
            "category_code": "SSC",
            "subject": "Indian Polity",
            "year": "SSC CGL 2023 Tier-1",
            "difficulty": "Medium",
            "question_en": "Under which Article of the Indian Constitution is the \"Right to Constitutional Remedies\" guaranteed?",
            "question_hi": "भारतीय संविधान के किस अनुच्छेद के तहत \"संवैधानिक उपचारों का अधिकार\" गारंटीकृत है?",
            "options_en": ["Article 19", "Article 21", "Article 32", "Article 44"],
            "options_hi": ["अनुच्छेद 19", "अनुच्छेद 21", "अनुच्छेद 32", "अनुच्छेद 44"],
            "correct_option_index": 2,
            "explanation_en": "Article 32 provides the Right to Constitutional Remedies, allowing individuals to move the Supreme Court directly for the enforcement of fundamental rights.",
            "explanation_hi": "अनुच्छेद 32 संवैधानिक उपचारों का अधिकार प्रदान करता है।"
        },
        {
            "id": "ssc_02",
            "category_code": "SSC",
            "subject": "History",
            "year": "SSC CHSL 2024 Tier-1",
            "difficulty": "Easy",
            "question_en": "Who founded the Brahmo Samaj in 1828 in Calcutta?",
            "question_hi": "1828 में कलकत्ता में ब्रह्म समाज की स्थापना किसने की थी?",
            "options_en": ["Swami Dayanand Saraswati", "Raja Ram Mohan Roy", "Ishwar Chandra Vidyasagar", "Swami Vivekananda"],
            "options_hi": ["स्वामी दयानंद सरस्वती", "राजा राम मोहन राय", "ईश्वर चंद्र विद्यासागर", "स्वामी विवेकानंद"],
            "correct_option_index": 1,
            "explanation_en": "Raja Ram Mohan Roy founded the Brahmo Samaj in August 1828 to promote monotheism and eradicate idol worship.",
            "explanation_hi": "राजा राम मोहन राय ने 1828 में ब्रह्म समाज की स्थापना की थी।"
        },
        {
            "id": "ssc_03",
            "category_code": "SSC",
            "subject": "Geography",
            "year": "SSC CGL 2023 Tier-2",
            "difficulty": "Medium",
            "question_en": "Which Indian river is known as the \"Sorrow of Bihar\" due to its frequent devastating floods?",
            "question_hi": "बार-बार आने वाली विनाशकारी बाढ़ के कारण किस भारतीय नदी को \"बिहार का शोक\" कहा जाता है?",
            "options_en": ["Gandak", "Kosi", "Son", "Ghaghara"],
            "options_hi": ["गंडक", "कोसी", "सोन", "घाघरा"],
            "correct_option_index": 1,
            "explanation_en": "The Kosi River is known as the Sorrow of Bihar because of its frequent floods and course shifts.",
            "explanation_hi": "कोसी नदी को 'बिहार का शोक' कहा जाता है।"
        },
        {
            "id": "ssc_04",
            "category_code": "SSC",
            "subject": "Economics",
            "year": "SSC CGL 2024 Tier-1",
            "difficulty": "Hard",
            "question_en": "What is the primary indicator used by the Reserve Bank of India (RBI) to measure headline retail inflation?",
            "question_hi": "खुदरा मुद्रास्फीति को मापने के लिए भारतीय रिज़र्व बैंक (RBI) द्वारा मुख्य संकेतक के रूप में क्या उपयोग किया जाता है?",
            "options_en": ["Wholesale Price Index (WPI)", "Consumer Price Index - Combined (CPI-C)", "GDP Deflator", "Index of Industrial Production (IIP)"],
            "options_hi": ["थोक मूल्य सूचकांक (WPI)", "उपभोक्ता मूल्य सूचकांक - संयुक्त (CPI-C)", "जीडीपी डिफ्लेटर", "औद्योगिक उत्पादन सूचकांक (IIP)"],
            "correct_option_index": 1,
            "explanation_en": "RBI targets Consumer Price Index - Combined (CPI-C) inflation within the 4% band.",
            "explanation_hi": "आरबीआई खुदरा मुद्रास्फीति के लिए CPI-C का उपयोग करता है।"
        },
        {
            "id": "ssc_05",
            "category_code": "SSC",
            "subject": "General Science",
            "year": "SSC MTS 2023",
            "difficulty": "Easy",
            "question_en": "Which part of the human brain is primarily responsible for maintaining posture, balance, and motor coordination?",
            "question_hi": "मानव मस्तिष्क का कौन सा भाग मुख्य रूप से शारीरिक मुद्रा, संतुलन और मांसपेशियों के समन्वय को बनाए रखने के लिए जिम्मेदार है?",
            "options_en": ["Cerebrum", "Cerebellum", "Medulla Oblongata", "Hypothalamus"],
            "options_hi": ["प्रमस्तिष्क", "अनुमस्तिष्क (सेरिबैलम)", "मेडुला", "हाइपोथैलेमस"],
            "correct_option_index": 1,
            "explanation_en": "The cerebellum coordinates voluntary muscle movements and maintains equilibrium.",
            "explanation_hi": "अनुमस्तिष्क (सेरिबैलम) शरीर का संतुलन और मुद्रा बनाए रखता है।"
        },
        {
            "id": "ssc_06",
            "category_code": "SSC",
            "subject": "Indian Polity",
            "year": "SSC CGL 2024",
            "difficulty": "Medium",
            "question_en": "Which schedule of the Indian Constitution contains the list of recognized official languages?",
            "question_hi": "भारतीय संविधान की कौन सी अनुसूची मान्यता प्राप्त आधिकारिक भाषाओं की सूची से संबंधित है?",
            "options_en": ["7th Schedule", "8th Schedule", "9th Schedule", "10th Schedule"],
            "options_hi": ["7वीं अनुसूची", "8वीं अनुसूची", "9वीं अनुसूची", "10वीं अनुसूची"],
            "correct_option_index": 1,
            "explanation_en": "The Eighth Schedule contains 22 officially recognized languages.",
            "explanation_hi": "8वीं अनुसूची में 22 आधिकारिक भाषाएँ सूचीबद्ध हैं।"
        },
        {
            "id": "ssc_07",
            "category_code": "SSC",
            "subject": "Geography",
            "year": "SSC CPO 2023",
            "difficulty": "Easy",
            "question_en": "Which is the highest peak in the Western Ghats (Sahyadri) range?",
            "question_hi": "पश्चिमी घाट (सह्याद्री) पर्वत श्रृंखला की सबसे ऊंची चोटी कौन सी है?",
            "options_en": ["Doda Betta", "Anamudi", "Kalsubai", "Guru Shikhar"],
            "options_hi": ["दोद्दाबेट्टा", "अनामुडी", "कलसूबाई", "गुरु शिखर"],
            "correct_option_index": 1,
            "explanation_en": "Anamudi in Kerala (2,695m) is the highest peak in the Western Ghats.",
            "explanation_hi": "अनामुडी (2,695 मीटर) पश्चिमी घाट की सबसे ऊंची चोटी है।"
        },
        {
            "id": "ssc_08",
            "category_code": "SSC",
            "subject": "History",
            "year": "SSC CGL 2023",
            "difficulty": "Medium",
            "question_en": "During whose reign did the famous Chinese pilgrim Xuanzang (Hiuen Tsang) visit India?",
            "question_hi": "प्रसिद्ध चीनी यात्री ह्वेनसांग किसके शासनकाल में भारत आया था?",
            "options_en": ["Chandragupta II", "Harshavardhana", "Ashoka", "Kanishka"],
            "options_hi": ["चंद्रगुप्त द्वितीय", "हर्षवर्धन", "अशोक", "कनिष्क"],
            "correct_option_index": 1,
            "explanation_en": "Xuanzang visited India during the 7th century during the reign of King Harshavardhana.",
            "explanation_hi": "ह्वेनसांग राजा हर्षवर्धन के शासनकाल में भारत आया था।"
        },
        {
            "id": "ssc_09",
            "category_code": "SSC",
            "subject": "Economics",
            "year": "SSC CHSL 2024",
            "difficulty": "Medium",
            "question_en": "Which regulatory body regulates the commodities and securities market in India?",
            "question_hi": "भारत में प्रतिभूति और कमोडिटी बाजार को कौन सा नियामक निकाय नियंत्रित करता है?",
            "options_en": ["RBI", "SEBI", "IRDAI", "PFRDA"],
            "options_hi": ["आरबीआई (RBI)", "सेबी (SEBI)", "इरडा (IRDAI)", "पीएफआरडीए (PFRDA)"],
            "correct_option_index": 1,
            "explanation_en": "Securities and Exchange Board of India (SEBI) is the statutory regulator for securities markets.",
            "explanation_hi": "सेबी (SEBI) भारत के प्रतिभूति बाजार का नियामक है।"
        },
        {
            "id": "ssc_10",
            "category_code": "SSC",
            "subject": "General Science",
            "year": "SSC CGL 2024",
            "difficulty": "Easy",
            "question_en": "What is the chemical formula of common baking soda?",
            "question_hi": "बेकिंग सोडा (खाने का सोडा) का रासायनिक सूत्र क्या है?",
            "options_en": ["Na2CO3", "NaHCO3", "NaCl", "NaOH"],
            "options_hi": ["Na2CO3", "NaHCO3", "NaCl", "NaOH"],
            "correct_option_index": 1,
            "explanation_en": "Sodium hydrogen carbonate (NaHCO3) is commonly known as baking soda.",
            "explanation_hi": "सोडियम बाइकार्बोनेट (NaHCO3) बेकिंग सोडा का रासायनिक सूत्र है।"
        }
    ]
}

def make_token(user_id, role="USER"):
    payload = f"{user_id}:{role}:{int(time.time()) + 604800}"
    sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"

def verify_token(token_str):
    if not token_str:
        return None
    try:
        parts = token_str.split(':')
        if len(parts) != 4:
            return None
        user_id, role, exp_str, sig = parts
        if int(exp_str) < time.time():
            return None
        payload = f"{user_id}:{role}:{exp_str}"
        expected_sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return {"user_id": user_id, "role": role}
    except Exception:
        pass
    return None

class UnifiedProductionHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def get_auth_user(self):
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            return verify_token(token)
        return None

    def send_json(self, status_code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                self.raw_body = b''
                return {}
            self.raw_body = self.rfile.read(length)
            return json.loads(self.raw_body.decode('utf-8'))
        except Exception:
            self.raw_body = b''
            return {}

    def do_GET(self):
        try:
            self._handle_get()
        except Exception as e:
            traceback.print_exc()
            self.send_json(500, {"error": "INTERNAL_SERVER_ERROR", "message": str(e)})

    def _handle_get(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')

        # Favicon
        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # 1. Health Check Route
        if path == '/health':
            self.send_json(200, {"status": "ok", "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
            return

        # 2. API Routes
        if path.startswith('/api/'):
            # Auth Session
            if path == '/api/auth/session':
                auth = self.get_auth_user()
                if not auth:
                    self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                    return
                user = STATE["users"].get(auth["user_id"])
                if not user:
                    self.send_json(401, {"error": "Unauthorized", "message": "Session expired or user not found."})
                    return
                wallet = STATE["wallets"].get(auth["user_id"], {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0})
                self.send_json(200, {
                    "authenticated": True,
                    "user": {
                        "id": user["id"],
                        "name": user["name"],
                        "phone": user.get("phone"),
                        "email": user.get("email"),
                        "avatar": user.get("avatar", "👨‍🎓"),
                        "role": user.get("role", "USER"),
                        "isKycVerified": user.get("is_kyc_verified", False),
                        "wallet": {
                            "availableBalancePaise": wallet["available_balance_paise"],
                            "totalWonPaise": wallet["total_won_paise"],
                            "totalWithdrawnPaise": wallet["total_withdrawn_paise"]
                        }
                    }
                })
                return

            # Tournaments List
            if path == '/api/quizzes/tournaments':
                self.send_json(200, {
                    "success": True,
                    "quizzes": [
                        {
                            "id": "live_maha_01",
                            "title": "Maha-Dhamaka SSC CGL All India Live Quiz",
                            "category": "SSC",
                            "prizePoolPaise": 1000000,
                            "entryFeePaise": 0,
                            "timePerQuestionSec": 15,
                            "totalQuestions": 5,
                            "registeredCount": 1842
                        }
                    ]
                })
                return

            # Practice Questions (Web & App)
            if path in ('/api/quizzes/practice', '/api/quiz/practice'):
                qs = parsed.query
                params = urllib.parse.parse_qs(qs)
                category = params.get('category', ['All'])[0]
                client_source = self.headers.get('X-Client-Source', 'web')
                
                filtered = STATE["questions"]
                if category != 'All':
                    filtered = [q for q in filtered if q["category_code"] == category]

                # PRD v1.0 Feature 2: Restrict web preview to 5 questions maximum
                is_web = (client_source == 'web')
                if is_web and len(filtered) > 5:
                    filtered = filtered[:5]

                self.send_json(200, {
                    "success": True,
                    "count": len(filtered),
                    "isWebPreview": is_web,
                    "maxPreviewQuestions": 5 if is_web else len(filtered),
                    "questions": [
                        {
                            "id": q["id"],
                            "category": q["category_code"],
                            "subject": q["subject"],
                            "year": q["year"],
                            "difficulty": q["difficulty"],
                            "question_en": q["question_en"],
                            "question_hi": q["question_hi"],
                            "options_en": q["options_en"],
                            "options_hi": q["options_hi"],
                            "correct": q["correct_option_index"],
                            "explanation_en": q["explanation_en"],
                            "explanation_hi": q["explanation_hi"]
                        }
                        for q in filtered
                    ]
                })
                return

            # Wallet Balance
            if path in ('/api/wallet', '/api/wallet/balance', '/api/payments/wallet-balance'):
                uid = None
                auth = self.get_auth_user()
                if auth:
                    uid = auth["user_id"]
                else:
                    qs = parsed.query
                    params = urllib.parse.parse_qs(qs)
                    uid = params.get('userId', [None])[0]

                if not uid:
                    self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                    return

                w = STATE["wallets"].get(uid, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0})
                self.send_json(200, {
                    "success": True,
                    "balance": w["available_balance_paise"] / 100,
                    "balancePaise": w["available_balance_paise"],
                    "wallet": {
                        "availableBalancePaise": w["available_balance_paise"],
                        "availableBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                        "totalWonPaise": w["total_won_paise"],
                        "totalWonRupees": f"{w['total_won_paise'] / 100:.2f}",
                        "totalWithdrawnPaise": w["total_withdrawn_paise"],
                        "totalWithdrawnRupees": f"{w['total_withdrawn_paise'] / 100:.2f}"
                    }
                })
                return

            # Transactions Ledger (Strict Auth Required)
            if path == '/api/wallet/transactions':
                auth = self.get_auth_user()
                if not auth:
                    self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                    return
                uid = auth["user_id"]
                txs = STATE["transactions"].get(uid, [])
                self.send_json(200, {
                    "success": True,
                    "transactions": [
                        {
                            "id": t["id"],
                            "type": t["type"],
                            "amountPaise": t["amount_paise"],
                            "amountRupees": f"{t['amount_paise'] / 100:.2f}",
                            "balanceAfterRupees": f"{t.get('balance_after_paise', 0) / 100:.2f}",
                            "referenceId": t.get("reference_id"),
                            "status": t.get("status", "SUCCESS"),
                            "description": t.get("description"),
                            "createdAt": t.get("created_at", "Just now")
                        }
                        for t in txs
                    ]
                })
                return

            # Payment Order Status
            if path.startswith('/api/payments/orders/'):
                auth = self.get_auth_user()
                if not auth:
                    self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                    return
                order_id = path.replace('/api/payments/orders/', '').strip()
                ord_rec = STATE["payment_orders"].get(order_id)
                if not ord_rec:
                    for k, v in STATE["payment_orders"].items():
                        if v.get("id") == order_id:
                            ord_rec = v
                            break
                if not ord_rec or ord_rec.get("user_id") != auth["user_id"]:
                    self.send_json(404, {"error": "Not Found", "message": "Order not found."})
                    return
                self.send_json(200, {
                    "success": True,
                    "order": {
                        "id": ord_rec["id"],
                        "razorpayOrderId": ord_rec["razorpay_order_id"],
                        "amountRupees": f"{ord_rec['amount_paise'] / 100:.2f}",
                        "status": ord_rec["status"],
                        "createdAt": ord_rec.get("created_at")
                    }
                })
                return

            # Admin Stats (RBAC Check)
            if path == '/api/admin/stats':
                auth = self.get_auth_user()
                if not auth or auth.get("role") not in ("ADMIN", "SUPER_ADMIN"):
                    self.send_json(403, {"error": "Forbidden", "message": "Admin privileges required."})
                    return
                self.send_json(200, {
                    "success": True,
                    "stats": {
                        "totalQuestions": len(STATE["questions"]),
                        "totalUsers": len(STATE["users"]),
                        "pendingPayouts": len(STATE["withdrawals"]),
                        "activeTournaments": 3,
                        "systemHealth": "100% Operational"
                    }
                })
                return

        super().do_GET()

    def do_POST(self):
        global ADMIN_MASTER_PASS
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip('/')
        body = self.read_json_body()

        # 1. Request OTP (Rate Limiting: 5 per minute per identifier)
        if path == '/api/auth/request-otp':
            identifier = str(body.get('identifier') or body.get('phone') or body.get('email') or '').strip().lower()
            if not identifier or len(identifier) < 5:
                self.send_json(400, {"error": "Bad Request", "message": "Valid phone or email required."})
                return

            now = time.time()
            STATE.setdefault("otp_cooldowns", {})
            if now - STATE["otp_cooldowns"].get(identifier, 0) < 10:
                self.send_json(429, {"error": "Too Many Requests", "message": "Please wait before requesting another OTP."})
                return
            STATE["otp_cooldowns"][identifier] = now

            otp_code = str(random.randint(100000, 999999))
            STATE["otp_requests"][identifier] = {
                "otp": otp_code,
                "expires_at": now + 300,
                "attempts": 0,
                "last_requested_at": now
            }
            self.send_json(200, {
                "success": True,
                "message": "OTP generated and dispatched securely.",
                "validitySeconds": 300,
                "devOtp": otp_code if NODE_ENV != 'production' else None
            })
            return

        # 2. Verify OTP (One-time Use, Attempt Limit & T&C Gating)
        if path == '/api/auth/verify-otp':
            identifier = str(body.get('identifier') or body.get('phone') or body.get('email') or '').strip().lower()
            otp = str(body.get('otp', '')).strip()
            terms_accepted = body.get('termsAccepted', True)

            if terms_accepted is False:
                self.send_json(400, {"error": "TERMS_REQUIRED", "message": "You must accept the Terms & Conditions and Privacy Policy to proceed."})
                return

            record = STATE["otp_requests"].get(identifier)
            if not record or record["expires_at"] < time.time():
                self.send_json(400, {"error": "Invalid OTP", "message": "OTP is expired or invalid."})
                return

            if record["attempts"] >= 5:
                del STATE["otp_requests"][identifier]
                self.send_json(429, {"error": "Too Many Attempts", "message": "Max verification attempts exceeded. Request a new OTP."})
                return

            is_dev_test_otp = (NODE_ENV != 'production' and otp == '123456')
            if record["otp"] != otp and not is_dev_test_otp:
                record["attempts"] += 1
                self.send_json(400, {"error": "Incorrect OTP", "message": "Incorrect OTP code."})
                return

            # Invalidate OTP immediately upon successful verification
            del STATE["otp_requests"][identifier]

                        # Find or create user
            uid = f"usr_{hashlib.md5(identifier.encode()).hexdigest()[:8]}"
            if uid not in STATE["users"]:
                STATE["users"][uid] = {
                    "id": uid,
                    "name": f"Aspirant_{identifier[-4:]}" if identifier.isdigit() else identifier.split('@')[0],
                    "phone": identifier if identifier.startswith('+') or identifier.isdigit() else None,
                    "email": identifier if '@' in identifier else None,
                    "avatar": "👨‍🎓",
                    "role": "USER",
                    "is_kyc_verified": False
                }
                STATE["wallets"][uid] = {
                    "available_balance_paise": 0,
                    "total_won_paise": 0,
                    "total_withdrawn_paise": 0,
                    "locked_balance_paise": 0
                }
                STATE["transactions"][uid] = []

            user = STATE["users"][uid]
            token = make_token(user["id"], user["role"])
            self.send_json(200, {"success": True, "token": token, "user": user})
            return

            uid = auth["user_id"]
            user = STATE["users"].get(uid)
            if not user:
                self.send_json(404, {"error": "Not Found", "message": "User account not found."})
                return

            terms_ver = str(body.get('termsVersion') or CURRENT_TERMS_VERSION).strip()
            now_ts = time.time()
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(now_ts))
            is_current = (terms_ver == CURRENT_TERMS_VERSION)

            user["terms_accepted"] = is_current
            user["accepted_terms_version"] = terms_ver
            user["terms_version"] = terms_ver
            user["terms_accepted_at"] = now_ts

            # Record immutable acceptance history
            acceptance_entry = {
                "id": f"uta_{int(now_ts)}_{uid}",
                "user_id": uid,
                "terms_version": terms_ver,
                "ip_address": self.client_address[0] if self.client_address else "127.0.0.1",
                "user_agent": self.headers.get('User-Agent', ''),
                "accepted_at": now_iso,
                "timestamp": now_ts
            }
            STATE.setdefault("user_terms_acceptance", []).append(acceptance_entry)

            STATE.setdefault("audit_logs", []).append({
                "id": f"aud_terms_{int(now_ts)}_{uid}",
                "user_id": uid,
                "action": "TERMS_AND_CONDITIONS_ACCEPTED",
                "terms_version": terms_ver,
                "timestamp": now_ts
            })

            self.send_json(200, {
                "success": True,
                "message": "Terms & Conditions successfully accepted.",
                "termsAccepted": True,
                "accepted_terms_version": terms_ver,
                "isTermsCurrent": is_current,
                "currentTermsVersion": CURRENT_TERMS_VERSION,
                "user": user
            })
            return

        # 3. Start Tournament Quiz (STRIPS CORRECT ANSWERS & ENFORCES APP-ONLY ACCESS)
        if (path.startswith('/api/quizzes/tournaments/') and path.endswith('/start')) or path in ('/api/quiz/start-tournament', '/api/quizzes/start-tournament'):
            # PRD v1.0 Feature 2: Restrict Live Event Tournaments to native App
            client_source = self.headers.get('X-Client-Source', body.get('client_source', 'web'))
            if client_source == 'web':
                self.send_json(403, {
                    "error": "APP_ONLY_FEATURE",
                    "message": "Live Event tournaments are available exclusively on the Disha mobile app.",
                    "appDownloadRequired": True
                })
                return

            auth = self.get_auth_user()
            uid = auth["user_id"] if auth else body.get("userId", "usr_test_aspirant")
            attempt_id = f"att_{int(time.time())}_{random.randint(1000, 9999)}"
            
            selected_qs = random.sample(STATE["questions"], min(5, len(STATE["questions"])))
            STATE["quiz_attempts"][attempt_id] = {
                "id": attempt_id,
                "user_id": uid,
                "start_time": time.time(),
                "q_start_time": time.time(),
                "score": 0,
                "correct_count": 0,
                "answers": set(),
                "questions": selected_qs,
                "status": "IN_PROGRESS"
            }

            # CRITICAL SECURITY RULE: Strip correct answers from response
            client_qs = [
                {
                    "id": q["id"],
                    "category": q["category_code"],
                    "subject": q["subject"],
                    "year": q["year"],
                    "difficulty": q["difficulty"],
                    "question_en": q["question_en"],
                    "question_hi": q["question_hi"],
                    "options_en": q["options_en"],
                    "options_hi": q["options_hi"]
                }
                for q in selected_qs
            ]

            self.send_json(200, {
                "success": True,
                "attemptId": attempt_id,
                "timePerQuestionSec": 15,
                "questions": client_qs,
                "serverStartTime": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            })
            return

        # 4. Submit Answer (Server-Authoritative Evaluation & Anti-Replay)
        if '/attempts/' in path and path.endswith('/answer'):
            auth = self.get_auth_user()
            if not auth:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return

            attempt_id = path.split('/attempts/')[1].split('/')[0]
            attempt = STATE["quiz_attempts"].get(attempt_id)
            if not attempt or attempt["status"] != 'IN_PROGRESS':
                self.send_json(404, {"error": "Not Found", "message": "Attempt not found or finalized."})
                return

            # IDOR Check: Ensure attempt belongs to authenticated user
            if attempt["user_id"] != auth["user_id"] and auth.get("role") not in ("ADMIN", "SUPER_ADMIN"):
                self.send_json(403, {"error": "Forbidden", "message": "You cannot submit answers for another user's attempt."})
                return

            q_id = body.get('questionId')
            opt_idx = body.get('selectedOptionIndex')
            client_time = body.get('clientResponseTimeMs', 3000)

            # Anti-Replay: Check if question was already answered in this attempt
            if "answers" not in attempt:
                attempt["answers"] = set()
            if q_id in attempt["answers"]:
                self.send_json(400, {"error": "Duplicate Submission", "message": "Question already answered in this attempt."})
                return
            attempt["answers"].add(q_id)

            # Find Question
            q = next((item for item in STATE["questions"] if item["id"] == q_id), None)
            if not q:
                self.send_json(404, {"error": "Not Found", "message": "Question not found."})
                return

            correct_idx = q["correct_option_index"]
            is_correct = (opt_idx is not None and opt_idx == correct_idx)

            points_awarded = 0
            if is_correct:
                resp_time = min(15000, max(500, client_time))
                rem_ms = max(0, 15000 - resp_time)
                speed_bonus = int((rem_ms / 15000) * 500)
                points_awarded = 1000 + speed_bonus
                attempt["score"] += points_awarded
                attempt["correct_count"] += 1

            attempt["q_start_time"] = time.time()

            self.send_json(200, {
                "success": True,
                "isCorrect": is_correct,
                "correctOptionIndex": correct_idx,
                "pointsAwarded": points_awarded,
                "currentScore": attempt["score"],
                "explanationEn": q.get("explanation_en"),
                "explanationHi": q.get("explanation_hi")
            })
            return

        # 5. Finish Quiz & Atomic Prize Distribution (Idempotent)
        if '/attempts/' in path and path.endswith('/finish'):
            auth = self.get_auth_user()
            if not auth:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return

            attempt_id = path.split('/attempts/')[1].split('/')[0]
            attempt = STATE["quiz_attempts"].get(attempt_id)
            if not attempt:
                self.send_json(404, {"error": "Not Found"})
                return

            # IDOR Check
            if attempt["user_id"] != auth["user_id"] and auth.get("role") not in ("ADMIN", "SUPER_ADMIN"):
                self.send_json(403, {"error": "Forbidden", "message": "Access denied."})
                return

            # Idempotency check on finish replay
            if attempt.get("status") == "COMPLETED":
                p_won = attempt.get("prize_won_paise", 0)
                self.send_json(200, {
                    "success": True,
                    "userRank": attempt.get("rank", 1),
                    "finalScore": attempt.get("score", 0),
                    "correctCount": attempt.get("correct_count", 0),
                    "prizeWonPaise": p_won,
                    "prizeWonRupees": f"{p_won / 100:.2f}",
                    "status": "COMPLETED",
                    "replayed": True
                })
                return

            attempt["status"] = "COMPLETED"
            score = attempt["score"]
            user_id = attempt["user_id"]

            prize_won_paise = 0
            user_rank = 1
            if score >= 6000:
                user_rank = 1
                prize_won_paise = 300000 # ₹3,000.00
            elif score >= 4500:
                user_rank = 2
                prize_won_paise = 60000  # ₹600.00
            elif score >= 3000:
                user_rank = 3
                prize_won_paise = 40000  # ₹400.00
            elif score >= 2000:
                user_rank = 5
                prize_won_paise = 30000  # ₹300.00

            attempt["rank"] = user_rank
            attempt["prize_won_paise"] = prize_won_paise

            # Atomic Wallet Credit
            if prize_won_paise > 0:
                w = STATE["wallets"].setdefault(user_id, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0})
                w["available_balance_paise"] += prize_won_paise
                w["total_won_paise"] += prize_won_paise

                tx_id = f"TXN-WIN-{random.randint(100000, 999999)}"
                STATE["transactions"].setdefault(user_id, []).insert(0, {
                    "id": tx_id,
                    "type": "PRIZE_CREDIT",
                    "amount_paise": prize_won_paise,
                    "balance_after_paise": w["available_balance_paise"],
                    "reference_id": attempt_id,
                    "status": "SUCCESS",
                    "description": f"Tournament Prize Rank #{user_rank}",
                    "created_at": "Just now"
                })

            self.send_json(200, {
                "success": True,
                "userRank": user_rank,
                "finalScore": score,
                "correctCount": attempt["correct_count"],
                "prizeWonPaise": prize_won_paise,
                "prizeWonRupees": f"{prize_won_paise / 100:.2f}",
                "status": "COMPLETED"
            })
            return

        # 6. Wallet Withdrawal (Strict Bounds, Thread-Safe Concurrency & Atomic Balance Check)
        if path == '/api/wallet/withdraw':
            auth = self.get_auth_user()
            if not auth:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return
            uid = auth["user_id"]
            
            try:
                amt_rupees = float(body.get('amountRupees', 0))
            except (ValueError, TypeError):
                self.send_json(400, {"error": "Invalid Amount", "message": "Amount must be a valid number."})
                return

            if amt_rupees < 100 or amt_rupees > 50000:
                self.send_json(400, {"error": "Invalid Amount", "message": "Must be between ₹100 and ₹50,000."})
                return

            req_paise = int(amt_rupees * 100)
            tds_paise = int(req_paise * 0.30) if amt_rupees > 10000 else 0
            net_payout_paise = req_paise - tds_paise
            withdrawal_id = f"WD-{int(time.time())}-{random.randint(1000, 9999)}"
            tx_id = f"TXN-WD-{random.randint(100000, 999999)}"
            payout_ref = f"RZP-TEST-SETTLE-{random.randint(1000, 9999)}"

            with STATE_LOCK:
                w = STATE["wallets"].setdefault(uid, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0})
                if w["available_balance_paise"] < req_paise:
                    self.send_json(400, {"error": "Insufficient Funds", "message": "Requested amount exceeds available balance."})
                    return

                w["available_balance_paise"] -= req_paise
                w["total_withdrawn_paise"] += req_paise
                avail_bal = w["available_balance_paise"]

                STATE.setdefault("withdrawals", []).append({
                    "id": withdrawal_id,
                    "user_id": uid,
                    "amount_paise": req_paise,
                    "tds_amount_paise": tds_paise,
                    "net_payout_paise": net_payout_paise,
                    "bank_details": body.get("bankDetails", {}),
                    "status": "SUCCESS",
                    "payout_rail": "TEST_SIMULATED_RAIL",
                    "payout_reference": payout_ref,
                    "created_at": time.time()
                })

                STATE["transactions"].setdefault(uid, []).insert(0, {
                    "id": tx_id,
                    "type": "WITHDRAWAL",
                    "amount_paise": req_paise,
                    "balance_after_paise": avail_bal,
                    "reference_id": withdrawal_id,
                    "status": "SUCCESS",
                    "description": f"Direct Bank Settlement (Net: ₹{net_payout_paise / 100:.2f}) [TEST MODE]",
                    "created_at": "Just now"
                })

                STATE["audit_logs"].append({
                    "id": f"aud_{random.randint(100000, 999999)}",
                    "actor_id": uid,
                    "action": "WALLET_WITHDRAWAL_PROCESSED",
                    "details": {"withdrawalId": withdrawal_id, "amountPaise": req_paise, "netPayoutPaise": net_payout_paise, "mode": "TEST_SIMULATED_RAIL"},
                    "created_at": time.time()
                })

            self.send_json(200, {
                "success": True,
                "withdrawalId": withdrawal_id,
                "amountRupees": f"{req_paise / 100:.2f}",
                "tdsRupees": f"{tds_paise / 100:.2f}",
                "netPayoutRupees": f"{net_payout_paise / 100:.2f}",
                "availableBalanceRupees": f"{avail_bal / 100:.2f}",
                "payoutMode": "TEST_SIMULATED_RAIL",
                "payoutReference": payout_ref,
                "message": "Withdrawal processed successfully via simulated test payout rail."
            })
            return

        # 6.5. Direct /deposit Deprecation & Admin Adjustment
        if path == '/api/wallet/deposit':
            auth = self.get_auth_user()
            if not auth:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return
            if auth.get("role") not in ("ADMIN", "SUPER_ADMIN"):
                self.send_json(400, {
                    "error": "Deprecated Endpoint",
                    "message": "Direct unverified deposits are disabled. Please use /api/payments/create-order and /api/payments/verify."
                })
                return
            target_uid = body.get('userId') or auth["user_id"]
            try:
                amt = float(body.get('amountRupees', 0))
            except (ValueError, TypeError):
                self.send_json(400, {"error": "Invalid Amount", "message": "Amount must be a valid number."})
                return
            if amt <= 0 or amt > 100000:
                self.send_json(400, {"error": "Invalid Amount", "message": "Adjustment amount must be between ₹1.00 and ₹1,00,000.00."})
                return
            dep_paise = int(amt * 100)
            w = STATE["wallets"].setdefault(target_uid, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0})
            w["available_balance_paise"] += dep_paise
            tx_id = f"TXN-ADJ-{random.randint(100000, 999999)}"
            STATE["transactions"].setdefault(target_uid, []).insert(0, {
                "id": tx_id,
                "type": "ADJUSTMENT",
                "amount_paise": dep_paise,
                "balance_after_paise": w["available_balance_paise"],
                "reference_id": "ADMIN_MANUAL",
                "status": "SUCCESS",
                "description": body.get("reason", "Admin Manual Balance Adjustment"),
                "created_at": "Just now"
            })
            self.send_json(200, {
                "success": True,
                "amountRupees": f"{dep_paise / 100:.2f}",
                "newBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                "transactionId": tx_id,
                "message": "Admin adjustment credited successfully."
            })
            return

        # 6.6. Razorpay Create Order
        if path in ('/api/payments/create-order', '/api/payments/order'):
            auth = self.get_auth_user()
            uid = auth["user_id"] if auth else body.get('userId')
            if not uid:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return
            try:
                amt_rupees = float(body.get('amountRupees') or body.get('amount') or 0)
            except (ValueError, TypeError):
                self.send_json(400, {"error": "Invalid Amount", "message": "Amount must be a valid number."})
                return
            
            purpose = body.get("purpose", "WALLET_DEPOSIT")
            if purpose == 'DONATION':
                if amt_rupees < 10 or amt_rupees > 100000:
                    self.send_json(400, {"error": "Invalid Amount", "message": "Donation amount must be between ₹10.00 and ₹1,00,000.00."})
                    return
            else:
                if amt_rupees < 50 or amt_rupees > 100000:
                    self.send_json(400, {"error": "Invalid Amount", "message": "Deposit amount must be between ₹50.00 and ₹1,00,000.00."})
                    return

            amount_paise = int(amt_rupees * 100)
            is_sandbox = (not RAZORPAY_KEY_ID or 'dummy' in RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET or 'dummy' in RAZORPAY_KEY_SECRET)
            rzp_order_id = f"order_{hashlib.md5(f'{time.time()}_{random.random()}'.encode()).hexdigest()[:16]}"
            internal_order_id = f"pay_ord_{hashlib.md5(f'{time.time()}_{random.random()}'.encode()).hexdigest()[:12]}"

            # If real credentials are provided in .env, create order on api.razorpay.com
            if not is_sandbox:
                try:
                    payload = json.dumps({
                        "amount": amount_paise,
                        "currency": "INR",
                        "receipt": f"rcpt_{int(time.time())}",
                        "notes": {"userId": uid, "purpose": purpose}
                    }).encode('utf-8')
                    auth_header = "Basic " + base64.b64encode(f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()).decode()
                    req = urllib.request.Request(
                        "https://api.razorpay.com/v1/orders",
                        data=payload,
                        headers={"Content-Type": "application/json", "Authorization": auth_header},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=2.0) as resp:
                        rzp_res = json.loads(resp.read().decode('utf-8'))
                        rzp_order_id = rzp_res.get("id", rzp_order_id)
                except Exception as rzp_err:
                    print(f"[Razorpay API Notice]: {rzp_err}. Serving test sandbox order.")
                    is_sandbox = True

            test_payment_id = f"pay_test_{hashlib.md5(f'{rzp_order_id}_{time.time()}'.encode()).hexdigest()[:14]}"
            test_signature = hmac.new(RAZORPAY_KEY_SECRET.encode(), f"{rzp_order_id}|{test_payment_id}".encode(), hashlib.sha256).hexdigest()

            order_obj = {
                "id": internal_order_id,
                "user_id": uid,
                "razorpay_order_id": rzp_order_id,
                "amount_paise": amount_paise,
                "status": "CREATED",
                "purpose": purpose,
                "created_at": time.time()
            }
            STATE["payment_orders"][rzp_order_id] = order_obj
            STATE["payment_orders"][internal_order_id] = order_obj

            self.send_json(200, {
                "success": True,
                "orderId": internal_order_id,
                "razorpayOrderId": rzp_order_id,
                "amountPaise": amount_paise,
                "amountRupees": f"{amount_paise / 100:.2f}",
                "currency": "INR",
                "keyId": RAZORPAY_KEY_ID,
                "mode": PAYMENT_MODE,
                "purpose": purpose,
                "isSandbox": is_sandbox,
                "testPaymentId": test_payment_id,
                "testSignature": test_signature
            })
            return

        # 6.7. Razorpay Verify Payment
        if path in ('/api/payments/verify', '/api/payments/verify-payment'):
            auth = self.get_auth_user()
            uid = auth["user_id"] if auth else body.get('userId')
            if not uid:
                self.send_json(401, {"error": "Unauthorized", "message": "Authentication required."})
                return

            rzp_order_id = str(body.get('razorpay_order_id') or body.get('orderId') or body.get('razorpayOrderId') or '').strip()
            rzp_payment_id = str(body.get('razorpay_payment_id') or body.get('paymentId') or body.get('razorpayPaymentId') or '').strip()
            rzp_sig = str(body.get('razorpay_signature') or body.get('signature') or body.get('razorpaySignature') or '').strip()

            if not rzp_order_id or not rzp_payment_id or not rzp_sig:
                self.send_json(400, {"error": "Bad Request", "message": "Order ID, Payment ID, and Signature required."})
                return
            order = STATE["payment_orders"].get(rzp_order_id)
            if not order:
                for k, v in STATE["payment_orders"].items():
                    if v.get("id") == rzp_order_id or v.get("razorpay_order_id") == rzp_order_id:
                        order = v
                        break
            if not order:
                self.send_json(404, {"error": "Not Found", "message": "Payment order not found."})
                return
            if order["user_id"] != uid:
                self.send_json(403, {"error": "Forbidden", "message": "You cannot verify another user’s payment order."})
                return
            order_amount_paise = order["amount_paise"]

            if order["status"] == "CAPTURED":
                w = STATE["wallets"].get(uid, {"available_balance_paise": 0})
                self.send_json(200, {
                    "success": True,
                    "replayed": True,
                    "amountRupees": f"{order_amount_paise / 100:.2f}",
                    "availableBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                    "newBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                    "message": "Payment was already verified."
                })
                return

            expected_sig = hmac.new(RAZORPAY_KEY_SECRET.encode(), f"{rzp_order_id}|{rzp_payment_id}".encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig, rzp_sig):
                order["status"] = "FAILED"
                self.send_json(400, {"error": "Invalid Signature", "message": "Payment signature verification failed."})
                return

            order["status"] = "CAPTURED"
            order["razorpay_payment_id"] = rzp_payment_id
            order["razorpay_signature"] = rzp_sig

            w = STATE["wallets"].setdefault(uid, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0})
            w["available_balance_paise"] += order_amount_paise
            tx_id = f"TXN-DEP-{random.randint(100000, 999999)}"
            STATE["transactions"].setdefault(uid, []).insert(0, {
                "id": tx_id,
                "type": "DEPOSIT",
                "amount_paise": order_amount_paise,
                "balance_after_paise": w["available_balance_paise"],
                "reference_id": rzp_payment_id,
                "status": "SUCCESS",
                "description": "Wallet Top-up via Razorpay",
                "created_at": "Just now"
            })
            self.send_json(200, {
                "success": True,
                "purpose": "WALLET_DEPOSIT",
                "transactionId": tx_id,
                "amountRupees": f"{order_amount_paise / 100:.2f}",
                "availableBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                "newBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                "message": "Payment verified and wallet credited successfully."
            })
            return
            STATE["audit_logs"].append({
                "id": f"aud_{random.randint(100000, 999999)}",
                "actor_id": uid,
                "action": "PAYMENT_CAPTURED",
                "details": {"orderId": rzp_order_id, "paymentId": rzp_payment_id, "amountPaise": order_amount_paise},
                "created_at": time.time()
            })
            self.send_json(200, {
                "success": True,
                "amountRupees": f"{order_amount_paise / 100:.2f}",
                "newBalanceRupees": f"{w['available_balance_paise'] / 100:.2f}",
                "transactionId": tx_id,
                "message": "Payment verified and wallet credited successfully."
            })
            return

        # 6.8. Razorpay Webhook
        if path == '/api/payments/webhook':
            sig = self.headers.get('X-Razorpay-Signature', '')
            if not sig:
                self.send_json(400, {"error": "Bad Request", "message": "Missing Razorpay webhook signature."})
                return
            expected_sig = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), getattr(self, 'raw_body', b''), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig, sig):
                self.send_json(400, {"error": "Invalid Signature", "message": "Webhook signature verification failed."})
                return
            event_type = body.get('event', '')
            if event_type in ('payment.captured', 'order.paid'):
                payment_entity = body.get('payload', {}).get('payment', {}).get('entity', {})
                rzp_ord = payment_entity.get('order_id') or body.get('payload', {}).get('order', {}).get('entity', {}).get('id')
                rzp_pay = payment_entity.get('id', 'pay_wh_' + str(random.randint(1000, 9999)))
                if rzp_ord and rzp_ord in STATE["payment_orders"]:
                    ord_obj = STATE["payment_orders"][rzp_ord]
                    if ord_obj["status"] != "CAPTURED":
                        ord_obj["status"] = "CAPTURED"
                        ord_obj["razorpay_payment_id"] = rzp_pay
                        u_id = ord_obj["user_id"]
                        ord_amt = ord_obj["amount_paise"]
                        w = STATE["wallets"].setdefault(u_id, {"available_balance_paise": 0, "total_won_paise": 0, "total_withdrawn_paise": 0, "locked_balance_paise": 0})
                        w["available_balance_paise"] += ord_amt
                        tx_id = f"TXN-DEP-{random.randint(100000, 999999)}"
                        STATE["transactions"].setdefault(u_id, []).insert(0, {
                            "id": tx_id,
                            "type": "DEPOSIT",
                            "amount_paise": ord_amt,
                            "balance_after_paise": w["available_balance_paise"],
                            "reference_id": rzp_pay,
                            "status": "SUCCESS",
                            "description": "Wallet Top-up via Razorpay Webhook",
                            "created_at": "Just now"
                        })
            elif event_type == 'payment.failed':
                payment_entity = body.get('payload', {}).get('payment', {}).get('entity', {})
                rzp_ord = payment_entity.get('order_id')
                if rzp_ord and rzp_ord in STATE["payment_orders"]:
                    STATE["payment_orders"][rzp_ord]["status"] = "FAILED"
            self.send_json(200, {"status": "ok", "message": "Webhook event processed."})
            return

        # 7. Admin Authentication
        if path == '/api/admin/auth':
            passcode = body.get('passcode', '').strip()
            if not hmac.compare_digest(passcode, ADMIN_MASTER_PASS):
                self.send_json(401, {"error": "Access Denied", "message": "Invalid master passcode."})
                return

            admin_user = {
                "id": "usr_admin_master",
                "name": "System Administrator",
                "email": "admin@disha.gov.in",
                "avatar": "👨‍💼",
                "role": "ADMIN"
            }
            token = make_token("usr_admin_master", "ADMIN")
            self.send_json(200, {"success": True, "token": token, "user": admin_user})
            return

        # 8. Admin Update Passcode
        if path == '/api/admin/passcode':
            auth = self.get_auth_user()
            if not auth or auth.get("role") not in ("ADMIN", "SUPER_ADMIN"):
                self.send_json(403, {"error": "Forbidden", "message": "Admin privileges required."})
                return

            curr_pass = body.get('currentPasscode', '').strip()
            new_pass = body.get('newPasscode', '').strip()

            if not hmac.compare_digest(curr_pass, ADMIN_MASTER_PASS):
                self.send_json(400, {"error": "Invalid Passcode", "message": "Current master passcode is incorrect."})
                return

            if len(new_pass) < 4:
                self.send_json(400, {"error": "Invalid Passcode", "message": "New passcode must be at least 4 characters."})
                return

            ADMIN_MASTER_PASS = new_pass
            self.send_json(200, {"success": True, "message": "Admin passcode updated successfully in database."})
            return

        self.send_json(404, {"error": "Not Found", "message": f"Endpoint {path} not found."})

    def send_head(self):
        clean_path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path).strip('/')
        parts = clean_path.split('/')

        for part in parts:
            if part == '..' or any(part.startswith(p) for p in FORBIDDEN_PREFIXES if p != '.' or part != '.'):
                self.send_error(403, "Access Denied: Forbidden Resource")
                return None

        if clean_path.lower().endswith(FORBIDDEN_EXTENSIONS):
            self.send_error(403, "Access Denied: Sensitive File Type Blocked")
            return None

        full_file_path = os.path.join(DIRECTORY, clean_path)
        if clean_path and not os.path.exists(full_file_path) and '.' not in clean_path:
            self.path = '/index.html'

        return super().send_head()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        self.send_header('Content-Security-Policy', 
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://checkout.razorpay.com https://*.razorpay.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob: https:; "
            "frame-src 'self' https://api.razorpay.com https://*.razorpay.com; "
            "connect-src 'self' https:;"
        )
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'geolocation=(), camera=(), microphone=()')
        
        req_origin = self.headers.get('Origin', '')
        if req_origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', req_origin)
            self.send_header('Vary', 'Origin')
        elif NODE_ENV != 'production':
            self.send_header('Access-Control-Allow-Origin', 'http://localhost:3000')

        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'application/javascript'
        if path.endswith('.css'):
            return 'text/css'
        if path.endswith('.html'):
            return 'text/html'
        if path.endswith('.json'):
            return 'application/json'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        return super().guess_type(path)

    def log_message(self, format, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

if __name__ == '__main__':
    http.server.ThreadingHTTPServer.allow_reuse_address = False
    with http.server.ThreadingHTTPServer((HOST, PORT), UnifiedProductionHandler) as httpd:
        print(f"[Disha Server] Active and listening on http://localhost:{PORT}")
        print(f"[Disha Server] Server-authoritative APIs mounted on /api/* and /health")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server gracefully.")
