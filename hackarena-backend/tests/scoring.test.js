import { jest } from '@jest/globals';
import { updateLeaderboard, applyQualificationRules } from '../src/routes/games.js';
import { db } from '../src/database/init.js';

// Mock the database
jest.mock('../src/database/init.js', () => ({
  db: {
    allAsync: jest.fn(),
    runAsync: jest.fn(),
    getAsync: jest.fn(),
  },
}));

// Mock socket.io
jest.mock('../src/server.js', () => ({
  io: {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  },
}));

describe('Scoring and Evaluation Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateLeaderboard', () => {
    it('should update participant ranks correctly', async () => {
      const gameId = 1;
      const participants = [
        { id: 1, total_score: 100 },
        { id: 2, total_score: 80 },
        { id: 3, total_score: 90 },
        { id: 4, total_score: 70 }
      ];

      const expectedLeaderboard = [
        { name: 'Alice', avatar: 'avatar1.jpg', total_score: 100, current_rank: 1 },
        { name: 'Bob', avatar: 'avatar2.jpg', total_score: 90, current_rank: 2 },
        { name: 'Charlie', avatar: 'avatar3.jpg', total_score: 80, current_rank: 3 },
        { name: 'David', avatar: 'avatar4.jpg', total_score: 70, current_rank: 4 }
      ];

      db.allAsync
        .mockResolvedValueOnce(participants) // First call for participants
        .mockResolvedValueOnce(expectedLeaderboard); // Second call for leaderboard

      await updateLeaderboard(gameId);

      // Verify rank updates
      expect(db.runAsync).toHaveBeenCalledTimes(4);
      expect(db.runAsync).toHaveBeenNthCalledWith(1, 'UPDATE participants SET current_rank = ? WHERE id = ?', [1, 1]);
      expect(db.runAsync).toHaveBeenNthCalledWith(2, 'UPDATE participants SET current_rank = ? WHERE id = ?', [2, 3]);
      expect(db.runAsync).toHaveBeenNthCalledWith(3, 'UPDATE participants SET current_rank = ? WHERE id = ?', [3, 2]);
      expect(db.runAsync).toHaveBeenNthCalledWith(4, 'UPDATE participants SET current_rank = ? WHERE id = ?', [4, 4]);
    });

    it('should emit leaderboard update to game room', async () => {
      const gameId = 1;
      const participants = [{ id: 1, total_score: 100 }];
      const leaderboard = [{ name: 'Alice', avatar: 'avatar1.jpg', total_score: 100, current_rank: 1 }];

      db.allAsync
        .mockResolvedValueOnce(participants)
        .mockResolvedValueOnce(leaderboard);

      await updateLeaderboard(gameId);

      const { io } = require('../src/server.js');
      expect(io.to).toHaveBeenCalledWith(`game-${gameId}`);
      expect(io.emit).toHaveBeenCalledWith('leaderboardUpdate', leaderboard);
    });
  });

  describe('applyQualificationRules', () => {
    it('should qualify top N participants', async () => {
      const gameId = 1;
      const game = { qualification_type: 'top_n', qualification_threshold: 3 };
      const participants = [
        { id: 1, total_score: 100 },
        { id: 2, total_score: 90 },
        { id: 3, total_score: 80 },
        { id: 4, total_score: 70 },
        { id: 5, total_score: 60 }
      ];

      db.getAsync
        .mockResolvedValueOnce(game) // Game details
        .mockResolvedValueOnce(participants); // Participants

      await applyQualificationRules(gameId);

      // Should qualify top 3 participants
      expect(db.runAsync).toHaveBeenCalledTimes(5);
      expect(db.runAsync).toHaveBeenNthCalledWith(1, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [1]);
      expect(db.runAsync).toHaveBeenNthCalledWith(2, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [2]);
      expect(db.runAsync).toHaveBeenNthCalledWith(3, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [3]);
      expect(db.runAsync).toHaveBeenNthCalledWith(4, 'UPDATE participants SET qualified = FALSE WHERE id = ?', [4]);
      expect(db.runAsync).toHaveBeenNthCalledWith(5, 'UPDATE participants SET qualified = FALSE WHERE id = ?', [5]);
    });

    it('should qualify top percentage of participants', async () => {
      const gameId = 1;
      const game = { qualification_type: 'top_percentage', qualification_threshold: 50 }; // Top 50%
      const participants = [
        { id: 1, total_score: 100 },
        { id: 2, total_score: 90 },
        { id: 3, total_score: 80 },
        { id: 4, total_score: 70 }
      ];

      db.getAsync
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(participants);

      await applyQualificationRules(gameId);

      // Should qualify top 2 participants (50% of 4)
      expect(db.runAsync).toHaveBeenCalledTimes(4);
      expect(db.runAsync).toHaveBeenNthCalledWith(1, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [1]);
      expect(db.runAsync).toHaveBeenNthCalledWith(2, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [2]);
      expect(db.runAsync).toHaveBeenNthCalledWith(3, 'UPDATE participants SET qualified = FALSE WHERE id = ?', [3]);
      expect(db.runAsync).toHaveBeenNthCalledWith(4, 'UPDATE participants SET qualified = FALSE WHERE id = ?', [4]);
    });

    it('should qualify participants above custom threshold', async () => {
      const gameId = 1;
      const game = { qualification_type: 'custom_threshold', qualification_threshold: 85 };
      const participants = [
        { id: 1, total_score: 100 },
        { id: 2, total_score: 90 },
        { id: 3, total_score: 80 },
        { id: 4, total_score: 95 }
      ];

      db.getAsync
        .mockResolvedValueOnce(game)
        .mockResolvedValueOnce(participants);

      await applyQualificationRules(gameId);

      // Should qualify participants with score >= 85 (IDs 1, 2, 4)
      expect(db.runAsync).toHaveBeenCalledTimes(4);
      expect(db.runAsync).toHaveBeenNthCalledWith(1, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [1]);
      expect(db.runAsync).toHaveBeenNthCalledWith(2, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [2]);
      expect(db.runAsync).toHaveBeenNthCalledWith(3, 'UPDATE participants SET qualified = FALSE WHERE id = ?', [3]);
      expect(db.runAsync).toHaveBeenNthCalledWith(4, 'UPDATE participants SET qualified = TRUE WHERE id = ?', [4]);
    });

    it('should do nothing for qualification_type none', async () => {
      const gameId = 1;
      const game = { qualification_type: 'none', qualification_threshold: 0 };

      db.getAsync.mockResolvedValueOnce(game);

      await applyQualificationRules(gameId);

      // Should not update any participants
      expect(db.runAsync).not.toHaveBeenCalled();
    });
  });
});