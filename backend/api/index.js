const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const { createClient } = require('@vercel/kv');
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

const app = express();

// 更明確的 CORS 設定，允許所有來源
app.use(cors({
  origin: '*'
}));

// 注意：webhook 端點需要 raw body，所以全域的 json parser 需要調整
app.use((req, res, next) => {
  if (req.path === '/api/paddle-webhook') {
    // For webhook signature verification, we need the raw request body.
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// 您的 Google Cloud Console Web Client ID
// **重要**: 請務必在 Vercel 中將此設定為環境變數
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const paddle = new Paddle(PADDLE_API_KEY, {
  environment: Environment.sandbox, // or Environment.production
});

// 初始化 Vercel KV 客戶端
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const TRIAL_PERIOD_DAYS = 30; // This constant is now only for reference, logic is handled by Paddle.

// [ 新增 ] API 端點：建立 Paddle 付款連結
app.post('/api/create-payment-link', async (req, res) => {
  const { userEmail } = req.body;
  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required' });
  }

  try {
    const transaction = await paddle.transactions.create({
      items: [{
        priceId: process.env.PADDLE_PRICE_ID, // 使用環境變數中的 Price ID
        quantity: 1
      }],
      customer: {
        email: userEmail,
      },
      customData: {
        user_email: userEmail,
      },
    });

    res.json({ checkoutUrl: transaction.checkout.url });
  } catch (error) {
    console.error('Error creating Paddle transaction:', error);
    res.status(500).json({ error: 'Failed to create payment link.' });
  }
});

// [ 新增 ] API 端點：接收 Paddle Webhook
app.post('/api/paddle-webhook', async (req, res) => {
  try {
    const signature = req.headers['paddle-signature'];
    const rawBody = req.body;
    const event = paddle.webhooks.unmarshal(rawBody, PADDLE_WEBHOOK_SECRET, signature);

    // 處理 'transaction.completed' 事件
    if (event.eventType === 'transaction.completed') {
      const userEmail = event.data.customData?.user_email;
      if (userEmail) {
        let user = await kv.get(userEmail);
        if (user) {
          user.license = 'premium';
          user.paddleTransactionId = event.data.id;
          await kv.set(userEmail, user);
          console.log(`User ${userEmail} license upgraded to premium.`);
        }
      }
    }
    res.status(200).send();
  } catch (error) {
    console.error('Error processing Paddle webhook:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// [ 主要邏輯變更 ] API 端點：驗證授權
app.post('/api/verify-license', async (req, res) => {
    const { token } = req.body;
    const requiredAudience = process.env.GOOGLE_CLIENT_ID;

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }
    
    if (!requiredAudience || !process.env.KV_REST_API_URL) {
        const missingVar = !requiredAudience ? 'GOOGLE_CLIENT_ID' : 'Vercel KV';
        console.error(`FATAL: ${missingVar} environment variable not set on Vercel.`);
        return res.status(500).json({ message: 'Server configuration error', details: `${missingVar} is not configured on the server.` });
    }

    let userEmail;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: requiredAudience });
        const payload = ticket.getPayload();
        userEmail = payload.email;
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return res.status(401).json({ message: 'Invalid Google token', details: error.message });
    }

    if (!userEmail) {
        return res.status(400).json({ message: 'Could not extract user email from token' });
    }

    let user = await kv.get(userEmail);

    if (!user) {
        // 新使用者：不再建立試用期，只記錄他們的存在。
        user = {
            email: userEmail,
            license: 'none', // 預設為 'none'
        };
        await kv.set(userEmail, user);
        console.log(`New user ${userEmail} created with 'none' license.`);
    }

    // 只回傳資料庫中記錄的狀態
    return res.json({ status: user.license });
});

// 為了讓 Vercel 正確處理，我們匯出 app
module.exports = app; 