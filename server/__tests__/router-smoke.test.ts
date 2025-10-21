import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';

import { registerRoutes } from '../routes';

const mockIsAuthenticated = jest.fn((req: any, res: any, next: any) => {
  res.status(401).json({ message: 'Unauthorized' });
});

jest.mock('../replitAuth', () => ({
  setupAuth: jest.fn<(app: Express) => Promise<void>>().mockResolvedValue(undefined),
  isAuthenticated: (req: any, res: any, next: any) => mockIsAuthenticated(req, res, next)
}));

describe('domain router smoke tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  it('mounts policies router', async () => {
    const response = await request(app).get('/api/tenants/testTenant/policies');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Unauthorized' });
  });

  it('mounts eligibility router', async () => {
    const response = await request(app)
      .post('/api/encounters/testEncounter/analyze-eligibility')
      .send({});
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Unauthorized' });
  });

  it('mounts documents router', async () => {
    const response = await request(app).get('/api/patients/testPatient/documents');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Unauthorized' });
  });
});
