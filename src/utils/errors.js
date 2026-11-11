export class AppError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function invalidParams(message) {
  return new AppError('INVALID_PARAMS', message, 400);
}
