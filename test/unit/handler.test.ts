import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/handler';
import { PersonService } from '../../src/services/person.service';
import { BadRequestError } from '../../src/errors/bad-request.error';
import { logger } from '../../src/utils/observability';

// Mock the dependencies
vi.mock('../../src/services/person.service');
vi.mock('../../src/utils/observability', () => ({
  logger: {
    error: vi.fn(),
  },
  metrics: {
    publishStoredMetrics: vi.fn(),
  },
  tracer: {
    captureAWSv3Client: vi.fn((client) => client),
  },
}));

describe('Fastify Global Error Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should catch AppError instances and return their specific status code', async () => {
    // Force the service to throw our custom 400 error
    vi.mocked(PersonService.prototype.getPersons).mockRejectedValueOnce(
      new BadRequestError('Mocked invalid cursor')
    );

    const response = await app.inject({
      method: 'GET',
      url: '/person',
      query: { limit: '10', cursor: 'bad-cursor' }
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toEqual({ error: 'Mocked invalid cursor' });
  });

  it('should catch unhandled generic errors, log them, and return 500', async () => {
    // Force the service to throw a raw Error
    const rawError = new Error('Database connection lost');
    vi.mocked(PersonService.prototype.getPersons).mockRejectedValueOnce(rawError);

    const response = await app.inject({
      method: 'GET',
      url: '/person',
    });

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.payload)).toEqual({ error: 'Internal Server Error' });

    // Verify the unhandled error was correctly piped to Powertools logger
    expect(logger.error).toHaveBeenCalledWith('Unhandled internal error', { err: rawError });
  });

  it('should return 400 and the error message when schema validation fails', async () => {
    // Fastify schema validation errors have a statusCode of 400
    const response = await app.inject({
      method: 'POST',
      url: '/person',
      payload: { 
        firstName: 'John',
        // missing required fields: lastName, phoneNumber, address
      }
    });

    expect(response.statusCode).toBe(400);
    const payload = JSON.parse(response.payload);
    // Fastify 5 validation errors might have different message formats, 
    // but they should be exposed because statusCode is 400.
    expect(payload.error).toMatch(/body/);
  });
});
