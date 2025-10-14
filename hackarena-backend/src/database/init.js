import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle serverless deployment paths
const isVercel = process.env.VERCEL === '1';
const isRender = process.env.RENDER === 'true';
const isServerless = isVercel || isRender;

let dbPath;
if (isVercel) {
  dbPath = '/tmp/hackarena.db';  // Vercel writable directory
} else if (isRender) {
  dbPath = process.env.DATABASE_URL || '/opt/render/project/src/database/hackarena.db';
} else {
  dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../database/hackarena.db');
}

console.log('Database path:', dbPath);
console.log('Is Vercel environment:', isVercel);
console.log('Is Render environment:', isRender);
console.log('Is serverless environment:', isServerless);

const db = new sqlite3.Database(dbPath);

// Promisify database methods
db.getAsync = promisify(db.get.bind(db));
db.allAsync = promisify(db.all.bind(db));

// Custom runAsync using promisify for proper error handling
const runAsync = promisify((sql, params, callback) => {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }
  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { lastID: this.lastID, changes: this.changes });
    }
  });
});
db.runAsync = runAsync;

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
        qualification_type TEXT DEFAULT 'none',
        qualification_threshold INTEGER DEFAULT 0,
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
        evaluation_mode TEXT DEFAULT 'mcq',
        test_cases TEXT,
        ai_validation_settings TEXT,
        image_url TEXT,
        crossword_grid TEXT,
        crossword_clues TEXT,
        crossword_size TEXT,
        partial_marking_settings TEXT,
        time_decay_enabled BOOLEAN DEFAULT FALSE,
        time_decay_factor DECIMAL(3,2) DEFAULT 0.1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id)
      )
    `);

    // Add new columns to existing questions table if they don't exist
    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN evaluation_mode TEXT DEFAULT 'mcq'`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN test_cases TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN ai_validation_settings TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN image_url TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN crossword_grid TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN crossword_clues TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN crossword_size TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN partial_marking_settings TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN time_decay_enabled BOOLEAN DEFAULT FALSE`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN time_decay_factor DECIMAL(3,2) DEFAULT 0.1`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Add new columns for code evaluation configuration
    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN code_languages TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN code_timeout INTEGER DEFAULT 30`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN code_memory_limit INTEGER DEFAULT 256`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE questions ADD COLUMN code_template TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE game_sessions ADD COLUMN paused_at DATETIME`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE games ADD COLUMN qualification_type TEXT DEFAULT 'none'`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE games ADD COLUMN qualification_threshold INTEGER DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE participants ADD COLUMN qualified BOOLEAN DEFAULT FALSE`);
    } catch (error) {
      // Column might already exist, ignore error
    }

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
        qualified BOOLEAN DEFAULT FALSE,
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

    // Add new columns for detailed code scoring
    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN execution_results TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN partial_score DECIMAL(5,2) DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN code_quality_score DECIMAL(5,2) DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN performance_score DECIMAL(5,2) DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN correctness_score DECIMAL(5,2) DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN evaluation_mode TEXT`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN execution_time_ms INTEGER DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN memory_used_kb INTEGER DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN test_cases_passed INTEGER DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    try {
      await db.runAsync(`ALTER TABLE answers ADD COLUMN total_test_cases INTEGER DEFAULT 0`);
    } catch (error) {
      // Column might already exist, ignore error
    }

    // Game sessions table for real-time state
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        current_question_id INTEGER,
        question_started_at DATETIME,
        question_ends_at DATETIME,
        paused_at DATETIME,
        answers_revealed BOOLEAN DEFAULT FALSE,
        total_participants INTEGER DEFAULT 0,
        answered_participants INTEGER DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games (id),
        FOREIGN KEY (current_question_id) REFERENCES questions (id)
      )
    `);

    // Code execution results table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS code_execution_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        answer_id INTEGER NOT NULL,
        language TEXT NOT NULL,
        code TEXT NOT NULL,
        execution_time DECIMAL(5,2),
        memory_used INTEGER,
        output TEXT,
        error_message TEXT,
        test_case_passed BOOLEAN DEFAULT FALSE,
        test_case_input TEXT,
        test_case_expected_output TEXT,
        test_case_actual_output TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (answer_id) REFERENCES answers (id)
      )
    `);

    // Supported languages table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS supported_languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_name TEXT UNIQUE NOT NULL,
        language_code TEXT UNIQUE NOT NULL,
        version TEXT,
        compiler_flags TEXT,
        timeout_multiplier DECIMAL(3,2) DEFAULT 1.0,
        memory_multiplier DECIMAL(3,2) DEFAULT 1.0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Code templates table
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS code_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id INTEGER NOT NULL,
        template_name TEXT NOT NULL,
        template_code TEXT NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (language_id) REFERENCES supported_languages (id)
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export { db };