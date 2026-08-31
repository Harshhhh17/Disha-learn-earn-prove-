/* ==========================================================================
   Disha Practice Mode (Self-Paced Exam Prep & Speed Drill)
   ========================================================================== */

import { QUESTION_BANK } from './data/questions.js';
import { DAILY_CAPSULE } from './data/current-affairs.js';
import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { API } from './api.js';

class PracticeView {
  constructor() {
    this.selectedCategory = 'All';
    this.mode = 'untimed'; // 'untimed' or 'timed'
    this.currentQuestions = [];
    this.currentIndex = 0;
    this.selectedOption = null;
    this.isAnswerSubmitted = false;
    this.timerInterval = null;
    this.timerSeconds = 15;
    this.score = 0;
    this.bilingualLang = 'hi'; // default question lang
  }

  render(params = {}) {
    const container = document.getElementById('view-practice');
    if (!container) return;

    if (params.category) {
      this.selectedCategory = params.category;
    }

    this.filterQuestionsSync();

    container.innerHTML = `
      <!-- Practice Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md); flex-wrap:wrap; gap:8px;">
        <div>
          <h2 style="font-size: 1.4rem;">${I18n.t('practice')}</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">${I18n.t('practiceDesc')}</p>
        </div>

        <!-- Mode Toggle & Question Language -->
        <div style="display: flex; gap: 8px; align-items: center;">
          <div class="neo-inset" style="padding: 4px; display: flex; gap: 4px; border-radius: var(--radius-full);">
            <button id="btn-mode-untimed" class="btn btn-sm ${this.mode === 'untimed' ? 'btn-primary' : 'btn-neo'}" style="padding: 6px 12px; font-size: 0.75rem;">
              📖 ${I18n.t('untimedMode')}
            </button>
            <button id="btn-mode-timed" class="btn btn-sm ${this.mode === 'timed' ? 'btn-primary' : 'btn-neo'}" style="padding: 6px 12px; font-size: 0.75rem;">
              ⚡ ${I18n.t('timedMode')}
            </button>
          </div>

          <button id="btn-bilingual-toggle" class="btn btn-neo btn-sm" style="padding: 6px 12px; font-size: 0.75rem; font-weight: 700;">
            🌐 ${this.bilingualLang === 'hi' ? 'हिंदी (A/अ)' : 'English (A/अ)'}
          </button>
        </div>
      </div>

      <!-- Categories Filter Bar -->
      <div class="categories-bar" style="margin-bottom: var(--space-lg); overflow-x: auto; padding-bottom: 4px;">
        ${['All', 'General Studies', 'Quantitative Aptitude', 'Reasoning Ability', 'English Language', 'Current Affairs', 'Bookmarks'].map(cat => `
          <button class="filter-pill ${this.selectedCategory === cat ? 'active' : ''}" data-cat="${cat}">
            ${cat === 'Bookmarks' ? '⭐ ' : ''}${cat}
          </button>
        `).join('')}
      </div>

      <!-- Question Box -->
      <div id="practice-card-container">
        ${this.renderQuestionCardHTML()}
      </div>
    `;

    this.bindEvents();

    if (this.mode === 'timed' && !this.isAnswerSubmitted && this.currentQuestions.length > 0) {
      this.startDrillTimer();
    }
  }

  filterQuestionsSync() {
    const customQuestions = Storage.getCustomQuestions() || [];
    const all = [...QUESTION_BANK, ...customQuestions];

    if (this.selectedCategory === 'Bookmarks') {
      const bookmarks = Storage.getBookmarks();
      this.currentQuestions = all.filter(q => bookmarks.includes(q.id));
    } else if (this.selectedCategory === 'Current Affairs') {
      this.currentQuestions = DAILY_CAPSULE.flatMap(d => d.questions || []);
    } else if (this.selectedCategory !== 'All') {
      this.currentQuestions = all.filter(q => q.category === this.selectedCategory);
    } else {
      this.currentQuestions = [...all];
    }

    if (this.currentIndex >= this.currentQuestions.length) {
      this.currentIndex = 0;
    }
  }

