let isExtensionEnabled = true;
let featuresAreActive = false;
let pageIsWatchPage = false;
let pageChangeListenerInterval = null;

function startFeatures() {
    console.log('Netflix Helper: 啟動功能');
    observeVideoPlayer();
    startVideoMonitor();
}

function stopFeatures() {
    console.log('Netflix Helper: 停止功能');
    disconnectPlayerObserver();
    stopVideoMonitor();
}

function handleStateAndPageChange() {
    const isNowWatchPage = window.location.href.includes('/watch/');
    const shouldBeActive = isExtensionEnabled && isNowWatchPage;

    if (shouldBeActive && !featuresAreActive) {
        // 狀態從「不活躍」變為「活躍」，啟動功能
        startFeatures();
        featuresAreActive = true;
    } else if (!shouldBeActive && featuresAreActive) {
        // 狀態從「活躍」變為「不活躍」，停止功能
        stopFeatures();
        featuresAreActive = false;
    }
}

// 讀取初始狀態
chrome.storage.sync.get({ isEnabled: true }, (data) => {
    isExtensionEnabled = data.isEnabled;
    console.log(`Netflix Helper: 初始狀態為 ${isExtensionEnabled ? '開啟' : '關閉'}`);
    // 進行一次初始狀態檢查
    handleStateAndPageChange();
    // 開始監控頁面和狀態的變化
    setInterval(handleStateAndPageChange, 1000);
});

// 監聽來自彈出視窗的狀態變化
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.isEnabled) {
        isExtensionEnabled = changes.isEnabled.newValue;
        console.log(`Netflix Helper: 狀態變更為 ${isExtensionEnabled ? '開啟' : '關閉'}`);
        handleStateAndPageChange();
    }
});

let playerObserver = null;

// 監聽影片播放狀態
function observeVideoPlayer() {
    if (playerObserver) {
        return; // 如果已經在運行，則不執行
    }
    let lastSimulationTime = 0;
    const simulationCooldown = 5000; // 5秒冷卻時間

    playerObserver = new MutationObserver((mutations) => {
        let shouldSimulateMouse = false;
        let hasRelevantChanges = false;

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'subtree') {
                // 檢查是否有相關的變化（影片控制項、下一集按鈕等）
                const addedNodes = Array.from(mutation.addedNodes);
                const hasVideoControls = addedNodes.some(node => 
                    node.nodeType === Node.ELEMENT_NODE && 
                    (node.classList?.contains('watch-video--bottom-controls-container') ||
                     node.querySelector?.('.watch-video--bottom-controls-container') ||
                     node.querySelector?.('[data-uia="next-episode-seamless-button"]'))
                );

                if (hasVideoControls) {
                    hasRelevantChanges = true;
                }
            }
        });

        // 只有在擴充功能啟用時才執行後續操作
        if (!isExtensionEnabled) {
            return;
        }

        // 只有在有相關變化且超過冷卻時間時才模擬滑鼠移動
        if (hasRelevantChanges) {
            const now = Date.now();
            if (now - lastSimulationTime > simulationCooldown) {
                shouldSimulateMouse = true;
                lastSimulationTime = now;
            }
        }

        if (shouldSimulateMouse) {
            simulateMouseMove();
        }
        
        // 檢查並略過介紹
        skipIntro();
        // 檢查並自動播放下一集
        autoPlayNext();
    });

    // 監聽整個文檔的變化，但使用更精確的配置
    playerObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false, // 不監聽屬性變化，減少觸發頻率
        characterData: false // 不監聽文字內容變化
    });
}

function disconnectPlayerObserver() {
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
        console.log('Netflix Helper: Player observer disconnected.');
    }
}

// 略過介紹
function skipIntro() {
    // 檢查擴充功能是否啟用
    if (!isExtensionEnabled) {
        return;
    }
    
    // 尋找略過介紹按鈕
    const skipButton = document.querySelector('.watch-video--skip-content-button, [data-uia="player-skip-intro"] button, [data-uia="player-skip-recap"] button');
    if (skipButton) {
        skipButton.click();
    } else {
        // console.log('未找到略過介紹/回顧按鈕');
    }
}

// 模擬滑鼠移動以觸發 UI 顯示
function simulateMouseMove() {
    // 檢查是否在影片播放頁面
    if (!window.location.href.includes('/watch/')) {
        return;
    }

    // 檢查是否在預覽頁面（避免在預覽頁面觸發）
    const isPreviewPage = document.querySelector('.previewModal--wrapper, .previewModal, [data-uia="preview-modal"]');
    if (isPreviewPage) {
        return;
    }

    // 直接在 body 上模擬滑鼠移動，確保事件能被觸發
    const body = document.body;
    if (body) {
        const rect = body.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const event = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY
        });
        body.dispatchEvent(event);
    } else {
        // console.log('[simulateMouseMove] 未找到 document.body 進行滑鼠模擬。');
    }
}

let videoCheckInterval = null;

