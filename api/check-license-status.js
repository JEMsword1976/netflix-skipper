export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // TODO: 補上 Google 驗證與 KV 查詢
  res.status(200).json({ status: 'none', subscriptionStatus: 'none', lastPaymentDate: null, needsRenewal: false });
} 