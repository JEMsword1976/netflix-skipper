const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const { createClient } = require('@vercel/kv');
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

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
  environment: Environment.sandbox, // or Environment.production
});

// Initialize Vercel KV client
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

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

// [ Added ] API endpoint: Receive Paddle Webhook
app.post('/api/paddle-webhook', async (req, res) => {
  try {
    const signature = req.headers['paddle-signature'];
    const rawBody = req.body;
    const event = paddle.webhooks.unmarshal(rawBody, PADDLE_WEBHOOK_SECRET, signature);

    // Handle 'transaction.completed' event
    if (event.eventType === 'transaction.completed') {
      const userEmail = event.data.customData?.user_email;
      if (userEmail) {
        let user = await kv.get(userEmail);
        if (user) {
          user.license = 'premium';
          user.paddleTransactionId = event.data.id;
          user.subscriptionStatus = 'active';
          user.lastPaymentDate = new Date().toISOString();
          await kv.set(userEmail, user);
          console.log(`User ${userEmail} license upgraded to premium.`);
        }
      }
    }

    // [ Added ] Handle subscription cancellation event
    if (event.eventType === 'subscription.cancelled') {
      const userEmail = event.data.customData?.user_email;
      if (userEmail) {
        let user = await kv.get(userEmail);
        if (user) {
          user.license = 'none';
          user.subscriptionStatus = 'cancelled';
          user.cancelledDate = new Date().toISOString();
          await kv.set(userEmail, user);
          console.log(`User ${userEmail} subscription cancelled.`);
        }
      }
    }

    // [ Added ] Handle subscription expiration event
    if (event.eventType === 'subscription.updated' && event.data.status === 'past_due') {
      const userEmail = event.data.customData?.user_email;
      if (userEmail) {
        let user = await kv.get(userEmail);
        if (user) {
          user.license = 'none';
          user.subscriptionStatus = 'past_due';
          user.pastDueDate = new Date().toISOString();
          await kv.set(userEmail, user);
          console.log(`User ${userEmail} subscription past due.`);
        }
      }
    }

    res.status(200).send();
  } catch (error) {
    console.error('Error processing Paddle webhook:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// [ Added ] API endpoint: Check license status (for periodic checking)
app.post('/api/check-license-status', async (req, res) => {
  const { token } = req.body;
  const requiredAudience = process.env.GOOGLE_CLIENT_ID;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
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

  let user = await kv.get(userEmail);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // [ Added ] Check subscription status
  let needsUpdate = false;
  
  // If premium user, check if subscription is still valid
  if (user.license === 'premium' && user.paddleTransactionId) {
    try {
      // Here we can call Paddle API to check subscription status
      // Due to Paddle limitations, we mainly rely on webhooks to update status
      // But we can add additional checking logic here
      
      // Check if more than 30 days without payment record (simple expiration check)
      if (user.lastPaymentDate) {
        const lastPayment = new Date(user.lastPaymentDate);
        const now = new Date();
        const daysSincePayment = (now - lastPayment) / (1000 * 60 * 60 * 24);
        
        if (daysSincePayment > 35) { // Give 5 days grace period
          user.license = 'none';
          user.subscriptionStatus = 'expired';
          user.expiredDate = new Date().toISOString();
          needsUpdate = true;
          console.log(`User ${userEmail} license expired due to no recent payment.`);
        }
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  }

  if (needsUpdate) {
    await kv.set(userEmail, user);
  }

  return res.json({ 
    status: user.license,
    subscriptionStatus: user.subscriptionStatus || 'none',
    lastPaymentDate: user.lastPaymentDate,
    needsRenewal: user.subscriptionStatus === 'past_due' || user.subscriptionStatus === 'expired'
  });
});

// [ Main logic change ] API endpoint: Verify license
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
        // If user doesn't exist in database (theoretically shouldn't happen after login, but as protection)
        // Directly create them as 'none' status, no longer giving server-side trial period.
        user = {
            email: userEmail,
            license: 'none',
        };
        await kv.set(userEmail, user);
        console.log(`A user (${userEmail}) not found in DB was created with 'none' license.`);
    }

    // Only return the status recorded in database
    return res.json({ status: user.license });
});

// Export app for Vercel to handle correctly
module.exports = app; 