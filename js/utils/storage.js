/* ==========================================================================
   Disha Storage & State Management with Privacy & Hash Protection
   ========================================================================== */

import { CryptoUtils } from './crypto.js';

const STORAGE_KEYS = {
  USER: 'disha_user_session',
  THEME: 'disha_theme_pref',
  LANG: 'disha_lang_pref',
  WALLET: 'disha_wallet_data',
  TRANSACTIONS: 'disha_tx_ledger',
  BOOKMARKS: 'disha_bookmarks',
  QUIZ_HISTORY: 'disha_quiz_history',
  CUSTOM_QUESTIONS: 'disha_custom_questions',
  SCHEDULED_QUIZZES: 'disha_scheduled_quizzes',
  ROLE: 'disha_current_role', // 'student' or 'admin'
  ADMIN_PROFILE: 'disha_admin_profile'
};

const DEFAULT_USER = {
  id: 'usr_' + Math.random().toString(36).substring(2, 9),
  name: 'Rohan Sharma',
  phone: '+91 98765 43210',
  email: 'rohan.sharma@example.com',
  avatar: '👨‍🎓',
  targetExams: ['SSC', 'Railways'],
  language: 'hi',
  joinDate: 'August 2026',
  isKycVerified: false,
  panNumber: '',
  aadhaarNumber: '',
  upiId: 'rohan@okhdfcbank',
  bankAccount: {
    accountNumber: '••••••••4812',
    ifsc: 'HDFC0001234',
    holderName: 'Rohan Sharma'
  },
  stats: {
    quizzesPlayed: 14,
    quizzesWon: 5,
    totalEarnings: 3450,
    accuracy: 84.5,
    winStreak: 3
  }
};

const DEFAULT_ADMIN = {
  name: 'Dr. Vikramaditya Sen',
  email: 'admin@disha.gov.in',
  role: 'Chief Exam Controller & Moderator',
  department: 'National Examination Moderation Board',
  phone: '+91 94150 99881',
  avatar: '👨‍💼'
};

const DEFAULT_WALLET = {
  availableBalance: 3450.00,
  lockedBalance: 400.00,
  totalWithdrawn: 1200.00,
  totalWon: 5050.00
};

const DEFAULT_SCHEDULED_QUIZZES = [
  {
    id: 'quiz_live_1',
    title: 'Maha-Dhamaka SSC CGL All India Live Quiz',
    category: 'SSC',
    startTime: 'Today, 8:50 PM',
    lockTime: 'Today, 8:40 PM',
    prizePool: 10000,
    registeredCount: 1842,
    status: 'ACTIVE'
  },
  {
    id: 'quiz_live_2',
    title: 'RRB NTPC Grand Science Maha-Quiz',
    category: 'Railways',
    startTime: 'Tomorrow, 8:00 PM',
    lockTime: 'Tomorrow, 7:50 PM',
    prizePool: 15000,
    registeredCount: 940,
    status: 'SCHEDULED'
  }
];

const DEFAULT_TRANSACTIONS = [
  {
    id: 'TXN-882194',
    type: 'CREDIT',
    title: '1st Place Prize — SSC CGL Special',
    amount: 3000.00,
    date: '17 Aug 2026, 09:32 PM',
    status: 'COMPLETED',
    method: 'Tournament Pool',
    netReceived: 3000.00,
    tdsDeducted: 0.00
  },
  {
    id: 'TXN-761209',
    type: 'DEBIT',
    title: 'Bank Withdrawal to HDFC Bank',
    amount: 1200.00,
    date: '15 Aug 2026, 04:15 PM',
    status: 'COMPLETED',
    method: 'IMPS Direct Transfer',
    reference: 'HDFC-IMPS-9923812'
  },
  {
    id: 'TXN-654921',
    type: 'CREDIT',
    title: '2nd Place Prize — Railways GS Drill',
    amount: 600.00,
    date: '14 Aug 2026, 08:30 PM',
    status: 'COMPLETED',
    method: 'Tournament Pool'
  },
  {
    id: 'TXN-541298',
    type: 'CREDIT',
    title: '3rd Place Prize — UPSSSC Special',
    amount: 400.00,
    date: '18 Aug 2026, 11:15 AM',
    status: 'PROCESSING',
    method: 'Under 24h Payout Verification'
  }
];

