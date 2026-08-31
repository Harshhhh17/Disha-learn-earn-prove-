/* ==========================================================================
   Disha Live Quiz Arena: Synchronized 15s Engine & Animated Leaderboard
   ========================================================================== */

import { QUESTION_BANK } from './data/questions.js';
import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { API } from './api.js';

class LiveQuizEngine {
  constructor() {
    this.state = 'WAITING'; // 'WAITING', 'COUNTDOWN', 'IN_QUIZ', 'REVEAL', 'FINISHED'
    const scheduled = Storage.getScheduledQuizzes();
    this.quizData = (scheduled && scheduled[0]) ? scheduled[0] : {
      id: 'live_maha_01',
      title: 'Maha-Dhamaka SSC CGL All India Live Quiz',
      category: 'SSC',
      prizePool: 10000,
      entryFee: 0,
      registeredCount: 1842
    };
    this.questions = [];
    this.currentQIndex = 0;
    this.totalQuestions = 5; // 5-question live tournament drill
    this.timerMs = 15000;
    this.timerInterval = null;
    this.startTime = 0;
    this.selectedOption = null;
    this.userScore = 0;
    this.streakCount = 0;
    this.correctAnswersCount = 0;
    this.totalResponseTimeMs = 0;
    this.answersLog = [];
    this.simulatedOpponents = [];
  }

  init() {
    // Generate initial live tournament data
    const scheduled = Storage.getScheduledQuizzes();
    this.quizData = scheduled[0] || {
      id: 'live_maha_01',
      title: 'Maha-Dhamaka SSC CGL All India Live Quiz',
      category: 'SSC',
      prizePool: 10000,
      entryFee: 0,
      registeredCount: 1842
    };
  }

  render() {
    const container = document.getElementById('view-live-quiz');
    if (!container) return;

    if (this.state === 'WAITING') {
      this.renderWaitingRoom(container);
    } else if (this.state === 'IN_QUIZ' || this.state === 'REVEAL') {
      this.renderArena(container);
    } else if (this.state === 'FINISHED') {
      this.renderFinished(container);
    }
  }

  renderWaitingRoom(container) {
    const user = Storage.getUser();
    container.innerHTML = `
      <div class="neo-card" style="max-width: 680px; margin: 0 auto; text-align: center; position: relative;">
        <div style="display:inline-flex; align-items:center; gap:6px; background:hsla(352,85%,58%,0.15); color:var(--brand-crimson); padding:4px 12px; border-radius:var(--radius-full); font-size:0.8rem; font-weight:700; text-transform:uppercase; margin-bottom: var(--space-md);">
          <span class="pulse-dot"></span> LIVE WAITING ROOM
        </div>

        <h2 style="font-size: 1.6rem; margin-bottom: 6px;">${this.quizData.title}</h2>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: var(--space-lg);">
          All-India Live Competitive Examination Tournament • Strict 15s Per Question
        </p>

        <!-- Prize Pool Breakdown Card -->
        <div class="glass-panel" style="padding: var(--space-md); margin-bottom: var(--space-xl); text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--brand-primary); text-transform: uppercase;">🏆 Guaranteed Prize Pool</span>
            <span style="font-family: var(--font-mono); font-size: 1.3rem; font-weight: 800; color: var(--brand-gold);">₹${this.quizData.prizePool.toLocaleString('en-IN')}</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center;">
            <div style="background: var(--bg-surface); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">🥇 1st Place (30%)</div>
              <div style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-gold); font-size: 1.05rem;">₹${(this.quizData.prizePool * 0.30).toLocaleString('en-IN')}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">🥈 2nd Place (6%)</div>
              <div style="font-family: var(--font-mono); font-weight: 800; color: var(--text-primary); font-size: 1.05rem;">₹${(this.quizData.prizePool * 0.06).toLocaleString('en-IN')}</div>
            </div>
            <div style="background: var(--bg-surface); padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">🥉 3rd Place (4%)</div>
              <div style="font-family: var(--font-mono); font-weight: 800; color: hsl(28,75%,60%); font-size: 1.05rem;">₹${(this.quizData.prizePool * 0.04).toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; text-align: center;">
            4th–10th: ₹300 each (21%) • 11th–25th: ₹60 each (9%) • 30% Platform & Rollover
          </div>
        </div>

        <!-- Rules Briefing -->
        <div style="text-align: left; background: var(--bg-surface-inset); padding: var(--space-md); border-radius: var(--radius-md); margin-bottom: var(--space-xl); font-size: 0.85rem; color: var(--text-secondary);">
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">📋 Tournament Rules:</div>
          <ul style="padding-left: 20px; line-height: 1.6;">
            <li>Each question has a <strong>hard 15-second timer</strong>.</li>
            <li><strong>Speed Bonus:</strong> Faster correct answers yield higher points (Base 1000 + up to 500 bonus).</li>
            <li><strong>Tie Breaker:</strong> Highest correct score → Lowest total response time → Fewest mistakes.</li>
            <li>Real-money winnings credited instantly to your Disha wallet post-leaderboard.</li>
          </ul>
        </div>

        <!-- App Exclusive Notice Banner (PRD v1.0 Feature 2) -->
        <div class="neo-inset" style="padding: 10px 14px; border-radius: var(--radius-md); margin-bottom: var(--space-md); font-size: 0.82rem; font-weight: 700; color: var(--brand-primary); border-left: 3px solid var(--brand-primary); text-align: left;">
          📱 <strong>App Exclusive:</strong> Live Event Tournaments with real cash prizes are hosted exclusively on the Disha mobile application to ensure anti-cheat timer synchronization.
        </div>

        <!-- Start / Enter Action -->
        <button id="btn-start-live-tournament" class="btn btn-primary btn-block" style="padding: 16px; font-size: 1.1rem;">
          🚀 Enter Live Tournament (App Exclusive)
        </button>

        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: var(--space-sm);">
          👤 Joined as <strong>${user?.name || 'Guest Aspirant'}</strong> • ${this.quizData.registeredCount} aspirants synchronized
        </div>
      </div>
    `;

    document.getElementById('btn-start-live-tournament')?.addEventListener('click', () => {
      // PRD v1.0 Feature 2: Gating Web users from Live Events
      Sound.playFanfare();
      window.DishaApp?.openAppOnlyModal();
    });
  }

