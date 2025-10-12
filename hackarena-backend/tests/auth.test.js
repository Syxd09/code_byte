import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';
import authRoutes from '../src/routes/auth.js';
import { db } from '../src/database/init.js';

// Mock the database
jest.mock('../src/database/init.js', () => ({
  db: {
    getAsync: jest.fn(),
    runAsync: jest.fn(),
  },
}));

// Mock Google OAuth2Client
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Authentication Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      db.getAsync.mockResolvedValue(null); // No existing user
      db.runAsync.mockResolvedValue({ lastID: 1 });

      const response = await request(app)
        .post('/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created successfully');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toEqual({
        id: 1,
        email: userData.email,
        name: userData.name
      });
    });

    it('should return error for missing fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('All fields are required');
    });

    it('should return error for existing user', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User'
      };

      db.getAsync.mockResolvedValue({ id: 1, email: userData.email });

      const response = await request(app)
        .post('/auth/register')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User already exists');
    });
  });

  describe('POST /auth/login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const hashedPassword = await bcrypt.hash(loginData.password, 12);
      const user = {
        id: 1,
        email: loginData.email,
        name: 'Test User',
        password: hashedPassword
      };

      db.getAsync.mockResolvedValue(user);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name
      });
    });

    it('should return error for invalid credentials', async () => {
      db.getAsync.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /auth/google', () => {
    it('should authenticate with Google successfully for new user', async () => {
      const googleData = { idToken: 'valid-token' };
      const payload = {
        sub: 'google-id-123',
        email: 'google@example.com',
        name: 'Google User'
      };

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue(payload)
      };

      const { OAuth2Client } = require('google-auth-library');
      const mockClient = new OAuth2Client();
      mockClient.verifyIdToken.mockResolvedValue(mockTicket);

      db.getAsync.mockResolvedValueOnce(null); // No user with Google ID
      db.getAsync.mockResolvedValueOnce(null); // No user with email
      db.runAsync.mockResolvedValue({ lastID: 1 });

      const response = await request(app)
        .post('/auth/google')
        .send(googleData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Google authentication successful');
      expect(response.body.token).toBeDefined();
    });

    it('should link Google account to existing user', async () => {
      const googleData = { idToken: 'valid-token' };
      const payload = {
        sub: 'google-id-123',
        email: 'existing@example.com',
        name: 'Existing User'
      };

      const mockTicket = {
        getPayload: jest.fn().mockReturnValue(payload)
      };

      const { OAuth2Client } = require('google-auth-library');
      const mockClient = new OAuth2Client();
      mockClient.verifyIdToken.mockResolvedValue(mockTicket);

      const existingUser = { id: 1, email: payload.email, name: payload.name };

      db.getAsync.mockResolvedValueOnce(null); // No user with Google ID
      db.getAsync.mockResolvedValueOnce(existingUser); // Existing user with email
      db.runAsync.mockResolvedValue({});

      const response = await request(app)
        .post('/auth/google')
        .send(googleData);

      expect(response.status).toBe(200);
      expect(db.runAsync).toHaveBeenCalledWith(
        'UPDATE users SET google_id = ? WHERE id = ?',
        [payload.sub, existingUser.id]
      );
    });
  });
});