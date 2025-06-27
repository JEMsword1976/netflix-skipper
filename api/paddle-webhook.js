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

      // 新增：根據 Paddle 方案 ID 寫入 subscriptionStatus
      let planId = event.data?.items?.[0]?.price?.product_id || event.data?.product_id;
      if (planId === 'pri_01jyb06mcbg2hqsp64mwth8em1') {
        user.subscriptionStatus = 'monthly';
      } else if (planId === 'pri_01jyb32gjsmvf819q2s04hqvr7') {
        user.subscriptionStatus = 'yearly';
      } else {
        user.subscriptionStatus = 'active'; // 預設
      }

      await redis.set(email, user);
      console.log('License & subscriptionStatus updated for', email, user.subscriptionStatus);
    } else {
      console.log('No email found in webhook payload or Paddle API');
    }
  }

  // 處理訂閱取消
  if (event.event_type === 'subscription.cancelled') {
    let email = null;
    if (event.data?.customer?.email) email = event.data.customer.email;
    if (!email && event.data?.email) email = event.data.email;
    if (email) {
      let user = await redis.get(email);
      if (!user) user = { email };
      user.license = 'none';
      user.subscriptionStatus = 'cancelled';
      await redis.set(email, user);
      console.log('Subscription cancelled for', email);
    }
  }

  // 處理訂閱過期
  if (event.event_type === 'subscription.expired') {
    let email = null;
    if (event.data?.customer?.email) email = event.data.customer.email;
    if (!email && event.data?.email) email = event.data.email;
    if (email) {
      let user = await redis.get(email);
      if (!user) user = { email };
      user.license = 'none';
      user.subscriptionStatus = 'expired';
      await redis.set(email, user);
      console.log('Subscription expired for', email);
    }
  }

  // 處理訂閱更新
  if (event.event_type === 'subscription.updated') {
    let email = null;
    if (event.data?.customer?.email) email = event.data.customer.email;
    if (!email && event.data?.email) email = event.data.email;
    if (email) {
      let user = await redis.get(email);
      if (!user) user = { email };
      // 根據狀態更新
      let status = event.data?.status;
      if (status === 'active') {
        user.license = 'premium';
        let planId = event.data?.items?.[0]?.price?.product_id || event.data?.product_id;
        if (planId === 'pri_01jyb06mcbg2hqsp64mwth8em1') {
          user.subscriptionStatus = 'monthly';
        } else if (planId === 'pri_01jyb32gjsmvf819q2s04hqvr7') {
          user.subscriptionStatus = 'yearly';
        } else {
          user.subscriptionStatus = 'active';
        }
      } else if (status === 'cancelled') {
        user.license = 'none';
        user.subscriptionStatus = 'cancelled';
      } else if (status === 'expired') {
        user.license = 'none';
        user.subscriptionStatus = 'expired';
      }
      await redis.set(email, user);
      console.log('Subscription updated for', email, user.subscriptionStatus);
    }
  }

  res.status(200).send('OK');
}