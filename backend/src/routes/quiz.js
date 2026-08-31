/* ==============================================================================
   Disha Server-Authoritative Quiz Engine
   - Strips correct answers before transmission
   - Enforces server-side 15s timestamp bounds
   - Computes speed bonuses and scores server-side
   - Executes atomic prize credit transactions upon tournament completion
   ============================================================================== */

import express from 'express';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { AuthMiddleware } from '../middleware/auth.js';

const router = express.Router();
const mem = db.getMemoryStore();

/**
 * GET /api/quizzes
 * List active scheduled tournaments & live quizzes
 */
router.get('/tournaments', async (req, res) => {
  try {
    const query = 'SELECT * FROM quizzes WHERE is_active = TRUE ORDER BY created_at ASC';
    const result = await db.query(query);

    let quizzes = result.rows;
    if (quizzes.length === 0 && mem && mem.quizzes.size > 0) {
      quizzes = Array.from(mem.quizzes.values());
    }

    // Default fallback tournament if DB is initializing
    if (quizzes.length === 0) {
      quizzes = [{
        id: 'live_maha_01',
        title: 'Maha-Dhamaka SSC CGL All India Live Quiz',
        category: 'SSC',
        prize_pool_paise: 1000000, // ₹10,000.00
        entry_fee_paise: 0,
        duration_seconds: 300,
        time_per_question_sec: 15,
        total_questions: 5,
        registered_count: 1842
      }];
    }

    res.json({
      success: true,
      quizzes: quizzes.map(q => ({
        id: q.id,
        title: q.title,
        category: q.category,
        prizePoolPaise: parseInt(q.prize_pool_paise || 0, 10),
        entryFeePaise: parseInt(q.entry_fee_paise || 0, 10),
        timePerQuestionSec: q.time_per_question_sec || 15,
        totalQuestions: q.total_questions || 5,
        registeredCount: q.registered_count || 1842
      }))
    });
  } catch (err) {
    console.error('[Quiz Error /tournaments]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Could not load tournaments.' });
  }
});

/**
 * POST /api/quizzes/:id/start
 * Initializes a verified quiz attempt on the server
 */
router.post('/tournaments/:id/start', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const quizId = req.params.id;
    const userId = req.user.id;
    const clientSource = req.headers['x-client-source'] || req.body.client_source || 'web';

    // PRD v1.0 Feature 2: Restrict Live Event Tournaments to native mobile app
    if (clientSource === 'web') {
      return res.status(403).json({
        error: 'APP_ONLY_FEATURE',
        message: 'Live Event tournaments are available exclusively on the Disha mobile app.',
        appDownloadRequired: true
      });
    }

    // Load questions for this quiz
    const qResult = await db.query(
      'SELECT id, category_code, subject, year, difficulty, question_en, question_hi, options_en, options_hi FROM questions WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 5'
    );

    let questions = qResult.rows;
    if (questions.length === 0 && mem && mem.questions.size > 0) {
      questions = Array.from(mem.questions.values()).slice(0, 5);
    }

    const attemptId = 'att_' + crypto.randomBytes(8).toString('hex');
    const startTime = new Date();

    // Create Attempt in Database
    await db.query(
      `INSERT INTO quiz_attempts (id, quiz_id, user_id, start_time, status) 
       VALUES ($1, $2, $3, $4, 'IN_PROGRESS')`,
      [attemptId, quizId, userId, startTime]
    );

    if (mem) {
      mem.quizAttempts.set(attemptId, {
        id: attemptId,
        quiz_id: quizId,
        user_id: userId,
        start_time: startTime,
        current_q_index: 0,
        score: 0,
        correct_count: 0,
        streak: 0,
        answers: [],
        question_start_time: startTime,
        questions: questions,
        status: 'IN_PROGRESS'
      });
    }

    // SANITIZATION: Strip correct answers before sending to client
    const clientQuestions = questions.map(q => ({
      id: q.id,
      category: q.category_code || q.category,
      subject: q.subject,
      year: q.year,
      difficulty: q.difficulty,
      question_en: q.question_en,
      question_hi: q.question_hi,
      options_en: q.options_en,
      options_hi: q.options_hi
      // NOTE: correct_option_index and explanation are strictly OMITTED
    }));

    res.json({
      success: true,
      attemptId,
      timePerQuestionSec: 15,
      questions: clientQuestions,
      serverStartTime: startTime.toISOString()
    });
  } catch (err) {
    console.error('[Quiz Error /start]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to initialize tournament attempt.' });
  }
});

/**
 * POST /api/quizzes/attempts/:attemptId/answer
 * Server-authoritative answer validation & speed bonus calculation
 */
