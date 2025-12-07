import request from 'supertest';
import app from '../src/app';

// Mock the database connection to prevent any connection attempts during tests
jest.mock('../src/db', () => ({
  default: {
    query: jest.fn(),
    getConnection: jest.fn(),
    execute: jest.fn(),
  },
  initializeDatabase: jest.fn(),
}));

describe('Health Check Endpoint', () => {
  it('should return 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});
