/* ==========================================================================
   Disha User Profile, Privacy & Settings View
   ========================================================================== */

import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Theme } from './theme.js';
import { Sound } from './utils/sound.js';
import { CryptoUtils } from './utils/crypto.js';
import { Sanitize } from './utils/sanitize.js';

class ProfileView {
  render() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    const user = Storage.getUser();
    const currentTheme = Storage.getTheme();
    const currentLang = Storage.getLanguage();

    const maskedPhone = user?.phone ? CryptoUtils.maskPhone(user.phone) : 'Phone not verified';
    const maskedEmail = user?.email ? CryptoUtils.maskEmail(user.email) : 'Sign in to sync account';

    container.innerHTML = `
      <!-- Profile Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg);">
        <div>
          <h2 style="font-size: 1.4rem;">${I18n.t('profile')} & Settings</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Manage account, exam goals, language, privacy, and security preferences.</p>
        </div>
      </div>

      <!-- User Card (With Masked PII) -->
      <div class="neo-card" style="margin-bottom: var(--space-xl);">
        <div style="display: flex; align-items: center; gap: var(--space-md); flex-wrap:wrap;">
          <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--bg-surface-inset); box-shadow: var(--neo-pressed); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; border: 2px solid var(--border-subtle);">
            ${user?.avatar || '👨‍🎓'}
          </div>

          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 style="font-size: 1.3rem;">${Sanitize.escapeHtml(user?.name || 'Guest Aspirant')}</h3>
              <span style="background: hsla(226,88%,60%,0.15); color: var(--brand-primary); padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;">
                ${user ? 'Aspirant' : 'Guest'}
              </span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 2px 0 6px;">
              ${maskedPhone} • ${maskedEmail}
            </p>
            <div style="display: flex; gap: 6px; flex-wrap:wrap;">
              ${(user?.targetExams || ['SSC', 'Railways']).map(ex => `
                <span style="background: var(--bg-surface-inset); padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 600; color: var(--text-muted);">
                  🎯 ${ex}
                </span>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Subject Performance Analytics -->
      <div class="neo-card" style="margin-bottom: var(--space-xl);">
        <h3 style="font-size: 1.15rem; margin-bottom: var(--space-md);">📊 Subject-Wise Accuracy</h3>
        
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px;">
              <span>Indian Polity & Constitution</span>
              <span style="color: var(--brand-emerald);">88% Accuracy</span>
            </div>
            <div style="height: 8px; background: var(--bg-surface-inset); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: 88%; height: 100%; background: var(--brand-emerald); border-radius: var(--radius-full);"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px;">
              <span>General Science (Phy, Chem, Bio)</span>
              <span style="color: var(--brand-primary);">82% Accuracy</span>
            </div>
            <div style="height: 8px; background: var(--bg-surface-inset); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: 82%; height: 100%; background: var(--brand-primary); border-radius: var(--radius-full);"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px;">
              <span>Quantitative Aptitude & Maths</span>
              <span style="color: var(--brand-gold);">74% Accuracy</span>
            </div>
            <div style="height: 8px; background: var(--bg-surface-inset); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: 74%; height: 100%; background: var(--brand-gold); border-radius: var(--radius-full);"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 4px;">
              <span>Current Affairs Capsule</span>
              <span style="color: var(--brand-purple);">91% Accuracy</span>
            </div>
            <div style="height: 8px; background: var(--bg-surface-inset); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: 91%; height: 100%; background: var(--brand-purple); border-radius: var(--radius-full);"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- App Preferences -->
      <div class="neo-card" style="margin-bottom: var(--space-xl);">
        <h3 style="font-size: 1.15rem; margin-bottom: var(--space-md);">⚙️ Preferences</h3>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Theme Preference -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">App Appearance</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary);">Toggle Dark or Light theme</div>
            </div>
            <div class="neo-inset" style="padding: 4px; display: flex; gap: 4px; border-radius: var(--radius-full);">
              <button id="set-theme-light" class="btn btn-sm ${currentTheme === 'light' ? 'btn-primary' : 'btn-neo'}" style="padding: 6px 14px; font-size: 0.8rem;">
                ☀️ Light
              </button>
              <button id="set-theme-dark" class="btn btn-sm ${currentTheme === 'dark' ? 'btn-primary' : 'btn-neo'}" style="padding: 6px 14px; font-size: 0.8rem;">
                🌙 Dark
              </button>
            </div>
          </div>

          <!-- Language Preference -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">Regional Language</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary);">Questions and interface language</div>
            </div>
            <select id="profile-lang-select" class="input-neo" style="padding: 8px 12px; font-size: 0.85rem; width: auto;">
              <option value="hi" ${currentLang === 'hi' ? 'selected' : ''}>हिंदी (Hindi)</option>
              <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
              <option value="pa" ${currentLang === 'pa' ? 'selected' : ''}>ਪੰਜਾਬੀ (Punjabi)</option>
              <option value="ur" ${currentLang === 'ur' ? 'selected' : ''}>اردو (Urdu)</option>
              <option value="bho" ${currentLang === 'bho' ? 'selected' : ''}>भोजपुरी (Bhojpuri)</option>
              <option value="ta" ${currentLang === 'ta' ? 'selected' : ''}>தமிழ் (Tamil)</option>
              <option value="te" ${currentLang === 'te' ? 'selected' : ''}>తెలుగు (Telugu)</option>
              <option value="bn" ${currentLang === 'bn' ? 'selected' : ''}>বাংলা (Bengali)</option>
              <option value="mr" ${currentLang === 'mr' ? 'selected' : ''}>मराठी (Marathi)</option>
            </select>
          </div>

