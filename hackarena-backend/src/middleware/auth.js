import jwt from 'jsonwebtoken';
import { db } from '../database/init.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getAsync('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const authenticateParticipant = async (req, res, next) => {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' });
  }

  try {
    const participant = await db.getAsync(
      'SELECT * FROM participants WHERE session_token = ? AND status = "active"', 
      [sessionToken]
    );
    
    if (!participant) {
      return res.status(401).json({ error: 'Invalid session token' });
    }
    
    req.participant = participant;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
};