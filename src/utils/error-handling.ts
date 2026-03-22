import { AppError } from '../errors/app.error';

export interface ErrorResponse {
    statusCode: number;
    message: string;
}

export function getErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof AppError) {
        return { statusCode: error.statusCode, message: error.message };
    }
    const err = error as { statusCode?: number };
    const statusCode =
        typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
            ? err.statusCode
            : 500;
    const exposeMessage = typeof err?.statusCode === 'number' && err.statusCode < 500;
    const message = exposeMessage && error instanceof Error ? error.message : 'Internal Server Error';
    return { statusCode, message };
}

