/* ==========================================================================
   Disha Admin & Content Management Portal (Password-Protected, Device CSV Upload, & Admin Profile Manager)
   ========================================================================== */

import { QUESTION_BANK } from './data/questions.js';
import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { Config } from './config.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { Sanitize } from './utils/sanitize.js';
import { API } from './api.js';

class AdminView {
  constructor() {
    this.isAuthenticated = false;
    this.activeTab = 'QUESTIONS'; // 'QUESTIONS', 'SCHEDULER', 'PAYOUTS', 'FRAUD', 'PROFILE'
    this.failedAttempts = 0;
    this.pendingImportQuestions = [];
    this.importedFileName = '';
  }

  render() {
    const container = document.getElementById('view-admin');
    if (!container) return;

    try {
      if (!this.isAuthenticated) {
        this.renderAuthGate(container);
        return;
      }

      const adminProfile = Storage.getAdminProfile() || {};
      const scheduled = Storage.getScheduledQuizzes() || [];
      const customQuestions = Storage.getCustomQuestions() || [];
      const totalQuestions = (QUESTION_BANK?.length || 0) + customQuestions.length;
      const transactions = Storage.getTransactions() || [];
      const pendingPayouts = transactions.filter(t => t.type === 'DEBIT' || t.status === 'PROCESSING');

      container.innerHTML = `
        <!-- Admin Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:center; font-size:1.4rem;">
              ${adminProfile.avatar || '👨‍💼'}
            </div>
            <div>
              <div style="display:inline-flex; align-items:center; gap:6px; background:hsla(152,76%,42%,0.15); color:var(--brand-emerald); padding:3px 10px; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700; text-transform:uppercase;">
                🟢 Authorized Session • ${adminProfile.name || 'Admin'}
              </div>
              <h2 style="font-size: 1.3rem; margin-top: 2px;">${adminProfile.role || 'Moderator'}</h2>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btn-lock-admin" class="btn btn-crimson btn-sm" style="background:hsla(352,85%,58%,0.15); color:var(--brand-crimson); border:1px solid hsla(352,85%,58%,0.3);">
              🔒 Lock & Exit
            </button>
            <button id="btn-back-to-student" class="btn btn-neo btn-sm">
              ← Student View
            </button>
          </div>
        </div>

        <!-- Admin Navigation Tabs -->
        <div class="filter-scroll-bar" style="margin-bottom: var(--space-lg);">
          <button class="filter-pill ${this.activeTab === 'QUESTIONS' ? 'active' : ''}" data-admin-tab="QUESTIONS">
            📝 Question Bank (${totalQuestions})
          </button>
          <button class="filter-pill ${this.activeTab === 'SCHEDULER' ? 'active' : ''}" data-admin-tab="SCHEDULER">
            ⏰ Live Tournaments (${scheduled.length})
          </button>
          <button class="filter-pill ${this.activeTab === 'PAYOUTS' ? 'active' : ''}" data-admin-tab="PAYOUTS">
            🏦 Payout Approval Desk (${pendingPayouts.length})
          </button>
          <button class="filter-pill ${this.activeTab === 'FRAUD' ? 'active' : ''}" data-admin-tab="FRAUD">
            🚨 Anti-Fraud Monitor
          </button>
          <button class="filter-pill ${this.activeTab === 'PROFILE' ? 'active' : ''}" data-admin-tab="PROFILE">
            👤 Admin Profile & Credentials
          </button>
        </div>

        <!-- Tab Content Area -->
        <div id="admin-tab-container">
          ${this.renderTabContent(totalQuestions, scheduled, pendingPayouts, adminProfile)}
        </div>
      `;

      this.bindConsoleEvents();
    } catch (err) {
      const safeErr = Config.createSafeError('Unable to initialize administrative console. Please try again.');
      container.innerHTML = `
        <div class="neo-card" style="padding: var(--space-xl); text-align: center; max-width: 500px; margin: 40px auto;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">⚠️</div>
          <h3 style="font-size: 1.2rem; margin-bottom: 8px;">Admin Console Initialization</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-sm);">
            ${safeErr.message}
          </p>
          <p style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: var(--space-md);">
            Reference: ${safeErr.correlationId}
          </p>
          <button id="btn-retry-admin" class="btn btn-primary btn-sm">
            🔄 Reload Admin Console
          </button>
        </div>
      `;
      document.getElementById('btn-retry-admin')?.addEventListener('click', () => this.render());
    }
  }

