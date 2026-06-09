import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
    apiVersion: process.env.FACEBOOK_API_VERSION || 'v19.0',
    proxy: process.env.FB_PROXY || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '7d',
  },
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    clientPort: parseInt(process.env.CLIENT_PORT || '5173', 10),
  },
  db: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'fb_auto_analytics',
    ssl: process.env.PG_SSL !== 'false',
  },
  shoplazzaDb: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.SHOPLAZZA_PG_DATABASE || 'shoplazza',
    ssl: process.env.PG_SSL !== 'false',
  },
  shoplazza: {
    apiVersion: process.env.SHOPLAZZA_API_VERSION || '2025-06',
    timeZone: parseInt(process.env.SHOPLAZZA_TIME_ZONE || '8', 10),
  },
  dingtalk: {
    appKey: process.env.DINGTALK_APP_KEY || '',
    appSecret: process.env.DINGTALK_APP_SECRET || '',
    redirectUri: process.env.DINGTALK_REDIRECT_URI || '',
  },
  system: {
    fbAccessToken: process.env.SYSTEM_FB_ACCESS_TOKEN || '',
  },
};