export const Storage = {
  getUser() {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  getSanitizedUser() {
    const user = this.getUser();
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      maskedPhone: CryptoUtils.maskPhone(user.phone),
      maskedEmail: CryptoUtils.maskEmail(user.email),
      avatar: user.avatar,
      targetExams: user.targetExams,
      isKycVerified: user.isKycVerified,
      stats: user.stats
    };
  },

  getDemoUser() {
    return { ...DEFAULT_USER, id: 'usr_demo_' + Math.random().toString(36).substring(2, 7) };
  },

  setUser(user) {
    if (!user) return;
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  clearUser() {
    localStorage.removeItem(STORAGE_KEYS.USER);
  },

  /**
   * Complete Data Erasure / Account Deletion Flow (DPDP & GDPR compliant)
   * Purges all personal identifiers, wallet balances, and local caches.
   */
  deleteAllUserData() {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.WALLET);
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.BOOKMARKS);
      localStorage.removeItem(STORAGE_KEYS.QUIZ_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.ROLE);
      sessionStorage.clear();
      return true;
    } catch (err) {
      console.error('[REDACTED] Error clearing personal storage data:', err.message);
      return false;
    }
  },

  getAdminProfile() {
    const data = localStorage.getItem(STORAGE_KEYS.ADMIN_PROFILE);
    if (!data) return { ...DEFAULT_ADMIN };
    try {
      return JSON.parse(data);
    } catch {
      return { ...DEFAULT_ADMIN };
    }
  },

  setAdminProfile(profile) {
    if (!profile) return;
    const safeProfile = { ...profile };
    delete safeProfile.passcode;
    delete safeProfile.passcodeHash;
    localStorage.setItem(STORAGE_KEYS.ADMIN_PROFILE, JSON.stringify(safeProfile));
  },

  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  },

  setTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  getLanguage() {
    return localStorage.getItem(STORAGE_KEYS.LANG) || 'hi';
  },

  setLanguage(lang) {
    localStorage.setItem(STORAGE_KEYS.LANG, lang);
  },

  getWallet() {
    const data = localStorage.getItem(STORAGE_KEYS.WALLET);
    return data ? JSON.parse(data) : DEFAULT_WALLET;
  },

  setWallet(wallet) {
    localStorage.setItem(STORAGE_KEYS.WALLET, JSON.stringify(wallet));
  },

  addEarnings(amount) {
    const num = parseFloat(amount);
    if (isNaN(num) || !isFinite(num) || num <= 0 || num > 50000) return;
    const cleanAmount = Math.round(num * 100) / 100;

    const wallet = this.getWallet();
    wallet.availableBalance = Math.round((wallet.availableBalance + cleanAmount) * 100) / 100;
    wallet.totalWon = Math.round((wallet.totalWon + cleanAmount) * 100) / 100;
    this.setWallet(wallet);

    const user = this.getUser();
    if (user && user.stats) {
      user.stats.totalEarnings = Math.round((user.stats.totalEarnings + cleanAmount) * 100) / 100;
      user.stats.quizzesWon += 1;
      this.setUser(user);
    }

    const tx = {
      id: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
      type: 'CREDIT',
      title: 'Quiz Reward Credited',
      amount: cleanAmount,
      date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      status: 'COMPLETED',
      method: 'Instant Prize Pool'
    };
    this.addTransaction(tx);
  },

  getTransactions() {
    const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : DEFAULT_TRANSACTIONS;
  },

  addTransaction(tx) {
    const list = this.getTransactions();
    list.unshift(tx);
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(list));
  },

  getBookmarks() {
    const data = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
    return data ? JSON.parse(data) : [];
  },

  toggleBookmark(questionId) {
    let bookmarks = this.getBookmarks();
    if (bookmarks.includes(questionId)) {
      bookmarks = bookmarks.filter(id => id !== questionId);
    } else {
      bookmarks.push(questionId);
    }
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
    return bookmarks.includes(questionId);
  },

  isBookmarked(questionId) {
    return this.getBookmarks().includes(questionId);
  },

  getCustomQuestions() {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_QUESTIONS);
    return data ? JSON.parse(data) : [];
  },

  addCustomQuestion(q) {
    const list = this.getCustomQuestions();
    list.unshift(q);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(list));
  },

  deleteCustomQuestion(id) {
    let list = this.getCustomQuestions();
    list = list.filter(q => q.id !== id);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(list));
  },

  getScheduledQuizzes() {
    const data = localStorage.getItem(STORAGE_KEYS.SCHEDULED_QUIZZES);
    return data ? JSON.parse(data) : DEFAULT_SCHEDULED_QUIZZES;
  },

  addScheduledQuiz(quiz) {
    const list = this.getScheduledQuizzes();
    list.unshift(quiz);
    localStorage.setItem(STORAGE_KEYS.SCHEDULED_QUIZZES, JSON.stringify(list));
  },

  getRole() {
    return localStorage.getItem(STORAGE_KEYS.ROLE) || 'student';
  },

  setRole(role) {
    localStorage.setItem(STORAGE_KEYS.ROLE, role);
  }
};
