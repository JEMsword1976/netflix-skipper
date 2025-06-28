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
  let user = await redis.get(userEmail);
  if (!user) {
    return res.status(404).json({ message: 'User not found', debug: { userEmail, userFromRedis: user } });
  }
  if (typeof user === 'string') user = JSON.parse(user);
  res.status(200).json({
    status: user.license,
    subscriptionStatus: user.subscriptionStatus || 'none',
    lastPaymentDate: user.lastPaymentDate,
    nextBilledAt: user.nextBilledAt,
    scheduledChange: user.scheduledChange,
    trialEndDate: user.trialEndDate,
    trialStartDate: user.trialStartDate,
    cancelledDate: user.cancelledDate,
    expiredDate: user.expiredDate,
    pastDueDate: user.pastDueDate,
    needsRenewal: user.subscriptionStatus === 'past_due' || user.subscriptionStatus === 'expired',
    debug: {
      userEmail,
      userFromRedis: user
    }
  });
} 