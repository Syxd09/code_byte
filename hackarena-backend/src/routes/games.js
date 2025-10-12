import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { db } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { io } from '../server.js';

const router = express.Router();

// Get all games for organizer
router.get('/', authenticateToken, async (req, res) => {
  try {
    const games = await db.allAsync(
      `SELECT g.*, 
       COUNT(p.id) as participant_count,
       COUNT(q.id) as question_count
       FROM games g
       LEFT JOIN participants p ON g.id = p.game_id AND p.status = 'active'
       LEFT JOIN questions q ON g.id = q.game_id
       WHERE g.organizer_id = ?
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );

    res.json(games);
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Create new game
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, maxParticipants } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const gameCode = uuidv4().substr(0, 8).toUpperCase();
    
    const result = await db.runAsync(
      `INSERT INTO games (title, description, game_code, organizer_id, max_participants) 
       VALUES (?, ?, ?, ?, ?)`,
      [title, description, gameCode, req.user.id, maxParticipants || 500]
    );

    // Generate QR Code
    const joinUrl = `${process.env.FRONTEND_URL}/join/${gameCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    const game = await db.getAsync('SELECT * FROM games WHERE id = ?', [result.lastID]);

    res.status(201).json({
      ...game,
      qrCode: qrCodeDataUrl,
      joinUrl
    });
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Get specific game details
router.get('/:gameId', authenticateToken, async (req, res) => {
  try {
    const game = await db.getAsync(
      'SELECT * FROM games WHERE id = ? AND organizer_id = ?',
      [req.params.gameId, req.user.id]
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Get questions
    const questions = await db.allAsync(
      'SELECT * FROM questions WHERE game_id = ? ORDER BY question_order',
      [game.id]
    );

    // Get participants
    const participants = await db.allAsync(
      `SELECT id, name, avatar, total_score, current_rank, status, cheat_warnings, joined_at 
       FROM participants WHERE game_id = ? ORDER BY total_score DESC`,
      [game.id]
    );

    // Generate QR Code
    const joinUrl = `${process.env.FRONTEND_URL}/join/${game.game_code}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    res.json({
      ...game,
      questions,
      participants,
      qrCode: qrCodeDataUrl,
      joinUrl
    });
  } catch (error) {
    console.error('Get game details error:', error);
    res.status(500).json({ error: 'Failed to fetch game details' });
  }
});

// Update game
router.put('/:gameId', authenticateToken, async (req, res) => {
  try {
    const { title, description, maxParticipants } = req.body;
    
    await db.runAsync(
      `UPDATE games SET title = ?, description = ?, max_participants = ? 
       WHERE id = ? AND organizer_id = ?`,
      [title, description, maxParticipants, req.params.gameId, req.user.id]
    );

    const game = await db.getAsync(
      'SELECT * FROM games WHERE id = ? AND organizer_id = ?',
      [req.params.gameId, req.user.id]
    );

    res.json(game);
  } catch (error) {
    console.error('Update game error:', error);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

// Delete game
router.delete('/:gameId', authenticateToken, async (req, res) => {
  try {
    const result = await db.runAsync(
      'DELETE FROM games WHERE id = ? AND organizer_id = ?',
      [req.params.gameId, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Add question to game
router.post('/:gameId/questions', authenticateToken, async (req, res) => {
  try {
    const {
      questionText,
      questionType,
      options,
      correctAnswer,
      hint,
      hintPenalty,
      timeLimit,
      marks,
      difficulty,
      explanation
    } = req.body;

    // Get current question count
    const questionCount = await db.getAsync(
      'SELECT COUNT(*) as count FROM questions WHERE game_id = ?',
      [req.params.gameId]
    );

    const result = await db.runAsync(
      `INSERT INTO questions (
        game_id, question_order, question_text, question_type, options,
        correct_answer, hint, hint_penalty, time_limit, marks, difficulty, explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.gameId,
        questionCount.count + 1,
        questionText,
        questionType,
        JSON.stringify(options),
        correctAnswer,
        hint,
        hintPenalty || 10,
        timeLimit || 60,
        marks || 10,
        difficulty || 'medium',
        explanation
      ]
    );

    // Update total questions in game
    await db.runAsync(
      'UPDATE games SET total_questions = ? WHERE id = ?',
      [questionCount.count + 1, req.params.gameId]
    );

    const question = await db.getAsync('SELECT * FROM questions WHERE id = ?', [result.lastID]);

    res.status(201).json({
      ...question,
      options: JSON.parse(question.options || '[]')
    });
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// Update question
router.put('/:gameId/questions/:questionId', authenticateToken, async (req, res) => {
  try {
    const {
      questionText,
      questionType,
      options,
      correctAnswer,
      hint,
      hintPenalty,
      timeLimit,
      marks,
      difficulty,
      explanation
    } = req.body;

    await db.runAsync(
      `UPDATE questions SET 
       question_text = ?, question_type = ?, options = ?, correct_answer = ?,
       hint = ?, hint_penalty = ?, time_limit = ?, marks = ?, difficulty = ?, explanation = ?
       WHERE id = ? AND game_id = ?`,
      [
        questionText, questionType, JSON.stringify(options), correctAnswer,
        hint, hintPenalty, timeLimit, marks, difficulty, explanation,
        req.params.questionId, req.params.gameId
      ]
    );

    const question = await db.getAsync('SELECT * FROM questions WHERE id = ?', [req.params.questionId]);

    res.json({
      ...question,
      options: JSON.parse(question.options || '[]')
    });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/:gameId/questions/:questionId', authenticateToken, async (req, res) => {
  try {
    await db.runAsync(
      'DELETE FROM questions WHERE id = ? AND game_id = ?',
      [req.params.questionId, req.params.gameId]
    );

    // Update question order for remaining questions
    await db.runAsync(
      `UPDATE questions SET question_order = question_order - 1 
       WHERE game_id = ? AND question_order > (
         SELECT question_order FROM questions WHERE id = ?
       )`,
      [req.params.gameId, req.params.questionId]
    );

    // Update total questions count
    const questionCount = await db.getAsync(
      'SELECT COUNT(*) as count FROM questions WHERE game_id = ?',
      [req.params.gameId]
    );

    await db.runAsync(
      'UPDATE games SET total_questions = ? WHERE id = ?',
      [questionCount.count, req.params.gameId]
    );

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Game control actions
router.post('/:gameId/start', authenticateToken, async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE games SET status = 'active', started_at = CURRENT_TIMESTAMP, current_question_index = 1 
       WHERE id = ? AND organizer_id = ?`,
      [req.params.gameId, req.user.id]
    );

    // Get first question
    const firstQuestion = await db.getAsync(
      'SELECT * FROM questions WHERE game_id = ? AND question_order = 1',
      [req.params.gameId]
    );

    if (firstQuestion) {
      // Create game session
      await db.runAsync(
        `INSERT INTO game_sessions (game_id, current_question_id, question_started_at, question_ends_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, datetime('now', '+' || ? || ' seconds'))`,
        [req.params.gameId, firstQuestion.id, firstQuestion.time_limit]
      );

      // Emit to all participants
      io.to(`game-${req.params.gameId}`).emit('gameStarted', {
        question: {
          ...firstQuestion,
          options: JSON.parse(firstQuestion.options || '[]')
        }
      });
    }

    res.json({ message: 'Game started successfully' });
  } catch (error) {
    console.error('Start game error:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

router.post('/:gameId/next-question', authenticateToken, async (req, res) => {
  try {
    const game = await db.getAsync('SELECT * FROM games WHERE id = ? AND organizer_id = ?', [req.params.gameId, req.user.id]);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const nextQuestionIndex = game.current_question_index + 1;
    
    // Get next question
    const nextQuestion = await db.getAsync(
      'SELECT * FROM questions WHERE game_id = ? AND question_order = ?',
      [req.params.gameId, nextQuestionIndex]
    );

    if (!nextQuestion) {
      return res.status(400).json({ error: 'No more questions' });
    }

    // Update game state
    await db.runAsync(
      'UPDATE games SET current_question_index = ? WHERE id = ?',
      [nextQuestionIndex, req.params.gameId]
    );

    // Update game session
    await db.runAsync(
      `UPDATE game_sessions SET 
       current_question_id = ?, 
       question_started_at = CURRENT_TIMESTAMP, 
       question_ends_at = datetime('now', '+' || ? || ' seconds'),
       answers_revealed = FALSE,
       answered_participants = 0
       WHERE game_id = ?`,
      [nextQuestion.id, nextQuestion.time_limit, req.params.gameId]
    );

    // Emit to all participants
    io.to(`game-${req.params.gameId}`).emit('nextQuestion', {
      question: {
        ...nextQuestion,
        options: JSON.parse(nextQuestion.options || '[]')
      }
    });

    res.json({ message: 'Next question started' });
  } catch (error) {
    console.error('Next question error:', error);
    res.status(500).json({ error: 'Failed to start next question' });
  }
});

router.post('/:gameId/reveal-answer', authenticateToken, async (req, res) => {
  try {
    // Get current question
    const session = await db.getAsync(
      `SELECT gs.*, q.* FROM game_sessions gs 
       JOIN questions q ON gs.current_question_id = q.id
       WHERE gs.game_id = ?`,
      [req.params.gameId]
    );

    if (!session) {
      return res.status(400).json({ error: 'No active question' });
    }

    // Mark answers as revealed
    await db.runAsync(
      'UPDATE game_sessions SET answers_revealed = TRUE WHERE game_id = ?',
      [req.params.gameId]
    );

    // Calculate and update leaderboard
    await updateLeaderboard(req.params.gameId);

    // Emit answer reveal to all participants
    io.to(`game-${req.params.gameId}`).emit('answerRevealed', {
      correctAnswer: session.correct_answer,
      explanation: session.explanation
    });

    res.json({ message: 'Answer revealed successfully' });
  } catch (error) {
    console.error('Reveal answer error:', error);
    res.status(500).json({ error: 'Failed to reveal answer' });
  }
});

router.post('/:gameId/end', authenticateToken, async (req, res) => {
  try {
    await db.runAsync(
      `UPDATE games SET status = 'completed', ended_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND organizer_id = ?`,
      [req.params.gameId, req.user.id]
    );

    // Calculate final rankings
    await updateLeaderboard(req.params.gameId);

    // Emit game end to all participants
    io.to(`game-${req.params.gameId}`).emit('gameEnded');

    res.json({ message: 'Game ended successfully' });
  } catch (error) {
    console.error('End game error:', error);
    res.status(500).json({ error: 'Failed to end game' });
  }
});

// Public leaderboard
router.get('/:gameCode/leaderboard', async (req, res) => {
  try {
    const game = await db.getAsync('SELECT id FROM games WHERE game_code = ?', [req.params.gameCode]);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const leaderboard = await db.allAsync(
      `SELECT name, avatar, total_score, current_rank, status
       FROM participants 
       WHERE game_id = ? AND status = 'active'
       ORDER BY total_score DESC, joined_at ASC`,
      [game.id]
    );

    res.json(leaderboard);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Helper function to update leaderboard
async function updateLeaderboard(gameId) {
  const participants = await db.allAsync(
    'SELECT id, total_score FROM participants WHERE game_id = ? AND status = "active" ORDER BY total_score DESC',
    [gameId]
  );

  for (let i = 0; i < participants.length; i++) {
    await db.runAsync(
      'UPDATE participants SET current_rank = ? WHERE id = ?',
      [i + 1, participants[i].id]
    );
  }

  // Emit updated leaderboard
  const leaderboard = await db.allAsync(
    `SELECT name, avatar, total_score, current_rank
     FROM participants 
     WHERE game_id = ? AND status = 'active'
     ORDER BY total_score DESC`,
    [gameId]
  );

  io.to(`game-${gameId}`).emit('leaderboardUpdate', leaderboard);
}

export default router;