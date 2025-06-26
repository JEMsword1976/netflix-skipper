import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Missing email' });
    return;
  }
  let user = await redis.get(email);
  if (typeof user === 'string') {
    try { user = JSON.parse(user); } catch {}
  }
  if (user && user.license === 'premium') {
    res.status(200).json({ status: 'premium' });
  } else {
    res.status(200).json({ status: 'none' });
  }
} 