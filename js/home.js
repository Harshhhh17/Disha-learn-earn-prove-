/* ==========================================================================
   Disha Home Dashboard View
   ========================================================================== */

import { Storage } from './utils/storage.js';
import { DAILY_CAPSULE } from './data/current-affairs.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';

class HomeView {
  constructor() {
    this.countdownInterval = null;
  }

  render() {
    const container = document.getElementById('view-home');
    if (!container) return;

    const user = Storage.getUser();
    const scheduledQuizzes = Storage.getScheduledQuizzes();
    const featuredQuiz = scheduledQuizzes[0] || {};

    container.innerHTML = `
      <!-- Hero Live Tournament Banner -->
      <section class="live-hero-banner" id="hero-quiz-banner">
        <div class="banner-header">
          <div class="live-pulse-badge">
            <span class="pulse-dot"></span>
            <span data-i18n="upcomingLive">${I18n.t('upcomingLive')}</span>
          </div>
          <div class="prize-pool-tag">
            <span>🏆 ₹${featuredQuiz.prizePool?.toLocaleString('en-IN') || '10,000'}</span>
          </div>
        </div>

        <h2 style="font-size: 1.35rem; margin-bottom: 4px; color: var(--text-primary);">
          ${featuredQuiz.title || 'Maha-Dhamaka SSC CGL All India Live Quiz'}
        </h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
          10 Questions • 15 Seconds Per Question • Instant Leaderboard & Bank Payout
        </p>

        <!-- Live Countdown -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap: var(--space-md);">
          <div>
            <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">
              ⏰ ${I18n.t('startsIn')} (Lock at 8:50 PM)
            </div>
            <div class="countdown-box" id="hero-countdown-box">
              <div class="countdown-unit">
                <div class="countdown-val" id="cd-hours">09</div>
                <div class="countdown-lbl">${I18n.t('hours')}</div>
              </div>
              <span style="font-size: 1.5rem; font-weight: 800; color: var(--text-muted);">:</span>
              <div class="countdown-unit">
                <div class="countdown-val" id="cd-mins">04</div>
                <div class="countdown-lbl">${I18n.t('mins')}</div>
              </div>
              <span style="font-size: 1.5rem; font-weight: 800; color: var(--text-muted);">:</span>
              <div class="countdown-unit">
                <div class="countdown-val" id="cd-secs" style="color: var(--brand-crimson);">18</div>
                <div class="countdown-lbl">${I18n.t('secs')}</div>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; min-width:180px;">
            <button id="hero-register-btn" class="btn ${featuredQuiz.isRegistered ? 'btn-emerald' : 'btn-primary'} btn-block" style="padding: 14px 20px;">
              ${featuredQuiz.isRegistered ? '✓ Registered & Reserved' : '🔥 ' + I18n.t('registerNow')}
            </button>
            <div class="registered-roster">
              <div class="avatar-stack">
                <div class="avatar-initial">AK</div>
                <div class="avatar-initial" style="background:#10b981;">PS</div>
                <div class="avatar-initial" style="background:#f59e0b;">RK</div>
                <div class="avatar-initial" style="background:#8b5cf6;">VJ</div>
              </div>
              <span><strong>${featuredQuiz.registeredCount?.toLocaleString('en-IN') || '1,842'}</strong> aspirants joined</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Target Exam Categories Grid -->
      <section style="margin-bottom: var(--space-xl);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md);">
          <div>
            <h3 style="font-size: 1.2rem;">${I18n.t('selectCategory')}</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary);">${I18n.t('practiceDesc')}</p>
          </div>
        </div>

        <div class="category-grid">
          <!-- SSC Card -->
          <div class="category-card" data-category="SSC">
            <div class="cat-icon-wrapper cat-ssc">🏛️</div>
            <div class="cat-title">SSC CGL / CHSL</div>
            <div class="cat-desc">Previous Year GK, History, Polity & Geography</div>
            <div class="cat-badge">2,450+ PYQs</div>
          </div>

          <!-- UPSSSC Card -->
          <div class="category-card" data-category="UPSSSC">
            <div class="cat-icon-wrapper cat-upsssc">📜</div>
            <div class="cat-title">UPSSSC PET</div>
            <div class="cat-desc">UP State GK, Hindi & Lekhpal Rural Modules</div>
            <div class="cat-badge">1,820+ PYQs</div>
          </div>

          <!-- Railways Card -->
          <div class="category-card" data-category="Railways">
            <div class="cat-icon-wrapper cat-railway">🚆</div>
            <div class="cat-title">Railways RRB</div>
            <div class="cat-desc">NTPC & Group D General Science (Phy, Chem, Bio)</div>
            <div class="cat-badge">3,100+ PYQs</div>
          </div>

          <!-- Bank Card -->
          <div class="category-card" data-category="Bank">
            <div class="cat-icon-wrapper cat-bank">🏦</div>
            <div class="cat-title">Bank PO / Clerk</div>
            <div class="cat-desc">Quantitative Aptitude, Reasoning & Financial GK</div>
            <div class="cat-badge">2,900+ PYQs</div>
          </div>
        </div>
      </section>

      <!-- Daily Current Affairs Persistent Module -->
      <section class="current-affairs-card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); flex-wrap:wrap; gap:8px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:6px; background:hsla(270,75%,60%,0.15); color:var(--brand-purple); padding:3px 10px; border-radius:var(--radius-full); font-size:0.75rem; font-weight:700; text-transform:uppercase;">
              📰 Daily Capsule • ${DAILY_CAPSULE.date}
            </div>
            <h3 style="font-size: 1.15rem; margin-top: 6px;">${I18n.t('currentAffairs')}</h3>
          </div>
          <button id="btn-take-ca-test" class="btn btn-gold btn-sm">
            ⚡ ${I18n.t('takeTest')}
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-md);">
          ${DAILY_CAPSULE.headlines.map(h => `
            <div style="background: var(--bg-surface); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <span style="font-size: 0.72rem; font-weight: 700; color: var(--brand-primary); text-transform: uppercase;">${h.category}</span>
              <p style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-top: 2px;">
                ${I18n.currentLang === 'hi' ? h.title_hi : h.title_en}
              </p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Aspirant Performance Quick Stats -->
      <section style="margin-bottom: var(--space-xl);">
        <h3 style="font-size: 1.15rem; margin-bottom: var(--space-md);">${I18n.t('statsOverview')}</h3>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-number">${user?.stats?.quizzesPlayed ?? 0}</div>
            <div class="stat-label">${I18n.t('quizzesPlayed')}</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: var(--brand-gold);">₹${(user?.stats?.totalEarnings ?? 0).toLocaleString('en-IN')}</div>
            <div class="stat-label">${I18n.t('totalWon')}</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: var(--brand-emerald);">${user?.stats?.accuracy ?? 0}%</div>
            <div class="stat-label">${I18n.t('accuracy')}</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" style="color: var(--brand-crimson);">${user?.stats?.winStreak ?? 0}🔥</div>
            <div class="stat-label">${I18n.t('winStreak')}</div>
          </div>
        </div>
      </section>
    `;

    this.bindEvents();
    this.startLiveCountdown();
  }

  bindEvents() {
    // Hero Register Button
    const regBtn = document.getElementById('hero-register-btn');
    if (regBtn) {
      regBtn.addEventListener('click', () => {
        Sound.playTick();
        const quizzes = Storage.getScheduledQuizzes();
        if (quizzes.length > 0) {
          quizzes[0].isRegistered = !quizzes[0].isRegistered;
          quizzes[0].registeredCount += quizzes[0].isRegistered ? 1 : -1;
          Storage.saveScheduledQuizzes(quizzes);
          if (quizzes[0].isRegistered) {
            Sound.playCoin();
            window.DishaApp.showToast('Seat reserved for 9:00 PM Live Quiz! Waiting room opens at 8:50 PM.', 'success');
          } else {
            window.DishaApp.showToast('Registration cancelled.', 'info');
          }
          this.render();
        }
      });
    }

    // Category Cards Click
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        Sound.playTick();
        const cat = card.getAttribute('data-category');
        window.DishaApp.navigateTo('practice', { category: cat });
      });
    });

    // Current Affairs Test
    const caTestBtn = document.getElementById('btn-take-ca-test');
    if (caTestBtn) {
      caTestBtn.addEventListener('click', () => {
        Sound.playTick();
        window.DishaApp.navigateTo('practice', { category: 'Current Affairs' });
      });
    }
  }

  startLiveCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    // Dynamic simulated countdown targeting 9:00 PM
    let totalSecs = 9 * 3600 + 4 * 60 + 18;

    this.countdownInterval = setInterval(() => {
      totalSecs--;
      if (totalSecs <= 0) totalSecs = 12 * 3600;

      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      const elH = document.getElementById('cd-hours');
      const elM = document.getElementById('cd-mins');
      const elS = document.getElementById('cd-secs');

      if (elH) elH.textContent = String(hrs).padStart(2, '0');
      if (elM) elM.textContent = String(mins).padStart(2, '0');
      if (elS) elS.textContent = String(secs).padStart(2, '0');
    }, 1000);
  }
}

export const Home = new HomeView();
