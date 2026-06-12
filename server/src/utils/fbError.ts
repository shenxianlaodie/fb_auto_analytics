/** 提取 FB Graph API 错误中的用户可读信息 */
export function fbErrorMessage(err: any): string {
  const fbErr = err?.response?.data?.error;
  return fbErr?.error_user_msg || fbErr?.message || err?.message || '操作失败';
}
