// ==UserScript==
// @name         DS网页CoT撤回记录
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  使用高频 DOM 视觉克隆技术。精准匹配节点，渲染过就绝对跑不掉。
// @author       Gemini
// @match        https://chat.deepseek.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/LplChen/ai-Tampermonkey-js/refs/heads/main/DS%E7%BD%91%E9%A1%B5CoT%E6%92%A4%E5%9B%9E%E8%AE%B0%E5%BD%95.js
// @downloadURL  https://raw.githubusercontent.com/LplChen/ai-Tampermonkey-js/refs/heads/main/DS%E7%BD%91%E9%A1%B5CoT%E6%92%A4%E5%9B%9E%E8%AE%B0%E5%BD%95.js
// ==/UserScript==

(function () {
    'use strict';

    let isMonitoringEnabled = localStorage.getItem('ds_cot_saver_enabled') !== 'false'; // 默认开启
    let latestData = { thinking: '', content: '' };

    // 用于追踪页面元素数量，判断是不是新对话
    let maxThinkingNodeCount = 0;
    let maxContentNodeCount = 0;
    let currentUrl = location.href;

    // 1. 注入 UI 样式 (沿用极简侧边风格)
    const style = document.createElement('style');
    style.innerHTML = `
        #ds-widget-container { position: fixed; right: 20px; bottom: 100px; z-index: 999998; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; font-family: system-ui, sans-serif; }
        .ds-toggle-wrapper { background: #1e1e2e; color: #cdd6f4; padding: 8px 12px; border-radius: 8px; border: 1px solid #45475a; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-size: 13px; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; transition: all 0.2s; }
        .ds-toggle-wrapper:hover { background: #313244; }
        .ds-switch { position: relative; width: 32px; height: 18px; background: #45475a; border-radius: 18px; transition: 0.3s; }
        .ds-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; background: white; border-radius: 50%; transition: 0.3s; }
        .ds-toggle-wrapper.active .ds-switch { background: #a6e3a1; }
        .ds-toggle-wrapper.active .ds-switch::after { transform: translateX(14px); }
        #ds-recover-btn { background: #4f46e5; color: white; padding: 10px 16px; border-radius: 20px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4); cursor: pointer; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 8px; transition: all 0.2s; user-select: none; }
        #ds-recover-btn:hover { background: #4338ca; transform: translateY(-2px); }
        #ds-recover-btn.receiving { background: #059669; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.4); }
        #ds-recover-btn.disabled-state { background: #6c7086; box-shadow: none; }
        #ds-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 999999; display: none; justify-content: center; align-items: center; }
        #ds-modal-panel { background: #1e1e2e; width: 85%; max-width: 1000px; height: 85vh; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.5); border: 1px solid #45475a; overflow: hidden; }
        .ds-modal-header { padding: 16px 20px; background: #181825; border-bottom: 1px solid #313244; display: flex; justify-content: space-between; align-items: center; color: #cdd6f4; }
        .ds-modal-title { font-size: 18px; font-weight: bold; color: #a6e3a1; }
        .ds-close-btn { cursor: pointer; color: #f38ba8; font-size: 24px; line-height: 1; }
        .ds-tabs { display: flex; background: #11111b; border-bottom: 1px solid #313244; }
        .ds-tab { padding: 12px 24px; color: #bac2de; cursor: pointer; border-bottom: 2px solid transparent; }
        .ds-tab.active { color: #89b4fa; border-bottom: 2px solid #89b4fa; background: #181825; }
        .ds-content-area { flex: 1; padding: 20px; overflow-y: auto; background: #1e1e2e; color: #cdd6f4; font-family: "Fira Code", monospace; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
        .ds-modal-footer { padding: 16px 20px; background: #181825; border-top: 1px solid #313244; display: flex; justify-content: flex-end; gap: 12px; }
        .ds-btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; }
        .ds-btn-copy { background: #89b4fa; color: #11111b; }
        .ds-btn-copy:hover { background: #b4befe; }
    `;
    document.head.appendChild(style);

    // 2. 构建 UI
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'ds-widget-container';
    widgetContainer.innerHTML = `
        <div class="ds-toggle-wrapper ${isMonitoringEnabled ? 'active' : ''}" id="ds-toggle">
            <div class="ds-switch"></div>
            <span id="ds-toggle-text">视觉直录: ${isMonitoringEnabled ? '已开启' : '已关闭'}</span>
        </div>
        <div id="ds-recover-btn" class="${!isMonitoringEnabled ? 'disabled-state' : ''}">🛡️ 查看被撤回数据</div>
    `;
    document.body.appendChild(widgetContainer);

    const overlay = document.createElement('div');
    overlay.id = 'ds-modal-overlay';
    overlay.innerHTML = `
        <div id="ds-modal-panel">
            <div class="ds-modal-header">
                <div class="ds-modal-title">🛡️ V5 视觉直录原内容</div>
                <div class="ds-close-btn" id="ds-modal-close">×</div>
            </div>
            <div class="ds-tabs">
                <div class="ds-tab active" data-target="thinking">🧠 被撤回的思考 (CoT)</div>
                <div class="ds-tab" data-target="content">📝 被截断的最终回复</div>
            </div>
            <div class="ds-content-area" id="ds-content-view"></div>
            <div class="ds-modal-footer">
                <button class="ds-btn ds-btn-copy" id="ds-copy-btn">📋 一键复制</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 3. UI 交互逻辑
    const toggleBtn = document.getElementById('ds-toggle');
    const toggleText = document.getElementById('ds-toggle-text');
    const recoverBtn = document.getElementById('ds-recover-btn');
    const contentView = document.getElementById('ds-content-view');
    let currentTab = 'thinking';

    toggleBtn.addEventListener('click', () => {
        isMonitoringEnabled = !isMonitoringEnabled;
        localStorage.setItem('ds_cot_saver_enabled', isMonitoringEnabled);
        if (isMonitoringEnabled) {
            toggleBtn.classList.add('active'); toggleText.innerText = '视觉直录: 已开启'; recoverBtn.classList.remove('disabled-state');
        } else {
            toggleBtn.classList.remove('active'); toggleText.innerText = '视觉直录: 已关闭'; recoverBtn.classList.add('disabled-state');
            latestData = { thinking: '', content: '' };
        }
    });

    const updateView = () => {
        if (!isMonitoringEnabled && !latestData.thinking && !latestData.content) {
            contentView.textContent = '⛔ 直录开关未开启，请先开启后再提问。'; return;
        }
        contentView.textContent = latestData[currentTab] || '（此部分当前没有截获到任何文字）';
    };

    recoverBtn.addEventListener('click', () => { overlay.style.display = 'flex'; updateView(); });
    document.getElementById('ds-modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });

    document.querySelectorAll('.ds-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.ds-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.getAttribute('data-target');
            updateView();
        });
    });

    document.getElementById('ds-copy-btn').addEventListener('click', () => {
        const text = latestData[currentTab];
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('ds-copy-btn');
                btn.innerText = '✅ 复制成功！';
                setTimeout(() => { btn.innerText = '📋 一键复制'; }, 2000);
            });
        }
    });

    // 4. 核心：高频 DOM 视界直录引擎 (无视任何网络封锁)
    let statusTimeout;
    
    setInterval(() => {
        if (!isMonitoringEnabled) return;

        // 【自动处理切换对话】如果发现网页 URL 变化了，或者用户清空了聊天记录，自动重置缓冲区
        if (location.href !== currentUrl || document.querySelectorAll('.ds-markdown').length === 0) {
            currentUrl = location.href;
            maxThinkingNodeCount = 0;
            maxContentNodeCount = 0;
            latestData = { thinking: '', content: '' };
        }

        // 精准使用你提供的 class 以及兼容的后备 class
        const thinkingNodes = document.querySelectorAll('._74c0879, .ds-thought-content');
        const contentNodes = document.querySelectorAll('.ds-markdown.ds-assistant-message-main-content');

        const curThinkingCount = thinkingNodes.length;
        const curContentCount = contentNodes.length;
        let hasUpdate = false;

        // 【回合检测】如果屏幕上的气泡数量变多了，说明开启了一轮新的对话
        if (curThinkingCount > maxThinkingNodeCount) {
            maxThinkingNodeCount = curThinkingCount;
            latestData.thinking = ""; // 清空上一轮的缓存
        }
        if (curContentCount > maxContentNodeCount) {
            maxContentNodeCount = curContentCount;
            latestData.content = ""; // 清空上一轮的缓存
        }

        // 【锁定只增不减读取逻辑】
        // 哪怕 DeepSeek 把节点删了 (Count 变小)，或者把内容清空了 (text.length 变小)，下面的判断都不会成立。
        // 这就保证了 latestData 里永远存着它撤回前那一瞬间最完整的文字！

        if (curThinkingCount === maxThinkingNodeCount && curThinkingCount > 0) {
            const text = thinkingNodes[curThinkingCount - 1].innerText;
            if (text && text.length > latestData.thinking.length) {
                latestData.thinking = text;
                hasUpdate = true;
            }
        }

        if (curContentCount === maxContentNodeCount && curContentCount > 0) {
            const text = contentNodes[curContentCount - 1].innerText;
            if (text && text.length > latestData.content.length) {
                latestData.content = text;
                hasUpdate = true;
            }
        }

        // 【状态响应】如果有新字抓到，面板和按钮给与反馈
        if (hasUpdate) {
            if (overlay.style.display === 'flex') updateView();
            
            recoverBtn.innerHTML = '⚡ 正在视界直录...';
            recoverBtn.classList.add('receiving');
            
            clearTimeout(statusTimeout);
            statusTimeout = setTimeout(() => {
                recoverBtn.innerHTML = '🛡️ 查看被撤回数据';
                recoverBtn.classList.remove('receiving');
            }, 1000);
        }
    }, 200); // 200毫秒（一秒5次）高频扫描，肉眼几乎无感

})();
