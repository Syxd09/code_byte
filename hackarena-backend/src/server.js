import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/init.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/games.js';
import participantRoutes from './routes/participants.js';
import analyticsRoutes from './routes/analytics.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.VERCEL ? 'https://code-byte-navy.vercel.app' : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Initialize Database
try {
  await initializeDatabase();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Database initialization failed:', error);
  // Continue execution for serverless functions
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'HackArena Backend is running' });
});

// Export for Vercel serverless functions
export default app;