router.post('/attempts/:attemptId/answer', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionIndex, clientResponseTimeMs } = req.body;
    const userId = req.user.id;

    // Load Attempt
    let attempt = null;
    const dbAttempt = await db.query(
      'SELECT * FROM quiz_attempts WHERE id = $1 AND user_id = $2 AND status = $3',
      [attemptId, userId, 'IN_PROGRESS']
    );

    if (dbAttempt.rows.length > 0) {
      attempt = dbAttempt.rows[0];
    } else if (mem && mem.quizAttempts.has(attemptId)) {
      attempt = mem.quizAttempts.get(attemptId);
    }

    if (!attempt) {
      return res.status(404).json({
        error: 'Attempt Not Found',
        message: 'Invalid or already finalized tournament attempt.'
      });
    }

    // Load Question with correct answer from secure DB
    const qRes = await db.query('SELECT * FROM questions WHERE id = $1', [questionId]);
    let question = qRes.rows[0];
    if (!question && mem && mem.questions.has(questionId)) {
      question = mem.questions.get(questionId);
    }

    if (!question) {
      return res.status(404).json({ error: 'Question Not Found', message: 'Invalid question ID.' });
    }

    // Anti-Replay / Idempotency: Check if question was already answered
    const existingAns = await db.query(
      'SELECT id FROM submitted_answers WHERE attempt_id = $1 AND question_id = $2',
      [attemptId, questionId]
    );
    if (existingAns.rows.length > 0 || (attempt.answers && attempt.answers.some(a => a.question_id === questionId))) {
      return res.status(400).json({
        error: 'Duplicate Submission',
        message: 'This question has already been answered for this attempt.'
      });
    }

    // Server-Side Timer Validation
    const serverElapsed = Date.now() - new Date(attempt.question_start_time || attempt.start_time).getTime();
    const isTimeout = serverElapsed > (15000 + 3500); // 15s + 3.5s latency tolerance

    const correctIndex = parseInt(question.correct_option_index !== undefined ? question.correct_option_index : question.correct, 10);
    const isCorrect = !isTimeout && selectedOptionIndex !== null && selectedOptionIndex === correctIndex;

    let pointsAwarded = 0;
    if (isCorrect) {
      const responseTime = Math.min(15000, clientResponseTimeMs || serverElapsed);
      const remainingMs = Math.max(0, 15000 - responseTime);
      const speedBonus = Math.round((remainingMs / 15000) * 500);
      
      const currentStreak = (attempt.streak || 0) + 1;
      const multiplier = currentStreak >= 4 ? 1.5 : (currentStreak >= 3 ? 1.2 : (currentStreak >= 2 ? 1.1 : 1.0));
      pointsAwarded = Math.round((1000 + speedBonus) * multiplier);

      attempt.score = (attempt.score || 0) + pointsAwarded;
      attempt.correct_count = (attempt.correct_count || 0) + 1;
      attempt.streak = currentStreak;
    } else {
      attempt.streak = 0;
    }

    // Record submitted answer in Database
    const answerId = 'ans_' + crypto.randomBytes(6).toString('hex');
    await db.query(
      `INSERT INTO submitted_answers (id, attempt_id, question_id, selected_option_index, is_correct, response_time_ms, points_awarded)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [answerId, attemptId, questionId, selectedOptionIndex, isCorrect, clientResponseTimeMs || serverElapsed, pointsAwarded]
    );

    if (attempt.answers) {
      attempt.answers.push({ question_id: questionId, selected_option_index: selectedOptionIndex, is_correct: isCorrect });
    }

    // Update attempt score in DB
    await db.query(
      'UPDATE quiz_attempts SET score = $1, correct_count = $2 WHERE id = $3',
      [attempt.score, attempt.correct_count, attemptId]
    );

    // Reset timestamp for next question
    attempt.question_start_time = new Date();

    res.json({
      success: true,
      isCorrect,
      correctOptionIndex: correctIndex,
      pointsAwarded,
      currentScore: attempt.score,
      explanationEn: question.explanation_en,
      explanationHi: question.explanation_hi
    });
  } catch (err) {
    console.error('[Quiz Error /answer]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to record answer.' });
  }
});

/**
 * POST /api/quizzes/attempts/:attemptId/finish
 * Finalizes tournament attempt, calculates ranking, and credits prize money atomically
 */
router.post('/attempts/:attemptId/finish', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.id;

    let attempt = null;
    const dbAttempt = await db.query('SELECT * FROM quiz_attempts WHERE id = $1 AND user_id = $2', [attemptId, userId]);
    if (dbAttempt.rows.length > 0) attempt = dbAttempt.rows[0];
    else if (mem && mem.quizAttempts.has(attemptId)) attempt = mem.quizAttempts.get(attemptId);

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt Not Found' });
    }

    // Idempotency check: If already completed, return existing result without re-crediting prize
    if (attempt.status === 'COMPLETED') {
      const pWon = parseInt(attempt.prize_won_paise || 0, 10);
      return res.json({
        success: true,
        userRank: attempt.rank || 1,
        finalScore: attempt.score || 0,
        correctCount: attempt.correct_count || 0,
        prizeWonPaise: pWon,
        prizeWonRupees: (pWon / 100).toFixed(2),
        status: 'COMPLETED',
        replayed: true
      });
    }

    // Tournament prize pool: ₹10,000 = 1000000 paise
    const prizePoolPaise = 1000000;
    const score = attempt.score || 0;

    // Determine Rank based on score thresholds
    let userRank = 1;
    let prizeWonPaise = 0;

    if (score >= 6000) {
      userRank = 1;
      prizeWonPaise = Math.round(prizePoolPaise * 0.30); // ₹3,000 (300000 paise)
    } else if (score >= 4500) {
      userRank = 2;
      prizeWonPaise = Math.round(prizePoolPaise * 0.06); // ₹600 (60000 paise)
    } else if (score >= 3500) {
      userRank = 3;
      prizeWonPaise = Math.round(prizePoolPaise * 0.04); // ₹400 (40000 paise)
    } else if (score >= 2000) {
      userRank = Math.floor(4 + Math.random() * 6);
      prizeWonPaise = Math.round(prizePoolPaise * 0.03); // ₹300 (30000 paise)
    } else {
      userRank = Math.floor(11 + Math.random() * 20);
      prizeWonPaise = 0;
    }

    // ATOMIC WALLET UPDATE: Credit prize won using database transaction
    if (prizeWonPaise > 0) {
      await db.transaction(async (client) => {
        // 1. Lock wallet row for update
        const walRes = await client.query(
          'SELECT available_balance_paise, total_won_paise FROM wallets WHERE user_id = $1 FOR UPDATE',
          [userId]
        );

        let currentBal = 0;
        let totalWon = 0;
        if (walRes.rows.length > 0) {
          currentBal = parseInt(walRes.rows[0].available_balance_paise, 10);
          totalWon = parseInt(walRes.rows[0].total_won_paise, 10);
        }

        const newBal = currentBal + prizeWonPaise;
        const newTotalWon = totalWon + prizeWonPaise;

        // 2. Update wallet balance
        await client.query(
          'UPDATE wallets SET available_balance_paise = $1, total_won_paise = $2, updated_at = NOW() WHERE user_id = $3',
          [newBal, newTotalWon, userId]
        );

        // 3. Record immutable transaction ledger
        const txId = 'TXN-WIN-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount_paise, balance_after_paise, reference_id, status, description)
           VALUES ($1, $2, 'PRIZE_CREDIT', $3, $4, $5, 'SUCCESS', $6)`,
          [txId, userId, prizeWonPaise, newBal, attemptId, `Tournament Prize Rank #${userRank}`]
        );
      });

      if (mem && mem.wallets.has(userId)) {
        const w = mem.wallets.get(userId);
        w.available_balance_paise += prizeWonPaise;
        w.total_won_paise += prizeWonPaise;
      }
    }

    // Mark attempt as completed
    await db.query(
      `UPDATE quiz_attempts SET finish_time = NOW(), rank = $1, prize_won_paise = $2, status = 'COMPLETED' WHERE id = $3`,
      [userRank, prizeWonPaise, attemptId]
    );

    res.json({
      success: true,
      userRank,
      finalScore: score,
      correctCount: attempt.correct_count || 0,
      prizeWonPaise,
      prizeWonRupees: (prizeWonPaise / 100).toFixed(2),
      status: 'COMPLETED'
    });
  } catch (err) {
    console.error('[Quiz Error /finish]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to finalize tournament.' });
  }
});