  startCountdownToStart() {
    const container = document.getElementById('view-live-quiz');
    if (!container) return;

    let count = 3;
    container.innerHTML = `
      <div class="neo-card" style="max-width: 480px; margin: 60px auto; text-align: center; padding: 48px 24px;">
        <div style="font-size: 0.9rem; font-weight: 700; color: var(--brand-primary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">
          Synchronizing Live Broadcast
        </div>
        <div id="live-start-counter" style="font-family: var(--font-mono); font-size: 5.5rem; font-weight: 800; color: var(--brand-primary); line-height: 1; animation: pulseScale 0.8s infinite;">
          ${count}
        </div>
        <p style="color: var(--text-secondary); margin-top: 16px;">Get ready! Question 1 is loading...</p>
      </div>
    `;

    const interval = setInterval(() => {
      count--;
      const el = document.getElementById('live-start-counter');
      if (count > 0) {
        Sound.playTick();
        if (el) el.textContent = count;
      } else if (count === 0) {
        Sound.playUrgentTick();
        if (el) el.textContent = 'GO! ⚡';
      } else {
        clearInterval(interval);
        this.beginQuizSession();
      }
    }, 1000);
  }

  async beginQuizSession() {
    try {
      const res = await API.quiz.startTournament(this.quizData?.id || 'live_maha_01');
      this.attemptId = res.attemptId;
      this.questions = res.questions;
    } catch (err) {
      if (err.appDownloadRequired || err.code === 'APP_ONLY_FEATURE' || (err.message && err.message.includes('mobile app'))) {
        window.DishaApp?.openAppOnlyModal();
        return;
      }
      console.warn('[Offline / Fallback Mode] Starting local tournament session');
      const shuffled = [...QUESTION_BANK].sort(() => 0.5 - Math.random());
      this.questions = shuffled.slice(0, this.totalQuestions);
    }

    this.currentQIndex = 0;
    this.userScore = 0;
    this.streakCount = 0;
    this.correctAnswersCount = 0;
    this.totalResponseTimeMs = 0;
    this.answersLog = [];

    // Pre-generate simulated realistic opponents
    this.generateOpponents();

    this.state = 'IN_QUIZ';
    this.loadQuestion();
  }

