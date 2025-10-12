import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import gamesRoutes from '../src/routes/games.js';
import { db } from '../src/database/init.js';

// Mock the database
jest.mock('../src/database/init.js', () => ({
  db: {
    getAsync: jest.fn(),
    allAsync: jest.fn(),
    runAsync: jest.fn(),
  },
}));

// Mock QRCode
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock-qr-code'),
}));

// Mock socket.io
jest.mock('../src/server.js', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/games', gamesRoutes);

// Mock authentication middleware
jest.mock('../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 1, email: 'organizer@example.com', name: 'Test Organizer' };
    next();
  },
}));

describe('Games API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /games', () => {
    it('should create a new game successfully', async () => {
      const gameData = {
        title: 'Test Hackathon',
        description: 'A test game',
        maxParticipants: 100,
        qualificationType: 'top_n',
        qualificationThreshold: 10
      };

      const mockResult = { lastID: 1 };

      db.runAsync.mockResolvedValue(mockResult);
      db.getAsync.mockResolvedValue({
        id: 1,
        title: gameData.title,
        description: gameData.description,
        game_code: 'ABC12345',
        organizer_id: 1,
        max_participants: gameData.maxParticipants,
        qualification_type: gameData.qualificationType,
        qualification_threshold: gameData.qualificationThreshold
      });

      const response = await request(app)
        .post('/games')
        .send(gameData);

      expect(response.status).toBe(201);
      expect(response.body.title).toBe(gameData.title);
      expect(response.body.game_code).toBeDefined();
      expect(response.body.qrCode).toBeDefined();
      expect(response.body.joinUrl).toBeDefined();
    });

    it('should return error for missing title', async () => {
      const response = await request(app)
        .post('/games')
        .send({ description: 'No title provided' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Title is required');
    });
  });

  describe('GET /games', () => {
    it('should return games for organizer', async () => {
      const mockGames = [
        {
          id: 1,
          title: 'Game 1',
          participant_count: 50,
          question_count: 10
        },
        {
          id: 2,
          title: 'Game 2',
          participant_count: 30,
          question_count: 8
        }
      ];

      db.allAsync.mockResolvedValue(mockGames);

      const response = await request(app)
        .get('/games');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockGames);
    });
  });

  describe('POST /games/:gameId/questions', () => {
    it('should add a question to game', async () => {
      const questionData = {
        questionText: 'What is 2+2?',
        questionType: 'mcq',
        options: ['3', '4', '5', '6'],
        correctAnswer: '4',
        marks: 10,
        timeLimit: 60,
        evaluationMode: 'mcq'
      };

      db.getAsync.mockResolvedValue({ count: 0 }); // No existing questions
      db.runAsync.mockResolvedValue({ lastID: 1 });
      db.getAsync.mockResolvedValue({
        id: 1,
        ...questionData,
        options: JSON.stringify(questionData.options)
      });

      const response = await request(app)
        .post('/games/1/questions')
        .send(questionData);

      expect(response.status).toBe(201);
      expect(response.body.question_text).toBe(questionData.questionText);
      expect(response.body.options).toEqual(questionData.options);
    });

    it('should handle advanced question types', async () => {
      const advancedQuestion = {
        questionText: 'Write a function to reverse a string',
        questionType: 'coding',
        correctAnswer: 'function reverse(str) { return str.split("").reverse().join(""); }',
        marks: 20,
        timeLimit: 300,
        evaluationMode: 'ai_validation',
        aiValidationSettings: {
          language: 'javascript',
          testCases: [
            { input: '"hello"', expected: '"olleh"' },
            { input: '"world"', expected: '"dlrow"' }
          ]
        }
      };

      db.getAsync.mockResolvedValue({ count: 0 });
      db.runAsync.mockResolvedValue({ lastID: 1 });
      db.getAsync.mockResolvedValue({
        id: 1,
        ...advancedQuestion,
        options: null,
        ai_validation_settings: JSON.stringify(advancedQuestion.aiValidationSettings)
      });

      const response = await request(app)
        .post('/games/1/questions')
        .send(advancedQuestion);

      expect(response.status).toBe(201);
      expect(response.body.evaluation_mode).toBe('ai_validation');
      expect(response.body.ai_validation_settings).toBeDefined();
    });
  });

  describe('POST /games/:gameId/start', () => {
    it('should start the game successfully', async () => {
      const mockQuestion = {
        id: 1,
        question_text: 'Test Question',
        options: '["A", "B", "C", "D"]',
        time_limit: 60
      };

      db.runAsync.mockResolvedValue({});
      db.getAsync.mockResolvedValue(mockQuestion);

      const response = await request(app)
        .post('/games/1/start');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Game started successfully');

      // Verify socket emission
      const { io } = require('../src/server.js');
      expect(io.to).toHaveBeenCalledWith('game-1');
      expect(io.emit).toHaveBeenCalledWith('gameStarted', expect.any(Object));
    });
  });

  describe('POST /games/:gameId/end', () => {
    it('should end the game and apply qualification rules', async () => {
      db.runAsync.mockResolvedValue({});

      const response = await request(app)
        .post('/games/1/end');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Game ended successfully');

      // Verify socket emission
      const { io } = require('../src/server.js');
      expect(io.to).toHaveBeenCalledWith('game-1');
      expect(io.emit).toHaveBeenCalledWith('gameEnded');
    });
  });

  describe('GET /games/:gameCode/leaderboard', () => {
    it('should return public leaderboard', async () => {
      const mockGame = { id: 1 };
      const mockLeaderboard = [
        { name: 'Alice', avatar: 'avatar1.jpg', total_score: 100, current_rank: 1, status: 'active' },
        { name: 'Bob', avatar: 'avatar2.jpg', total_score: 90, current_rank: 2, status: 'active' }
      ];

      db.getAsync.mockResolvedValue(mockGame);
      db.allAsync.mockResolvedValue(mockLeaderboard);

      const response = await request(app)
        .get('/games/ABC12345/leaderboard');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockLeaderboard);
    });

    it('should return error for invalid game code', async () => {
      db.getAsync.mockResolvedValue(null);

      const response = await request(app)
        .get('/games/INVALID/leaderboard');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Game not found');
    });
  });

  describe('Participant Rejoin During Active Game', () => {
    let participantToken;
    let gameId;
    let participantId;

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
    });

    it('should allow participant to join game', async () => {
      // Mock game creation
      const mockGame = {
        id: 1,
        game_code: 'TEST123',
        title: 'Test Game',
        status: 'waiting',
        max_participants: 100
      };

      db.getAsync
        .mockResolvedValueOnce(mockGame) // Check game exists
        .mockResolvedValueOnce({ count: 0 }); // No existing participants with same name

      db.runAsync.mockResolvedValue({ lastID: 1 });
      db.getAsync.mockResolvedValue({
        id: 1,
        name: 'Test Participant',
        avatar: '👨‍💻',
        game_id: 1,
        session_token: 'test-token-123'
      });

      const response = await request(app)
        .post('/participants/join')
        .send({
          gameCode: 'TEST123',
          name: 'Test Participant'
        });

      expect(response.status).toBe(201);
      expect(response.body.participant).toBeDefined();
      expect(response.body.sessionToken).toBeDefined();

      participantToken = response.body.sessionToken;
      gameId = response.body.participant.gameId;
      participantId = response.body.participant.id;
    });

    it('should start game and emit gameStarted event', async () => {
      // Mock game start
      const mockQuestion = {
        id: 1,
        question_text: 'Test Question?',
        options: '["A", "B", "C", "D"]',
        time_limit: 60,
        marks: 10
      };

      db.runAsync.mockResolvedValue({});
      db.getAsync.mockResolvedValue(mockQuestion);

      const response = await request(app)
        .post(`/games/${gameId}/start`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Game started successfully');

      // Verify socket emission
      const { io } = require('../src/server.js');
      expect(io.to).toHaveBeenCalledWith(`game-${gameId}`);
      expect(io.emit).toHaveBeenCalledWith('gameStarted', expect.objectContaining({
        question: expect.objectContaining({
          id: 1,
          question_text: 'Test Question?'
        })
      }));
    });

    it('should allow participant to rejoin during active game and receive current question', async () => {
      // Mock rejoin scenario - game is active with current question
      const mockGame = {
        id: gameId,
        status: 'active',
        title: 'Test Game'
      };

      const mockSession = {
        current_question_id: 1,
        answers_revealed: false,
        question_ends_at: new Date(Date.now() + 60000).toISOString() // 1 minute from now
      };

      const mockQuestion = {
        id: 1,
        question_text: 'Test Question?',
        question_type: 'mcq',
        options: '["A", "B", "C", "D"]',
        correct_answer: 'A',
        time_limit: 60,
        marks: 10,
        question_order: 1
      };

      // Mock database calls for rejoin
      db.getAsync
        .mockResolvedValueOnce(mockGame) // Get game
        .mockResolvedValueOnce(mockSession) // Get session
        .mockResolvedValueOnce(null); // No existing answer for this question

      // Mock participant authentication
      const mockParticipant = {
        id: participantId,
        name: 'Test Participant',
        avatar: '👨‍💻',
        game_id: gameId,
        total_score: 0,
        current_rank: 1,
        status: 'active'
      };

      // Mock auth middleware
      jest.mock('../src/middleware/auth.js', () => ({
        authenticateParticipant: (req, res, next) => {
          req.participant = mockParticipant;
          next();
        }
      }));

      const response = await request(app)
        .post('/participants/rejoin')
        .set('x-session-token', participantToken);

      expect(response.status).toBe(200);
      expect(response.body.participant).toBeDefined();
      expect(response.body.currentQuestion).toBeDefined();
      expect(response.body.currentQuestion.question_text).toBe('Test Question?');
      expect(response.body.currentQuestion.options).toEqual(["A", "B", "C", "D"]);
      expect(response.body.gameCode).toBeDefined();
    });

    it('should handle participant socket connection and room joining', async () => {
      // Mock socket connection setup
      const mockSocket = {
        id: 'socket-123',
        join: jest.fn(),
        emit: jest.fn(),
        on: jest.fn()
      };

      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };

      // Mock database calls for socket handler
      const mockParticipant = {
        id: participantId,
        name: 'Test Participant',
        game_id: gameId,
        socket_id: null
      };

      db.getAsync
        .mockResolvedValueOnce({ id: gameId }) // Game exists
        .mockResolvedValueOnce(mockParticipant); // Participant exists

      db.runAsync.mockResolvedValue({});
      db.getAsync.mockResolvedValue({ count: 1 }); // Participant count

      // Import and test socket handler
      const { setupSocketHandlers } = require('../src/socket/socketHandlers');
      setupSocketHandlers(mockIo);

      // Simulate socket connection and joinGameRoom event
      const connectionCallback = mockIo.on.mock.calls.find(call => call[0] === 'connection')[1];
      connectionCallback(mockSocket);

      // Simulate joinGameRoom event
      const joinGameRoomCallback = mockSocket.on.mock.calls.find(call => call[0] === 'joinGameRoom')[1];
      joinGameRoomCallback({
        gameCode: 'TEST123',
        participantId: participantId,
        role: 'participant'
      });

      // Verify socket room joining
      expect(mockSocket.join).toHaveBeenCalledWith(`game-${gameId}`);
      expect(mockSocket.participantId).toBe(participantId);
      expect(mockSocket.gameId).toBe(gameId);

      // Verify participant count update emission
      expect(mockIo.to).toHaveBeenCalledWith(`organizer-${gameId}`);
      expect(mockIo.emit).toHaveBeenCalledWith('participantCountUpdate', { count: 1 });
    });
  });
});