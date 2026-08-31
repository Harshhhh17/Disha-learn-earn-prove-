/* ==========================================================================
   Disha Localization Engine: Multi-Language & RTL Support
   ========================================================================== */

import { LANGUAGES, TRANSLATIONS } from './data/translations.js';
import { Storage } from './utils/storage.js';

class I18nEngine {
  constructor() {
    this.currentLang = Storage.getLanguage() || 'hi';
  }

  init() {
    this.setLanguage(this.currentLang);
  }

  setLanguage(langCode) {
    if (!TRANSLATIONS[langCode]) {
      langCode = 'en';
    }
    this.currentLang = langCode;
    Storage.setLanguage(langCode);

    const langMeta = LANGUAGES.find(l => l.code === langCode) || { dir: 'ltr' };
    document.documentElement.setAttribute('lang', langCode);
    document.documentElement.setAttribute('dir', langMeta.dir);

    this.translateDOM();
    this.updateLanguageMenuUI();

    window.dispatchEvent(new CustomEvent('disha:languageChanged', { detail: { lang: langCode } }));
  }

  t(key) {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS['en'];
    return dict[key] || TRANSLATIONS['en'][key] || key;
  }

  translateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.setAttribute('placeholder', text);
      } else {
        el.textContent = text;
      }
    });
  }

  updateLanguageMenuUI() {
    const currentLangEl = document.getElementById('current-lang-label');
    if (currentLangEl) {
      const langObj = LANGUAGES.find(l => l.code === this.currentLang);
      currentLangEl.textContent = langObj ? langObj.native : 'हिंदी';
    }

    const items = document.querySelectorAll('.lang-dropdown-item');
    items.forEach(item => {
      const code = item.getAttribute('data-lang');
      if (code === this.currentLang) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}

export const I18n = new I18nEngine();
