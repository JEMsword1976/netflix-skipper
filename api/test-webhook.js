import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// 測試函數：模擬訂閱取消 webhook
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, action } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    let user = await redis.get(email);
    if (!user) {
      user = { email };
    }

    console.log(`Testing ${action} for user:`, email);
    console.log('Current user state:', user);

    switch (action) {
      case 'cancel':
        user.license = 'none';
        user.subscriptionStatus = 'cancelled';
        user.cancelledDate = new Date().toISOString();
        break;
      case 'activate':
        user.license = 'premium';
        user.subscriptionStatus = 'active';
        user.lastPaymentDate = new Date().toISOString();
        break;
      case 'expire':
        user.license = 'none';
        user.subscriptionStatus = 'expired';
        user.expiredDate = new Date().toISOString();
        break;
      default:
        return res.status(400).json({ error: 'Invalid action. Use: cancel, activate, or expire' });
    }

    await redis.set(email, user);
    
    console.log(`User ${email} ${action} completed. New state:`, user);

    res.json({
      success: true,
      message: `User ${action} completed`,
      user: user
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
} 