  async filterQuestions() {
    this.filterQuestionsSync();
  }

  renderQuestionCardHTML() {
    if (this.currentQuestions.length === 0) {
      return `
        <div class="neo-card" style="text-align: center; padding: var(--space-2xl) var(--space-md);">
          <div style="font-size: 2.5rem; margin-bottom: var(--space-sm);">📚</div>
          <h3>No questions found</h3>
          <p style="color: var(--text-muted); margin-bottom: var(--space-md);">Try selecting another category or add custom questions from Admin panel.</p>
          <button id="btn-reset-filters" class="btn btn-primary btn-sm">Show All Questions</button>
        </div>
      `;
    }

    const q = this.currentQuestions[this.currentIndex];
    const bookmarks = Storage.getBookmarks();
    const isBookmarked = bookmarks.includes(q.id);

    const questionText = this.bilingualLang === 'hi' ? (q.question_hi || q.question_en) : q.question_en;
    const options = this.bilingualLang === 'hi' ? (q.options_hi || q.options_en) : q.options_en;
    const explanationText = this.bilingualLang === 'hi' ? (q.explanation_hi || q.explanation_en) : q.explanation_en;

    return `
      <div class="question-card">
        <!-- Question Meta Row -->
        <div class="question-meta">
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-primary);">
              Q ${this.currentIndex + 1} of ${this.currentQuestions.length}
            </span>
            <span style="background: var(--bg-surface-inset); padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 600;">
              ${q.category} • ${q.subject}
            </span>
            <span style="background: hsla(43,96%,52%,0.15); color: hsl(38,98%,46%); padding: 2px 8px; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700;">
              ${q.year || 'PYQ'}
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            ${this.mode === 'timed' ? `
              <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1rem; color: ${this.timerSeconds <= 5 ? 'var(--brand-crimson)' : 'var(--brand-primary)'};">
                ⏱️ <span id="drill-timer-val">${this.timerSeconds}</span>s
              </div>
            ` : ''}
            <button id="btn-toggle-bookmark" class="btn btn-icon btn-neo btn-sm" style="width: 34px; height: 34px;" title="Bookmark Question">
              ${isBookmarked ? '⭐' : '☆'}
            </button>
          </div>
        </div>

        <!-- Question Body -->
        <div class="question-text">
          ${questionText}
        </div>

        <!-- Options Container -->
        <div class="options-container">
          ${options.map((opt, idx) => {
            let extraClass = '';
            if (this.isAnswerSubmitted) {
              if (idx === q.correct) extraClass = 'correct';
              else if (this.selectedOption === idx) extraClass = 'wrong';
            } else if (this.selectedOption === idx) {
              extraClass = 'selected';
            }

            const letter = ['A', 'B', 'C', 'D'][idx];
            return `
              <button class="option-btn ${extraClass}" data-opt-idx="${idx}" ${this.isAnswerSubmitted ? 'disabled' : ''}>
                <div class="option-index">${letter}</div>
                <span>${opt}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Explanation Panel (Untimed or Submitted) -->
        ${this.isAnswerSubmitted ? `
          <div class="explanation-panel">
            <div class="explanation-title">💡 ${I18n.t('explanation')}</div>
            <p style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.5;">
              ${explanationText}
            </p>
          </div>
        ` : ''}

        <!-- Bottom Action Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-xl);">
          <button id="btn-prev-q" class="btn btn-neo btn-sm" ${this.currentIndex === 0 ? 'disabled' : ''}>
            ← Previous
          </button>
          
