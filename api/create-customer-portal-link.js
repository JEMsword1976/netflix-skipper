export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    // 1. 先查詢 customer_id
    const customerRes = await fetch(`https://api.paddle.com/customers?email=${encodeURIComponent(email)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
      }
    });
    const customerData = await customerRes.json();
    const customerId = customerData?.data?.[0]?.id;
    if (!customerId) {
      res.status(404).json({ error: 'Customer not found in Paddle' });
      return;
    }
    // 2. 用 customer_id 產生 portal link
    const portalRes = await fetch(`https://api.paddle.com/customers/${customerId}/portal-link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const portalData = await portalRes.json();
    if (portalData?.data?.url) {
      res.json({ url: portalData.data.url });
    } else {
      console.error('Paddle portal API error:', portalData);
      res.status(500).json({ error: 'Failed to get portal url', details: portalData });
    }
  } catch (e) {
    console.error('Create portal session error:', e);
    res.status(500).json({ error: 'Failed to create portal session', details: e.message });
  }
} 