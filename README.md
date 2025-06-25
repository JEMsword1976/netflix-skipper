# Netflix Auto Skip & Play - 後端伺服器

這是 "Netflix Auto Skip & Play" Chrome 擴充功能的後端伺服器，專為部署在 [Vercel](https://vercel.com) 而設計。

## 功能

- 使用 Google 登入驗證使用者身份。
- 為新使用者提供 30 天試用期。
- 驗證使用者的授權狀態 (trial, premium, expired)。
- 防止使用者透過重新安裝來重置試用期。
- (未來) 與 Paddle 整合以處理付款。

## 部署到 Vercel

### 步驟 1: 取得 Google Client ID

1.  前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)。
2.  點擊 "建立憑證" -> "OAuth 用戶端 ID"。
3.  選擇 "網頁應用程式"。
4.  在 "已授權的 JavaScript 來源" 中，**不需要**填寫任何內容。
5.  在 "已授權的重新導向 URI" 中，**不需要**填寫任何內容。
6.  建立後，複製您的 **用戶端 ID (Client ID)**。這就是我們的 `GOOGLE_CLIENT_ID`。

### 步驟 2: 部署專案

1.  將這個專案的程式碼上傳到您自己的 GitHub 儲存庫中。
2.  登入您的 [Vercel](https://vercel.com) 帳號。
3.  點擊 "Add New..." -> "Project"。
4.  從您的 GitHub 中匯入這個專案。
5.  在 "Environment Variables" (環境變數) 區塊中，新增一個變數：
    -   **Name**: `GOOGLE_CLIENT_ID`
    -   **Value**: (貼上您在步驟 1 中複製的 Client ID)
6.  點擊 "Deploy"。Vercel 會自動安裝套件並部署您的 API。

### 步驟 3: 更新您的擴充功能

1.  部署成功後，Vercel 會提供您一個網址，例如 `https://your-project-name.vercel.app`。
2.  打開您的 Chrome 擴充功能專案中的 `popup.js` 檔案。
3.  將 `BACKEND_URL` 這個常數的值，從 `https://your-backend-server.com/api` 修改為您的 Vercel 網址，例如：`https://your-project-name.vercel.app/api`。
4.  重新載入您的擴充功能。

現在，您的擴充功能將會與您部署在 Vercel 上的後端伺服器進行通訊了！ 