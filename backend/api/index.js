const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');

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

// 模擬資料庫，在真實應用中，您應該使用 Vercel Postgres, Neon, 或 MongoDB Atlas
const mockDatabase = {
    // 範例: 'google-user-id': { license: 'premium', trialStartDate: '...' }
};
const TRIAL_PERIOD_DAYS = 30;

// API 端點：驗證授權
app.post('/api/verify-license', async (req, res) => {
    const { token } = req.body;
    const requiredAudience = process.env.GOOGLE_CLIENT_ID;

    if (!token) {
        return res.status(400).json({ message: 'Token is required' });
    }
    
    if (!requiredAudience) {
        console.error('FATAL: GOOGLE_CLIENT_ID environment variable not set on Vercel.');
        return res.status(500).json({ message: 'Server configuration error', details: 'Client ID is not configured on the server.' });
    }

    let userEmail;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: requiredAudience,
        });
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
    let user = mockDatabase[userEmail];

    if (!user) {
        // 新使用者：建立試用期
        const now = new Date();
        user = {
            license: 'trial',
            trialStartDate: now.toISOString()
        };
        mockDatabase[userEmail] = user;
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
        return res.json({ status: 'expired' });
    }
});

// 為了讓 Vercel 正確處理，我們匯出 app
module.exports = app; 