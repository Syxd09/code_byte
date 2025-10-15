import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
// Socket.IO is not available in serverless functions
// Real-time features will need to be implemented differently
// import { io } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

const router = express.Router();

// Upload image for questions
router.post('/upload-image', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

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
    const { title, description, maxParticipants, qualificationType, qualificationThreshold } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const gameCode = uuidv4().substr(0, 8).toUpperCase();

    const result = await db.runAsync(
      `INSERT INTO games (title, description, game_code, organizer_id, max_participants, qualification_type, qualification_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, gameCode, req.user.id, maxParticipants || 500, qualificationType || 'none', qualificationThreshold || 0]
    );

    // Generate QR Code
    const joinUrl = `${process.env.FRONTEND_URL}/join/${gameCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);

    const game = await db.getAsync('SELECT * FROM games WHERE game_code = ?', [gameCode]);

    if (!game) {
      throw new Error('Game not found after creation');
    }

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
      `SELECT id, name, avatar, total_score, current_rank, status, qualified, cheat_warnings, joined_at
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
    const { title, description, maxParticipants, qualificationType, qualificationThreshold } = req.body;

    await db.runAsync(
      `UPDATE games SET title = ?, description = ?, max_participants = ?, qualification_type = ?, qualification_threshold = ?
       WHERE id = ? AND organizer_id = ?`,
      [title, description, maxParticipants, qualificationType, qualificationThreshold, req.params.gameId, req.user.id]
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
      explanation,
      evaluationMode,
      testCases,
      aiValidationSettings,
      imageUrl,
      crosswordGrid,
      crosswordClues,
      crosswordSize
    } = req.body;

    // Validate required fields
    if (!questionText || !questionType) {
      return res.status(400).json({ error: 'Question text and type are required' });
    }

    // Validate question type specific requirements
    if (questionType === 'mcq' && (!options || !Array.isArray(options) || options.length < 2)) {
      return res.status(400).json({ error: 'MCQ questions must have at least 2 options' });
    }

    if (questionType === 'code' && !evaluationMode) {
      return res.status(400).json({ error: 'Code questions must specify evaluation mode' });
    }

    // Validate test cases for code questions
    if (questionType === 'code' && (evaluationMode === 'compiler' || evaluationMode === 'bugfix')) {
      try {
        const parsedTestCases = testCases ? JSON.parse(testCases) : null;
        if (!Array.isArray(parsedTestCases) || parsedTestCases.length === 0) {
          return res.status(400).json({ error: 'Code questions with compiler/bugfix evaluation must have test cases' });
        }

        // Validate test case structure
        for (const testCase of parsedTestCases) {
          if (!testCase.hasOwnProperty('input') || !testCase.hasOwnProperty('expectedOutput')) {
            return res.status(400).json({ error: 'Test cases must have input and expectedOutput fields' });
          }
        }
      } catch (parseError) {
        return res.status(400).json({ error: 'Invalid test cases format' });
      }
    }

    // Validate marks and time limits
    if (marks && (marks < 0 || marks > 100)) {
      return res.status(400).json({ error: 'Marks must be between 0 and 100' });
    }

    if (timeLimit && (timeLimit < 10 || timeLimit > 3600)) {
      return res.status(400).json({ error: 'Time limit must be between 10 and 3600 seconds' });
    }

    // Get current question count
    const questionCount = await db.getAsync(
      'SELECT COUNT(*) as count FROM questions WHERE game_id = ?',
      [req.params.gameId]
    );

    const result = await db.runAsync(
      `INSERT INTO questions (game_id, question_order, question_text, question_type, options, correct_answer, hint, hint_penalty, time_limit, marks, difficulty, explanation, evaluation_mode, test_cases, ai_validation_settings, image_url, crossword_grid, crossword_clues, crossword_size, partial_marking_settings, time_decay_enabled, time_decay_factor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
         req.params.gameId,
         questionCount.count + 1,
         questionText,
         questionType,
         JSON.stringify(options || []),
         correctAnswer,
         hint,
         hintPenalty || 10,
         timeLimit || 60,
         marks || 10,
         difficulty || 'medium',
         explanation,
         evaluationMode || 'mcq',
         testCases || null,
         aiValidationSettings || null,
         imageUrl || null,
         crosswordGrid ? JSON.stringify(crosswordGrid) : null,
         crosswordClues ? JSON.stringify(crosswordClues) : null,
         JSON.stringify(crosswordSize) || null,
         null, // partial_marking_settings
         false, // time_decay_enabled
         0.1 // time_decay_factor
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
      explanation,
      evaluationMode,
      testCases,
      aiValidationSettings,
      imageUrl,
      crosswordGrid,
      crosswordClues,
      crosswordSize
    } = req.body;

    await db.runAsync(
      `UPDATE questions SET
       question_text = ?, question_type = ?, options = ?, correct_answer = ?,
       hint = ?, hint_penalty = ?, time_limit = ?, marks = ?, difficulty = ?, explanation = ?,
       evaluation_mode = ?, test_cases = ?, ai_validation_settings = ?, image_url = ?,
       crossword_grid = ?, crossword_clues = ?, crossword_size = ?,
       partial_marking_settings = ?, time_decay_enabled = ?, time_decay_factor = ?
       WHERE id = ? AND game_id = ?`,
      [
        questionText, questionType, JSON.stringify(options), correctAnswer,
        hint, hintPenalty, timeLimit, marks, difficulty, explanation,
        evaluationMode, testCases, aiValidationSettings, imageUrl,
        crosswordGrid ? JSON.stringify(crosswordGrid) : null,
        crosswordClues ? JSON.stringify(crosswordClues) : null,
        JSON.stringify(crosswordSize),
        null, // partial_marking_settings
        false, // time_decay_enabled
        0.1, // time_decay_factor
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
      const questionEndTime = new Date(Date.now() + firstQuestion.time_limit * 1000).toISOString();
      console.log('🎮 Game start - Question time limit:', firstQuestion.time_limit);
      console.log('🎮 Game start - Question end time:', questionEndTime);
      console.log('🎮 Game start - First question data:', firstQuestion);

      await db.runAsync(
        `INSERT INTO game_sessions (game_id, current_question_id, question_started_at, question_ends_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
        [req.params.gameId, firstQuestion.id, questionEndTime]
      );

      // Real-time features disabled in serverless environment
      // TODO: Implement real-time features using WebSockets or polling
      console.log('📡 Game started - real-time features disabled in serverless environment');
      console.log('Game started for game:', req.params.gameId);
    } else {
      console.log('❌ No first question found for game:', req.params.gameId);
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
    const nextQuestionEndTime = new Date(Date.now() + nextQuestion.time_limit * 1000).toISOString();
    console.log('Next question - Time limit:', nextQuestion.time_limit);
    console.log('Next question - End time:', nextQuestionEndTime);

    await db.runAsync(
      `UPDATE game_sessions SET
       current_question_id = ?,
       question_started_at = CURRENT_TIMESTAMP,
       question_ends_at = ?,
       answers_revealed = FALSE,
       answered_participants = 0
       WHERE game_id = ?`,
      [nextQuestion.id, nextQuestionEndTime, req.params.gameId]
    );

    // Real-time features disabled in serverless environment
    console.log('Next question started for game:', req.params.gameId);

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

    // Real-time features disabled in serverless environment
    console.log('Answer revealed for game:', req.params.gameId);

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

    // Apply qualification rules
    await applyQualificationRules(req.params.gameId);

    // Real-time features disabled in serverless environment
    console.log('Game ended for game:', req.params.gameId);

    res.json({ message: 'Game ended successfully' });
  } catch (error) {
    console.error('End game error:', error);
    res.status(500).json({ error: 'Failed to end game' });
  }
});

router.post('/:gameId/pause', authenticateToken, async (req, res) => {
  try {
    const game = await db.getAsync('SELECT * FROM games WHERE id = ? AND organizer_id = ?', [req.params.gameId, req.user.id]);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'active') {
      return res.status(400).json({ error: 'Game is not active' });
    }

    // Update game status to paused
    await db.runAsync(
      'UPDATE games SET status = ? WHERE id = ?',
      ['paused', req.params.gameId]
    );

    // Record pause time in game session
    await db.runAsync(
      'UPDATE game_sessions SET paused_at = CURRENT_TIMESTAMP WHERE game_id = ?',
      [req.params.gameId]
    );

    // Real-time features disabled in serverless environment
    console.log('Game paused for game:', req.params.gameId);

    res.json({ message: 'Game paused successfully' });
  } catch (error) {
    console.error('Pause game error:', error);
    res.status(500).json({ error: 'Failed to pause game' });
  }
});

router.post('/:gameId/resume', authenticateToken, async (req, res) => {
  try {
    const game = await db.getAsync('SELECT * FROM games WHERE id = ? AND organizer_id = ?', [req.params.gameId, req.user.id]);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'paused') {
      return res.status(400).json({ error: 'Game is not paused' });
    }

    // Get current session
    const session = await db.getAsync(
      'SELECT * FROM game_sessions WHERE game_id = ?',
      [req.params.gameId]
    );

    if (session && session.question_ends_at && session.paused_at) {
      // Calculate remaining time when paused
      const pausedTime = new Date(session.paused_at);
      const endTime = new Date(session.question_ends_at);
      const remainingMs = endTime - pausedTime;

      if (remainingMs > 0) {
        // Set new end time
        const newEndTime = new Date(Date.now() + remainingMs);
        console.log('Resume - Remaining time:', remainingMs / 1000, 'seconds');
        console.log('Resume - New end time:', newEndTime.toISOString());
        await db.runAsync(
          'UPDATE game_sessions SET question_ends_at = ?, paused_at = NULL WHERE game_id = ?',
          [newEndTime.toISOString(), req.params.gameId]
        );
      } else {
        // Time already expired, auto-submit answers
        console.log('Resume - Time already expired, auto-submitting');
        await db.runAsync(
          'UPDATE game_sessions SET paused_at = NULL WHERE game_id = ?',
          [req.params.gameId]
        );
      }
    }

    // Update game status back to active
    await db.runAsync(
      'UPDATE games SET status = ? WHERE id = ?',
      ['active', req.params.gameId]
    );

    // Real-time features disabled in serverless environment
    console.log('Game resumed for game:', req.params.gameId);

    res.json({ message: 'Game resumed successfully' });
  } catch (error) {
    console.error('Resume game error:', error);
    res.status(500).json({ error: 'Failed to resume game' });
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
// Get current game state for polling (replaces real-time features in serverless environment)
router.get('/:gameCode/state', async (req, res) => {
  try {
    const game = await db.getAsync('SELECT * FROM games WHERE game_code = ?', [req.params.gameCode]);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const state = {
      gameId: game.id,
      status: game.status,
      currentQuestionIndex: game.current_question_index,
      totalQuestions: game.total_questions,
      startedAt: game.started_at,
      endedAt: game.ended_at,
      qualificationType: game.qualification_type,
      qualificationThreshold: game.qualification_threshold
    };

    // Get current session if game is active
    if (game.status === 'active') {
      const session = await db.getAsync(
        `SELECT gs.*, q.question_text, q.question_type, q.options, q.correct_answer,
                q.hint, q.time_limit, q.marks, q.difficulty, q.explanation, q.image_url
         FROM game_sessions gs
         LEFT JOIN questions q ON gs.current_question_id = q.id
         WHERE gs.game_id = ?`,
        [game.id]
      );

      if (session) {
        // Calculate time remaining
        const now = new Date();
        const endTime = new Date(session.question_ends_at);
        const timeRemaining = Math.max(0, Math.floor((endTime - now) / 1000));

        state.currentQuestion = {
          id: session.current_question_id,
          questionText: session.question_text,
          questionType: session.question_type,
          options: session.options ? JSON.parse(session.options) : [],
          hint: session.hint,
          timeLimit: session.time_limit,
          marks: session.marks,
          difficulty: session.difficulty,
          explanation: session.explanation,
          imageUrl: session.image_url,
          timeRemaining,
          answersRevealed: session.answers_revealed,
          answeredParticipants: session.answered_participants
        };
      }
    }

    // Get leaderboard
    const leaderboard = await db.allAsync(
      `SELECT name, avatar, total_score, current_rank, status, qualified
       FROM participants
       WHERE game_id = ? AND status = 'active'
       ORDER BY total_score DESC, joined_at ASC`,
      [game.id]
    );

    state.leaderboard = leaderboard;

    res.json(state);
  } catch (error) {
    console.error('Get game state error:', error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

// Helper function to update leaderboard
// This function recalculates participant rankings based on their total scores
// and broadcasts the updated leaderboard to all connected clients in real-time
async function updateLeaderboard(gameId) {
  // Fetch all active participants ordered by score (highest first)
  // This ensures accurate ranking calculation
  const participants = await db.allAsync(
    'SELECT id, total_score FROM participants WHERE game_id = ? AND status = "active" ORDER BY total_score DESC',
    [gameId]
  );

  // Update each participant's rank in the database
  // Rank is 1-indexed (1st place, 2nd place, etc.)
  for (let i = 0; i < participants.length; i++) {
    await db.runAsync(
      'UPDATE participants SET current_rank = ? WHERE id = ?',
      [i + 1, participants[i].id]
    );
  }

  // Fetch complete leaderboard data for broadcasting
  // Includes participant names, avatars, scores, and ranks
  const leaderboard = await db.allAsync(
    `SELECT name, avatar, total_score, current_rank
     FROM participants
     WHERE game_id = ? AND status = 'active'
     ORDER BY total_score DESC`,
    [gameId]
  );

  // Real-time features disabled in serverless environment
  // Leaderboard updates will need to be polled by clients
  console.log('Leaderboard updated for game:', gameId);
}

// Helper function to apply qualification rules
// This function implements different qualification strategies based on game settings:
// - top_n: Top N highest scoring participants qualify
// - top_percentage: Top X% of participants qualify
// - custom_threshold: Participants above a score threshold qualify
// - none: No qualification rules applied
async function applyQualificationRules(gameId) {
  // Fetch game qualification settings
  const game = await db.getAsync('SELECT qualification_type, qualification_threshold FROM games WHERE id = ?', [gameId]);

  // Skip if no qualification rules are set
  if (!game || game.qualification_type === 'none') {
    return;
  }

  // Get all active participants sorted by score (highest first)
  const participants = await db.allAsync(
    'SELECT id, total_score FROM participants WHERE game_id = ? AND status = "active" ORDER BY total_score DESC',
    [gameId]
  );

  // No participants to qualify
  if (participants.length === 0) {
    return;
  }

  let qualifiedCount = 0;

  // Calculate number of qualified participants based on qualification type
  if (game.qualification_type === 'top_n') {
    // Top N participants qualify (capped at total participants)
    qualifiedCount = Math.min(game.qualification_threshold, participants.length);
  } else if (game.qualification_type === 'top_percentage') {
    // Top X% of participants qualify (rounded up)
    qualifiedCount = Math.ceil((game.qualification_threshold / 100) * participants.length);
  } else if (game.qualification_type === 'custom_threshold') {
    // Count participants who meet or exceed the score threshold
    qualifiedCount = participants.filter(p => p.total_score >= game.qualification_threshold).length;
  }

  // Update qualification status for qualified participants (top of the leaderboard)
  for (let i = 0; i < qualifiedCount; i++) {
    await db.runAsync(
      'UPDATE participants SET qualified = TRUE WHERE id = ?',
      [participants[i].id]
    );
  }

  // Mark remaining participants as unqualified
  for (let i = qualifiedCount; i < participants.length; i++) {
    await db.runAsync(
      'UPDATE participants SET qualified = FALSE WHERE id = ?',
      [participants[i].id]
    );
  }
}

export default router;