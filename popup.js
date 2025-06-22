document.addEventListener('DOMContentLoaded', async () => {
    const toggleSwitch = document.getElementById('toggleSwitch');
    const statusText = document.getElementById('statusText');
    const versionDisplay = document.getElementById('version-display');
    const trialStatusEl = document.getElementById('trial-status');
    const upgradeButton = document.getElementById('upgrade-button');

    // 暫時禁用伺服器驗證，強制使用本地試用期
    const FORCE_LOCAL_TRIAL = false;
    // 【測試開關】使用假權杖來測試伺服器連線
    const USE_FAKE_TOKEN = true;

    // 您的後端伺服器 URL
    const BACKEND_URL = 'https://netflix-skipper.vercel.app/api';
    const TRIAL_PERIOD_DAYS = 30;

    // 顯示版本號
    const manifest = chrome.runtime.getManifest();
    versionDisplay.textContent = `Version ${manifest.version}`;

    function updateStatus(message) {
        statusText.textContent = message;
    }

    // [新增] 離線備用邏輯：檢查本地試用狀態
    function checkLocalTrialStatus() {
        console.warn('Backend verification failed. Falling back to local trial check.');
        trialStatusEl.textContent = 'Offline Mode: Using local trial status.';
        
        chrome.storage.sync.get(['isEnabled', 'trialStartDate'], (data) => {
            const { isEnabled, trialStartDate } = data;

            if (!trialStartDate) {
                trialStatusEl.textContent = 'Error: Could not determine local trial status.';
                toggleSwitch.disabled = true;
                updateStatus('Disabled');
                return;
            }

            const startDate = new Date(trialStartDate);
            const now = new Date();
            const elapsedMs = now.getTime() - startDate.getTime();
            const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
            const remainingDays = Math.ceil(TRIAL_PERIOD_DAYS - elapsedDays);

            if (remainingDays > 0) {
                trialStatusEl.textContent = `Offline Mode: ${remainingDays} days left in trial.`;
                toggleSwitch.disabled = false;
                toggleSwitch.checked = isEnabled;
                updateStatus('Enabled');
            } else {
                trialStatusEl.innerHTML = 'Offline Mode: Trial has expired. <br>Please upgrade to continue.';
                trialStatusEl.style.color = '#E50914';
                toggleSwitch.checked = false;
                toggleSwitch.disabled = true;
                updateStatus('Disabled');
                upgradeButton.style.display = 'block';
                if (isEnabled) {
                    chrome.storage.sync.set({ isEnabled: false });
                }
            }
        });
    }

    function updateUI(license) {
        // ... (伺服器模式的 UI 更新邏輯, 目前未使用)
    }

    async function verifyAndInitialize() {
        updateStatus('Verifying license...');
        toggleSwitch.disabled = true;

        try {
            const clientId = '364621191970-fun3jhghqs14bp9h40t7s749pqq6jn8b.apps.googleusercontent.com';
            const redirectUri = `https://` + chrome.runtime.id + `.chromiumapp.org/`;
            const nonce = Math.random().toString(36).substring(2, 15);
            
            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.append('client_id', clientId);
            authUrl.searchParams.append('response_type', 'id_token');
            authUrl.searchParams.append('scope', 'openid profile email');
            authUrl.searchParams.append('redirect_uri', redirectUri);
            authUrl.searchParams.append('nonce', nonce);

            const resultUrl = await new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                    url: authUrl.href,
                    interactive: true
                }, (responseUrl) => {
                    if (chrome.runtime.lastError) {
                        return reject(new Error(chrome.runtime.lastError.message));
                    }
                    if (!responseUrl) {
                        return reject(new Error("Authentication flow was cancelled by the user."));
                    }
                    resolve(responseUrl);
                });
            });

            const urlHash = new URL(resultUrl).hash;
            const params = new URLSearchParams(urlHash.substring(1));
            const idToken = params.get('id_token');

            if (!idToken) {
                throw new Error("Could not retrieve ID token from Google.");
            }
            
            const token = idToken;

            const response = await fetch(`${BACKEND_URL}/verify-license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(`Server error: ${errorData.message}`);
            }

            const data = await response.json();
            handleLicenseStatus(data.license);

        } catch (error) {
            console.error('Error during license verification:', error);
            updateStatus(`Error: ${error.message}`);
            toggleSwitch.disabled = true;
        }
    }

    function handleLicenseStatus(license) {
        if (license === 'VALID') {
            updateUI(license);
            updateStatus('Enabled');
            toggleSwitch.checked = true;
            toggleSwitch.disabled = false;
        } else if (license === 'EXPIRED') {
            updateStatus('Trial expired. Please upgrade.');
            toggleSwitch.checked = false;
            toggleSwitch.disabled = true;
            chrome.storage.sync.set({ isEnabled: false });
        } else {
            updateStatus('Invalid license.');
            toggleSwitch.checked = false;
            toggleSwitch.disabled = true;
            chrome.storage.sync.set({ isEnabled: false });
        }
    }

    // 主啟動函數
    function initializePopup() {
        if (FORCE_LOCAL_TRIAL) {
            checkLocalTrialStatus();
        } else {
            // 未來的伺服器驗證邏輯
            verifyAndInitialize();
        }
    }

    initializePopup();

    // 監聽開關的變化
    toggleSwitch.addEventListener('change', () => {
        const isEnabled = toggleSwitch.checked;
        chrome.storage.sync.set({ isEnabled: isEnabled });
        updateStatus(isEnabled ? 'Enabled' : 'Disabled');
    });

    // 升級按鈕點擊事件
    upgradeButton.addEventListener('click', () => {
        // 這部分將來會從後端獲取 Paddle 的 URL
        alert('This will redirect to the Paddle checkout page.');
    });
}); 