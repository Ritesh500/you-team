/** An error with an HTTP status the error middleware can render verbatim. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code ?? defaultCodeFor(status);
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new HttpError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required') {
    return new HttpError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new HttpError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new HttpError(404, message, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists', details?: unknown) {
    return new HttpError(409, message, 'CONFLICT', details);
  }

  static unprocessable(message = 'Request could not be processed', details?: unknown) {
    return new HttpError(422, message, 'UNPROCESSABLE', details);
  }
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
