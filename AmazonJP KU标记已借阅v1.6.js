// ==UserScript==
// @name         AmazonJP KU标记已借阅
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Amazon.co.jp Kindle搜索结果标记已借阅图书（自动抓取+导出备份+直接选择文件导入）
// @author       Gemini & You
// @match        https://www.amazon.co.jp/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=amazon.co.jp
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置项 ---
    const STORAGE_KEY = 'ku_borrowed_asins';

    // --- 样式注入 ---
    GM_addStyle(`
        .ku-borrowed-mark {
            position: absolute;
            top: 0;
            left: 0;
            width: 24px;
            height: 24px;
            background-color: #2ecc71;
            border-radius: 50%;
            z-index: 100;
            box-shadow: 1px 1px 3px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            margin-top: 2px;
            margin-left: 2px;
        }
        .ku-borrowed-mark::after {
            content: '';
            display: block;
            width: 6px;
            height: 10px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
            margin-bottom: 1px;
        }
        .s-product-image-container, .s-image-fixed-height {
            position: relative !important;
        }
    `);

    // --- 核心数据管理 ---

    function getBorrowedASINs() {
        const stored = GM_getValue(STORAGE_KEY, []);
        return new Set(stored);
    }

    function addASIN(asin) {
        if (!asin) return;
        const currentSet = getBorrowedASINs();
        if (!currentSet.has(asin)) {
            currentSet.add(asin);
            GM_setValue(STORAGE_KEY, Array.from(currentSet));
            console.log(`[KU Marker] 成功记录已借阅 ASIN: ${asin}`);
        }
    }

    // --- 菜单功能：文件导入 (新功能) ---
    function importASINsFromFile() {
        // 创建一个隐藏的文件输入框
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt'; // 只接受txt文件
        fileInput.style.display = 'none';

        // 监听文件选择事件
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                const text = event.target.result;
                if (!text) return;

                // 解析内容
                const asins = text.split(/[\s,]+/).filter(s => s.trim().length > 0);
                const currentSet = getBorrowedASINs();
                let count = 0;

                asins.forEach(asin => {
                    const cleanAsin = asin.trim();
                    // 简单的ASIN校验 (通常是10位字符)
                    if (cleanAsin.length >= 8 && !currentSet.has(cleanAsin)) {
                        currentSet.add(cleanAsin);
                        count++;
                    }
                });

                GM_setValue(STORAGE_KEY, Array.from(currentSet));
                alert(`✅ 导入成功！\n新增 ASIN: ${count} 个\n总记录数: ${currentSet.size} 个\n页面即将刷新以应用更改。`);

                // 自动刷新页面以显示图标
                window.location.reload();
            };

            // 读取文件
            reader.readAsText(file);
        });

        // 触发点击
        document.body.appendChild(fileInput);
        fileInput.click();

        // 稍后移除元素
        setTimeout(() => {
            document.body.removeChild(fileInput);
        }, 1000);
    }

    // --- 菜单功能：导出文件 ---
    function exportASINsToFile() {
        const currentSet = getBorrowedASINs();
        if (currentSet.size === 0) {
            alert("当前还没有记录任何 ASIN，无需导出。");
            return;
        }

        const listStr = Array.from(currentSet).join('\n');
        const blob = new Blob([listStr], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().slice(0,10);
        link.download = `ku_backup_${dateStr}.txt`;

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // --- 注册菜单 ---
    GM_registerMenuCommand("📂 导入备份文件 (.txt)", importASINsFromFile);
    GM_registerMenuCommand("💾 导出备份到文件 (.txt)", exportASINsToFile);
    GM_registerMenuCommand("📊 查看已存储数量", () => {
        alert(`当前已记录 ${getBorrowedASINs().size} 本借阅图书。`);
    });

    // --- 页面逻辑：详情页抓取 ---

    function checkDetailPage() {
        if (window.location.href.includes('/thankYouPage')) return;

        const asinInput = document.getElementById('ASIN') || document.querySelector('input[name="ASIN"]');
        const currentASIN = asinInput ? asinInput.value : null;
        if (!currentASIN) return;
        const bodyText = document.body.innerText;
        const isBorrowed = bodyText.includes("通过 Kindle Unlimited 包月服务借阅") ||
                           bodyText.includes("利用を終了") ||
                           bodyText.includes("お客様は、この商品をすでにKindle Unlimitedで利用しています");

        if (isBorrowed) {
            addASIN(currentASIN);
        }
    }

    // --- 页面逻辑：借阅成功页抓取 ---
    function checkThankYouPage() {
        if (!window.location.href.includes('/kindle-dbs/thankYouPage')) return;
        const urlParams = new URLSearchParams(window.location.search);
        const asin = urlParams.get('asin');
        if (asin) {
            const bodyText = document.body.innerText;
            const successKeywords = [
                "已加入您的图书馆",
                "ライブラリに追加されました",
                "Kindle Unlimited",
                "阅读器开始阅读"
            ];
            if (successKeywords.some(keyword => bodyText.includes(keyword))) {
                addASIN(asin);
            }
        }
    }

    // --- 页面逻辑：搜索列表渲染 ---

    function markSearchResults() {
        const borrowedSet = getBorrowedASINs();
        if (borrowedSet.size === 0) return;

        const items = document.querySelectorAll('[data-asin]');

        items.forEach(item => {
            const asin = item.getAttribute('data-asin');
            if (borrowedSet.has(asin)) {
                let targetContainer = item.querySelector('.s-product-image-container');
                if (!targetContainer) {
                    targetContainer = item.querySelector('.s-image-fixed-height');
                }

                if (targetContainer) {
                    if (targetContainer.querySelector('.ku-borrowed-mark')) return;
                    const mark = document.createElement('div');
                    mark.className = 'ku-borrowed-mark';
                    mark.title = '已借阅 (脚本记录)';
                    targetContainer.appendChild(mark);
                }
            }
        });
    }

    // --- 初始化与执行 ---

    if (document.querySelector('#dp') || window.location.href.includes('/dp/')) {
        setTimeout(checkDetailPage, 1500);
    }

    checkThankYouPage();

    const observer = new MutationObserver((mutations) => {
        markSearchResults();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    markSearchResults();

})();
