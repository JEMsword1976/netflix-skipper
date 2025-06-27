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
    // 2. 產生 customer portal session (正確 endpoint)
    const portalRes = await fetch(`https://api.paddle.com/customers/${customer.id}/portal-link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        return_url: 'https://netflix-skipper.vercel.app'
      })
    });
    const portalData = await portalRes.json();
    const portalUrl = portalData?.data?.url;
    if (portalUrl) {
      // 僅回傳 url 給前端，並保留 debug 欄位
      return res.status(200).json({
        url: portalUrl,
        customerId: customer.id,
        email: customer.email,
        status: customer.status,
        debug: portalData
      });
    } else {
      // 若無 url，回傳 500 並附上 debug
      return res.status(500).json({
        error: 'No URL returned from Paddle',
        customerId: customer.id,
        email: customer.email,
        status: customer.status,
        debug: portalData
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create customer portal link',
      details: typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
  }
};