const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
  environment: Environment.production, // 這裡一定要 production
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
    const customers = await paddle.customers.list({ email });
    if (!customers.data || customers.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found in Paddle' });
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
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
}; 