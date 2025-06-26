import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const event = req.body;
  console.log('Paddle webhook received:', event);

  if (event.event_type === 'transaction.completed') {
    // 假設 email 在 event.data.customer.email
    const email = event.data?.customer?.email;
    if (email) {
      // 取得現有資料
      let user = await redis.get(email);
      if (!user) user = { email };
      user.license = 'premium';
      await redis.set(email, JSON.stringify(user));
      console.log('License updated for', email);
    } else {
      console.log('No email found in webhook payload');
    }
  }

  res.status(200).send('OK');
} 