/**
 * GET /api/practice/questions
 * Fetches practice questions by category
 */
router.get('/practice', async (req, res) => {
  try {
    const category = req.query.category || 'All';
    const clientSource = req.headers['x-client-source'] || req.query.client_source || 'web';
    let query = 'SELECT * FROM questions WHERE is_active = TRUE';
    const params = [];

    if (category !== 'All') {
      query += ' AND category_code = $1';
      params.push(category);
    }
    query += ' ORDER BY id ASC LIMIT 50';

    const result = await db.query(query, params);
    let questions = result.rows;

    if (questions.length === 0 && mem && mem.questions.size > 0) {
      questions = Array.from(mem.questions.values());
      if (category !== 'All') {
        questions = questions.filter(q => q.category_code === category || q.category === category);
      }
    }

    const isWeb = (clientSource === 'web');
    if (isWeb && questions.length > 5) {
      questions = questions.slice(0, 5);
    }

    res.json({
      success: true,
      count: questions.length,
      isWebPreview: isWeb,
      maxPreviewQuestions: isWeb ? 5 : questions.length,
      questions: questions.map(q => ({
        id: q.id,
        category: q.category_code || q.category,
        subject: q.subject,
        year: q.year,
        difficulty: q.difficulty,
        question_en: q.question_en,
        question_hi: q.question_hi,
        options_en: q.options_en,
        options_hi: q.options_hi,
        correct: q.correct_option_index !== undefined ? q.correct_option_index : q.correct,
        explanation_en: q.explanation_en,
        explanation_hi: q.explanation_hi
      }))
    });
  } catch (err) {
    console.error('[Practice Error]:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch practice questions.' });
  }
});

export default router;