  generateOpponents() {
    const names = [
      { name: 'Ananya Sharma', avatar: '👩‍🎓', baseSkill: 0.92 },
      { name: 'Vikramaditya Rao', avatar: '👨‍🎓', baseSkill: 0.88 },
      { name: 'Pooja Deshmukh', avatar: '👩‍🏫', baseSkill: 0.84 },
      { name: 'Harsh Vardhan', avatar: '👨‍💼', baseSkill: 0.80 },
      { name: 'Deepak Patel', avatar: '👨‍🔬', baseSkill: 0.76 },
      { name: 'Megha Mukherjee', avatar: '👩‍💻', baseSkill: 0.72 },
      { name: 'Siddharth Nair', avatar: '👨‍🎓', baseSkill: 0.68 },
      { name: 'Kavita Yadav', avatar: '👩‍🎓', baseSkill: 0.64 },
      { name: 'Manish Pandey', avatar: '👨‍🚀', baseSkill: 0.60 }
    ];

    this.simulatedOpponents = names.map(o => ({
      ...o,
      score: 0,
      correctCount: 0,
      totalTimeMs: 0
    }));
  }

  loadQuestion() {
    this.state = 'IN_QUIZ';
    this.selectedOption = null;
    this.timerMs = 15000;
    this.startTime = Date.now();
    this.render();
    this.startLiveTimer();
  }

  startLiveTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const circumference = 2 * Math.PI * 28; // radius = 28
    const circleProgress = document.getElementById('arena-circle-progress');
    const timerText = document.getElementById('arena-timer-text');

    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      this.timerMs = Math.max(0, 15000 - elapsed);
      const remainingSecs = Math.ceil(this.timerMs / 1000);

      // SVG Dash Offset
      const progressFraction = this.timerMs / 15000;
      const offset = circumference * (1 - progressFraction);

      if (circleProgress) {
        circleProgress.style.strokeDashoffset = offset;
        if (remainingSecs <= 4) {
          circleProgress.classList.add('critical');
          circleProgress.classList.remove('warning');
        } else if (remainingSecs <= 8) {
          circleProgress.classList.add('warning');
          circleProgress.classList.remove('critical');
        }
      }

      if (timerText) {
        timerText.textContent = remainingSecs;
        if (remainingSecs <= 4) {
          timerText.classList.add('critical');
        }
      }

      // Audio tick on each full second threshold
      if (this.timerMs % 1000 < 60) {
        if (remainingSecs <= 4 && remainingSecs > 0) {
          Sound.playUrgentTick();
        } else if (remainingSecs > 4) {
          Sound.playTick();
        }
      }

