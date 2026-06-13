import { Response } from 'express';

/** 提取 FB Graph API 错误中的用户可读信息 */
export function fbErrorMessage(err: any): string {
  const fbErr = err?.response?.data?.error;
  return fbErr?.error_user_msg || fbErr?.message || err?.message || '操作失败';
}

/** FB 客户端错误映射为 HTTP 状态码（400/403 透传，其余 500） */
export function fbErrorStatus(err: any): number {
  const status = err?.response?.status;
  if (status === 400 || status === 403) return status;
  return 500;
}

/** 统一向客户端返回 FB 错误 */
export function sendFbError(res: Response, err: any): void {
  res.status(fbErrorStatus(err)).json({ error: fbErrorMessage(err) });
}
