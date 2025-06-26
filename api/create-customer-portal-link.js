import { Paddle } from '@paddle/paddle-node-sdk';

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
  environment: process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const session = await paddle.portal.sessions.create({
      customer: { email }
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('Create portal session error:', e, e?.response?.data);
    res.status(500).json({ error: 'Failed to create portal session', details: e.message, stack: e.stack, paddle: e?.response?.data });
  }
} 