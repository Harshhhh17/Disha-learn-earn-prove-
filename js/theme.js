/* ==========================================================================
   Disha Theme Engine: Light / Dark / System Mode System
   ========================================================================== */

import { Storage } from './utils/storage.js';

class ThemeEngine {
  constructor() {
    this.currentTheme = Storage.getTheme() || 'dark';
  }

  init() {
    this.currentTheme = Storage.getTheme() || 'dark';
    this.applyTheme(this.currentTheme);
    this.listenToSystemTheme();
  }

  listenToSystemTheme() {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const saved = Storage.getTheme();
        if (saved === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }

  applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      theme = 'dark';
    }

    this.currentTheme = theme;
    Storage.setTheme(theme);

    const effective = (theme === 'system')
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    // Apply attribute and class to html and body
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(effective);

    if (document.body) {
      document.body.setAttribute('data-theme', effective);
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(effective);
    }

    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', effective === 'dark' ? '#060913' : '#F1F5F9');
    }

    this.updateThemeButtonUI();
  }

  toggle() {
    const nextTheme = (this.currentTheme === 'dark') ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    if (window.DishaApp && typeof window.DishaApp.showToast === 'function') {
      window.DishaApp.showToast(nextTheme === 'dark' ? '🌙 Dark Mode Activated' : '☀️ Light Mode Activated', 'info');
    }
  }

  updateThemeButtonUI() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    const effective = (this.currentTheme === 'system')
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : this.currentTheme;

    if (effective === 'dark') {
      btn.innerHTML = `<span style="font-size: 1.15rem;">🌙</span>`;
      btn.setAttribute('title', 'Theme: Dark (Click for Light Mode)');
      btn.setAttribute('aria-label', 'Switch to Light Mode');
    } else {
      btn.innerHTML = `<span style="font-size: 1.15rem;">☀️</span>`;
      btn.setAttribute('title', 'Theme: Light (Click for Dark Mode)');
      btn.setAttribute('aria-label', 'Switch to Dark Mode');
    }
  }
}

export const Theme = new ThemeEngine();

