// Diagnostic logging for platform compatibility
console.log('Node.js version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Environment:', process.env.NODE_ENV || 'development');

// Check for sqlite3 native module
try {
  const sqlite3 = await import('sqlite3');
  console.log('SQLite3 module loaded successfully');
  console.log('SQLite3 version:', sqlite3.default?.VERSION || 'unknown');
} catch (error) {
  console.error('Failed to load SQLite3 module:', error.message);
  console.error('This may indicate a platform compatibility issue with native binaries');
  // Continue execution - database init will handle this
}
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database/init.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/games.js';
import participantRoutes from './routes/participants.js';
import analyticsRoutes from './routes/analytics.js';
import { setupSocketHandlers } from './socket/socketHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: 'https://code-byte-navy.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize Database
await initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'HackArena Backend is running' });
});

// Socket.IO Setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`HackArena Backend running on port ${PORT}`);
});

export { io };