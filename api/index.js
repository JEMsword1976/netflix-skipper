const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const { Redis } = require('@upstash/redis');
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const fetch = require('node-fetch');

const app = express();

// More explicit CORS settings, allowing all origins
app.use(cors({
  origin: '*'
}));

// Note: webhook endpoint needs raw body, so global json parser needs adjustment
app.use((req, res, next) => {
  if (req.path === '/api/paddle-webhook') {
    // For webhook signature verification, we need the raw request body.
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

// Your Google Cloud Console Web Client ID
// **Important**: Please make sure to set this as an environment variable in Vercel
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const paddle = new Paddle(PADDLE_API_KEY, {
  environment: process.env.NODE_ENV === 'production' ? Environment.production : Environment.sandbox,
});

// Initialize Redis client
const redis = Redis.fromEnv();

const TRIAL_PERIOD_DAYS = 30; // This constant is now only for reference, logic is handled by Paddle.

// [ Added ] API endpoint: Create Paddle payment link
app.post('/api/create-payment-link', async (req, res) => {
  const { userEmail } = req.body;
  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required' });
  }

  try {
    const transaction = await paddle.transactions.create({
      items: [{
        priceId: process.env.PADDLE_PRICE_ID, // Use Price ID from environment variables
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

// [ Main logic change ] API endpoint: Verify license
app.post('/api/verify-license', async (req, res) => {
    console.log('verify-license req.body:', req.body);
    const { token } = req.body;
    const requiredAudience = process.env.GOOGLE_CLIENT_ID;
    if (!token) {
        console.log('No token provided');
        return res.status(400).json({ message: 'Token is required' });
    }
    let userEmail;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: requiredAudience });
        const payload = ticket.getPayload();
        userEmail = payload.email;
        console.log('Google token valid, userEmail:', userEmail);
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return res.status(401).json({ message: 'Invalid Google token', details: error.message });
    }
    if (!userEmail) {
        console.log('No userEmail extracted from token');
        return res.status(400).json({ message: 'Could not extract user email from token' });
    }
    let user = await redis.get(userEmail);
    console.log('DB user:', user);
    if (!user) {
        user = { email: userEmail, license: 'none' };
        await redis.set(userEmail, user);
        console.log(`A user (${userEmail}) not found in DB was created with 'none' license.`);
    }
    return res.json({ status: user.license });
});

// [ Added ] Test endpoint: Check Paddle API connection
app.get('/api/test-paddle-connection', async (req, res) => {
  try {
    console.log('Testing Paddle API connection...');
    console.log('Paddle API Key exists:', !!process.env.PADDLE_API_KEY);
    console.log('Paddle environment:', process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');
    
    // 測試基本的 API 連接
    const customers = await paddle.customers.list({
      limit: 1
    });
    
    console.log('Paddle API test successful');
    
    res.json({
      success: true,
      message: 'Paddle API connection successful',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
      apiKeyExists: !!process.env.PADDLE_API_KEY,
      customersCount: customers.data ? customers.data.length : 0
    });
    
  } catch (error) {
    console.error('Paddle API test failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Paddle API connection failed',
      details: error.message,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
      apiKeyExists: !!process.env.PADDLE_API_KEY
    });
  }
});

// Export app for Vercel to handle correctly
module.exports = app; 