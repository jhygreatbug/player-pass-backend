import { AppError } from '../utils/errors.js';
import { errorResponse } from '../utils/response.js';

export function handleError(error, context = {}) {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      console.error(
        `[error] ${context.method ?? ''} ${context.path ?? ''} ${error.code}: ${error.message}`
      );
    }
    return errorResponse(error.status, error.code, error.message);
  }

  console.error('[error] 未处理异常:', error?.stack ?? error);
  return errorResponse(500, 'INTERNAL_ERROR', '服务内部错误');
}
