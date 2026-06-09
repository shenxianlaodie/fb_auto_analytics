import { FacebookClient } from './facebookClient';
import { getUserById, upsertUser } from '../models/user';
import { config } from '../config';

export class TokenService {
  static async getValidToken(userId: string): Promise<string> {
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // Use system token if user has no personal Facebook token
    if (!user.access_token) {
      return config.system.fbAccessToken;
    }

    if (user.token_expires_at) {
      const expiresAt = new Date(user.token_expires_at).getTime();
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (now + oneHour >= expiresAt) {
        try {
          const fbClient = FacebookClient.getInstance();
          const newToken = await fbClient.refreshLongLivedToken(user.access_token);

          if (user.facebook_user_id) {
            await upsertUser({
              facebookUserId: user.facebook_user_id,
              accessToken: newToken.access_token,
              tokenExpiresAt: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
            });
          }

          return newToken.access_token;
        } catch (err) {
          console.error('[TokenService] Failed to refresh token:', err);
        }
      }
    }

    return user.access_token || config.system.fbAccessToken;
  }

  static async getToken(userId: string): Promise<string> {
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    return user.access_token || config.system.fbAccessToken;
  }
}
