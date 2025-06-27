const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
  environment: Environment.production,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const searchEmail = email.trim().toLowerCase();
    const customers = await paddle.customers.list({ email: searchEmail });
    if (!customers.data || customers.data.length === 0) {
      return res.status(404).json({ 
        error: 'Customer not found in Paddle', 
        searchEmail, 
        apiKeyHead: process.env.PADDLE_API_KEY?.slice(0, 12) 
      });
    }
    const customer = customers.data[0];
    const customerPortalSession = await paddle.customerPortalSessions.create({
      customerId: customer.id,
      returnUrl: 'https://netflix-skipper.vercel.app',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    res.json({
      url: customerPortalSession.url,
      customerId: customer.id,
      expiresAt: customerPortalSession.expiresAt,
    });
    console.error('查詢 email:', searchEmail);
  } catch (error) {
    console.error('查詢 email:', email);
    console.error('API Key 前6:', process.env.PADDLE_API_KEY?.slice(0, 6));
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
}; 