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
    const response = await fetch(`https://api.paddle.com/customers?email=${encodeURIComponent(searchEmail)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
      }
    });
    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      // 務必回傳完整 debug 資訊
      return res.status(404).json({ 
        error: 'Customer not found in Paddle', 
        searchEmail, 
        apiKeyHead: process.env.PADDLE_API_KEY?.slice(0, 12),
        paddleResponse: data
      });
    }
    const customer = data.data[0];
    res.json({
      customerId: customer.id,
      email: customer.email,
      status: customer.status,
      raw: customer
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
}; 