      if (this.timerMs <= 0) {
        clearInterval(this.timerInterval);
        this.handleAnswerSubmission(null); // Time out, no option chosen
      }
    }, 50);
  }

  async handleAnswerSubmission(optIdx) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const responseTime = Date.now() - this.startTime;
    this.totalResponseTimeMs += responseTime;

    this.selectedOption = optIdx;
    this.state = 'REVEAL';

    const q = this.questions[this.currentQIndex];

    try {
      // Server-Authoritative Evaluation & Scoring
      let isCorrect = false;
      let pointsEarned = 0;

      if (this.attemptId) {
        const serverResult = await API.quiz.submitAnswer(this.attemptId, q.id, optIdx, responseTime);
        isCorrect = serverResult.isCorrect;
        pointsEarned = serverResult.pointsAwarded;
        q.correct = serverResult.correctOptionIndex;
        q.explanation_en = serverResult.explanationEn;
        q.explanation_hi = serverResult.explanationHi;
        this.userScore = serverResult.currentScore;
      } else {
        isCorrect = (optIdx === q.correct);
        const remainingMs = Math.max(0, 15000 - responseTime);
        const speedBonus = Math.round((remainingMs / 15000) * 500);
        const multiplier = this.streakCount >= 4 ? 1.5 : (this.streakCount >= 3 ? 1.2 : 1.0);
        pointsEarned = isCorrect ? Math.round((1000 + speedBonus) * multiplier) : 0;
        this.userScore += pointsEarned;
      }

      if (isCorrect) {
        this.correctAnswersCount++;
        this.streakCount++;
        Sound.playCorrect();
        this.answersLog.push({ correct: true, points: pointsEarned, time: responseTime });
      } else {
        this.streakCount = 0;
        Sound.playWrong();
        this.answersLog.push({ correct: false, points: 0, time: responseTime });
      }
    } catch (e) {
      console.warn('Fallback local evaluation:', e);
    }

    // Simulate opponent answers for this question
    this.simulatedOpponents.forEach(opp => {
      const willBeCorrect = Math.random() < opp.baseSkill;
      const oppTime = 3000 + Math.random() * 9000;
      opp.totalTimeMs += oppTime;
      if (willBeCorrect) {
        opp.correctCount++;
        const oppBonus = Math.round(((15000 - oppTime) / 15000) * 500);
        opp.score += (1000 + oppBonus);
      }
    });

    this.render();

    // 2.5s rapid learning reveal before next question
    setTimeout(() => {
      if (this.currentQIndex < this.questions.length - 1) {
        this.currentQIndex++;
        this.loadQuestion();
      } else {
        this.finishTournament();
      }
    }, 2800);
  }

  async finishTournament() {
    this.state = 'FINISHED';

    let userRank = 1;
    let prizeWon = 0;

    if (this.attemptId) {
      try {
        const serverFinish = await API.quiz.finishTournament(this.attemptId);
        userRank = serverFinish.userRank;
        prizeWon = parseFloat(serverFinish.prizeWonRupees || 0);
      } catch (err) {
        console.warn('Could not finish via API, using local fallback:', err);
      }
    }

    const user = Storage.getUser() || Storage.getDemoUser();
    const allAspirants = [
      {
        name: user.name + ' (You)',
        avatar: user.avatar || '👨‍🎓',
        score: this.userScore,
        correctCount: this.correctAnswersCount,
        totalTimeMs: this.totalResponseTimeMs,
        isUser: true
      },
      ...this.simulatedOpponents
    ];

    allAspirants.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
      return b.correctCount - a.correctCount;
    });

    if (!this.attemptId) {
      userRank = allAspirants.findIndex(a => a.isUser) + 1;
      if (userRank === 1) prizeWon = Math.round(this.quizData.prizePool * 0.30);
      else if (userRank === 2) prizeWon = Math.round(this.quizData.prizePool * 0.06);
      else if (userRank === 3) prizeWon = Math.round(this.quizData.prizePool * 0.04);
      else if (userRank <= 10) prizeWon = Math.round(this.quizData.prizePool * 0.03);

      if (prizeWon > 0) {
        const wallet = Storage.getWallet();
        wallet.availableBalance += prizeWon;
        wallet.totalWon += prizeWon;
        Storage.setWallet(wallet);

        Storage.addTransaction({
          id: 'TXN-WIN-' + Math.floor(100000 + Math.random() * 900000),
          type: 'CREDIT',
          title: `Rank #${userRank} Prize — ${this.quizData.title}`,
          amount: prizeWon,
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', Just now',
          status: 'COMPLETED',
          method: 'Instant Tournament Settlement'
        });
      }
    }

    // Update user stats
    if (user.stats) {
      user.stats.quizzesPlayed++;
      if (userRank <= 3) user.stats.quizzesWon++;
      user.stats.totalEarnings += prizeWon;
      Storage.setUser(user);
    }

    this.leaderboardData = { allAspirants, userRank, prizeWon };
    this.render();

    // Celebration
    Sound.playFanfare();
    Confetti.fire(150);
  }

  renderArena(container) {
    const q = this.questions[this.currentQIndex];
    const circumference = 2 * Math.PI * 28;
    const progressFrac = this.timerMs / 15000;
    const offset = circumference * (1 - progressFrac);
    const secs = Math.ceil(this.timerMs / 1000);

    const questionText = I18n.currentLang === 'hi' ? (q.question_hi || q.question_en) : q.question_en;
    const options = I18n.currentLang === 'hi' ? (q.options_hi || q.options_en) : q.options_en;
    const explanationText = I18n.currentLang === 'hi' ? (q.explanation_hi || q.explanation_en) : q.explanation_en;

    container.innerHTML = `
      <div class="quiz-arena">
        <!-- Arena Topbar -->
        <div class="arena-topbar">
          <div>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--brand-primary); text-transform: uppercase;">
              Question ${this.currentQIndex + 1} of ${this.totalQuestions}
            </span>
            <div style="font-family: var(--font-mono); font-size: 1.1rem; font-weight: 800; color: var(--text-primary);">
              Score: <span style="color: var(--brand-primary);">${this.userScore.toLocaleString('en-IN')}</span> pts
            </div>
          </div>

          <!-- Streak Multiplier -->
          ${this.streakCount >= 2 ? `
            <div class="streak-badge">
              🔥 ${this.streakCount}x STREAK
            </div>
          ` : '<div></div>'}

          <!-- Circular 15s Timer -->
          <div class="circular-timer-wrapper">
            <svg class="circular-timer-svg" viewBox="0 0 72 72">
              <circle class="timer-circle-bg" cx="36" cy="36" r="28" />
              <circle 
                id="arena-circle-progress"
                class="timer-circle-progress ${secs <= 4 ? 'critical' : (secs <= 8 ? 'warning' : '')}"
                cx="36" cy="36" r="28"
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};"
              />
            </svg>
            <div id="arena-timer-text" class="timer-center-text ${secs <= 4 ? 'critical' : ''}">
              ${secs}
            </div>
          </div>
        </div>

        <!-- Question Card -->
        <div class="question-card" style="margin-bottom: var(--space-md);">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 8px;">
            ${q.category} • ${q.subject} • ${q.year || 'PYQ'}
          </div>

          <div class="question-text" style="font-size: 1.2rem; margin-bottom: var(--space-lg);">
            ${questionText}
          </div>

          <!-- Options Grid -->
          <div class="options-container">
            ${options.map((opt, idx) => {
              let extraClass = '';
              if (this.state === 'REVEAL') {
                if (idx === q.correct) extraClass = 'correct';
                else if (this.selectedOption === idx) extraClass = 'wrong';
              } else if (this.selectedOption === idx) {
                extraClass = 'selected';
              }

              const letter = ['A', 'B', 'C', 'D'][idx];
              return `
                <button 
                  class="option-btn ${extraClass}" 
                  data-live-opt="${idx}" 
                  ${this.state === 'REVEAL' ? 'disabled' : ''}
                >
                  <div class="option-index">${letter}</div>
                  <span style="font-weight: 600;">${opt}</span>
                </button>
              `;
            }).join('')}
          </div>

          <!-- Rapid 2.5s Reveal Explanation -->
          ${this.state === 'REVEAL' ? `
            <div class="explanation-panel" style="animation: springUp 300ms ease;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="explanation-title">💡 ${this.selectedOption === q.correct ? '✓ Correct! Instant speed bonus applied' : '✗ Incorrect Answer'}</span>
                <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Next Q in 2s...</span>
              </div>
              <p style="font-size: 0.88rem; color: var(--text-primary);">
                ${explanationText}
              </p>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    if (this.state === 'IN_QUIZ') {
      document.querySelectorAll('[data-live-opt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const optIdx = parseInt(btn.getAttribute('data-live-opt'), 10);
          this.handleAnswerSubmission(optIdx);
        });
      });
    }
  }

  renderFinished(container) {
    const { allAspirants, userRank, prizeWon } = this.leaderboardData;
    const top3 = allAspirants.slice(0, 3);
    const rest = allAspirants.slice(3, 10);

    container.innerHTML = `
      <div class="neo-card" style="max-width: 680px; margin: 0 auto; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 4px;">🏆</div>
        <h2 style="font-size: 1.6rem; color: var(--text-primary);">Live Tournament Concluded!</h2>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-lg);">
          All-India Leaderboard Certified & Verified
        </p>

        <!-- User Standing Hero Card -->
        <div class="glass-panel-elevated" style="padding: var(--space-lg); margin-bottom: var(--space-xl); border: 2px solid ${prizeWon > 0 ? 'var(--brand-gold)' : 'var(--brand-primary)'};">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="text-align: left;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--brand-primary); text-transform: uppercase;">Your Performance</span>
              <h3 style="font-size: 1.4rem; color: var(--text-primary); margin-top: 2px;">Rank #${userRank} out of ${this.quizData.registeredCount}</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary);">
                Score: <strong>${this.userScore.toLocaleString('en-IN')} pts</strong> • Correct: <strong>${this.correctAnswersCount}/${this.totalQuestions}</strong>
              </p>
            </div>

            ${prizeWon > 0 ? `
              <div style="text-align: right; background: hsla(43,96%,52%,0.15); padding: 10px 18px; border-radius: var(--radius-lg); border: 1px solid var(--brand-gold);">
                <span style="font-size: 0.75rem; font-weight: 700; color: hsl(38,98%,46%); text-transform: uppercase;">💰 Prize Awarded</span>
                <div style="font-family: var(--font-mono); font-size: 1.5rem; font-weight: 800; color: var(--brand-gold);">+₹${prizeWon.toLocaleString('en-IN')}</div>
                <span style="font-size: 0.7rem; color: var(--brand-emerald); font-weight: 700;">✓ Credited to Wallet</span>
              </div>
            ` : `
              <div style="text-align: right;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">Top 10 win cash prizes</span>
              </div>
            `}
          </div>
        </div>

        <!-- 1st, 2nd, 3rd Podium -->
        <div class="podium-container">
          <!-- 2nd Place -->
          ${top3[1] ? `
            <div class="podium-column podium-rank-2">
              <div class="podium-avatar">${top3[1].avatar}</div>
              <div style="font-size: 0.8rem; font-weight: 700; margin-bottom: 4px;">${top3[1].name}</div>
              <div class="podium-pillar">
                <div style="font-size: 1.1rem; font-weight: 800;">#2</div>
                <div class="podium-prize">₹${Math.round(this.quizData.prizePool * 0.06).toLocaleString('en-IN')}</div>
                <div class="podium-score">${top3[1].score} pts</div>
              </div>
            </div>
          ` : ''}

          <!-- 1st Place -->
          ${top3[0] ? `
            <div class="podium-column podium-rank-1">
              <div style="font-size: 1.4rem; margin-bottom: -6px; z-index: 2;">👑</div>
              <div class="podium-avatar">${top3[0].avatar}</div>
              <div style="font-size: 0.85rem; font-weight: 800; margin-bottom: 4px; color: var(--brand-gold);">${top3[0].name}</div>
              <div class="podium-pillar">
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--brand-gold);">#1</div>
                <div class="podium-prize">₹${Math.round(this.quizData.prizePool * 0.30).toLocaleString('en-IN')}</div>
                <div class="podium-score">${top3[0].score} pts</div>
              </div>
            </div>
          ` : ''}

          <!-- 3rd Place -->
          ${top3[2] ? `
            <div class="podium-column podium-rank-3">
              <div class="podium-avatar">${top3[2].avatar}</div>
              <div style="font-size: 0.8rem; font-weight: 700; margin-bottom: 4px;">${top3[2].name}</div>
              <div class="podium-pillar">
                <div style="font-size: 1rem; font-weight: 800;">#3</div>
                <div class="podium-prize">₹${Math.round(this.quizData.prizePool * 0.04).toLocaleString('en-IN')}</div>
                <div class="podium-score">${top3[2].score} pts</div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Top 4 - 10 List -->
        <h3 style="font-size: 1.1rem; text-align: left; margin: var(--space-xl) 0 var(--space-sm);">
          Ranks 4 – 10 (Prize: ₹300 each)
        </h3>

        <div class="leaderboard-list">
          ${rest.map((aspirant, idx) => {
            const rank = idx + 4;
            return `
              <div class="leaderboard-row ${aspirant.isUser ? 'my-rank' : ''}">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span class="rank-idx">#${rank}</span>
                  <span style="font-size: 1.2rem;">${aspirant.avatar}</span>
                  <span style="font-weight: 600; font-size: 0.9rem;">${aspirant.name}</span>
                </div>
                <div style="text-align: right;">
                  <span style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-primary);">${aspirant.score} pts</span>
                  <div style="font-size: 0.72rem; color: var(--brand-gold); font-weight: 700;">+₹300 Won</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Actions -->
        <div style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
          <button id="btn-back-home" class="btn btn-neo btn-block">
            🏠 Back to Home
          </button>
          <button id="btn-view-wallet" class="btn btn-primary btn-block">
            💳 Check Wallet Balance
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-back-home')?.addEventListener('click', () => {
      this.state = 'WAITING';
      window.DishaApp.navigateTo('home');
    });

    document.getElementById('btn-view-wallet')?.addEventListener('click', () => {
      this.state = 'WAITING';
      window.DishaApp.navigateTo('wallet');
    });
  }
}

export const LiveQuiz = new LiveQuizEngine();
