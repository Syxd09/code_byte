import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/init.js';
import { authenticateParticipant } from '../middleware/auth.js';
import CodeExecutionService from '../services/codeExecution.js';

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
      // Enhanced partial scoring for code questions using CodeExecutionService
      const language = question.programming_language || 'javascript';
      const evaluationMode = question.evaluation_mode || 'mcq';

      // Use the new partial scoring algorithm
      return CodeExecutionService.calculatePartialScore(userAnswer, correctAnswer, null, language, evaluationMode);
    }

    return 0;
  } catch (error) {
    console.error('Error calculating partial score:', error);
    return 0;
  }
}

const router = express.Router();

// Code evaluation functions
async function evaluateCodeSemantic(userCode, correctCode, aiSettings, language = 'javascript', userId = null) {
  // Enhanced semantic checking using the new CodeExecutionService
  if (!userCode || !correctCode) return false;

  try {
    // Rate limiting check for semantic analysis
    if (userId && !CodeExecutionService.rateLimiter.isAllowed(userId)) {
      console.warn('Rate limit exceeded for semantic analysis, user:', userId);
      return false;
    }

    // Use the semantic analyzer from CodeExecutionService
    const analysis = CodeExecutionService.analyzeCode(userCode, language, correctCode);

    // Determine if code passes semantic evaluation
    const semanticScore = (analysis.structureScore + analysis.keywordScore + analysis.similarityScore) / 3;

    // Pass if semantic score is above threshold (6 out of 10)
    return semanticScore >= 6;

  } catch (error) {
    console.error('Error in semantic evaluation:', error);
    // Fallback to basic checks
    const userCodeNormalized = userCode.toLowerCase().trim();
    const correctCodeNormalized = correctCode.toLowerCase().trim();

    if (userCodeNormalized === correctCodeNormalized) return true;

    const checks = [
      () => {
        const keywords = ['function', 'def', 'class', 'if', 'for', 'while', 'return'];
        const userHasKeywords = keywords.some(kw => userCodeNormalized.includes(kw));
        const correctHasKeywords = keywords.some(kw => correctCodeNormalized.includes(kw));
        return userHasKeywords === correctHasKeywords;
      },
      () => {
        const lengthRatio = userCodeNormalized.length / correctCodeNormalized.length;
        return lengthRatio > 0.5 && lengthRatio < 2.0;
      }
    ];

    const passedChecks = checks.filter(check => check()).length;
    return passedChecks >= 1;
  }
}

