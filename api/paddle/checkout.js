export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, plan } = req.body;

  // Paddle 產品 checkout base url
  const PRODUCT_URLS = {
    monthly: 'https://pay.paddle.io/hsc_01jyb9zsxq51a9v8pzr4negjxt_2edntyz8rzh1yf81rz1s9prm4wx0y9es',
    yearly:  'https://pay.paddle.io/hsc_01jyba1r94k1q663rw4s148g4e_pwjx34dygywtz4bqbhckvgbpxwmxvbs1'
  };

  if (!email || !plan || !PRODUCT_URLS[plan]) {
    res.status(400).json({ error: 'Missing or invalid parameters' });
    return;
  }

  const baseUrl = PRODUCT_URLS[plan];
  const checkoutUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `email=${encodeURIComponent(email)}`;

  res.status(200).json({ checkoutUrl });
} 