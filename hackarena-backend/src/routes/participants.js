import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';
import { authenticateParticipant } from '../middleware/auth.js';

const router = express.Router();

// Tech-themed avatars
const techAvatars = [
  '👨‍💻', '👩‍💻', '🤖', '🦾', '🔬', '⚡', '🚀', '💻', '📱', '🖥️',
  '⌨️', '🖱️', '💾', '💿', '📟', '📺', '🔌', '🔋', '💡', '🔧'
];

// Join game
router.post('/join', async (req, res) => {
  try {
    const { gameCode, name } = req.body;

    if (!gameCode || !name) {
      return res.status(400).json({ error: 'Game code and name are required' });
    }

    // Find game
    const game = await db.getAsync(
      'SELECT * FROM games WHERE game_code = ?',
      [gameCode.toUpperCase()]
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Check if game has started and no new participants allowed
    if (game.status === 'active') {
      return res.status(400).json({ error: 'Game has already started. No new participants allowed.' });
    }

    if (game.status === 'completed') {
      return res.status(400).json({ error: 'Game has ended' });
    }

    // Check if participant already exists (prevent duplicates)
    const existingParticipant = await db.getAsync(
      'SELECT * FROM participants WHERE game_id = ? AND name = ? AND status = "active"',
      [game.id, name]
    );

    if (existingParticipant) {
      return res.status(400).json({ error: 'Participant with this name already exists' });
    }

    // Check participant limit
    const participantCount = await db.getAsync(
      'SELECT COUNT(*) as count FROM participants WHERE game_id = ? AND status = "active"',
      [game.id]
    );

    if (participantCount.count >= game.max_participants) {
      return res.status(400).json({ error: 'Game is full' });
    }

    // Create participant
    const sessionToken = uuidv4();
    const avatar = techAvatars[Math.floor(Math.random() * techAvatars.length)];

    const result = await db.runAsync(
      `INSERT INTO participants (game_id, name, avatar, session_token) 
       VALUES (?, ?, ?, ?)`,
      [game.id, name, avatar, sessionToken]
    );

    const participant = await db.getAsync(
      'SELECT * FROM participants WHERE id = ?',
      [result.lastID]
    );

    res.status(201).json({
      participant: {
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
        gameId: game.id,
        gameTitle: game.title,
        gameStatus: game.status
      },
      sessionToken,
      gameCode: game.game_code
    });
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Rejoin game (for network reconnection)
router.post('/rejoin', authenticateParticipant, async (req, res) => {
  try {
    const participant = req.participant;
    
    const game = await db.getAsync(
      'SELECT * FROM games WHERE id = ?',
      [participant.game_id]
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Get current game state
    let currentQuestion = null;
    if (game.status === 'active') {
      const session = await db.getAsync(
        `SELECT gs.*, q.* FROM game_sessions gs 
         JOIN questions q ON gs.current_question_id = q.id
         WHERE gs.game_id = ?`,
        [game.id]
      );

      if (session && !session.answers_revealed) {
        // Check if participant already answered this question
        const existingAnswer = await db.getAsync(
          'SELECT * FROM answers WHERE participant_id = ? AND question_id = ?',
          [participant.id, session.current_question_id]
        );

        if (!existingAnswer) {
          currentQuestion = {
            ...session,
            options: JSON.parse(session.options || '[]')
          };
        }
      }
    }

    res.json({
      participant: {
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar,
        totalScore: participant.total_score,
        currentRank: participant.current_rank,
        gameId: game.id,
        gameTitle: game.title,
        gameStatus: game.status
      },
      currentQuestion,
      gameCode: game.game_code
    });
  } catch (error) {
    console.error('Rejoin game error:', error);
    res.status(500).json({ error: 'Failed to rejoin game' });
  }
});

// Submit answer
router.post('/answer', authenticateParticipant, async (req, res) => {
  try {
    const { questionId, answer, hintUsed, timeTaken } = req.body;
    const participant = req.participant;

    // Check if already answered
    const existingAnswer = await db.getAsync(
      'SELECT * FROM answers WHERE participant_id = ? AND question_id = ?',
      [participant.id, questionId]
    );

    if (existingAnswer) {
      return res.status(400).json({ error: 'Already answered this question' });
    }

    // Get question details
    const question = await db.getAsync(
      'SELECT * FROM questions WHERE id = ?',
      [questionId]
    );

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if question time has expired
    const session = await db.getAsync(
      'SELECT * FROM game_sessions WHERE current_question_id = ?',
      [questionId]
    );

    if (!session || new Date() > new Date(session.question_ends_at)) {
      return res.status(400).json({ error: 'Question time has expired' });
    }

    // Calculate score
    let isCorrect = false;
    let scoreEarned = 0;

    if (question.question_type === 'mcq') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    } else if (question.question_type === 'fill') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    } else if (question.question_type === 'code') {
      // For code questions, you might want to implement AI-based evaluation
      // For now, simple text comparison
      isCorrect = answer.toLowerCase().includes(question.correct_answer.toLowerCase());
    } else {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    }

    if (isCorrect) {
      scoreEarned = question.marks;
      
      // Time-based bonus (faster response = more points)
      const timeBonus = Math.max(0, (question.time_limit - timeTaken) / question.time_limit * 5);
      scoreEarned += Math.floor(timeBonus);
      
      // Hint penalty
      if (hintUsed) {
        scoreEarned -= question.hint_penalty;
      }
      
      scoreEarned = Math.max(0, scoreEarned);
    }

    // Save answer
    await db.runAsync(
      `INSERT INTO answers (participant_id, question_id, answer_text, is_correct, score_earned, time_taken, hint_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [participant.id, questionId, answer, isCorrect, scoreEarned, timeTaken, hintUsed]
    );

    // Update participant total score
    await db.runAsync(
      'UPDATE participants SET total_score = total_score + ? WHERE id = ?',
      [scoreEarned, participant.id]
    );

    // Update session answered count
    await db.runAsync(
      'UPDATE game_sessions SET answered_participants = answered_participants + 1 WHERE current_question_id = ?',
      [questionId]
    );

    res.json({
      submitted: true,
      isCorrect,
      scoreEarned,
      message: isCorrect ? 'Correct answer!' : 'Incorrect answer'
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// Report cheat attempt
router.post('/cheat-report', authenticateParticipant, async (req, res) => {
  try {
    const { cheatType } = req.body;
    const participant = req.participant;

    // Update cheat warnings
    const newWarningCount = participant.cheat_warnings + 1;
    
    let penaltyScore = 0;
    let status = 'active';

    if (newWarningCount === 1) {
      penaltyScore = 10;
    } else if (newWarningCount === 2) {
      penaltyScore = 15;
    } else if (newWarningCount >= 3) {
      status = 'flagged'; // Flag for organizer attention
    }

    await db.runAsync(
      `UPDATE participants SET 
       cheat_warnings = ?, 
       total_score = total_score - ?, 
       status = ?
       WHERE id = ?`,
      [newWarningCount, penaltyScore, status, participant.id]
    );

    res.json({
      warning: newWarningCount,
      penalty: penaltyScore,
      status: status
    });
  } catch (error) {
    console.error('Cheat report error:', error);
    res.status(500).json({ error: 'Failed to report cheat' });
  }
});

// Get participant analytics
router.get('/analytics', authenticateParticipant, async (req, res) => {
  try {
    const participant = req.participant;

    // Get all answers for this participant
    const answers = await db.allAsync(
      `SELECT a.*, q.question_text, q.correct_answer, q.marks, q.question_type
       FROM answers a
       JOIN questions q ON a.question_id = q.id
       WHERE a.participant_id = ?
       ORDER BY q.question_order`,
      [participant.id]
    );

    // Calculate statistics
    const totalQuestions = answers.length;
    const correctAnswers = answers.filter(a => a.is_correct).length;
    const totalScore = answers.reduce((sum, a) => sum + a.score_earned, 0);
    const averageTime = totalQuestions > 0 ? answers.reduce((sum, a) => sum + a.time_taken, 0) / totalQuestions : 0;

    res.json({
      participant: {
        name: participant.name,
        avatar: participant.avatar,
        finalRank: participant.current_rank,
        totalScore: participant.total_score,
        cheatWarnings: participant.cheat_warnings
      },
      stats: {
        totalQuestions,
        correctAnswers,
        accuracy: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0,
        averageTime: Math.round(averageTime),
        totalScore
      },
      answers: answers.map(a => ({
        questionText: a.question_text,
        yourAnswer: a.answer_text,
        correctAnswer: a.correct_answer,
        isCorrect: a.is_correct,
        scoreEarned: a.score_earned,
        maxScore: a.marks,
        timeTaken: a.time_taken,
        hintUsed: a.hint_used
      }))
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export default router;