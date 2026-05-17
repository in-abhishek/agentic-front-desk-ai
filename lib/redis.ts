import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Missing Upstash Redis credentials in .env.local');
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const otpStorage = {
  
  saveOTP: async (email: string, otp: string) => {
    const key = `otp:${email.toLowerCase()}`;
    await redis.set(key, otp, { ex: 300 }); 
    console.log(`[Redis Cache] OTP saved for ${email}. Expires in 5m.`);
  },

  getOTP: async (email: string): Promise<string | null> => {
    const key = `otp:${email.toLowerCase()}`;
    return await redis.get<string>(key);
  },

  deleteOTP: async (email: string) => {
    const key = `otp:${email.toLowerCase()}`;
    await redis.del(key);
    console.log(`[Redis Cache] OTP cleared for ${email}`);
  }
};

export const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: '@ratelimit',
});