          <button id="btn-next-q" class="btn btn-primary btn-sm">
            ${this.currentIndex === this.currentQuestions.length - 1 ? 'Start Over 🔄' : I18n.t('nextQuestion') + ' →'}
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Filter Pills
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.playTick();
        this.selectedCategory = btn.getAttribute('data-cat');
        this.currentIndex = 0;
        this.selectedOption = null;
        this.isAnswerSubmitted = false;
        this.render();
      });
    });

    // Reset Filters
    const resetBtn = document.getElementById('btn-reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.selectedCategory = 'All';
        this.render();
      });
    }

    // Mode Toggle
    const untimedBtn = document.getElementById('btn-mode-untimed');
    const timedBtn = document.getElementById('btn-mode-timed');
    if (untimedBtn && timedBtn) {
      untimedBtn.addEventListener('click', () => {
        Sound.playTick();
        this.mode = 'untimed';
        this.stopDrillTimer();
        this.render();
      });
      timedBtn.addEventListener('click', () => {
        Sound.playTick();
        this.mode = 'timed';
        this.selectedOption = null;
        this.isAnswerSubmitted = false;
        this.timerSeconds = 15;
        this.render();
      });
    }

    // Bilingual Toggle
    const bilingualBtn = document.getElementById('btn-bilingual-toggle');
    if (bilingualBtn) {
      bilingualBtn.addEventListener('click', () => {
        Sound.playTick();
        this.bilingualLang = this.bilingualLang === 'hi' ? 'en' : 'hi';
        this.render();
      });
    }

    // Option Buttons Click
    document.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.isAnswerSubmitted) return;
        const optIdx = parseInt(btn.getAttribute('data-opt-idx'), 10);
        this.selectedOption = optIdx;
        this.isAnswerSubmitted = true;
        this.stopDrillTimer();

        const q = this.currentQuestions[this.currentIndex];
        if (optIdx === q.correct) {
          Sound.playCorrect();
          this.score++;
        } else {
          Sound.playWrong();
        }

        // Re-render card to display explanations
        const container = document.getElementById('practice-card-container');
        if (container) {
          container.innerHTML = this.renderQuestionCardHTML();
          this.bindCardEvents();
        }
      });
    });

    this.bindCardEvents();
  }

  bindCardEvents() {
    // Next Question Button
    const nextBtn = document.getElementById('btn-next-q');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        Sound.playTick();
        if (this.currentIndex < this.currentQuestions.length - 1) {
          this.currentIndex++;
        } else {
          this.currentIndex = 0;
        }
        this.selectedOption = null;
        this.isAnswerSubmitted = false;
        this.timerSeconds = 15;
        this.render();
      });
    }

    // Prev Question Button
    const prevBtn = document.getElementById('btn-prev-q');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        Sound.playTick();
        if (this.currentIndex > 0) {
          this.currentIndex--;
          this.selectedOption = null;
          this.isAnswerSubmitted = false;
          this.timerSeconds = 15;
          this.render();
        }
      });
    }

    // Bookmark Toggle
    const bookmarkBtn = document.getElementById('btn-toggle-bookmark');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', () => {
        Sound.playCoin();
        const q = this.currentQuestions[this.currentIndex];
        Storage.toggleBookmark(q.id);
        this.render();
      });
    }
  }

  startDrillTimer() {
    this.stopDrillTimer();
    this.timerSeconds = 15;

    this.timerInterval = setInterval(() => {
      this.timerSeconds--;
      const timerVal = document.getElementById('drill-timer-val');
      if (timerVal) {
        timerVal.textContent = this.timerSeconds;
        if (this.timerSeconds <= 5) {
          Sound.playUrgentTick();
        }
      }

      if (this.timerSeconds <= 0) {
        this.stopDrillTimer();
        this.isAnswerSubmitted = true;
        Sound.playWrong();
        const container = document.getElementById('practice-card-container');
        if (container) {
          container.innerHTML = this.renderQuestionCardHTML();
          this.bindCardEvents();
        }
      }
    }, 1000);
  }

  stopDrillTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

export const Practice = new PracticeView();
