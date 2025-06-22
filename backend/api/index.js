const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const { createClient } = require('@vercel/kv');

const app = express();

// 更明確的 CORS 設定，允許所有來源
app.use(cors({
  origin: '*'
}));

app.use(express.json());

// 您的 Google Cloud Console Web Client ID
// **重要**: 請務必在 Vercel 中將此設定為環境變數
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// 初始化 Vercel KV 客戶端
const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const TRIAL_PERIOD_DAYS = 30;

// API 端點：驗證授權
app.post('/api/verify-license', async (req, res) => {
    const { token } = req.body;
    const requiredAudience = process.env.GOOGLE_CLIENT_ID;

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }
    
    if (!requiredAudience || !process.env.KV_REST_API_URL) {
        const missingVar = !requiredAudience ? 'GOOGLE_CLIENT_ID' : 'Vercel KV';
        console.error(`FATAL: ${missingVar} environment variable not set on Vercel.`);
        return res.status(500).json({ message: 'Server configuration error', details: `${missingVar} is not configured on the server.` });
    }

    let userEmail;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: requiredAudience });
        const payload = ticket.getPayload();
        userEmail = payload.email;
    } catch (error) {
        console.error('Error verifying Google token:', error);
        return res.status(401).json({ message: 'Invalid Google token', details: error.message });
    }

    if (!userEmail) {
        return res.status(400).json({ message: 'Could not extract user email from token' });
    }

    const now = new Date();
    let user = await kv.get(userEmail);

    if (!user) {
        const trialStartDate = now.toISOString();
        user = {
            email: userEmail,
            license: 'trial',
            trialStartDate: trialStartDate
        };
        await kv.set(userEmail, user);
        console.log(`New user ${userEmail} created with a trial.`);
    }

    // 檢查授權狀態
    if (user.license === 'premium') {
        return res.json({ status: 'premium' });
    }

    // 計算試用期
    const startDate = new Date(user.trialStartDate);
    const elapsedMs = now.getTime() - startDate.getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    
    if (elapsedDays < TRIAL_PERIOD_DAYS) {
        const daysLeft = Math.ceil(TRIAL_PERIOD_DAYS - elapsedDays);
        return res.json({ status: 'trial', daysLeft: daysLeft });
    } else {
        if (user.license !== 'expired') {
            user.license = 'expired';
            await kv.set(userEmail, user);
        }
        return res.json({ status: 'expired' });
    }
});

// 為了讓 Vercel 正確處理，我們匯出 app
module.exports = app; 