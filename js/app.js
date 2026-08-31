import { Theme } from './theme.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { Auth } from './auth.js';
import { Storage } from './utils/storage.js';
import { API } from './api.js';
import { Config } from './config.js';
import { Landing } from './landing.js';
import { Home } from './home.js';
import { Practice } from './practice.js';
import { LiveQuiz } from './live-quiz.js';
import { Wallet } from './wallet.js';
import { Profile } from './profile.js';
import { Admin } from './admin.js';

class Application {
  constructor() {
    this.currentRoute = 'home';
    this.routeParams = {};
  }

  init() {
    try {
      // 1. Initialize core system services
      Theme.init();
      I18n.init();
      LiveQuiz.init();
      Auth.init();

      // 2. Setup Navigation & Global Event Listeners
      this.setupHeaderEvents();
      this.setupBottomNavEvents();
      // 3. Clear any stale URL hash (e.g. #terms) to guarantee clean landing
      if (window.location.hash && !['#home', '#practice', '#live-quiz', '#wallet', '#profile', '#admin'].includes(window.location.hash)) {
        try {
          history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
      }

      // 4. Initial Route Resolution: Login page first for unauthenticated users
      const startRoute = Auth.isLoggedIn() ? 'home' : 'landing';
      this.navigateTo(startRoute);

      // 4. Listen for language changes
      window.addEventListener('disha:languageChanged', () => {
        this.renderAll();
      });
    } catch (err) {
      console.error('[Disha App Init Error]:', err);
      this.navigateTo('landing');
    }
  }

  navigateTo(route, params = {}) {
    // Route guard: Allow 'landing' for unauthenticated users
    if (route !== 'landing' && !Auth.isLoggedIn()) {
      route = 'landing';
    }

    this.currentRoute = route;
    this.routeParams = params;

    // Manage Bottom Navigation Visibility
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      if (route === 'landing' || !Auth.isLoggedIn()) {
        bottomNav.style.display = 'none';
        document.querySelector('.app-wrapper')?.classList.add('no-bottom-nav');
      } else {
        bottomNav.style.display = 'flex';
        document.querySelector('.app-wrapper')?.classList.remove('no-bottom-nav');
      }
    }

    // Update Bottom Nav active states
    document.querySelectorAll('.nav-item').forEach(item => {
      const target = item.getAttribute('data-nav');
      if (target === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Hide all view containers
    const views = ['view-landing', 'view-home', 'view-practice', 'view-live-quiz', 'view-wallet', 'view-profile', 'view-admin'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = 'none';
    });

    // Show target view
    const targetEl = document.getElementById(`view-${route}`);
    if (targetEl) {
      targetEl.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Render corresponding view controller
    switch (route) {
      case 'landing':
        Landing.render();
        break;
      case 'home':
        Home.render();
        break;
      case 'practice':
        Practice.render(this.routeParams);
        break;
      case 'live-quiz':
        LiveQuiz.render();
        break;
      case 'wallet':
        Wallet.render();
        break;
      case 'profile':
        Profile.render();
        break;
      case 'admin':
        Admin.render();
        break;
    }

    this.updateHeaderUserUI();
    I18n.translateDOM();
  }

  updateHeaderUserUI() {
    const user = Storage.getUser();
    const loginBtn = document.getElementById('header-login-btn');
    const userBtn = document.getElementById('header-user-btn');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userBtn) {
        userBtn.style.display = 'inline-flex';
        userBtn.innerHTML = `<span>${user.avatar || '👨‍🎓'}</span>`;
        userBtn.setAttribute('title', `${user.name} (My Profile)`);
      }
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userBtn) userBtn.style.display = 'none';
    }
  }

  onAuthSuccess(userOrMsg = null, message = 'Welcome to Disha!') {
    let user = Storage.getUser();
    if (typeof userOrMsg === 'object' && userOrMsg !== null) {
      user = userOrMsg;
      Storage.setUser(user);
    } else if (typeof userOrMsg === 'string') {
      message = userOrMsg;
    }

    sessionStorage.setItem('disha_active_session', 'true');
    this.updateHeaderUserUI();
    this.showToast(message, 'success');
    this.navigateTo('home');
  }

  onLogout() {
    sessionStorage.removeItem('disha_active_session');
    Storage.clearUser();
    this.updateHeaderUserUI();
    this.showToast('Signed out successfully.', 'info');
    this.navigateTo('landing');
  }

  renderAll() {
    this.navigateTo(this.currentRoute, this.routeParams);
  }

  setupHeaderEvents() {
    // Brand Logo Click
    document.getElementById('header-brand-logo')?.addEventListener('click', () => {
      Sound.playTick();
      if (Auth.isLoggedIn()) {
        this.navigateTo('home');
      } else {
        this.navigateTo('landing');
      }
    });

    // Theme Toggle Button
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      Sound.playTick();
      Theme.toggle();
    });

    // Language Dropdown Toggle
    const langBtn = document.getElementById('lang-menu-btn');
    const langDropdown = document.getElementById('lang-dropdown-menu');

    langBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      Sound.playTick();
      langDropdown?.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!langBtn?.contains(e.target) && !langDropdown?.contains(e.target)) {
        langDropdown?.classList.remove('show');
      }
    });

    // Language Select Item Click
    document.querySelectorAll('.lang-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const langCode = item.getAttribute('data-lang');
        Sound.playTick();
        I18n.setLanguage(langCode);
        langDropdown?.classList.remove('show');
        this.showToast(`Language switched to ${item.querySelector('.native-name')?.textContent || langCode}`, 'info');
      });
    });

    // Header Login button
    document.getElementById('header-login-btn')?.addEventListener('click', () => {
      Sound.playTick();
      this.navigateTo('landing');
    });

    // User Avatar Button
    document.getElementById('header-user-btn')?.addEventListener('click', () => {
      Sound.playTick();
      this.navigateTo('profile');
    });

    // Bell notification trigger
    document.getElementById('header-notif-btn')?.addEventListener('click', () => {
      Sound.playTick();
      this.showToast('🔔 9:00 PM Live SSC Maha-Quiz starts soon. Registration open!', 'info');
    });
  }

  setupBottomNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        Sound.playTick();
        const route = item.getAttribute('data-nav');
        this.navigateTo(route);
      });
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('global-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
      <span style="font-weight: 700; font-size: 1.1rem;">${icon}</span>
      <span style="flex: 1;">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 300ms ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Instantiate and expose globally
window.DishaApp = new Application();
window.API = API;
window.Storage = Storage;
window.Auth = Auth;
window.Wallet = Wallet;
window.Landing = Landing;
window.Home = Home;
window.Practice = Practice;
window.LiveQuiz = LiveQuiz;
window.Profile = Profile;
window.Admin = Admin;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.DishaApp.init();
  });
} else {
  window.DishaApp.init();
}