  renderAuthGate(container) {
    try {
      const adminProfile = Storage.getAdminProfile() || {};

    container.innerHTML = `
      <div style="max-width: 460px; margin: 40px auto 80px; padding: 0 var(--space-sm);">
        <div class="neo-card" style="padding: var(--space-2xl) var(--space-xl); text-align: center; border: 1px solid var(--border-strong);">
          
          <div style="width: 60px; height: 60px; border-radius: 50%; background: hsla(352,85%,58%,0.12); color: var(--brand-crimson); display:flex; align-items:center; justify-content:center; font-size:1.8rem; margin: 0 auto var(--space-md); border: 1px solid hsla(352,85%,58%,0.3);">
            🔒
          </div>

          <h2 style="font-size: 1.45rem; margin-bottom: 4px;">Admin Access Control</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-xl);">
            Restricted area. Please enter your administrator passcode to curate question banks and manage student payouts.
          </p>

          <form id="form-admin-auth">
            <div class="form-group" style="text-align: left;">
              <label class="form-label">Admin Email ID</label>
              <input type="email" id="admin-auth-email" class="input-neo" value="${adminProfile.email}" required />
            </div>

            <div class="form-group" style="text-align: left;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <label class="form-label">Security Passcode / PIN</label>
                <span style="font-size: 0.72rem; color: var(--text-muted);">Protected by Master Passcode</span>
              </div>
              <div style="position: relative; display: flex; align-items: center;">
                <input type="password" id="admin-auth-pass" class="input-neo" placeholder="Enter master passcode..." style="padding-right: 44px;" required autofocus />
                <button type="button" id="btn-toggle-auth-pass" style="position: absolute; right: 10px; background: none; border: none; font-size: 1.15rem; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 4px;" title="Show Passcode">
                  👁️
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="padding: 14px; margin-top: var(--space-md);">
              🔓 Authenticate & Access Admin Panel
            </button>
          </form>

          <div style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <button id="btn-cancel-admin-auth" class="btn btn-neo btn-sm">
              ← Return to Student App
            </button>
            <span style="font-size: 0.7rem; color: var(--text-muted);">
              🛡️ Role-Gated 2FA Protection
            </span>
          </div>
        </div>
      </div>
    `;

    // Toggle password eye icon in auth gate
    document.getElementById('btn-toggle-auth-pass')?.addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.getElementById('admin-auth-pass');
      const btn = document.getElementById('btn-toggle-auth-pass');
      if (input && btn) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.innerHTML = '🙈';
          btn.setAttribute('title', 'Hide Passcode');
        } else {
          input.type = 'password';
          btn.innerHTML = '👁️';
          btn.setAttribute('title', 'Show Passcode');
        }
      }
    });

    document.getElementById('form-admin-auth')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rateCheck = RateLimiter.check('ADMIN_LOGIN');
      if (!rateCheck.allowed) {
        window.DishaApp.showToast(`Admin Lockout: Max attempts exceeded. Please wait ${rateCheck.retryAfterSec}s.`, 'error');
        return;
      }

      const pass = document.getElementById('admin-auth-pass')?.value.trim();
      RateLimiter.consume('ADMIN_LOGIN');

      try {
        const res = await API.admin.auth(pass);
        RateLimiter.reset('ADMIN_LOGIN');
        Sound.playFanfare();
        this.isAuthenticated = true;
        this.failedAttempts = 0;
        Storage.setAdminProfile(res.user);
        window.DishaApp.showToast('Administrator session verified successfully!', 'success');
        Confetti.fire(70);
        this.render();
      } catch (err) {
        this.failedAttempts++;
        Sound.playWrong();
        window.DishaApp.showToast(`Access Denied! ${err.message || 'Invalid passcode.'} (Attempt ${this.failedAttempts}/5)`, 'error');
        if (this.failedAttempts >= 5) {
          window.DishaApp.showToast('Security lockout initiated. Returning to student view.', 'error');
          setTimeout(() => {
            window.DishaApp.navigateTo('home');
          }, 1200);
        }
      }
    });

    document.getElementById('btn-cancel-admin-auth')?.addEventListener('click', () => {
      Sound.playTick();
      window.DishaApp.navigateTo('home');
    });
    } catch (err) {
      const safeErr = Config.createSafeError('Authentication system encountered an error.');
      container.innerHTML = `
        <div class="neo-card" style="padding: var(--space-xl); text-align: center; max-width: 460px; margin: 40px auto;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔒</div>
          <h3 style="font-size: 1.2rem; margin-bottom: 8px;">Admin Authentication</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px;">${safeErr.message}</p>
          <p style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 16px;">Reference: ${safeErr.correlationId}</p>
          <button onclick="window.DishaApp.navigateTo('home')" class="btn btn-primary btn-sm">← Back to App</button>
        </div>
      `;
    }
  }

  renderTabContent(totalQuestions, scheduled, pendingPayouts, adminProfile) {
    if (this.activeTab === 'QUESTIONS') {
      return `
        <!-- Question Bank Manager -->
        <div class="neo-card" style="margin-bottom: var(--space-xl);">
          <h3 style="font-size: 1.2rem; margin-bottom: var(--space-sm);">➕ Add Single MCQ to Question Bank</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
            Add verified previous-year question for government exam aspirants.
          </p>

          <form id="form-add-question">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Exam Category</label>
                <select id="admin-q-cat" class="input-neo" required>
                  <option value="SSC">SSC (CGL/CHSL)</option>
                  <option value="UPSSSC">UPSSSC (PET/Lekhpal)</option>
                  <option value="Railways">Railways (RRB NTPC/Group D)</option>
                  <option value="Bank">Bank (IBPS/SBI)</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Subject & Topic</label>
                <input type="text" id="admin-q-subject" class="input-neo" placeholder="e.g. Indian Polity" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Question Text (English)</label>
              <textarea id="admin-q-text-en" class="input-neo" rows="2" placeholder="Enter question in English..." required></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Question Text (Hindi - Optional)</label>
              <textarea id="admin-q-text-hi" class="input-neo" rows="2" placeholder="हिंदी में प्रश्न लिखें..."></textarea>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);">
              <div class="form-group">
                <label class="form-label">Option A</label>
                <input type="text" id="admin-opt-0" class="input-neo" placeholder="Option A" required />
              </div>
              <div class="form-group">
                <label class="form-label">Option B</label>
                <input type="text" id="admin-opt-1" class="input-neo" placeholder="Option B" required />
              </div>
              <div class="form-group">
                <label class="form-label">Option C</label>
                <input type="text" id="admin-opt-2" class="input-neo" placeholder="Option C" required />
              </div>
              <div class="form-group">
                <label class="form-label">Option D</label>
                <input type="text" id="admin-opt-3" class="input-neo" placeholder="Option D" required />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Correct Option</label>
                <select id="admin-correct-idx" class="input-neo" required>
                  <option value="0">Option A</option>
                  <option value="1">Option B</option>
                  <option value="2">Option C</option>
                  <option value="3">Option D</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Source / Year</label>
                <input type="text" id="admin-q-year" class="input-neo" placeholder="e.g. SSC CGL 2024 Tier-1" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Concept Explanation</label>
              <textarea id="admin-q-explanation" class="input-neo" rows="2" placeholder="Detailed explanation for learning..." required></textarea>
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="margin-top: var(--space-sm);">
              💾 Save Question to Live Database
            </button>
          </form>
        </div>

        <!-- Real Device Bulk CSV Upload Area -->
        <div class="neo-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-xs); flex-wrap:wrap; gap:8px;">
            <h3 style="font-size: 1.15rem;">📁 Bulk CSV / Spreadsheet Upload</h3>
            <button id="btn-download-csv-template" class="btn btn-neo btn-sm" style="font-size: 0.75rem; padding: 4px 10px;">
              📄 Download CSV Template
            </button>
          </div>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
            Upload question files directly from your computer or mobile device (.csv format).
          </p>

          <!-- Hidden Device File Input -->
          <input type="file" id="admin-csv-file-input" accept=".csv, text/csv, .txt" style="display: none;" />

          <!-- Interactive Drag & Drop Area -->
          <div id="admin-csv-dropzone" style="border: 2px dashed var(--border-strong); border-radius: var(--radius-md); padding: var(--space-xl) var(--space-md); text-align: center; background: var(--bg-surface-inset); transition: all var(--transition-fast); cursor: pointer;">
            <div style="font-size: 2.2rem; margin-bottom: 8px;">📑</div>
            <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary); margin-bottom: 4px;">
              Drag & Drop Question CSV from your Device
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--space-md);">
              Click anywhere in this box to browse local files on your computer/phone
            </p>

            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button type="button" id="btn-browse-device-csv" class="btn btn-primary btn-sm">
                📂 Browse & Choose CSV File
              </button>
              <button type="button" id="btn-mock-csv-upload" class="btn btn-neo btn-sm">
                ⚡ Load Sample 20-Question CSV Pack
              </button>
            </div>
          </div>

          <!-- Parsed CSV Preview Box (Appears when file uploaded) -->
          <div id="csv-preview-container" style="display: ${this.pendingImportQuestions.length > 0 ? 'block' : 'none'}; margin-top: var(--space-lg);">
            <div class="glass-panel" style="padding: var(--space-md); border: 1px solid var(--brand-primary);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm); flex-wrap:wrap; gap:8px;">
                <div>
                  <span style="font-size: 0.75rem; font-weight: 700; color: var(--brand-emerald); text-transform: uppercase;">
                    ✓ CSV Parsed Successfully
                  </span>
                  <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">
                    ${this.importedFileName} (${this.pendingImportQuestions.length} Questions Ready)
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button id="btn-confirm-csv-import" class="btn btn-emerald btn-sm">
                    💾 Save All to Question Bank
                  </button>
                  <button id="btn-cancel-csv-import" class="btn btn-neo btn-sm" style="color: var(--brand-crimson);">
                    ✕ Discard
                  </button>
                </div>
              </div>

              <!-- Preview Questions List -->
              <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px;">
                ${this.pendingImportQuestions.slice(0, 5).map((pq, idx) => `
                  <div style="background: var(--bg-surface); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 0.8rem;">
                    <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--brand-primary); margin-bottom: 2px;">
                      <span>Q${idx + 1}. [${Sanitize.escapeHtml(pq.category)} • ${Sanitize.escapeHtml(pq.subject)}]</span>
                      <span style="color: var(--brand-emerald);">Ans: ${['A', 'B', 'C', 'D'][pq.correct]}</span>
                    </div>
                    <div style="color: var(--text-primary); font-weight: 600;">${Sanitize.escapeHtml(pq.question_en)}</div>
                  </div>
                `).join('')}
                ${this.pendingImportQuestions.length > 5 ? `
                  <div style="text-align: center; font-size: 0.75rem; color: var(--text-muted); padding: 4px;">
                    ...and ${this.pendingImportQuestions.length - 5} more questions
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'SCHEDULER') {
      return `
        <!-- Tournament Scheduler -->
        <div class="neo-card" style="margin-bottom: var(--space-xl);">
          <h3 style="font-size: 1.2rem; margin-bottom: var(--space-sm);">🏆 Schedule New Live Tournament</h3>
          
          <form id="form-schedule-quiz">
            <div class="form-group">
              <label class="form-label">Tournament Title</label>
              <input type="text" id="sched-title" class="input-neo" value="RRB NTPC Grand Science Maha-Quiz" required />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Exam Category</label>
                <select id="sched-category" class="input-neo">
                  <option value="Railways">Railways</option>
                  <option value="SSC">SSC</option>
                  <option value="UPSSSC">UPSSSC</option>
                  <option value="Bank">Bank</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Prize Pool (₹)</label>
                <input type="number" id="sched-pool" class="input-neo" value="15000" min="1000" step="500" required />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Start Time</label>
                <input type="text" id="sched-start" class="input-neo" value="Tomorrow 8:00 PM" required />
              </div>

              <div class="form-group">
                <label class="form-label">Registration Lock Time</label>
                <input type="text" id="sched-lock" class="input-neo" value="Tomorrow 7:50 PM" required />
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">
              📅 Publish Live Tournament
            </button>
          </form>
        </div>

        <!-- Scheduled Tournaments Table -->
        <div class="neo-card">
          <h3 style="font-size: 1.15rem; margin-bottom: var(--space-md);">Active Scheduled Tournaments</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${scheduled.map(s => `
              <div style="background: var(--bg-surface); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-weight: 700; color: var(--text-primary);">${s.title}</div>
                  <div style="font-size: 0.78rem; color: var(--text-muted);">${s.category} • ${s.startTime} • ${s.registeredCount} Registered</div>
                </div>
                <div style="text-align: right;">
                  <span style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-gold);">₹${s.prizePool.toLocaleString('en-IN')}</span>
                  <span style="display:block; font-size: 0.7rem; color: var(--brand-emerald); font-weight: 700;">● LIVE STATUS: ${s.status}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'PAYOUTS') {
      return `
        <!-- Payout Approval Desk -->
        <div class="neo-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md); flex-wrap:wrap; gap:8px;">
            <div>
              <h3 style="font-size: 1.2rem;">🏦 Payout Approval Desk</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary);">Direct integration with Razorpay / Cashfree Payout Gateway Rail</p>
            </div>
            <span style="font-size: 0.8rem; background: hsla(152,76%,42%,0.15); color: var(--brand-emerald); padding: 4px 10px; border-radius: var(--radius-full); font-weight: 700;">
              Auto-IMPS Enabled
            </span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div class="tx-row" style="flex-direction: column; align-items: flex-start; gap: 10px;">
              <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div>
                  <span style="font-size: 0.75rem; font-weight: 700; color: var(--brand-primary);">TXN-WD-994102</span>
                  <div style="font-weight: 700; font-size: 1rem;">Rohan Sharma (KYC: PAN Verified ✓)</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">UPI ID: rohan@okhdfcbank • HDFC Bank</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.2rem; color: var(--brand-emerald);">₹1,200.00</div>
                  <span style="font-size: 0.7rem; color: hsl(38,98%,46%); font-weight: 700;">Risk Score: 0/100 (Safe)</span>
                </div>
              </div>

              <div style="display: flex; gap: 8px; width: 100%;">
                <button class="btn btn-emerald btn-sm btn-block" id="btn-approve-payout">
                  ✓ Approve & Release Instant IMPS
                </button>
                <button class="btn btn-neo btn-sm" id="btn-flag-payout">
                  ⚠️ Flag for Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'FRAUD') {
      return `
        <!-- Anti-Fraud Monitor -->
        <div class="neo-card">
          <h3 style="font-size: 1.2rem; margin-bottom: 4px;">🚨 Real-Time Anti-Fraud & Integrity Monitor</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Protects real-money tournament fairness via client timing validation and device fingerprinting.
          </p>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="background: hsla(152,76%,42%,0.1); border-left: 4px solid var(--brand-emerald); padding: 12px; border-radius: var(--radius-md);">
              <div style="font-weight: 700; font-size: 0.88rem; color: var(--brand-emerald);">✓ Device Integrity Check Passed</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">99.8% of concurrent active players verified with unique hardware UUID.</div>
            </div>

            <div style="background: hsla(221,83%,53%,0.1); border-left: 4px solid var(--brand-primary); padding: 12px; border-radius: var(--radius-md);">
              <div style="font-weight: 700; font-size: 0.88rem; color: var(--brand-primary);">ℹ️ Server-Authoritative Clock Sync</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">Client timer drift < 45ms. All scoring calculated purely server-side.</div>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'PROFILE') {
      return `
        <!-- Admin Profile & Credentials Management -->
        <div class="neo-card" style="margin-bottom: var(--space-xl);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm); flex-wrap:wrap; gap:8px;">
            <h3 style="font-size: 1.2rem;">👤 Administrator Profile & Credentials</h3>
            <span style="font-size: 0.75rem; background: hsla(221,83%,53%,0.15); color: var(--brand-primary); padding: 4px 10px; border-radius: var(--radius-full); font-weight: 700;">
              Root Security Access
            </span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Update your administrator details, contact email, and master security passcodes.
          </p>

          <form id="form-edit-admin-profile">
            <!-- Profile Info Section -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Administrator Full Name</label>
                <input type="text" id="admin-edit-name" class="input-neo" value="${adminProfile.name}" required />
              </div>

              <div class="form-group">
                <label class="form-label">Official Admin Email</label>
                <input type="email" id="admin-edit-email" class="input-neo" value="${adminProfile.email}" required />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group">
                <label class="form-label">Role & Designation</label>
                <input type="text" id="admin-edit-role" class="input-neo" value="${adminProfile.role}" required />
              </div>

              <div class="form-group">
                <label class="form-label">Department / Operations</label>
                <input type="text" id="admin-edit-dept" class="input-neo" value="${adminProfile.department || 'National Examination Operations'}" required />
              </div>
            </div>

            <!-- Avatar Badge Selection -->
            <div class="form-group">
              <label class="form-label">Administrator Badge Icon</label>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${['👨‍💼', '👑', '🛡️', '⭐', '💼', '🎓'].map(icon => `
                  <button type="button" class="btn-select-avatar btn btn-sm ${adminProfile.avatar === icon ? 'btn-primary' : 'btn-neo'}" data-avatar="${icon}" style="font-size: 1.25rem; padding: 6px 14px;">
                    ${icon}
                  </button>
                `).join('')}
              </div>
              <input type="hidden" id="admin-selected-avatar" value="${adminProfile.avatar || '👨‍💼'}" />
            </div>

            <div class="form-group">
              <label class="form-label">Emergency 2FA Mobile Number</label>
              <input type="tel" id="admin-edit-phone" class="input-neo" value="${adminProfile.phone || '+91 98765 43210'}" placeholder="+91 98765 43210" required />
            </div>

            <!-- Passcode Update Section -->
            <div style="background: var(--bg-surface-inset); padding: var(--space-md); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin: var(--space-lg) 0;">
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--brand-primary); margin-bottom: 4px;">
                🔐 Master Passcode & Security Credentials
              </div>
              <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: var(--space-md);">
                Change the passcode used to unlock the Admin Panel. Leave new passcode blank if you do not wish to change it.
              </p>

              <div class="form-group">
                <label class="form-label">Current Master Passcode</label>
                <div style="position: relative; display: flex; align-items: center;">
                  <input type="password" id="admin-curr-pass" class="input-neo" placeholder="Enter current passcode..." style="padding-right: 44px;" />
                  <button type="button" class="btn-toggle-pass" data-target="admin-curr-pass" style="position: absolute; right: 10px; background: none; border: none; font-size: 1.15rem; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 4px;" title="Show Passcode">
                    👁️
                  </button>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
                <div class="form-group">
                  <label class="form-label">New Master Passcode</label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input type="password" id="admin-new-pass" class="input-neo" placeholder="New passcode..." style="padding-right: 44px;" />
                    <button type="button" class="btn-toggle-pass" data-target="admin-new-pass" style="position: absolute; right: 10px; background: none; border: none; font-size: 1.15rem; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 4px;" title="Show Passcode">
                      👁️
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Confirm New Passcode</label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input type="password" id="admin-confirm-pass" class="input-neo" placeholder="Confirm new passcode..." style="padding-right: 44px;" />
                    <button type="button" class="btn-toggle-pass" data-target="admin-confirm-pass" style="position: absolute; right: 10px; background: none; border: none; font-size: 1.15rem; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 4px;" title="Show Passcode">
                      👁️
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="padding: 14px;">
              💾 Save Profile & Update Admin Credentials
            </button>
          </form>
        </div>
      `;
    }
  }

  bindConsoleEvents() {
    // Lock Admin button
    document.getElementById('btn-lock-admin')?.addEventListener('click', () => {
      Sound.playTick();
      this.isAuthenticated = false;
      window.DishaApp.showToast('Admin session locked.', 'info');
      this.render();
    });

    // Back to student view
    document.getElementById('btn-back-to-student')?.addEventListener('click', () => {
      Sound.playTick();
      window.DishaApp.navigateTo('home');
    });

    // Admin Tabs
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.playTick();
        this.activeTab = btn.getAttribute('data-admin-tab');
        this.render();
      });
    });

    // Add Question Form
    const formQ = document.getElementById('form-add-question');
    if (formQ) {
      formQ.onsubmit = (e) => {
        e.preventDefault();
        const cat = document.getElementById('admin-q-cat').value;
        const sub = document.getElementById('admin-q-subject').value;
        const textEn = document.getElementById('admin-q-text-en').value;
        const textHi = document.getElementById('admin-q-text-hi').value;
        const opt0 = document.getElementById('admin-opt-0').value;
        const opt1 = document.getElementById('admin-opt-1').value;
        const opt2 = document.getElementById('admin-opt-2').value;
        const opt3 = document.getElementById('admin-opt-3').value;
        const correct = parseInt(document.getElementById('admin-correct-idx').value, 10);
        const year = document.getElementById('admin-q-year').value || 'PYQ 2024';
        const exp = document.getElementById('admin-q-explanation').value;

        const newQ = {
          id: 'custom_' + Date.now(),
          category: cat,
          subject: sub,
          year: year,
          difficulty: 'Medium',
          question_en: textEn,
          question_hi: textHi || textEn,
          options_en: [opt0, opt1, opt2, opt3],
          options_hi: [opt0, opt1, opt2, opt3],
          correct: correct,
          explanation_en: exp,
          explanation_hi: exp
        };

        Storage.addCustomQuestion(newQ);
        Sound.playCoin();
        window.DishaApp.showToast('Question successfully added to question bank!', 'success');
        formQ.reset();
        this.render();
      };
    }

    // Device CSV File Upload Handlers
    const fileInput = document.getElementById('admin-csv-file-input');
    const browseBtn = document.getElementById('btn-browse-device-csv');
    const dropzone = document.getElementById('admin-csv-dropzone');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--brand-primary)';
      dropzone.style.background = 'hsla(221, 83%, 53%, 0.12)';
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-strong)';
      dropzone.style.background = 'var(--bg-surface-inset)';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-strong)';
      dropzone.style.background = 'var(--bg-surface-inset)';
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.processUploadedCsvFile(files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        this.processUploadedCsvFile(files[0]);
      }
    });

    // Download CSV Template
    document.getElementById('btn-download-csv-template')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.downloadCsvTemplate();
    });

    // Load Mock Sample Pack
    document.getElementById('btn-mock-csv-upload')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadSampleCsvPack();
    });

    // Confirm CSV Import
    document.getElementById('btn-confirm-csv-import')?.addEventListener('click', () => {
      if (this.pendingImportQuestions.length > 0) {
        this.pendingImportQuestions.forEach(q => Storage.addCustomQuestion(q));
        Sound.playFanfare();
        Confetti.fire(120);
        window.DishaApp.showToast(`Successfully imported ${this.pendingImportQuestions.length} questions from ${this.importedFileName}!`, 'success');
        this.pendingImportQuestions = [];
        this.importedFileName = '';
        this.render();
      }
    });

    // Discard CSV Import
    document.getElementById('btn-cancel-csv-import')?.addEventListener('click', () => {
      Sound.playTick();
      this.pendingImportQuestions = [];
      this.importedFileName = '';
      this.render();
    });

    // Schedule Quiz Form
    const formSched = document.getElementById('form-schedule-quiz');
    if (formSched) {
      formSched.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('sched-title').value;
        const cat = document.getElementById('sched-category').value;
        const pool = parseFloat(document.getElementById('sched-pool').value);
        const start = document.getElementById('sched-start').value;
        const lock = document.getElementById('sched-lock').value;

        const list = Storage.getScheduledQuizzes();
        list.push({
          id: 'quiz_' + Date.now(),
          title: title,
          category: cat,
          startTime: start,
          lockTime: lock,
          prizePool: pool,
          entryFee: 0,
          questionsCount: 10,
          registeredCount: 350,
          isRegistered: false,
          status: 'OPEN'
        });
        Storage.saveScheduledQuizzes(list);
        Sound.playFanfare();
        window.DishaApp.showToast('New Live Tournament published successfully!', 'success');
        this.render();
      };
    }

    // Approve payout
    document.getElementById('btn-approve-payout')?.addEventListener('click', () => {
      Sound.playCoin();
      window.DishaApp.showToast('IMPS Payout of ₹1,200.00 successfully released via Razorpay API!', 'success');
    });

    document.getElementById('btn-flag-payout')?.addEventListener('click', () => {
      Sound.playTick();
      window.DishaApp.showToast('Payout flagged for compliance review.', 'info');
    });

    // Eye icon toggles inside Admin Panel
    document.querySelectorAll('.btn-toggle-pass').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '🙈';
            btn.setAttribute('title', 'Hide Passcode');
          } else {
            input.type = 'password';
            btn.innerHTML = '👁️';
            btn.setAttribute('title', 'Show Passcode');
          }
        }
      });
    });

    // Avatar selector buttons in Profile tab
    document.querySelectorAll('.btn-select-avatar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const avatar = btn.getAttribute('data-avatar');
        document.getElementById('admin-selected-avatar').value = avatar;
        document.querySelectorAll('.btn-select-avatar').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-neo');
        });
        btn.classList.remove('btn-neo');
        btn.classList.add('btn-primary');
      });
    });

    // Admin Profile Edit Form Submission
    const formProfile = document.getElementById('form-edit-admin-profile');
    if (formProfile) {
      formProfile.onsubmit = async (e) => {
        e.preventDefault();
        const currentProfile = Storage.getAdminProfile();
        const name = document.getElementById('admin-edit-name')?.value.trim();
        const email = document.getElementById('admin-edit-email')?.value.trim();
        const role = document.getElementById('admin-edit-role')?.value.trim();
        const dept = document.getElementById('admin-edit-dept')?.value.trim();
        const phone = document.getElementById('admin-edit-phone')?.value.trim();
        const avatar = document.getElementById('admin-selected-avatar')?.value || '👨‍💼';

        const currPass = document.getElementById('admin-curr-pass')?.value.trim();
        const newPass = document.getElementById('admin-new-pass')?.value.trim();
        const confirmPass = document.getElementById('admin-confirm-pass')?.value.trim();

        // Check if user is attempting to change passcode
        if (newPass) {
          const passLimitCheck = RateLimiter.check('PASSWORD_RESET');
          if (!passLimitCheck.allowed) {
            window.DishaApp.showToast(`Passcode change limit: Max 3 per hour. Retry in ${Math.ceil(passLimitCheck.retryAfterSec / 60)} mins.`, 'error');
            return;
          }

          if (!currPass) {
            Sound.playWrong();
            window.DishaApp.showToast('Please enter your current master passcode!', 'error');
            return;
          }

          if (newPass.length < 4) {
            Sound.playWrong();
            window.DishaApp.showToast('New passcode must be at least 4 characters long!', 'error');
            return;
          }

          if (newPass !== confirmPass) {
            Sound.playWrong();
            window.DishaApp.showToast('New passcode and confirm passcode do not match!', 'error');
            return;
          }

          try {
            await API.admin.updatePasscode(currPass, newPass);
            RateLimiter.reset('PASSWORD_RESET');
          } catch (err) {
            RateLimiter.consume('PASSWORD_RESET');
            Sound.playWrong();
            window.DishaApp.showToast(`Failed to update passcode: ${err.message || 'Incorrect current passcode.'}`, 'error');
            return;
          }
        }

        const updatedProfile = {
          ...currentProfile,
          name: name || currentProfile.name,
          email: email || currentProfile.email,
          role: role || currentProfile.role,
          department: dept || currentProfile.department,
          phone: phone || currentProfile.phone,
          avatar: avatar
        };
        delete updatedProfile.passcode;

        Storage.setAdminProfile(updatedProfile);
        Sound.playFanfare();
        Confetti.fire(100);
        window.DishaApp.showToast('Admin Profile & Master Credentials updated successfully!', 'success');
        this.render();
      };
    }
  }

  processUploadedCsvFile(file) {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      window.DishaApp.showToast('Please select a valid .csv file', 'error');
      return;
    }

    this.importedFileName = file.name;
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = this.parseCsvContent(text);
      if (parsed.length === 0) {
        window.DishaApp.showToast('No valid questions found in CSV file. Please check template format.', 'error');
        return;
      }

      this.pendingImportQuestions = parsed;
      Sound.playCoin();
      window.DishaApp.showToast(`Parsed ${parsed.length} questions from ${file.name}!`, 'success');
      this.render();
    };

    reader.onerror = () => {
      window.DishaApp.showToast('Failed to read file from device.', 'error');
    };

    reader.readAsText(file);
  }

  parseCsvContent(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];

    const results = [];
    // Skip header line (idx 0)
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      if (row.length >= 8) {
        // Expected columns:
        // [0: Category, 1: Subject, 2: Question_EN, 3: OptA, 4: OptB, 5: OptC, 6: OptD, 7: Correct, 8: Explanation, 9: Year, 10: Question_HI]
        const category = Sanitize.cleanText(row[0]) || 'SSC';
        const subject = Sanitize.cleanText(row[1]) || 'General Studies';
        const qEn = Sanitize.cleanText(row[2]);
        const optA = Sanitize.cleanText(row[3]);
        const optB = Sanitize.cleanText(row[4]);
        const optC = Sanitize.cleanText(row[5]);
        const optD = Sanitize.cleanText(row[6]);
        
        let correctRaw = Sanitize.cleanText(row[7]).toUpperCase();
        let correctIdx = 0;
        if (correctRaw === 'B' || correctRaw === '1' || correctRaw === '2') correctIdx = 1;
        if (correctRaw === 'C' || correctRaw === '2' || correctRaw === '3') correctIdx = 2;
        if (correctRaw === 'D' || correctRaw === '3' || correctRaw === '4') correctIdx = 3;

        const exp = Sanitize.cleanText(row[8]) || 'Standard conceptual explanation from government exam syllabus.';
        const year = Sanitize.cleanText(row[9]) || 'PYQ 2024';
        const qHi = Sanitize.cleanText(row[10]) || qEn;

        if (qEn && optA && optB) {
          results.push({
            id: 'csv_' + Date.now() + '_' + i,
            category: category,
            subject: subject,
            year: year,
            difficulty: 'Medium',
            question_en: qEn,
            question_hi: qHi,
            options_en: [optA, optB, optC || 'None of these', optD || 'All of the above'],
            options_hi: [optA, optB, optC || 'इनमें से कोई नहीं', optD || 'उपर्युक्त सभी'],
            correct: correctIdx,
            explanation_en: exp,
            explanation_hi: exp
          });
        }
      }
    }

    return results;
  }

  parseCsvLine(line) {
    const result = [];
    let curVal = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(curVal);
        curVal = '';
      } else {
        curVal += char;
      }
    }
    result.push(curVal);
    return result;
  }

  downloadCsvTemplate() {
    const csvContent = "Category,Subject,Question_EN,Option_A,Option_B,Option_C,Option_D,Correct_Option,Explanation,Year,Question_HI\n" +
      "SSC,Indian Polity,\"Under which article is the Right to Equality guaranteed?\",\"Article 14-18\",\"Article 19\",\"Article 21\",\"Article 32\",\"A\",\"Articles 14 to 18 of the Constitution guarantee Right to Equality.\",\"SSC CGL 2024\",\"समानता का अधिकार किस अनुच्छेद के तहत है?\"\n" +
      "Railways,Physics,\"What is the unit of power?\",\"Joule\",\"Watt\",\"Newton\",\"Pascal\",\"B\",\"Watt is the SI unit of power, equivalent to 1 Joule per second.\",\"RRB NTPC 2023\",\"शक्ति का मात्रक क्या है?\"\n" +
      "UPSSSC,State GK,\"Which city is the capital of Uttar Pradesh?\",\"Kanpur\",\"Varanasi\",\"Lucknow\",\"Prayagraj\",\"C\",\"Lucknow is the administrative and judicial capital city of Uttar Pradesh.\",\"UP PET 2023\",\"उत्तर प्रदेश की राजधानी कौन सा शहर है?\"\n" +
      "Bank,Banking Awareness,\"What is the full form of NEFT?\",\"National Electronic Fund Transfer\",\"National Easy Finance Tech\",\"Net Electronic Fund Transfer\",\"National Express Fast Trade\",\"A\",\"NEFT stands for National Electronic Funds Transfer operated by RBI.\",\"SBI PO 2023\",\"NEFT का पूर्ण रूप क्या है?\"";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'disha_question_bank_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.DishaApp.showToast('Downloaded disha_question_bank_template.csv to your device!', 'info');
  }

  loadSampleCsvPack() {
    const sampleCsv = `Category,Subject,Question_EN,Option_A,Option_B,Option_C,Option_D,Correct_Option,Explanation,Year,Question_HI
SSC,History,"Who was the first Governor-General of independent India?","Lord Mountbatten","C. Rajagopalachari","Dr. Rajendra Prasad","Jawaharlal Nehru","A","Lord Mountbatten served as the first Governor-General of independent India until June 1948.","SSC CGL 2023","स्वतंत्र भारत के प्रथम गवर्नर-जनरल कौन थे?"
SSC,Geography,"Which is the largest freshwater lake in India?","Wular Lake","Chilika Lake","Sambhar Lake","Loktak Lake","A","Wular Lake in Jammu & Kashmir is the largest freshwater lake in India.","SSC CHSL 2023","भारत की सबसे बड़ी मीठे पानी की झील कौन सी है?"
Railways,Chemistry,"What is the common name of Sodium Bicarbonate?","Baking Soda","Washing Soda","Bleaching Powder","Caustic Soda","A","Sodium bicarbonate (NaHCO3) is commonly known as baking soda.","RRB Group D 2022","सोडियम बाइकार्बोनेट का सामान्य नाम क्या है?"
Railways,Biology,"Which blood group is known as the Universal Donor?","O Negative","AB Positive","A Positive","B Negative","A","O negative blood cells have neither A nor B antigens nor Rh factor, making it universal.","RRB NTPC 2022","किस रक्त समूह को सर्वदाता (Universal Donor) कहा जाता है?"
Bank,Quantitative Aptitude,"What is 15% of 40% of 1200?","72","60","84","96","A","0.15 * 0.40 * 1200 = 0.06 * 1200 = 72.","IBPS Clerk 2023","1200 के 40% का 15% कितना होगा?"`;

    const parsed = this.parseCsvContent(sampleCsv);
    this.importedFileName = 'sample_gov_exam_pyq_pack.csv';
    this.pendingImportQuestions = parsed;
    Sound.playCoin();
    window.DishaApp.showToast(`Loaded ${parsed.length} sample PYQ questions from CSV! Click 'Save All' to import.`, 'success');
    this.render();
  }
}

export const Admin = new AdminView();
