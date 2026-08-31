/* ==========================================================================
   Disha Authentication & Onboarding Flow
   ========================================================================== */

import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { API } from './api.js';

class AuthEngine {
  constructor() {
    this.otpTimer = null;
    this.otpSecondsRemaining = 30;
    this.generatedOtp = null;
    this.pendingPhone = '';
    this.otpAttempts = 0;
  }

  init() {
    this.setupAuthModalEvents();
  }

  isLoggedIn() {
    const hasUser = !!Storage.getUser();
    const hasActiveSession = !!sessionStorage.getItem('disha_active_session');
    return hasUser && hasActiveSession;
  }

  getCurrentUser() {
    return Storage.getUser();
  }

  showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.add('show');
      this.showStep('auth-step-options');
    }
  }

  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  showStep(stepId) {
    const steps = ['auth-step-options', 'auth-step-phone', 'auth-step-otp', 'auth-step-email', 'auth-step-onboarding'];
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === stepId) ? 'block' : 'none';
    });
  }

  setupAuthModalEvents() {
    // Continue with Google
    const googleBtn = document.getElementById('btn-auth-google');
    if (googleBtn) {
      googleBtn.disabled = false;
      googleBtn.addEventListener('click', () => {
        this.handleGoogleLogin();
      });
    }

    // Continue with Phone
    const phoneBtn = document.getElementById('btn-auth-phone');
    if (phoneBtn) {
      phoneBtn.disabled = false;
      phoneBtn.addEventListener('click', () => {
        Sound.playTick();
        this.showStep('auth-step-phone');
      });
    }

    // Continue with Email
    const emailBtn = document.getElementById('btn-auth-email');
    if (emailBtn) {
      emailBtn.disabled = false;
      emailBtn.addEventListener('click', () => {
        Sound.playTick();
        this.showStep('auth-step-email');
      });
    }

    // Send OTP Button
    const sendOtpBtn = document.getElementById('btn-send-otp');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener('click', () => this.handleSendOtp());
    }

    // Verify OTP Button
    const verifyOtpBtn = document.getElementById('btn-verify-otp');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener('click', () => this.handleVerifyOtp());
    }

    // Email Submit
    const emailSubmitBtn = document.getElementById('btn-submit-email');
    if (emailSubmitBtn) {
      emailSubmitBtn.addEventListener('click', () => this.handleEmailLogin());
    }

    // Setup OTP inputs auto-advance
    this.setupOtpInputFields();

    // Onboarding Exam Pills toggle
    document.querySelectorAll('.onboarding-exam-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        Sound.playTick();
        pill.classList.toggle('active');
      });
    });

    // Onboarding Finish Button
    const finishOnboardingBtn = document.getElementById('btn-finish-onboarding');
    if (finishOnboardingBtn) {
      finishOnboardingBtn.addEventListener('click', () => this.handleFinishOnboarding());
    }

    // Close Auth Modal
    document.querySelectorAll('.btn-close-auth-modal').forEach(btn => {
      btn.addEventListener('click', () => this.hideAuthModal());
    });
  }

  setupOtpInputFields() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, idx) => {
      box.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && idx < boxes.length - 1) {
          boxes[idx + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          boxes[idx - 1].focus();
        }
      });
    });
  }

  async handleGoogleLogin() {
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
    this.showStep('auth-step-onboarding');
  }

  async handleSendOtp() {
    const rateCheck = RateLimiter.check('OTP_SEND');
    if (!rateCheck.allowed) {
      window.DishaApp.showToast(`Rate limit reached. Please wait ${rateCheck.retryAfterSec}s.`, 'error');
      return;
    }

    const phoneInput = document.getElementById('auth-phone-input');
    const phoneVal = phoneInput ? phoneInput.value.trim() : '';

    if (!/^\d{10}$/.test(phoneVal)) {
      window.DishaApp.showToast('Please enter a valid 10-digit mobile number', 'error');
      return;
    }

    RateLimiter.consume('OTP_SEND');
    this.pendingPhone = '+91 ' + phoneVal;

    try {
      const res = await API.auth.requestOtp(this.pendingPhone);
      this.generatedOtp = res.devOtp || '123456';

      Sound.playTick();
      this.showStep('auth-step-otp');
      this.startOtpTimer();

      if (this.generatedOtp) {
        setTimeout(() => {
          this.showSmsNotification(this.generatedOtp);
        }, 800);
      }
      window.DishaApp.showToast('OTP sent successfully to your mobile number!', 'success');
    } catch (err) {
      window.DishaApp.showToast(err.message || 'Failed to send OTP.', 'error');
    }
  }

  startOtpTimer() {
    if (this.otpTimer) clearInterval(this.otpTimer);
    this.otpSecondsRemaining = 30;
    const timerLabel = document.getElementById('otp-timer-label');
    const resendBtn = document.getElementById('btn-resend-otp');

    if (resendBtn) resendBtn.disabled = true;

    this.otpTimer = setInterval(() => {
      this.otpSecondsRemaining--;
      if (timerLabel) {
        timerLabel.textContent = `${this.otpSecondsRemaining}s`;
      }
      if (this.otpSecondsRemaining <= 0) {
        clearInterval(this.otpTimer);
        if (resendBtn) resendBtn.disabled = false;
        if (timerLabel) timerLabel.textContent = '0s';
      }
    }, 1000);
  }

  showSmsNotification(otp) {
    const banner = document.createElement('div');
    banner.className = 'glass-panel-elevated';
    banner.style.position = 'fixed';
    banner.style.top = '16px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = '999999';
    banner.style.width = '90%';
    banner.style.maxWidth = '420px';
    banner.style.padding = '14px 18px';
    banner.style.boxShadow = '0 16px 40px rgba(0,0,0,0.5)';
    banner.style.border = '1px solid var(--brand-primary)';
    banner.style.animation = 'slideDown 300ms cubic-bezier(0.16, 1, 0.3, 1)';

    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:0.75rem; font-weight:700; color:var(--brand-primary); text-transform:uppercase; letter-spacing:0.05em;">💬 Messages • Just now</span>
        <button id="close-sms-banner" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1rem;">✕</button>
      </div>
      <div style="font-size:0.88rem; color:var(--text-primary); font-weight:600; margin-bottom:8px;">
        <span style="font-family:var(--font-mono); font-weight:800; color:var(--brand-primary); font-size:1.1rem; background:var(--bg-surface-inset); padding:2px 8px; border-radius:6px;">${otp}</span> is your Disha Live Quiz OTP. Valid for 5 mins.
      </div>
      <button id="autofill-otp-btn" class="btn btn-primary btn-sm" style="width:100%;">
        ⚡ Auto-fill ${otp}
      </button>
    `;

    document.body.appendChild(banner);

    document.getElementById('close-sms-banner')?.addEventListener('click', () => banner.remove());
    document.getElementById('autofill-otp-btn')?.addEventListener('click', () => {
      const boxes = document.querySelectorAll('.otp-box');
      otp.split('').forEach((digit, i) => {
        if (boxes[i]) boxes[i].value = digit;
      });
      Sound.playTick();
      banner.remove();
      this.handleVerifyOtp();
    });

    setTimeout(() => { if (banner.parentElement) banner.remove(); }, 12000);
  }

  async handleVerifyOtp() {
    const verifyCheck = RateLimiter.check('OTP_VERIFY');
    if (!verifyCheck.allowed) {
      window.DishaApp.showToast(`Too many failed attempts. Cooldown: ${verifyCheck.retryAfterSec}s.`, 'error');
      return;
    }

    const boxes = document.querySelectorAll('.otp-box');
    let entered = '';
    boxes.forEach(box => entered += box.value.trim());

    if (entered.length < 6) {
      window.DishaApp.showToast('Please enter full 6-digit OTP', 'error');
      return;
    }

    RateLimiter.consume('OTP_VERIFY');

    try {
      const res = await API.auth.verifyOtp(this.pendingPhone, entered);
      RateLimiter.reset('OTP_VERIFY');
      RateLimiter.reset('OTP_SEND');
      Sound.playCorrect();

      const user = res.user || {
        phone: this.pendingPhone,
        name: `Aspirant_${this.pendingPhone.slice(-4)}`,
              };
      Storage.setUser(user);
      window.DishaApp.showToast('Phone verified successfully!', 'success');
      this.showStep('auth-step-onboarding');
    } catch (err) {
      Sound.playWrong();
      window.DishaApp.showToast(err.message || 'Invalid OTP entered. Please try again.', 'error');
    }
  }

  handleEmailLogin() {
    const emailInput = document.getElementById('auth-email-input');
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
    this.showStep('auth-step-onboarding');
  }

  handleFinishOnboarding() {
    const nameInput = document.getElementById('onboarding-name');
    const nameVal = nameInput ? nameInput.value.trim() : 'Aspirant';

    const selectedExams = [];
    document.querySelectorAll('.onboarding-exam-pill.active').forEach(p => {
      selectedExams.push(p.getAttribute('data-exam'));
    });

    const existing = Storage.getUser() || Storage.getDemoUser();
    const user = {
      ...existing,
      name: nameVal || existing.name,
      targetExams: selectedExams.length > 0 ? selectedExams : ['SSC', 'Railways']
    };

    Storage.setUser(user);
    Sound.playFanfare();
    Confetti.fire(120);
    this.hideAuthModal();
    if (window.DishaApp) {
      window.DishaApp.onAuthSuccess(user, `Welcome, ${user.name}! Profile setup complete.`);
    }
  }
}

export const Auth = new AuthEngine();
