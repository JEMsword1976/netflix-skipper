import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const event = req.body;
  console.log('Webhook event:', JSON.stringify(event, null, 2));

  if (event.event_type === 'transaction.completed') {
    // 嘗試多種方式取得 email
    let email = event.data?.customer?.email;
    if (!email && event.data?.items?.[0]?.customer?.email) {
      email = event.data.items[0].customer.email;
    }
    if (!email && event.data?.email) {
      email = event.data.email;
    }
    if (!email && event.data?.items?.[0]?.email) {
      email = event.data.items[0].email;
    }
    if (email) {
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
