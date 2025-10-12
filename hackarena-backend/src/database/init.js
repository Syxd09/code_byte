import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const db = new sqlite3.Database(process.env.DATABASE_URL || './database/hackarena.db');

// Promisify database methods
db.getAsync = promisify(db.get.bind(db));
db.allAsync = promisify(db.all.bind(db));
db.runAsync = promisify(db.run.bind(db));

export async function initializeDatabase() {
  try {
    // Users table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        name TEXT NOT NULL,
        google_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Games table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        game_code TEXT UNIQUE NOT NULL,
        organizer_id INTEGER NOT NULL,
        status TEXT DEFAULT 'draft',
        current_question_index INTEGER DEFAULT 0,
        total_questions INTEGER DEFAULT 0,
        max_participants INTEGER DEFAULT 500,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        ended_at DATETIME,
        FOREIGN KEY (organizer_id) REFERENCES users (id)
      )
    `);

    // Questions table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        question_order INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL,
        options TEXT,
        correct_answer TEXT NOT NULL,
        hint TEXT,
        hint_penalty INTEGER DEFAULT 10,
        time_limit INTEGER DEFAULT 60,
        marks INTEGER DEFAULT 10,
        difficulty TEXT DEFAULT 'medium',
        explanation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id)
      )
    `);

    // Participants table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        total_score INTEGER DEFAULT 0,
        current_rank INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        cheat_warnings INTEGER DEFAULT 0,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        socket_id TEXT,
        session_token TEXT UNIQUE,
        FOREIGN KEY (game_id) REFERENCES games (id)
      )
    `);

    // Answers table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_text TEXT,
        is_correct BOOLEAN DEFAULT FALSE,
        score_earned INTEGER DEFAULT 0,
        time_taken INTEGER,
        hint_used BOOLEAN DEFAULT FALSE,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (participant_id) REFERENCES participants (id),
        FOREIGN KEY (question_id) REFERENCES questions (id)
      )
    `);

    // Game sessions table for real-time state
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        current_question_id INTEGER,
        question_started_at DATETIME,
        question_ends_at DATETIME,
        answers_revealed BOOLEAN DEFAULT FALSE,
        total_participants INTEGER DEFAULT 0,
        answered_participants INTEGER DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games (id),
        FOREIGN KEY (current_question_id) REFERENCES questions (id)
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export { db };