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
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(401).json({ error: 'Authorization token not provided.' });
    }

    const token = authorization.split(' ')[1];
    let userId;

    try {
        // 【測試模式】如果收到假權杖，則繞過 Google 驗證
        if (token === 'FAKE_TOKEN_FOR_TESTING') {
            console.log('✅ [TEST MODE] Fake token received. Bypassing Google verification.');
            userId = 'fake-user-for-testing'; // 使用一個固定的假使用者 ID
        } else {
            // 【正常模式】驗證 Google Token
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            userId = payload['sub']; // 這是唯一的 Google 使用者 ID
        }

        // 在資料庫中查找使用者
        let user = mockDatabase[userId];

        if (!user) {
            // 新使用者：建立試用期
            const now = new Date();
            user = {
                license: 'trial',
                trialStartDate: now.toISOString()
            };
            mockDatabase[userId] = user;
            console.log(`New user ${userId} created with a trial.`);
        }

        // 檢查授權狀態
        if (user.license === 'premium') {
            return res.json({ status: 'premium' });
        }

        // 計算試用期
        const startDate = new Date(user.trialStartDate);
        const now = new Date();
        const elapsedMs = now.getTime() - startDate.getTime();
        const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
        
        if (elapsedDays < TRIAL_PERIOD_DAYS) {
            const daysLeft = Math.ceil(TRIAL_PERIOD_DAYS - elapsedDays);
            return res.json({ status: 'trial', daysLeft: daysLeft });
        } else {
            return res.json({ status: 'expired' });
        }

    } catch (error) {
        console.error('❌ Error during verification process:', error.message);
        return res.status(401).json({ error: 'Invalid token or verification failed.' });
    }
});

// 為了讓 Vercel 正確處理，我們匯出 app
module.exports = app; 