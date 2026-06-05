import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[Error]', err);

  // Facebook API errors
  if (err.response?.error?.error_user_msg) {
    res.status(err.status || 400).json({
      error: err.response.error.error_user_msg,
      code: err.response.error.code,
      fbTraceId: err.response.error.fbtrace_id,
    });
    return;
  }

  if (err.response?.error?.message) {
    res.status(err.status || 400).json({
      error: err.response.error.message,
      code: err.response.error.code,
    });
    return;
  }

  // Generic error
  const status = err.status || err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(status).json({ error: message });
}
