// 擴充功能安裝或更新時觸發
chrome.runtime.onInstalled.addListener((details) => {
  // 檢查儲存空間中是否已經有試用開始日期
  chrome.storage.sync.get('trialStartDate', (data) => {
    // 如果沒有，就設定一個新的。這涵蓋了新安裝和從舊版本更新的用戶。
    if (!data.trialStartDate) {
      const now = new Date().toISOString();
      chrome.storage.sync.set({
        isEnabled: true,
        trialStartDate: now
      });
      console.log(`Netflix Auto Skip & Play trial started on: ${now}`);
    }
  });
});

// 監聽來自 popup.js 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'verifyLicense') {
    // 讓監聽器可以直接處理異步函數
    (async () => {
        try {
            const response = await fetch(request.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${request.token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Server returned non-JSON error' }));
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }

            const license = await response.json();
            sendResponse({ success: true, license: license });
        } catch (error) {
            console.error('Error in background fetch:', error.message);
            sendResponse({ success: false, error: error.message });
        }
    })();
    
    // 返回 true，表示我們將異步地發送響應
    return true; 
  }
}); 