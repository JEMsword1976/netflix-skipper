const fetch = require('node-fetch');

module.exports = async (req, res) => {
  console.log('API function called', new Date().toISOString());
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const searchEmail = email.trim().toLowerCase();
    console.log('收到 email:', email);
    console.log('查詢 email:', searchEmail);
    console.log('API Key Head:', process.env.PADDLE_API_KEY?.slice(0, 12));
    const response = await fetch(`https://api.paddle.com/customers?email=${encodeURIComponent(searchEmail)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
      }
    });
    const data = await response.json();
    console.log('Paddle API 回傳:', JSON.stringify(data));
    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found in Paddle', searchEmail });
    }
    const customer = data.data[0];
    // 這裡你可以繼續用 fetch 呼叫 customer portal session API
    res.json({
      customerId: customer.id,
      email: customer.email,
      status: customer.status,
      raw: customer
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
}; 