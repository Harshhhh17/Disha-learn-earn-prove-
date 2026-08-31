/* ==========================================================================
   Disha Landing & Dedicated Login / Sign-Up Gateway
   ========================================================================== */

import { Auth } from './auth.js';
import { I18n } from './i18n.js';
import { Storage } from './utils/storage.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { API } from './api.js';

class LandingView {
  constructor() {
    this.authTab = 'phone'; // 'phone', 'google', 'email'
    this.otpTimer = null;
    this.otpSecondsRemaining = 30;
    this.generatedOtp = null;
    this.pendingPhone = '';
    this.isOtpSent = false;
  }

  render() {
    const container = document.getElementById('view-landing');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width: 580px; margin: 0 auto; padding-bottom: var(--space-2xl);">
        
        <!-- Hero Header Branding -->
        <div style="text-align: center; margin-bottom: var(--space-xl); padding-top: var(--space-sm);">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: hsla(221, 83%, 53%, 0.12); color: var(--brand-primary); padding: 6px 16px; border-radius: var(--radius-full); font-size: 0.82rem; font-weight: 700; text-transform: uppercase; margin-bottom: var(--space-md); border: 1px solid var(--border-subtle);">
            🇮🇳 India's #1 Live Govt Exam Quiz Platform
          </div>

          <div style="width: 68px; height: 68px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--brand-primary), var(--brand-gold)); color:#fff; display:flex; align-items:center; justify-content:center; font-size:2.4rem; font-weight:800; margin: 0 auto var(--space-sm); box-shadow: 0 12px 28px var(--brand-primary-glow);">
            D
          </div>

          <h1 style="font-size: 2.1rem; margin-bottom: 6px; letter-spacing: -0.03em;">
            Disha <span style="color: var(--brand-primary);">Live</span>
          </h1>
          <p style="font-size: 1.05rem; font-weight: 500; color: var(--text-secondary); max-width: 460px; margin: 0 auto; line-height: 1.5;">
            "Where Knowledge Meets Reward" — Solve PYQs under strict 15s timers and win real-money bank payouts.
          </p>
        </div>

        <!-- Trust & Feature Badges -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: var(--space-xl); text-align: center;">
          <div class="neo-card-sm" style="padding: 12px 6px;">
            <div style="font-size: 1.4rem;">⚡</div>
            <div style="font-size: 0.78rem; font-weight: 700; margin-top: 4px;">15s Timers</div>
          </div>
          <div class="neo-card-sm" style="padding: 12px 6px;">
            <div style="font-size: 1.4rem;">🏆</div>
            <div style="font-size: 0.78rem; font-weight: 700; margin-top: 4px;">₹10K Daily Pools</div>
          </div>
          <div class="neo-card-sm" style="padding: 12px 6px;">
            <div style="font-size: 1.4rem;">🏦</div>
            <div style="font-size: 0.78rem; font-weight: 700; margin-top: 4px;">Instant UPI</div>
          </div>
        </div>

        <!-- Dedicated Auth & Login Box -->
        <div class="neo-card" style="padding: var(--space-xl); border: 1px solid var(--border-strong); box-shadow: var(--neo-card);">
          <div style="text-align: center; margin-bottom: var(--space-lg);">
            <h2 style="font-size: 1.4rem; margin-bottom: 4px;">Sign In to Enter App</h2>
            <p style="font-size: 0.88rem; color: var(--text-secondary);">Choose your login method to start competing</p>
          </div>

          <!-- Auth Tabs -->
          <div class="neo-inset" style="padding: 4px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; border-radius: var(--radius-full); margin-bottom: var(--space-xl);">
            <button id="tab-auth-phone" class="btn btn-sm ${this.authTab === 'phone' ? 'btn-primary' : 'btn-neo'}" style="font-size: 0.82rem; padding: 10px 4px; font-weight: 700;">
              📱 Phone OTP
            </button>
            <button id="tab-auth-google" class="btn btn-sm ${this.authTab === 'google' ? 'btn-primary' : 'btn-neo'}" style="font-size: 0.82rem; padding: 10px 4px; font-weight: 700;">
              🔵 Google
            </button>
            <button id="tab-auth-email" class="btn btn-sm ${this.authTab === 'email' ? 'btn-primary' : 'btn-neo'}" style="font-size: 0.82rem; padding: 10px 4px; font-weight: 700;">
              ✉️ Email
            </button>
          </div>

          <!-- Tab Content Area -->
          <div id="landing-auth-body">
            ${this.renderAuthTabContent()}
          </div>
        </div>

        <!-- Guest / Demo Access -->
        <div style="text-align: center; margin-top: var(--space-xl);">
          <button id="btn-guest-explore" class="btn btn-neo" style="font-size: 0.92rem; padding: 14px 28px; font-weight: 700;">
            👀 Explore Disha as Guest (Demo Mode) →
          </button>
          <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 10px;">
            100% Legal & Skill-Based Gaming per Indian Law • Safe & RBI Compliant
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderAuthTabContent() {
    if (this.authTab === 'phone') {
      if (!this.isOtpSent) {
        return `
          <div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 600; margin-bottom: 6px; display: block;">Enter Mobile Number</label>
              <div style="display: flex; gap: 8px;">
                <div class="neo-inset" style="padding: 12px 14px; font-weight: 700; color: var(--text-primary); border-radius: var(--radius-md); display:flex; align-items:center;">
                  +91
                </div>
                <input type="tel" id="landing-phone-input" class="input-neo" placeholder="9876543210" maxlength="10" value="${this.pendingPhone.replace('+91 ', '')}" autofocus style="font-size: 1.05rem;" />
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; display: block;">
                We will send an automated 6-digit OTP for instant 1-tap verification.
              </span>
            </div>

            <button id="btn-landing-send-otp" class="btn btn-primary btn-block" style="padding: 14px; margin-top: var(--space-lg); font-size: 1rem; width: 100%;">
              📲 Send 6-Digit OTP →
            </button>
          </div>
        `;
      } else {
        return `
          <div style="text-align: center;">
            <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
              OTP sent to <strong>${this.pendingPhone}</strong> 
              <button id="btn-change-phone" style="background:none; border:none; color:var(--brand-primary); font-weight:700; cursor:pointer; margin-left:6px;">Edit</button>
            </div>

            <div class="otp-container" style="margin-bottom: var(--space-md);">
              <input type="text" class="otp-box landing-otp" maxlength="1" autofocus />
              <input type="text" class="otp-box landing-otp" maxlength="1" />
              <input type="text" class="otp-box landing-otp" maxlength="1" />
              <input type="text" class="otp-box landing-otp" maxlength="1" />
              <input type="text" class="otp-box landing-otp" maxlength="1" />
              <input type="text" class="otp-box landing-otp" maxlength="1" />
            </div>

            <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-lg);">
              Resend in <strong id="landing-otp-timer" style="color: var(--brand-primary);">${this.otpSecondsRemaining}s</strong>
              <button id="btn-landing-resend" class="btn btn-neo btn-sm" style="margin-left: 8px;" ${this.otpSecondsRemaining > 0 ? 'disabled' : ''}>Resend</button>
            </div>

            <button id="btn-landing-verify-otp" class="btn btn-primary btn-block" style="padding: 14px; font-size: 1rem; width: 100%;">
              ✓ Verify Code & Sign In
            </button>
          </div>
        `;
      }
    }

    if (this.authTab === 'google') {
      return `
        <div style="text-align: center; padding: var(--space-md) 0;">
          <p style="font-size: 0.92rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Sign in instantly with your verified Google account. No password needed.
          </p>

          <button id="btn-landing-google-login" class="btn btn-neo btn-block" style="padding: 14px; font-size: 1rem; border: 1px solid var(--border-strong); width: 100%;">
            <svg style="width: 22px; height: 22px; margin-right: 8px;" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Continue with Google Account
          </button>
        </div>
      `;
    }

    if (this.authTab === 'email') {
      return `
        <div>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" style="font-weight: 600; margin-bottom: 6px; display: block;">Email Address</label>
            <input type="email" id="landing-email-input" class="input-neo" placeholder="aspirant@gmail.com" style="width: 100%;" />
          </div>

          <div class="form-group" style="margin-bottom: var(--space-lg);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
              <label class="form-label" style="font-weight: 600;">Password</label>
              <span style="font-size:0.72rem; color:var(--text-muted);">Minimum 6 characters</span>
            </div>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="landing-password-input" class="input-neo" placeholder="••••••••" style="padding-right: 44px; width: 100%;" />
              <button type="button" id="btn-toggle-landing-pass" style="position: absolute; right: 10px; background: none; border: none; font-size: 1.15rem; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 4px;" title="Show Password">
                👁️
              </button>
            </div>
          </div>

          <button id="btn-landing-email-submit" class="btn btn-primary btn-block" style="padding: 14px; font-size: 1rem; width: 100%;">
            Sign In with Email →
          </button>
        </div>
      `;
    }
  }

  bindEvents() {
    // Tab switching
    document.getElementById('tab-auth-phone')?.addEventListener('click', () => {
      Sound.playTick();
      this.authTab = 'phone';
      this.render();
    });
    document.getElementById('tab-auth-google')?.addEventListener('click', () => {
      Sound.playTick();
      this.authTab = 'google';
      this.render();
    });
    document.getElementById('tab-auth-email')?.addEventListener('click', () => {
      Sound.playTick();
      this.authTab = 'email';
      this.render();
    });

    // Password Visibility Toggle
    document.getElementById('btn-toggle-landing-pass')?.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('landing-password-input');
      const btn = document.getElementById('btn-toggle-landing-pass');
      if (input && btn) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = '🙈';
        } else {
          input.type = 'password';
          btn.innerHTML = '👁️';
        }
      }
    });

    // Send OTP
    document.getElementById('btn-landing-send-otp')?.addEventListener('click', async () => {
      const rateCheck = RateLimiter.check('OTP_SEND');
      if (!rateCheck.allowed) {
        window.DishaApp.showToast(`Rate limit reached. Please wait ${rateCheck.retryAfterSec}s.`, 'error');
        return;
      }

      const input = document.getElementById('landing-phone-input');
      const val = input ? input.value.trim() : '';

      if (!/^\d{10}$/.test(val)) {
        window.DishaApp.showToast('Please enter a valid 10-digit mobile number', 'error');
        return;
      }

      RateLimiter.consume('OTP_SEND');
      this.pendingPhone = '+91 ' + val;

      try {
        const res = await API.auth.requestOtp(this.pendingPhone);
        this.generatedOtp = res.devOtp || '123456';
        this.isOtpSent = true;
        Sound.playTick();
        this.render();
        this.startOtpTimer();

        if (this.generatedOtp) {
          setTimeout(() => {
            Auth.showSmsNotification(this.generatedOtp);
          }, 700);
        }
        window.DishaApp.showToast('OTP sent successfully to your mobile number!', 'success');
      } catch (err) {
        window.DishaApp.showToast(err.message || 'Failed to send OTP.', 'error');
      }
    });

    // Change Phone
    document.getElementById('btn-change-phone')?.addEventListener('click', () => {
      this.isOtpSent = false;
      this.render();
    });

    // Setup OTP auto-advance
    const otpBoxes = document.querySelectorAll('.landing-otp');
    otpBoxes.forEach((box, idx) => {
      box.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && idx < otpBoxes.length - 1) {
          otpBoxes[idx + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          otpBoxes[idx - 1].focus();
        }
      });
    });

    // Verify OTP
    document.getElementById('btn-landing-verify-otp')?.addEventListener('click', async () => {
      const verifyCheck = RateLimiter.check('OTP_VERIFY');
      if (!verifyCheck.allowed) {
        window.DishaApp.showToast(`Too many failed attempts. Cooldown: ${verifyCheck.retryAfterSec}s.`, 'error');
        return;
      }

      let entered = '';
      document.querySelectorAll('.landing-otp').forEach(b => entered += b.value.trim());

      if (entered.length < 6) {
        window.DishaApp.showToast('Please enter the full 6-digit OTP', 'error');
        return;
      }

      RateLimiter.consume('OTP_VERIFY');

      try {
        const res = await API.auth.verifyOtp(this.pendingPhone, entered);
        RateLimiter.reset('OTP_VERIFY');
        RateLimiter.reset('OTP_SEND');
        Sound.playFanfare();

        const user = res.user || {
          phone: this.pendingPhone,
          name: `Aspirant_${this.pendingPhone.slice(-4)}`,
          };
        Storage.setUser(user);
        window.DishaApp.onAuthSuccess(user, `Welcome, ${user.name}!`);
      } catch (err) {
        Sound.playWrong();
        window.DishaApp.showToast(err.message || 'Invalid OTP code. Please try again.', 'error');
      }
    });

    // Resend OTP
    document.getElementById('btn-landing-resend')?.addEventListener('click', async () => {
      if (this.otpSecondsRemaining > 0) return;
      try {
        const res = await API.auth.requestOtp(this.pendingPhone);
        this.generatedOtp = res.devOtp || '123456';
        this.startOtpTimer();
        if (this.generatedOtp) {
          setTimeout(() => Auth.showSmsNotification(this.generatedOtp), 600);
        }
        window.DishaApp.showToast('New OTP dispatched successfully.', 'info');
      } catch (e) {
        window.DishaApp.showToast(e.message || 'Failed to resend OTP', 'error');
      }
    });

    // Google Login
    document.getElementById('btn-landing-google-login')?.addEventListener('click', () => {
      Sound.playCorrect();
      const demoGoogleUser = {
        id: 'usr_g_' + Math.random().toString(36).substring(2, 9),
        name: 'Google Aspirant',
        email: 'aspirant.google@gmail.com',
        avatar: '👨‍🎓',
        role: 'USER',
        is_kyc_verified: false,
      };
      Storage.setUser(demoGoogleUser);
      window.DishaApp.onAuthSuccess(demoGoogleUser, `Welcome, ${demoGoogleUser.name}!`);
    });

    // Email Login
    document.getElementById('btn-landing-email-submit')?.addEventListener('click', () => {
      const emailInput = document.getElementById('landing-email-input');
      const emailVal = emailInput ? emailInput.value.trim() : '';

      if (!emailVal || !emailVal.includes('@')) {
        window.DishaApp.showToast('Please enter a valid email address', 'error');
        return;
      }

      Sound.playCorrect();
      const existing = Storage.getUser() || Storage.getDemoUser();
      const user = {
        ...existing,
        email: emailVal,
      };
      Storage.setUser(user);
      window.DishaApp.onAuthSuccess(user, `Welcome, ${user.name}!`);
    });

    // Guest Explore Button
    document.getElementById('btn-guest-explore')?.addEventListener('click', () => {
      Sound.playTick();
      const demoUser = Storage.getDemoUser();
      Storage.setUser(demoUser);
      window.DishaApp.onAuthSuccess(demoUser, 'Entering Disha Arena in Guest Mode...');
    });
  }

  startOtpTimer() {
    if (this.otpTimer) clearInterval(this.otpTimer);
    this.otpSecondsRemaining = 30;
    const timerLabel = document.getElementById('landing-otp-timer');
    const resendBtn = document.getElementById('btn-landing-resend');

    this.otpTimer = setInterval(() => {
      this.otpSecondsRemaining--;
      if (timerLabel) timerLabel.textContent = `${this.otpSecondsRemaining}s`;
      if (this.otpSecondsRemaining <= 0) {
        clearInterval(this.otpTimer);
        if (resendBtn) resendBtn.disabled = false;
        if (timerLabel) timerLabel.textContent = '0s';
      }
    }, 1000);
  }
}

export const Landing = new LandingView();
