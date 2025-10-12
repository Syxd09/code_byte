import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';
import { authenticateParticipant } from '../middleware/auth.js';

// Time decay function
function calculateTimeDecayBonus(timeTaken, timeLimit, decayFactor = 0.1) {
  if (!timeLimit || timeTaken >= timeLimit) return 0;

  // Exponential decay: bonus = base_marks * e^(-decay_factor * (time_taken / time_limit))
  const normalizedTime = timeTaken / timeLimit;
  const bonusMultiplier = Math.exp(-decayFactor * normalizedTime);

  return bonusMultiplier;
}

// Partial marking function
function calculatePartialScore(userAnswer, correctAnswer, questionType, partialSettings) {
  if (!partialSettings) return 0;

  try {
    const settings = JSON.parse(partialSettings);

    if (questionType === 'fill' || questionType === 'mcq') {
      // For text-based questions, check for partial matches
      const userWords = userAnswer.toLowerCase().split(/\s+/);
      const correctWords = correctAnswer.toLowerCase().split(/\s+/);

      let matchingWords = 0;
      for (const word of userWords) {
        if (correctWords.includes(word)) {
          matchingWords++;
        }
      }

      const accuracy = matchingWords / correctWords.length;
      return settings.partialPercentage ? (accuracy * settings.maxPartialScore) : 0;
    } else if (questionType === 'code') {
      // For code questions, check for keyword matches or structure similarity
      const userCode = userAnswer.toLowerCase();
      const correctCode = correctAnswer.toLowerCase();

      let score = 0;
      const keywords = ['function', 'def', 'class', 'if', 'for', 'while', 'return', 'print', 'console.log'];

      for (const keyword of keywords) {
        if (userCode.includes(keyword) && correctCode.includes(keyword)) {
          score += settings.keywordWeight || 1;
        }
      }

      // Length similarity bonus
      const lengthRatio = Math.min(userCode.length, correctCode.length) / Math.max(userCode.length, correctCode.length);
      score += lengthRatio * (settings.lengthWeight || 2);

      return Math.min(score, settings.maxPartialScore || 5);
    }

    return 0;
  } catch (error) {
    console.error('Error calculating partial score:', error);
    return 0;
  }
}

const router = express.Router();

