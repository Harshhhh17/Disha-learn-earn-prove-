/* ==========================================================================
   Disha Theme Engine: Light / Dark Mode System
   ========================================================================== */

import { Storage } from './utils/storage.js';

class ThemeEngine {
  constructor() {
    this.currentTheme = Storage.getTheme() || 'dark';
  }

  init() {
    this.applyTheme(this.currentTheme);
  }

  applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'dark';
    }

    this.currentTheme = theme;
    Storage.setTheme(theme);

    // Apply attribute to html and body
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);

    if (document.body) {
      document.body.setAttribute('data-theme', theme);
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(theme);
    }

    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#060913' : '#F1F5F9');
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

    if (this.currentTheme === 'dark') {
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
