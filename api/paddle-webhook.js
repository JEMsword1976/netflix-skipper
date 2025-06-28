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

  console.log('Webhook event received:', event.event_type, JSON.stringify(event, null, 2));

  // 統一獲取用戶 email 的函數
  const getEmailFromEvent = (event) => {
    let email = null;
    // 1. 先嘗試直接抓 email
    if (event.data?.customer?.email) email = event.data.customer.email;
    if (!email && event.data?.items?.[0]?.customer?.email) email = event.data.items[0].customer.email;
    if (!email && event.data?.email) email = event.data.email;
    if (!email && event.data?.items?.[0]?.email) email = event.data.items[0].email;
    if (!email && event.data?.customData?.user_email) email = event.data.customData.user_email;
    return email;
  };

  // 統一更新用戶狀態的函數
  const updateUserStatus = async (email, updates) => {
    if (!email) {
      console.log('No email found for event');
      return false;
    }
    
    try {
      let user = await redis.get(email);
      if (!user) user = { email };
      
      // 合併更新
      user = { ...user, ...updates };
      
      await redis.set(email, user);
      console.log(`User ${email} status updated:`, updates);
      return true;
    } catch (error) {
      console.error(`Error updating user ${email}:`, error);
      return false;
    }
  };

  if (event.event_type === 'transaction.completed') {
    let email = getEmailFromEvent(event);
    
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
      // 根據 Paddle 方案 ID 寫入 subscriptionStatus
      let planId = event.data?.items?.[0]?.price?.product_id || event.data?.product_id;
      let subscriptionStatus = 'active'; // 預設
      
      if (planId === 'pri_01jyb06mcbg2hqsp64mwth8em1') {
        subscriptionStatus = 'monthly';
      } else if (planId === 'pri_01jyb32gjsmvf819q2s04hqvr7') {
        subscriptionStatus = 'yearly';
      }

      await updateUserStatus(email, {
        license: 'premium',
        subscriptionStatus: subscriptionStatus,
        lastPaymentDate: new Date().toISOString(),
        paddleTransactionId: event.data.id
      });
    } else {
      console.log('No email found in webhook payload or Paddle API');
    }
  }

  // 處理訂閱取消
  if (event.event_type === 'subscription.cancelled') {
    const email = getEmailFromEvent(event);
    await updateUserStatus(email, {
      license: 'none',
      subscriptionStatus: 'cancelled',
      cancelledDate: new Date().toISOString()
    });
  }

  // 處理訂閱過期
  if (event.event_type === 'subscription.expired') {
    const email = getEmailFromEvent(event);
    await updateUserStatus(email, {
      license: 'none',
      subscriptionStatus: 'expired',
      expiredDate: new Date().toISOString()
    });
  }

  // 處理訂閱更新
  if (event.event_type === 'subscription.updated') {
    const email = getEmailFromEvent(event);
    const status = event.data?.status;
    
    if (status === 'active') {
      let planId = event.data?.items?.[0]?.price?.product_id || event.data?.product_id;
      let subscriptionStatus = 'active';
      
      if (planId === 'pri_01jyb06mcbg2hqsp64mwth8em1') {
        subscriptionStatus = 'monthly';
      } else if (planId === 'pri_01jyb32gjsmvf819q2s04hqvr7') {
        subscriptionStatus = 'yearly';
      }

      await updateUserStatus(email, {
        license: 'premium',
        subscriptionStatus: subscriptionStatus,
        lastUpdated: new Date().toISOString()
      });
    } else if (status === 'cancelled') {
      await updateUserStatus(email, {
        license: 'none',
        subscriptionStatus: 'cancelled',
        cancelledDate: new Date().toISOString()
      });
    } else if (status === 'expired') {
      await updateUserStatus(email, {
        license: 'none',
        subscriptionStatus: 'expired',
        expiredDate: new Date().toISOString()
      });
    } else if (status === 'past_due') {
      await updateUserStatus(email, {
        license: 'none',
        subscriptionStatus: 'past_due',
        pastDueDate: new Date().toISOString()
      });
    }
  }

  res.status(200).send('OK');
}