import { OAuth2Client } from 'google-auth-library';
import { Redis } from '@upstash/redis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }
  let userEmail;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    userEmail = payload.email;
  } catch (error) {
    return res.status(401).json({ message: 'Invalid Google token', details: error.message });
  }
  if (!userEmail) {
    return res.status(400).json({ message: 'Could not extract user email from token' });
  }
  let user = await redis.get(userEmail);
  if (!user) {
    user = { email: userEmail, license: 'none' };
    await redis.set(userEmail, user);
  }
  return res.json({ status: user.license });
} 