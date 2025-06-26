export default function handler(req, res) {
  console.log('Paddle webhook received:', req.body);
  res.status(200).send('OK');
} 