function stopVideoMonitor() {
    if (videoCheckInterval) {
        clearInterval(videoCheckInterval);
        videoCheckInterval = null;
        console.log('Netflix Helper: Video monitor stopped.');
    }
}

function startVideoMonitor() {
    // 清除任何現有的監測，避免重複啟動
    stopVideoMonitor();

    videoCheckInterval = setInterval(() => {
        // 首先檢查擴充功能是否啟用
        if (!isExtensionEnabled) {
            return;
        }

        const video = document.querySelector('video');
        if (video) {
            console.log(`[VideoMonitor] 檢查影片狀態: paused=${video.paused}, ended=${video.ended}, currentTime=${video.currentTime.toFixed(2)}, duration=${video.duration.toFixed(2)}`);
            // 確保影片正在播放且未暫停或結束
            if (!video.paused && !video.ended) {
                const timeRemaining = video.duration - video.currentTime;
                console.log(`[VideoMonitor] 影片剩餘時間: ${timeRemaining.toFixed(2)} 秒，影片已結束: ${video.ended}`);
                // 如果影片剩餘時間小於等於 15 秒，或影片已結束
                if (timeRemaining <= 15) {
                    console.log(`[VideoMonitor] 影片剩餘時間小於等於 15 秒，嘗試自動播放下一集。`);
                    console.log(`[VideoMonitor] 即將呼叫 autoPlayNext()`);
                    // 只在真正需要時才模擬滑鼠移動
                    if (timeRemaining <= 5) {
                        simulateMouseMove();
                    }
                    const clicked = autoPlayNext(); 
                    if (clicked) {
                        console.log('成功點擊下一集按鈕，停止影片監測');
                        clearInterval(videoCheckInterval);
                        videoCheckInterval = null;
                    }
                }
            } else if (video.ended) {
                // 影片真正結束時，再嘗試一次並停止監測
                console.log('[VideoMonitor] 影片已結束，嘗試自動播放下一集並停止監測。');
                console.log(`[VideoMonitor] 即將呼叫 autoPlayNext()`);
                simulateMouseMove();
                autoPlayNext();
                stopVideoMonitor();
            }
        } else {
            console.log('[VideoMonitor] 未找到影片元素。');
            // 如果找不到影片元素（例如：用戶離開了影片頁面），停止監測
            // clearInterval(videoCheckInterval);
            // videoCheckInterval = null;
        }
    }, 2000); // 每 2 秒檢查一次
    console.log('Netflix Helper: Video monitor started.');
}

// 自動播放下一集
function autoPlayNext() {
    // 檢查擴充功能是否啟用
    if (!isExtensionEnabled) {
        return false;
    }
    
    console.log('[autoPlayNext] 函數已呼叫。');

    // 檢查當前 URL 是否是影片播放頁面，避免在預覽或瀏覽頁面觸發
    if (!window.location.href.includes('/watch/')) {
        console.log('[autoPlayNext] 當前頁面不是影片播放頁面，不執行自動播放。');
        return false;
    }

    let nextButton = document.querySelector('[data-uia="next-episode-seamless-button"], [data-uia="next-episode-seamless-button-draining"]');
    
    if (nextButton) {
        console.log('[autoPlayNext] 透過 data-uia 找到下一集按鈕，準備點擊:', nextButton.outerHTML);
        setTimeout(() => {
            nextButton.click();
            console.log('[autoPlayNext] 已點擊下一集按鈕。');
        }, 100); // 延遲 100 毫秒後點擊
        return true;
    }

    // 備用：嘗試透過文字內容尋找按鈕
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
        if (span.textContent && span.textContent.includes('下一集')) {
            const parentButton = span.closest('button');
            if (parentButton) {
                console.log('[autoPlayNext] 透過文字內容找到下一集按鈕，準備點擊:', parentButton.outerHTML);
                setTimeout(() => {
                    parentButton.click();
                    console.log('[autoPlayNext] 已點擊下一集按鈕 (備用)');
                }, 100);
                return true;
            }
        }
    }

    // 新增：當沒有「下一集」按鈕時，嘗試點擊「接下來播放」的影片
    const postPlayContainer = document.querySelector('[data-uia="post-play-experience-container"]');
    if (postPlayContainer) {
        console.log('[autoPlayNext] 找到 post-play 容器，正在尋找下一個播放項目。');
        // Netflix 推薦的下一個影片通常有這個 'autoplay' data-uia
        const upNextButton = postPlayContainer.querySelector('[data-uia="post-play-item-autoplay"]');
        if (upNextButton) {
            console.log('[autoPlayNext] 找到「接下來播放」的推薦影片，準備點擊:', upNextButton.outerHTML);
            setTimeout(() => {
                upNextButton.click();
                console.log('[autoPlayNext] 已點擊「接下來播放」的影片。');
            }, 100);
            return true;
        }
    }

    console.log('[autoPlayNext] 未找到任何下一集按鈕或推薦影片');
    return false; 
} 