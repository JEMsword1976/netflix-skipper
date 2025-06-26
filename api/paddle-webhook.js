import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  let event = req.body;
  // 強制 parse body
  if (typeof event === 'string') {
    try {
      event = JSON.parse(event);
    } catch (e) {
      console.log('Webhook body parse error:', e, event);
      return res.status(200).send('OK');
    }
  }
  if (!event) {
    console.log('Webhook received empty body');
    return res.status(200).send('OK');
  }

  console.log('Webhook event:', JSON.stringify(event, null, 2));

  if (event.event_type === 'transaction.completed') {
    let email = null;
    // 1. 先嘗試直接抓 email
    if (event.data?.customer?.email) email = event.data.customer.email;
    if (!email && event.data?.items?.[0]?.customer?.email) email = event.data.items[0].customer.email;
    if (!email && event.data?.email) email = event.data.email;
    if (!email && event.data?.items?.[0]?.email) email = event.data.items[0].email;
    // 2. 若還是沒有，嘗試用 customer_id 查詢 Paddle API
    if (!email && event.data?.customer_id) {
      try {
        const paddleRes = await fetch(`https://api.paddle.com/customers/${event.data.customer_id}`, {
          headers: { 'Authorization': `Bearer ${process.env.PADDLE_API_KEY}` }
        });
        const paddleData = await paddleRes.json();
        email = paddleData?.data?.email;
        console.log('Fetched email from Paddle API:', email);
      } catch (e) {
        console.log('Fetch Paddle customer error:', e);
      }
    }
    if (email) {
      let user = await redis.get(email);
      if (!user) user = { email };
      user.license = 'premium';
      await redis.set(email, JSON.stringify(user));
      console.log('License updated for', email);
    } else {
      console.log('No email found in webhook payload or Paddle API');
    }
  }

  res.status(200).send('OK');
}