          <!-- Sound Effects -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">Sound Effects & Haptics</div>
              <div style="font-size: 0.78rem; color: var(--text-secondary);">Timer ticks, correct/wrong chimes</div>
            </div>
            <button id="btn-toggle-sound" class="btn btn-sm ${Sound.enabled ? 'btn-emerald' : 'btn-neo'}" style="padding: 6px 14px; font-size: 0.8rem;">
              ${Sound.enabled ? '🔊 Active' : '🔇 Muted'}
            </button>
          </div>
        </div>
      </div>

      <!-- Data Privacy & Right to Erasure (DPDP Act & GDPR Compliance) -->
      <div class="neo-card" style="margin-bottom: var(--space-xl); border: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.15rem; margin-bottom: var(--space-xs);">🛡️ Privacy & Personal Data Management</h3>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
          In compliance with India's Digital Personal Data Protection (DPDP) Act and GDPR standards, you have full ownership over your personal data.
        </p>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: var(--bg-surface-inset); padding: var(--space-md); border-radius: var(--radius-md);">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary);">Right to be Forgotten (Account Erasure)</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              Permanently delete your profile, phone, email, quiz history, wallet balance, and bookmarks.
            </div>
          </div>
          <button id="btn-delete-all-data" class="btn btn-sm" style="background: hsla(352,85%,58%,0.15); color: var(--brand-crimson); border: 1px solid hsla(352,85%,58%,0.3); font-weight: 700; padding: 8px 16px;">
            🗑️ Delete Account & Erase All Data
          </button>
        </div>
      </div>

      <!-- Admin Panel Section -->
      <div class="glass-panel" style="padding: var(--space-md); border: 1px dashed var(--brand-primary); display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap: 8px; margin-bottom: var(--space-md);">
        <div>
          <div style="font-weight: 700; font-size: 0.92rem; color: var(--brand-primary);">
            🔒 Admin & Content Manager Console
          </div>
          <p style="font-size: 0.8rem; color: var(--text-secondary);">
            Role-Gated: Curate question banks, schedule quizzes, & approve payouts.
          </p>
        </div>
        <button id="btn-switch-admin-view" class="btn btn-primary btn-sm">
          Unlock Admin Panel 🔑
        </button>
      </div>

      <!-- Log Out / Switch Account -->
      <div style="text-align: center; margin-top: var(--space-lg);">
        <button id="btn-profile-logout" class="btn btn-neo" style="color: var(--brand-crimson); border-color: hsla(352,85%,58%,0.3); font-weight: 700; padding: 12px 28px;">
          🚪 Sign Out / Switch Account
        </button>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Theme buttons
    document.getElementById('set-theme-light')?.addEventListener('click', () => {
      Theme.applyTheme('light');
      this.render();
    });
    document.getElementById('set-theme-dark')?.addEventListener('click', () => {
      Theme.applyTheme('dark');
      this.render();
    });

    // Language select
    document.getElementById('profile-lang-select')?.addEventListener('change', (e) => {
      I18n.setLanguage(e.target.value);
      this.render();
    });

    // Sound toggle
    document.getElementById('btn-toggle-sound')?.addEventListener('click', () => {
      const state = Sound.toggle();
      window.DishaApp.showToast(state ? 'Sound effects enabled' : 'Sound effects muted', 'info');
      this.render();
    });

    // Admin portal
    document.getElementById('btn-switch-admin-view')?.addEventListener('click', () => {
      Sound.playTick();
      window.DishaApp.navigateTo('admin');
    });

    // Right to be Forgotten / Complete Account & Data Erasure
    document.getElementById('btn-delete-all-data')?.addEventListener('click', () => {
      const confirmed = window.confirm(
        '⚠️ ARE YOU SURE YOU WANT TO DELETE YOUR ACCOUNT?\n\n' +
        'This action is irreversible. All your profile information, phone, email, wallet balance, quiz statistics, and saved bookmarks will be permanently erased.'
      );

      if (confirmed) {
        Sound.playWrong();
        Storage.deleteAllUserData();
        window.DishaApp.showToast('Your account and all personal data have been permanently erased.', 'info');
        setTimeout(() => {
          if (window.DishaApp) {
            window.DishaApp.onLogout();
          }
        }, 800);
      }
    });

    // Log out
    document.getElementById('btn-profile-logout')?.addEventListener('click', () => {
      Sound.playTick();
      Storage.clearUser();
      if (window.DishaApp) {
        window.DishaApp.onLogout();
      }
    });
  }
}

export const Profile = new ProfileView();
