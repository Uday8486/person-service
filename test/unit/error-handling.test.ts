import { describe, it, expect } from 'vitest';
import { getErrorResponse } from '../../src/utils/error-handling';
import { AppError } from '../../src/errors/app.error';
import { BadRequestError } from '../../src/errors/bad-request.error';

describe('getErrorResponse', () => {
  it('should return specific status and message for AppError instances', () => {
    const error = new AppError('Custom app error', 418);
    const result = getErrorResponse(error);
    expect(result).toEqual({ statusCode: 418, message: 'Custom app error' });
  });

  it('should return specific status and message for BadRequestError', () => {
    const error = new BadRequestError('Invalid input');
    const result = getErrorResponse(error);
    expect(result).toEqual({ statusCode: 400, message: 'Invalid input' });
  });

  it('should expose message for errors with 4xx status code', () => {
    const error = new Error('Forbidden') as any;
    error.statusCode = 403;
    const result = getErrorResponse(error);
    expect(result).toEqual({ statusCode: 403, message: 'Forbidden' });
  });

  it('should return 500 and "Internal Server Error" for internal errors (>= 500)', () => {
    const error = new Error('Database connection failed') as any;
    error.statusCode = 503;
    const result = getErrorResponse(error);
    expect(result).toEqual({ statusCode: 503, message: 'Internal Server Error' });
  });

  it('should return 500 and "Internal Server Error" for generic Error without statusCode', () => {
    const error = new Error('Something went wrong');
    const result = getErrorResponse(error);
    expect(result).toEqual({ statusCode: 500, message: 'Internal Server Error' });
  });

  it('should return 500 and "Internal Server Error" for non-Error unknown objects', () => {
    const result = getErrorResponse({ some: 'random object' });
    expect(result).toEqual({ statusCode: 500, message: 'Internal Server Error' });
  });

  it('should return 500 and "Internal Server Error" for null or undefined', () => {
    expect(getErrorResponse(null)).toEqual({ statusCode: 500, message: 'Internal Server Error' });
    expect(getErrorResponse(undefined)).toEqual({ statusCode: 500, message: 'Internal Server Error' });
  });
});
