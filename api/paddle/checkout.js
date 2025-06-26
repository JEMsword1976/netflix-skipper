export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, plan } = req.body;

  // 你的 Paddle 產品 priceId，請依實際填寫
  const PRICE_IDS = {
    monthly: 'pri_01jyb06mcbg2hqsp64mwth8em1', // 月費 priceId
    yearly:  'pri_01jyb32gjsmvf819q2s04hqvr7'  // 年費 priceId
  };

  if (!email || !plan || !PRICE_IDS[plan]) {
    res.status(400).json({ error: 'Missing or invalid parameters' });
    return;
  }

  // 呼叫 Paddle API 建立 checkout session
  const response = await fetch('https://api.paddle.com/checkout/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PADDLE_API_KEY}`
    },
    body: JSON.stringify({
      customer: { email },
      items: [{ price_id: PRICE_IDS[plan], quantity: 1 }]
    })
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      errorDetail = await response.text();
    } catch (e) {
      errorDetail = '無法取得詳細錯誤';
    }
    res.status(500).json({ error: 'Failed to create Paddle session', details: errorDetail });
    return;
  }

  const data = await response.json();
  res.status(200).json({ checkoutUrl: data.data.checkout_url });
} 