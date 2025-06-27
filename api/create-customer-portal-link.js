const fetch = require('node-fetch');

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
    // 1. 查詢 customer
    const response = await fetch(`https://api.paddle.com/customers?email=${encodeURIComponent(searchEmail)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
      }
    });
    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      // 回傳 debug
      return res.status(404).json({ 
        error: 'Customer not found in Paddle', 
        searchEmail, 
        apiKeyHead: process.env.PADDLE_API_KEY?.slice(0, 12),
        paddleResponse: data
      });
    }
    const customer = data.data[0];
    // 2. 產生 customer portal session
    const portalRes = await fetch('https://api.paddle.com/customer-portal-sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_id: customer.id,
        return_url: 'https://netflix-skipper.vercel.app'
      })
    });
    const portalData = await portalRes.json();
    res.json({
      customerId: customer.id,
      email: customer.email,
      status: customer.status,
      portalUrl: portalData.data?.url || null,
      portalDebug: portalData,
      raw: customer
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
}; 