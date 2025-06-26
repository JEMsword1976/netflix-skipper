export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const paddleRes = await fetch('https://api.paddle.com/portal/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
      },
      body: JSON.stringify({
        customer: { email }
      })
    });
    const data = await paddleRes.json();
    if (data?.data?.url) {
      res.json({ url: data.data.url });
    } else {
      console.error('Paddle portal API error:', data);
      res.status(500).json({ error: 'Failed to get portal url', details: data });
    }
  } catch (e) {
    console.error('Create portal session error:', e);
    res.status(500).json({ error: 'Failed to create portal session', details: e.message });
  }
} 