async function evaluateCodeWithTestCases(userCode, testCasesJson, correctCode, language = 'javascript', userId = null) {
  // Enhanced test case validation using the new CodeExecutionService
  if (!userCode || !testCasesJson) return false;

  try {
    const testCases = JSON.parse(testCasesJson);
    if (!Array.isArray(testCases) || testCases.length === 0) return false;

    // Execute code against all test cases with rate limiting
    const testResults = await CodeExecutionService.executeTestCases(userCode, language, testCases, userId);

    // Calculate success rate
    const passedTests = testResults.filter(result => result.success).length;
    const totalTests = testResults.length;
    const passRate = passedTests / totalTests;

    // Return true if at least 80% tests pass
    return passRate >= 0.8;

  } catch (error) {
    console.error('Error executing test cases:', error);
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

    // Security: Validate input size and content
    if (answer && answer.length > 10000) {
      return res.status(400).json({ error: 'Answer too large' });
    }

    // Security: Basic input sanitization for code
    if (typeof answer === 'string') {
      // Check for potentially dangerous patterns
      const dangerousPatterns = [
        /require\s*\(\s*['"`]child_process['"`]\s*\)/i,
        /require\s*\(\s*['"`]fs['"`]\s*\)/i,
        /exec\s*\(/i,
        /spawn\s*\(/i,
        /eval\s*\(/i,
        /Function\s*\(/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(answer)) {
          console.warn('Potentially dangerous code detected from participant:', req.participant?.id);
          // Log security event but don't block - sandboxing will handle it
        }
      }
    }
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
    let codeQualityScore = 0;
    let performanceScore = 0;
    let correctnessScore = 0;
    let executionResults = null;
    let evaluationMode = question.evaluation_mode || 'mcq';
    let executionTimeMs = 0;
    let memoryUsedKb = 0;
    let testCasesPassed = 0;
    let totalTestCases = 0;

    const language = question.programming_language || 'javascript';

    if (question.question_type === 'mcq') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
      correctnessScore = isCorrect ? 10 : 0;
    } else if (question.question_type === 'fill') {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
      correctnessScore = isCorrect ? 10 : 0;
    } else if (question.question_type === 'image') {
      // For image-based questions, answer is typically a text description or identification
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
      correctnessScore = isCorrect ? 10 : 0;
    } else if (question.question_type === 'crossword') {
      // Validate crossword answers
      isCorrect = evaluateCrosswordAnswer(answer, question.crossword_grid, question.crossword_clues, question.crossword_size);
      correctnessScore = isCorrect ? 10 : 0;
    } else if (question.question_type === 'code') {
      // Enhanced code question evaluation with detailed scoring
      try {
        if (evaluationMode === 'mcq') {
          // Auto-check against key
          isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
          correctnessScore = isCorrect ? 10 : 0;
        } else if (evaluationMode === 'semantic') {
          // AI-based semantic validation with detailed analysis
          isCorrect = await evaluateCodeSemantic(answer, question.correct_answer, question.ai_validation_settings, language, participant.id);
          const analysis = CodeExecutionService.analyzeCode(answer, language, question.correct_answer);

          correctnessScore = (analysis.structureScore + analysis.keywordScore + analysis.similarityScore) / 3;
          codeQualityScore = analysis.complexityScore;
          performanceScore = 0; // Not applicable for semantic evaluation
          isCorrect = correctnessScore >= 6; // Pass threshold

          // Ensure scores don't exceed maximum
          correctnessScore = Math.min(correctnessScore, 10);
          codeQualityScore = Math.min(codeQualityScore, 10);
        } else if (evaluationMode === 'compiler') {
          // Test case validation with detailed metrics
          const testResults = await CodeExecutionService.executeTestCases(answer, language, JSON.parse(question.test_cases || '[]'), participant.id);
          executionResults = JSON.stringify(testResults);

          testCasesPassed = testResults.filter(r => r.success).length;
          totalTestCases = testResults.length;
          const passRate = totalTestCases > 0 ? testCasesPassed / totalTestCases : 0;

          // Calculate metrics
          executionTimeMs = testResults.reduce((sum, r) => sum + (r.executionTime || 0), 0);
          memoryUsedKb = testResults.reduce((sum, r) => sum + (r.memoryUsage || 0), 0) / 1024;

          correctnessScore = passRate * 10;
          performanceScore = Math.max(0, 10 - (executionTimeMs / 1000)); // Penalize slow execution
          codeQualityScore = CodeExecutionService.calculatePartialScore(answer, question.correct_answer, testResults, language, evaluationMode);

          // Ensure scores don't exceed maximum
          correctnessScore = Math.min(correctnessScore, 10);
          performanceScore = Math.min(performanceScore, 10);
          codeQualityScore = Math.min(codeQualityScore, 10);

          isCorrect = passRate >= 0.8; // 80% pass rate required
        } else if (evaluationMode === 'bugfix') {
          // Bug fix validation with detailed analysis
          const validation = await CodeExecutionService.validateBugFix(question.correct_answer || '', answer, question.test_cases || '[]', participant.id);
          executionResults = JSON.stringify(validation);

          correctnessScore = (validation.fixesApplied ? 5 : 0) + (validation.testsPass ? 5 : 0);
          codeQualityScore = validation.improvementScore;
          performanceScore = 0; // Not measured for bug fixes
          testCasesPassed = validation.testsPass ? 1 : 0;
          totalTestCases = 1;

          isCorrect = validation.fixesApplied && validation.testsPass;
        } else {
          // Default to simple text comparison
          isCorrect = answer.toLowerCase().includes(question.correct_answer.toLowerCase());
          correctnessScore = isCorrect ? 10 : 0;
        }

        // Handle execution failures and timeouts
        if (executionResults && JSON.parse(executionResults).some(r => r.error && r.error.includes('timeout'))) {
          performanceScore = Math.max(0, performanceScore - 2); // Penalty for timeouts
          correctnessScore = Math.max(0, correctnessScore - 1); // Minor penalty for timeouts
        }

      } catch (error) {
        console.error('Code evaluation error:', error);
        // On evaluation failure, fall back to partial scoring
        partialScore = calculatePartialScore(answer, question.correct_answer, question.question_type, question.partial_marking_settings);
        correctnessScore = partialScore;
        isCorrect = false;
      }
    } else {
      isCorrect = answer.toLowerCase().trim() === question.correct_answer.toLowerCase().trim();
      correctnessScore = isCorrect ? 10 : 0;
    }

    // Calculate base score with enhanced metrics
    if (isCorrect) {
      scoreEarned = question.marks;
    } else if (question.partial_marking_settings || question.question_type === 'code') {
      // Apply partial marking for incorrect answers
      if (question.question_type === 'code') {
        // For code questions, use the calculated partial score from evaluation
        partialScore = Math.max(partialScore, CodeExecutionService.calculatePartialScore(answer, question.correct_answer, executionResults ? JSON.parse(executionResults) : null, language, evaluationMode));
      } else {
        partialScore = calculatePartialScore(answer, question.correct_answer, question.question_type, question.partial_marking_settings);
      }
      scoreEarned = partialScore;
      // Ensure partial score doesn't exceed question marks
      scoreEarned = Math.min(scoreEarned, question.marks);
    }

    // Apply time decay bonus if enabled
    if (question.time_decay_enabled && scoreEarned > 0) {
      const decayBonus = calculateTimeDecayBonus(timeTaken, question.time_limit, question.time_decay_factor);
      timeBonus = Math.floor(scoreEarned * decayBonus);
      scoreEarned += timeBonus;
    } else if (isCorrect && question.time_limit > 0) {
      // Legacy time-based bonus for backward compatibility
      const timeRatio = Math.max(0, (question.time_limit - timeTaken) / question.time_limit);
      timeBonus = Math.floor(timeRatio * 5); // Max 5 points bonus
      scoreEarned += timeBonus;
    }

    // Hint penalty
    if (hintUsed) {
      scoreEarned -= question.hint_penalty;
    }

    scoreEarned = Math.max(0, scoreEarned);

    // Save answer with detailed scoring information
    await db.runAsync(
      `INSERT INTO answers (
        participant_id, question_id, answer_text, is_correct, score_earned, time_taken, hint_used,
        execution_results, partial_score, code_quality_score, performance_score, correctness_score,
        evaluation_mode, execution_time_ms, memory_used_kb, test_cases_passed, total_test_cases
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        participant.id, questionId, answer, isCorrect, scoreEarned, timeTaken, hintUsed,
        executionResults, partialScore, codeQualityScore, performanceScore, correctnessScore,
        evaluationMode, executionTimeMs, memoryUsedKb, testCasesPassed, totalTestCases
      ]
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

    // Log resource usage for monitoring
    const resourceStats = CodeExecutionService.getResourceStats();
    if (resourceStats.memoryUsage > 50 * 1024 * 1024) { // 50MB
      console.warn('High memory usage detected:', resourceStats);
    }

    res.json({
      submitted: true,
      isCorrect,
      scoreEarned,
      timeBonus,
      partialScore,
      codeQualityScore,
      performanceScore,
      correctnessScore,
      evaluationMode,
      executionTimeMs,
      memoryUsedKb,
      testCasesPassed,
      totalTestCases,
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

    // Get all answers for this participant with detailed scoring information
    const answers = await db.allAsync(
      `SELECT a.*, q.question_text, q.correct_answer, q.marks, q.question_type, q.evaluation_mode
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

    // Calculate code-specific statistics
    const codeQuestions = answers.filter(a => a.question_type === 'code');
    const codeStats = {
      totalCodeQuestions: codeQuestions.length,
      codeCorrectAnswers: codeQuestions.filter(a => a.is_correct).length,
      averageCodeQuality: codeQuestions.length > 0 ? codeQuestions.reduce((sum, a) => sum + (a.code_quality_score || 0), 0) / codeQuestions.length : 0,
      averagePerformance: codeQuestions.length > 0 ? codeQuestions.reduce((sum, a) => sum + (a.performance_score || 0), 0) / codeQuestions.length : 0,
      averageCorrectness: codeQuestions.length > 0 ? codeQuestions.reduce((sum, a) => sum + (a.correctness_score || 0), 0) / codeQuestions.length : 0,
      totalTestCasesPassed: codeQuestions.reduce((sum, a) => sum + (a.test_cases_passed || 0), 0),
      totalTestCases: codeQuestions.reduce((sum, a) => sum + (a.total_test_cases || 0), 0)
    };

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
        totalScore,
        codeStats
      },
      answers: answers.map(a => ({
        questionText: a.question_text,
        yourAnswer: a.answer_text,
        correctAnswer: a.correct_answer,
        isCorrect: a.is_correct,
        scoreEarned: a.score_earned,
        maxScore: a.marks,
        timeTaken: a.time_taken,
        hintUsed: a.hint_used,
        questionType: a.question_type,
        evaluationMode: a.evaluation_mode,
        partialScore: a.partial_score,
        codeQualityScore: a.code_quality_score,
        performanceScore: a.performance_score,
        correctnessScore: a.correctness_score,
        executionTimeMs: a.execution_time_ms,
        memoryUsedKb: a.memory_used_kb,
        testCasesPassed: a.test_cases_passed,
        totalTestCases: a.total_test_cases,
        executionResults: a.execution_results ? JSON.parse(a.execution_results) : null
      }))
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

export default router;