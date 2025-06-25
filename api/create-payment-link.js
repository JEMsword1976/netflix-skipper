export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // TODO: 補上 Paddle 交易邏輯
  res.status(200).json({ checkoutUrl: 'https://pay.paddle.io/...' });
} 