import { db } from '../database/init.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join game room
    socket.on('joinGameRoom', async (data) => {
      try {
        const { gameCode, participantId, role } = data;
        console.log('🏠 Socket joinGameRoom event received:', data);

        if (role === 'organizer') {
          const game = await db.getAsync(
            'SELECT * FROM games WHERE game_code = ?',
            [gameCode]
          );

          if (game) {
            socket.join(`game-${game.id}`);
            socket.join(`organizer-${game.id}`);
            console.log(`👑 Organizer joined game room: game-${game.id}`);
          }
        } else if (role === 'participant' && participantId) {
          const participant = await db.getAsync(
            'SELECT * FROM participants WHERE id = ?',
            [participantId]
          );

          if (participant) {
            // Update socket ID for reconnection handling
            await db.runAsync(
              'UPDATE participants SET socket_id = ? WHERE id = ?',
              [socket.id, participantId]
            );

            socket.join(`game-${participant.game_id}`);
            socket.participantId = participantId;
            socket.gameId = participant.game_id;

            console.log(`👤 Participant ${participant.name} joined game room: game-${participant.game_id}`);
            console.log(`🔗 Socket ID: ${socket.id}, Participant ID: ${participantId}`);

            // Emit participant count update to organizers
            const participantCount = await db.getAsync(
              'SELECT COUNT(*) as count FROM participants WHERE game_id = ? AND status = "active"',
              [participant.game_id]
            );

            io.to(`organizer-${participant.game_id}`).emit('participantCountUpdate', {
              count: participantCount.count
            });
          } else {
            console.log('❌ Participant not found for ID:', participantId);
          }
        } else if (role === 'viewer') {
          const game = await db.getAsync(
            'SELECT * FROM games WHERE game_code = ?',
            [gameCode]
          );

          if (game) {
            socket.join(`game-${game.id}`);
            console.log(`👀 Viewer joined game room: game-${game.id}`);
          }
        }
      } catch (error) {
        console.error('❌ Join room error:', error);
        socket.emit('error', { message: 'Failed to join game room' });
      }
    });

    // Handle real-time cheat detection
    // Implements progressive penalty system for maintaining game integrity
    // Warning levels: 1st warning (10pts), 2nd warning (15pts), 3rd+ warning (flagged)
    socket.on('cheatDetected', async (data) => {
      try {
        // Only process cheat detection for authenticated participants
        if (!socket.participantId) return;

        const { type, timestamp } = data;

        // Fetch participant details for penalty calculation
        const participant = await db.getAsync(
          'SELECT * FROM participants WHERE id = ?',
          [socket.participantId]
        );

        if (!participant) return;

        // Calculate new warning count and determine penalty
        const newWarningCount = participant.cheat_warnings + 1;
        let penaltyScore = 0;
        let status = 'active';

        // Progressive penalty system:
        // - 1st violation: 10 point deduction (warning)
        // - 2nd violation: 15 point deduction (severe warning)
        // - 3rd+ violation: Participant flagged for organizer review (no longer active)
        if (newWarningCount === 1) {
          penaltyScore = 10;
        } else if (newWarningCount === 2) {
          penaltyScore = 15;
        } else if (newWarningCount >= 3) {
          status = 'flagged';

          // Alert organizer about severely flagged participant
          io.to(`organizer-${socket.gameId}`).emit('participantFlagged', {
            participantId: socket.participantId,
            name: participant.name,
            cheatType: type,
            warningCount: newWarningCount
          });
        }

        // Apply penalty and update participant status
        await db.runAsync(
          `UPDATE participants SET
           cheat_warnings = ?,
           total_score = total_score - ?,
           status = ?
           WHERE id = ?`,
          [newWarningCount, penaltyScore, status, socket.participantId]
        );

        // Notify the participant of their penalty
        socket.emit('cheatPenalty', {
          warningCount: newWarningCount,
          penalty: penaltyScore,
          message: getCheatMessage(newWarningCount)
        });

        console.log(`Cheat detected for participant ${participant.name}: ${type}`);

      } catch (error) {
        console.error('Cheat detection error:', error);
      }
    });

    // Handle organizer actions
    socket.on('eliminateParticipant', async (data) => {
      try {
        const { participantId, gameId } = data;
        
        await db.runAsync(
          'UPDATE participants SET status = "eliminated" WHERE id = ? AND game_id = ?',
          [participantId, gameId]
        );

        // Get participant socket and disconnect
        const participant = await db.getAsync(
          'SELECT * FROM participants WHERE id = ?',
          [participantId]
        );
        
        if (participant && participant.socket_id) {
          io.to(participant.socket_id).emit('eliminated', {
            message: 'You have been eliminated by the organizer'
          });
        }

        // Update organizer with new participant list
        const participants = await db.allAsync(
          'SELECT id, name, avatar, total_score, current_rank, status, cheat_warnings FROM participants WHERE game_id = ? ORDER BY total_score DESC',
          [gameId]
        );

        io.to(`organizer-${gameId}`).emit('participantsUpdate', participants);
        
      } catch (error) {
        console.error('Eliminate participant error:', error);
      }
    });

    socket.on('warnParticipant', async (data) => {
      try {
        const { participantId, gameId, customPenalty } = data;

        const penalty = customPenalty || 5;

        await db.runAsync(
          'UPDATE participants SET total_score = total_score - ?, cheat_warnings = cheat_warnings + 1 WHERE id = ? AND game_id = ?',
          [penalty, participantId, gameId]
        );

        const participant = await db.getAsync(
          'SELECT * FROM participants WHERE id = ?',
          [participantId]
        );

        if (participant && participant.socket_id) {
          io.to(participant.socket_id).emit('organiserWarning', {
            penalty,
            message: `You received a warning from the organizer. ${penalty} points deducted.`
          });
        }

      } catch (error) {
        console.error('Warn participant error:', error);
      }
    });

    socket.on('reAdmitParticipant', async (data) => {
      try {
        const { participantId, gameId } = data;

        // Re-admit the participant
        await db.runAsync(
          'UPDATE participants SET status = "active" WHERE id = ? AND game_id = ?',
          [participantId, gameId]
        );

        // Get updated participant info
        const participant = await db.getAsync(
          'SELECT * FROM participants WHERE id = ?',
          [participantId]
        );

        // Notify the re-admitted participant
        if (participant && participant.socket_id) {
          io.to(participant.socket_id).emit('reAdmitted', {
            message: 'You have been re-admitted to the game by the organizer'
          });
        }

        // Update organizer with new participant list
        const participants = await db.allAsync(
          'SELECT id, name, avatar, total_score, current_rank, status, cheat_warnings FROM participants WHERE game_id = ? ORDER BY total_score DESC',
          [gameId]
        );

        io.to(`organizer-${gameId}`).emit('participantsUpdate', participants);

        console.log(`Participant ${participant.name} re-admitted to game ${gameId}`);

      } catch (error) {
        console.error('Re-admit participant error:', error);
      }
    });

    // Handle question time expiry
    socket.on('questionTimeExpired', async (data) => {
      try {
        const { gameId, questionId } = data;

        console.log('Server received questionTimeExpired event for game:', gameId, 'question:', questionId);

        // Auto-submit blank answers for participants who haven't answered
        const unansweredParticipants = await db.allAsync(
          `SELECT p.id FROM participants p
           WHERE p.game_id = ? AND p.status = 'active'
           AND p.id NOT IN (
             SELECT a.participant_id FROM answers a WHERE a.question_id = ?
           )`,
          [gameId, questionId]
        );

        console.log('Unanswered participants count:', unansweredParticipants.length);

        for (const participant of unansweredParticipants) {
          await db.runAsync(
            'INSERT INTO answers (participant_id, question_id, answer_text, is_correct, score_earned, time_taken) VALUES (?, ?, "", 0, 0, 0)',
            [participant.id, questionId]
          );
        }

        // Emit time expired to all participants
        console.log('Emitting questionTimeExpired to all participants in game:', gameId);
        io.to(`game-${gameId}`).emit('questionTimeExpired');

      } catch (error) {
        console.error('Question time expired error:', error);
      }
    });

    // Handle live analytics requests
    socket.on('requestLiveAnalytics', async (data) => {
      try {
        const { gameId } = data;
        
        // Get current question analytics
        const session = await db.getAsync(
          'SELECT * FROM game_sessions WHERE game_id = ?',
          [gameId]
        );

        if (session && session.current_question_id) {
          const questionAnalytics = await db.getAsync(
            `SELECT 
               q.question_text,
               q.marks,
               COUNT(a.id) as total_attempts,
               COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as correct_attempts,
               AVG(a.time_taken) as avg_time,
               AVG(a.score_earned) as avg_score
             FROM questions q
             LEFT JOIN answers a ON q.id = a.question_id
             WHERE q.id = ?
             GROUP BY q.id`,
            [session.current_question_id]
          );

          socket.emit('liveAnalytics', {
            currentQuestion: questionAnalytics,
            totalParticipants: session.total_participants,
            answeredParticipants: session.answered_participants
          });
        }
        
      } catch (error) {
        console.error('Live analytics error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      // Update participant socket status
      if (socket.participantId) {
        db.runAsync(
          'UPDATE participants SET socket_id = NULL WHERE id = ?',
          [socket.participantId]
        ).catch(console.error);
      }
    });
  });
}

function getCheatMessage(warningCount) {
  switch (warningCount) {
    case 1:
      return 'First warning: Avoid suspicious activities. 10 points deducted.';
    case 2:
      return 'Second warning: Please follow game rules. 15 points deducted.';
    default:
      return 'Multiple violations detected. You have been flagged for organizer review.';
  }
}