import { describe, expect, it } from 'vitest';
import { fbErrorMessage, fbErrorStatus } from '../fbError';

describe('fbErrorMessage', () => {
  it('优先返回 error_user_msg', () => {
    const err = {
      response: { data: { error: { error_user_msg: '广告正在审核中', message: 'Generic' } } },
    };
    expect(fbErrorMessage(err)).toBe('广告正在审核中');
  });

  it('回退到 FB message', () => {
    const err = { response: { data: { error: { message: 'Invalid parameter' } } } };
    expect(fbErrorMessage(err)).toBe('Invalid parameter');
  });

  it('回退到 axios message', () => {
    expect(fbErrorMessage({ message: 'Request failed with status code 400' }))
      .toBe('Request failed with status code 400');
  });
});

describe('fbErrorStatus', () => {
  it('FB 400 透传', () => {
    expect(fbErrorStatus({ response: { status: 400 } })).toBe(400);
  });

  it('FB 403 透传', () => {
    expect(fbErrorStatus({ response: { status: 403 } })).toBe(403);
  });

  it('其他错误返回 500', () => {
    expect(fbErrorStatus({ response: { status: 502 } })).toBe(500);
    expect(fbErrorStatus({})).toBe(500);
  });
});
