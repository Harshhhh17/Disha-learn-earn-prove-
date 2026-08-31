# 🇮🇳 Disha — Where Knowledge Meets Reward

A high-performance live quiz and reward platform designed for competitive government examination aspirants (SSC, UPSSSC, Railways, Banking). Aspirants solve previous-year question papers (PYQs) under 15-second timers and receive instant UPI / IMPS wallet payouts.

---

## 🔒 Critical Security & Secret Rotation Notice

> [!CAUTION]
> **IMMEDIATE ACTION REQUIRED BEFORE PRODUCTION DEPLOYMENT**
> 
> If any secret, passcode, or credential was used during local development or test iterations, **it must be rotated immediately**. 
> - Hardcoded values in historical git commits remain visible in commit history unless rotated on the provider's dashboard.
> - Always generate new API keys, master passcodes, database credentials, and JWT signing keys when deploying to production.

---

## 🛡️ Secret Safety Architecture & Rules

### 1. Supabase Keys
* **`VITE_SUPABASE_ANON_KEY` (Client-Safe):** Only safe for client-side use **IF AND ONLY IF** Row Level Security (RLS) policies are active on every database table.
* **`SUPABASE_SERVICE_ROLE_KEY` (Server-Side ONLY):** Completely bypasses RLS. **NEVER expose this key to client-side code, frontend bundles, or public repositories.**

### 2. Payment Gateway Keys (Razorpay / Stripe / Cashfree)
* **Client-Side:** Only the **Publishable Key** (`VITE_RAZORPAY_KEY_ID` or `VITE_STRIPE_PUBLISHABLE_KEY`) is bundled into the frontend.
* **Server-Side ONLY:** The **Secret Key** (`RAZORPAY_KEY_SECRET` or `STRIPE_SECRET_KEY`) and Webhook Secrets (`RAZORPAY_WEBHOOK_SECRET`) must remain in secure backend environment variables to process withdrawals, verify signatures, and release payouts.

### 3. Database Connection Strings
* PostgreSQL URIs (`postgresql://user:pass@host/db`) and MongoDB connection strings must never be hardcoded. They are read dynamically via the `DATABASE_URL` environment variable.

### 4. JWT & OAuth Secrets
* `JWT_SECRET` must be a high-entropy 64-character random string stored exclusively on the server.
* `GOOGLE_CLIENT_SECRET` must never be referenced in frontend code.

### 5. Frontend Variable Exposure
* Modern bundlers (Vite, React, Next.js) expose variables prefixed with `VITE_`, `REACT_APP_`, or `NEXT_PUBLIC_` directly in client bundles.
* Verify that **NO private secret** uses any of these prefixes.

---

## ⚙️ Environment Variables Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Populate `.env` with your production keys.
3. On **Netlify / Vercel / Railway / Render**:
   - Go to **Site Configuration** $\rightarrow$ **Environment Variables**.
   - Add each variable defined in `.env.example`.

---

## 🚀 Running Locally

```bash
# Start python development server on http://localhost:3000
python server.py
```

---

## 📦 Production Deployment (Netlify)

1. Ensure `.env` is listed in `.gitignore` (verified).
2. Set your environment variables in Netlify Dashboard.
3. Deploy the project folder to Netlify via Git repository connection or Netlify Drop.