// Code evaluation functions
function evaluateCodeSemantic(userCode, correctCode, aiSettings) {
  // Basic semantic checking - can be enhanced with external APIs later
  if (!userCode || !correctCode) return false;

  const userCodeNormalized = userCode.toLowerCase().trim();
  const correctCodeNormalized = correctCode.toLowerCase().trim();

  // Check for exact match first
  if (userCodeNormalized === correctCodeNormalized) return true;

  // Basic semantic checks
  const checks = [
    // Check if key programming constructs are present
    () => {
      const keywords = ['function', 'def', 'class', 'if', 'for', 'while', 'return'];
      const userHasKeywords = keywords.some(kw => userCodeNormalized.includes(kw));
      const correctHasKeywords = keywords.some(kw => correctCodeNormalized.includes(kw));
      return userHasKeywords === correctHasKeywords;
    },
    // Check code length similarity (within 50% difference)
    () => {
      const lengthRatio = userCodeNormalized.length / correctCodeNormalized.length;
      return lengthRatio > 0.5 && lengthRatio < 2.0;
    },
    // Check for common code patterns
    () => {
      const patterns = [
        /print\(|console\.log\(/,
        /input\(|prompt\(/,
        /len\(|length/,
        /\d+/
      ];
      const userMatches = patterns.filter(p => p.test(userCodeNormalized)).length;
      const correctMatches = patterns.filter(p => p.test(correctCodeNormalized)).length;
      return Math.abs(userMatches - correctMatches) <= 1;
    }
  ];

  // Pass if at least 2 out of 3 checks pass
  const passedChecks = checks.filter(check => check()).length;
  return passedChecks >= 2;
}

function evaluateCodeWithTestCases(userCode, testCasesJson, correctCode) {
  // Basic test case validation - in a real implementation, this would run the code
  if (!userCode || !testCasesJson) return false;

  try {
    const testCases = JSON.parse(testCasesJson);
    if (!Array.isArray(testCases) || testCases.length === 0) return false;

    // For now, implement basic validation
    // In a full implementation, this would:
    // 1. Execute user code with test inputs
    // 2. Compare outputs with expected results
    // 3. Check for optimization (time/space complexity)

    const userCodeNormalized = userCode.toLowerCase().trim();
    const correctCodeNormalized = correctCode.toLowerCase().trim();

    // Basic checks for compiler mode
    let score = 0;

    // Check if code structure is similar
    if (userCodeNormalized.includes('function') || userCodeNormalized.includes('def')) {
      score += 1;
    }

    // Check for input/output handling
    if (userCodeNormalized.includes('input') || userCodeNormalized.includes('readline')) {
      score += 1;
    }

    // Check for output statements
    if (userCodeNormalized.includes('print') || userCodeNormalized.includes('console.log')) {
      score += 1;
    }

    // Check code length (should be reasonable)
    if (userCodeNormalized.length > 10 && userCodeNormalized.length < 1000) {
      score += 1;
    }

    // Pass if score is at least 3 out of 4
    return score >= 3;

  } catch (error) {
    console.error('Error parsing test cases:', error);
    return false;
  }
}

function evaluateCrosswordAnswer(userAnswer, crosswordGrid, crosswordClues, crosswordSize) {
  // Validate crossword answer
  if (!userAnswer || !crosswordGrid || !crosswordClues || !crosswordSize) return false;

  try {
    const grid = JSON.parse(crosswordGrid);
    const clues = JSON.parse(crosswordClues);
    const size = JSON.parse(crosswordSize); // { rows: number, cols: number }

    // Parse user answer - expect format like "1A:WORD,2D:WORD,..."
    const userEntries = {};
    const entries = userAnswer.split(',').map(entry => entry.trim());

    for (const entry of entries) {
      const [clueNum, word] = entry.split(':');
      if (clueNum && word) {
        userEntries[clueNum.toUpperCase()] = word.toUpperCase().trim();
      }
    }

    // Check if all required clues are filled
    let correctCount = 0;
    let totalClues = 0;

    for (const [clueNum, clueData] of Object.entries(clues)) {
      totalClues++;
      const userWord = userEntries[clueNum];
      if (userWord && userWord === clueData.word.toUpperCase()) {
        correctCount++;
      }
    }

    // Consider it correct if 80% or more answers are correct
    return correctCount >= totalClues * 0.8;

  } catch (error) {
    console.error('Error validating crossword:', error);
    return false;
  }
}

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
    if (game.status === 'active' || game.status === 'paused') {
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

    console.log('🔄 Rejoin request for participant:', participant.id, 'game:', participant.game_id);

    const game = await db.getAsync(
      'SELECT * FROM games WHERE id = ?',
      [participant.game_id]
    );

    if (!game) {
      console.log('❌ Game not found for rejoin:', participant.game_id);
      return res.status(404).json({ error: 'Game not found' });
    }

    console.log('📊 Game status during rejoin:', game.status);

    // Get current game state
    let currentQuestion = null;
    let answersRevealed = false;
    if (game.status === 'active') {
      const session = await db.getAsync(
        `SELECT gs.*, q.* FROM game_sessions gs
         JOIN questions q ON gs.current_question_id = q.id
         WHERE gs.game_id = ?`,
        [game.id]
      );

      console.log('🎯 Game session found:', !!session);
      if (session) {
        answersRevealed = session.answers_revealed;
        console.log('🔍 Answers revealed status:', answersRevealed);

        // Always send current question for active games, regardless of reveal status
        // Check if participant already answered this question
        const existingAnswer = await db.getAsync(
          'SELECT * FROM answers WHERE participant_id = ? AND question_id = ?',
          [participant.id, session.current_question_id]
        );

        console.log('📝 Participant already answered:', !!existingAnswer);

        // CRITICAL FIX: Always send current question for active games to ensure participants
        // who rejoin during an active question immediately receive it, regardless of answer status
        // Only skip if answers are revealed AND participant has already answered
        if (!answersRevealed || !existingAnswer) {
          console.log('✅ Sending current question to participant (rejoin during active game)');
          currentQuestion = {
            ...session,
            options: JSON.parse(session.options || '[]')
          };
        } else {
          console.log('⏳ Answers revealed and participant already answered, not resending question');
        }
      } else {
        console.log('❌ No active session found for game:', game.id);
      }
    } else {
      console.log('⏸️ Game not active, status:', game.status);
    }

    const responseData = {
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
    };

    console.log('📤 Rejoin response data:', {
      gameStatus: game.status,
      hasCurrentQuestion: !!currentQuestion,
      answersRevealed,
      participantId: participant.id
    });

    res.json(responseData);
  } catch (error) {
    console.error('❌ Rejoin game error:', error);
    res.status(500).json({ error: 'Failed to rejoin game' });
  }
});

// Submit answer
router.post('/answer', authenticateParticipant, async (req, res) => {
  try {
    console.log('Received answer submission:', req.body);
    console.log('Participant:', req.participant?.id);

    const { questionId, answer, hintUsed, timeTaken, autoSubmit } = req.body;
    console.log('Destructured autoSubmit value:', autoSubmit, 'Type:', typeof autoSubmit);
    const participant = req.participant;

    // Validate required fields
    if (!questionId || answer === undefined || hintUsed === undefined || timeTaken === undefined) {
      console.log('Missing required fields:', { questionId, answer, hintUsed, timeTaken });
      return res.status(400).json({
        error: 'Missing required fields: questionId, answer, hintUsed, timeTaken are all required'
      });
    }

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

    console.log('Time check - Current time:', new Date().toISOString());
    console.log('Time check - Session question_ends_at:', session?.question_ends_at);
    console.log('Time check - Session exists:', !!session);
    console.log('Auto-submit flag:', autoSubmit);

    const currentTime = new Date();
    const questionEndsAt = session ? new Date(session.question_ends_at) : null;
    const timeExpired = session && currentTime > questionEndsAt;
    const shouldAllowAutoSubmit = autoSubmit === true || autoSubmit === 'true';
    console.log('Condition evaluation - timeExpired:', timeExpired, 'shouldAllowAutoSubmit:', shouldAllowAutoSubmit, 'autoSubmit raw:', autoSubmit);

    if (!session || (timeExpired && !shouldAllowAutoSubmit)) {
      console.log('Time expired - rejecting submission');
      return res.status(400).json({ error: 'Question time has expired' });
    }

    console.log('Time check passed - allowing submission');

    // Calculate score with enhanced features
    let isCorrect = false;
    let scoreEarned = 0;
    let timeBonus = 0;
    let partialScore = 0;

    if (question.question_type === 'mcq') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    } else if (question.question_type === 'fill') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    } else if (question.question_type === 'image') {
      // For image-based questions, answer is typically a text description or identification
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    } else if (question.question_type === 'crossword') {
      // Validate crossword answers
      isCorrect = evaluateCrosswordAnswer(answer, question.crossword_grid, question.crossword_clues, question.crossword_size);
    } else if (question.question_type === 'code') {
      // Handle different evaluation modes for code questions
      const evaluationMode = question.evaluation_mode || 'mcq';

      if (evaluationMode === 'mcq') {
        // Auto-check against key
        isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
      } else if (evaluationMode === 'textarea') {
        // AI-based semantic validation
        isCorrect = evaluateCodeSemantic(answer, question.correct_answer, question.ai_validation_settings);
      } else if (evaluationMode === 'compiler') {
        // Test case validation with correctness and optimization checking
        isCorrect = evaluateCodeWithTestCases(answer, question.test_cases, question.correct_answer);
      } else {
        // Default to simple text comparison
        isCorrect = answer.toLowerCase().includes(question.correct_answer.toLowerCase());
      }
    } else {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
    }

    // Calculate base score
    if (isCorrect) {
      scoreEarned = question.marks;
    } else if (question.partial_marking_settings) {
      // Apply partial marking for incorrect answers
      partialScore = calculatePartialScore(answer, question.correct_answer, question.question_type, question.partial_marking_settings);
      scoreEarned = partialScore;
    }

    // Apply time decay bonus if enabled
    if (question.time_decay_enabled && scoreEarned > 0) {
      const decayBonus = calculateTimeDecayBonus(timeTaken, question.time_limit, question.time_decay_factor);
      timeBonus = Math.floor(scoreEarned * decayBonus);
      scoreEarned += timeBonus;
    } else if (isCorrect) {
      // Legacy time-based bonus for backward compatibility
      const legacyTimeBonus = Math.max(0, (question.time_limit - timeTaken) / question.time_limit * 5);
      timeBonus = Math.floor(legacyTimeBonus);
      scoreEarned += timeBonus;
    }

    // Hint penalty
    if (hintUsed) {
      scoreEarned -= question.hint_penalty;
    }

    scoreEarned = Math.max(0, scoreEarned);

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
      timeBonus,
      partialScore,
      message: isCorrect ? 'Correct answer!' : (partialScore > 0 ? 'Partial credit awarded!' : 'Incorrect answer')
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

// Re-admit eliminated participant
router.post('/re-admit/:participantId', async (req, res) => {
  try {
    const { participantId } = req.params;
    const { organizerId } = req.body; // Organizer ID passed from frontend

    // Verify the organizer owns the game
    const participant = await db.getAsync(
      `SELECT p.*, g.organizer_id FROM participants p
       JOIN games g ON p.game_id = g.id
       WHERE p.id = ?`,
      [participantId]
    );

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    if (participant.organizer_id !== organizerId) {
      return res.status(403).json({ error: 'Unauthorized to re-admit this participant' });
    }

    if (participant.status !== 'eliminated') {
      return res.status(400).json({ error: 'Participant is not eliminated' });
    }

    // Re-admit the participant
    await db.runAsync(
      'UPDATE participants SET status = "active" WHERE id = ?',
      [participantId]
    );

    // Get updated participant list for the game
    const updatedParticipants = await db.allAsync(
      `SELECT id, name, avatar, total_score, current_rank, status, qualified, cheat_warnings, joined_at
       FROM participants WHERE game_id = ? ORDER BY total_score DESC`,
      [participant.game_id]
    );

    res.json({
      message: 'Participant re-admitted successfully',
      participants: updatedParticipants
    });
  } catch (error) {
    console.error('Re-admit participant error:', error);
    res.status(500).json({ error: 'Failed to re-admit participant' });
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