(function() {
    'use strict';

    // ============================================================
    //  1. 服务器状态检测
    // ============================================================
    const SERVER_HOST = "mc233.xin";
    const API_URL = `https://api.mcsrvstat.us/3/${SERVER_HOST}`;
    const statusContent = document.getElementById('statusContent');
    const lastUpdateSpan = document.getElementById('lastUpdateTime');
    const manualBtn = document.getElementById('manualRefreshBtn');
    const refreshIcon = document.getElementById('refreshIcon');
    let refreshTimer = null;
    let isFetching = false;

    function formatTime(date) {
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            return '&#39;';
        });
    }

    function renderStatus(data, pingMs) {
        if (!statusContent) return;
        const online = data && data.online === true;
        if (online) {
            const players = data.players || { online: 0, max: 0 };
            const onlineCount = players.online ?? 0;
            const maxPlayers = players.max ?? 0;
            const version = data.version || "未知版本";
            let motdText = "无描述";
            if (data.motd && data.motd.clean) {
                if (Array.isArray(data.motd.clean)) {
                    motdText = data.motd.clean.join(' · ');
                } else {
                    motdText = data.motd.clean;
                }
            } else if (data.motd && typeof data.motd === 'string') {
                motdText = data.motd;
            }
            let playersListHtml = '';
            if (players.list && Array.isArray(players.list) && players.list.length > 0) {
                const showPlayers = players.list.slice(0, 6);
                const playerNames = showPlayers.map(function(p) { return (p && p.name) ? p.name : String(p); }).join('、');
                const moreHint = players.list.length > 6 ? ` 等${players.list.length}人` : '';
                playersListHtml =
                    `<div class="mt-3 pt-3 border-t border-gray-300"><span class="text-xs text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 在线玩家：</span><span class="text-sm text-gray-800 font-medium">${escapeHtml(playerNames)}${moreHint}</span></div>`;
            } else if (onlineCount > 0) {
                playersListHtml =
                    `<div class="mt-3 pt-3 border-t border-gray-300"><span class="text-xs text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 当前有 ${onlineCount} 位冒险家在线，但未获取到具体名单。</span></div>`;
            } else {
                playersListHtml =
                    `<div class="mt-3 pt-3 border-t border-gray-300"><span class="text-xs text-gray-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg> 暂时没有玩家在线，快成为第一个上线的人吧~</span></div>`;
            }
            const pingDisplay = (pingMs !== null && pingMs !== undefined) ? `${pingMs} ms` : '未知';
            const html = `
                    <div class="space-y-4">
                        <div class="flex items-center justify-between flex-wrap gap-3">
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-4 w-4">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span class="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
                                </span>
                                <span class="font-bold text-green-700 text-lg">● 服务器在线</span>
                            </div>
                            <div class="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">接口响应 ${pingDisplay}</div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div class="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                                <div class="text-xs text-gray-600 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 当前在线</div>
                                <div class="text-3xl font-bold text-blue-600">${onlineCount}<span class="text-base text-gray-500">/${maxPlayers}</span></div>
                            </div>
                            <div class="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                                <div class="text-xs text-gray-600 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> 游戏版本</div>
                                <div class="font-mono text-sm font-semibold text-gray-800 break-words">${escapeHtml(version)}</div>
                            </div>
                            <div class="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                                <div class="text-xs text-gray-600 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg> 状态检测</div>
                                <div class="text-sm text-green-700 font-medium"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> 可正常连接</div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg p-3 border border-gray-200">
                            <div class="text-xs text-gray-600 mb-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 服务器描述 (MOTD)</div>
                            <div class="text-gray-800 font-medium">${escapeHtml(motdText)}</div>
                        </div>
                        ${playersListHtml}
                    </div>
                `;
            statusContent.innerHTML = html;
        } else {
            const offlineMsg = data && data.error ? data.error : "服务器可能关闭或网络波动";
            const html = `
                    <div class="flex flex-col items-center justify-center py-6 space-y-3">
                        <div class="relative">
                            <span class="flex h-6 w-6">
                                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span class="relative inline-flex rounded-full h-6 w-6 bg-red-500"></span>
                            </span>
                        </div>
                        <div class="text-center">
                            <div class="text-2xl font-bold text-red-600 mb-1">服务器离线</div>
                            <div class="text-gray-700 text-sm">当前无法连接到服务器 ${SERVER_HOST}</div>
                            <div class="text-gray-500 text-xs mt-2">可能原因: 服务器维护中 / 网络波动 / 启动中</div>
                            <div class="mt-3 p-2 bg-red-100 rounded text-red-700 text-xs font-medium">${escapeHtml(offlineMsg)}</div>
                            <div class="mt-4 text-sm text-gray-600">💡 请稍后刷新试试，或加入QQ群询问管理员</div>
                        </div>
                    </div>
                `;
            statusContent.innerHTML = html;
        }
        if (lastUpdateSpan) {
            const now = new Date();
            lastUpdateSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 最近更新: ${formatTime(now)}`;
        }
    }

    function showError(message) {
        if (!statusContent) return;
        const html = `
                <div class="flex flex-col items-center justify-center py-8 space-y-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline text-4xl text-amber-600"  aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <div class="text-center">
                        <div class="text-lg font-semibold text-gray-800">状态获取失败</div>
                        <div class="text-gray-700 text-sm mt-1">${escapeHtml(message)}</div>
                        <button id="retryFromErrorBtn" class="mt-4 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm hover:bg-blue-200 transition font-medium shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> 点击重试
                        </button>
                    </div>
                </div>
            `;
        statusContent.innerHTML = html;
        const retryBtn = document.getElementById('retryFromErrorBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', function() {
                fetchServerStatus(true);
            });
        }
        if (lastUpdateSpan) {
            lastUpdateSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 获取失败，待重试`;
        }
    }

    function showSkeleton() {
        if (!statusContent) return;
        statusContent.innerHTML = `
                <div class="animate-pulse space-y-4">
                    <div class="flex items-center justify-between">
                        <div class="skeleton-pulse h-6 w-24 rounded"></div>
                        <div class="skeleton-pulse h-8 w-20 rounded-full"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><div class="skeleton-pulse h-4 w-full rounded mb-2"></div><div class="skeleton-pulse h-6 w-20 rounded"></div></div>
                        <div><div class="skeleton-pulse h-4 w-full rounded mb-2"></div><div class="skeleton-pulse h-6 w-20 rounded"></div></div>
                        <div><div class="skeleton-pulse h-4 w-full rounded mb-2"></div><div class="skeleton-pulse h-6 w-32 rounded"></div></div>
                    </div>
                    <div class="skeleton-pulse h-16 w-full rounded"></div>
                </div>
            `;
    }

    async function fetchServerStatus(isManual) {
        if (isFetching) return;
        isFetching = true;
        if (refreshIcon) refreshIcon.classList.add('spin');
        if (isManual) {
            showSkeleton();
        } else {
            const isEmpty = !statusContent.innerText.trim() || statusContent.innerText.includes('状态获取失败');
            if (isEmpty) showSkeleton();
        }
        const startTime = performance.now();
        let pingTime = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(function() {
                controller.abort();
            }, 8000);
            const response = await fetch(API_URL, { signal: controller.signal });
            clearTimeout(timeoutId);
            const endTime = performance.now();
            pingTime = Math.round(endTime - startTime);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            renderStatus(data, pingTime);
        } catch (error) {
            console.warn("服务器状态获取失败:", error);
            let errorMsg = "无法连接到状态监测服务，请检查网络后点击刷新";
            if (error.name === 'AbortError') errorMsg = "请求超时，服务器状态API响应较慢";
            showError(errorMsg);
            if (lastUpdateSpan) {
                lastUpdateSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 请求失败，稍后自动重试`;
            }
        } finally {
            isFetching = false;
            if (refreshIcon) refreshIcon.classList.remove('spin');
        }
    }

    function manualRefresh() {
        fetchServerStatus(true);
        resetAutoRefresh();
    }

    function resetAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function() {
            fetchServerStatus(false);
        }, 30000);
    }

    window.addEventListener('beforeunload', function() {
        if (refreshTimer) clearInterval(refreshTimer);
    });

    function handleVisibilityChange() {
        if (document.hidden) {
            if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
        } else {
            if (!refreshTimer) {
                resetAutoRefresh();
                fetchServerStatus(false);
            }
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (manualBtn) {
        manualBtn.addEventListener('click', manualRefresh);
    }
    fetchServerStatus(false);
    resetAutoRefresh();


    // ============================================================
    //  2. 复制IP（主体 + 菜单）
    // ============================================================
    var copyBtn = document.getElementById('copy-ip');
    var ipText = document.getElementById('ip-text');
    if (copyBtn && ipText) {
        copyBtn.addEventListener('click', async function() {
            try {
                await navigator.clipboard.writeText(ipText.innerText);
                var originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline mr-1"  aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
                setTimeout(function() {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            } catch (err) {
                // 降级方案
                try {
                    var range = document.createRange();
                    range.selectNode(ipText);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                    document.execCommand('copy');
                    window.getSelection().removeAllRanges();
                    var originalText2 = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline mr-1"  aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
                    setTimeout(function() {
                        copyBtn.innerHTML = originalText2;
                    }, 2000);
                } catch (fallbackErr) {
                    alert('复制失败，请手动复制地址：' + ipText.innerText);
                }
            }
        });
    }


    // ============================================================
    //  3. 返回顶部
    // ============================================================
    var backBtn = document.getElementById('backToTop');
    if (backBtn) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 300) {
                backBtn.classList.remove('opacity-0');
                backBtn.classList.add('opacity-100');
            } else {
                backBtn.classList.add('opacity-0');
                backBtn.classList.remove('opacity-100');
            }
        });
        backBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }


    // ============================================================
    //  4. 背景音乐控制
    // ============================================================
    var audio = document.getElementById('bgMusic');
    var musicBtn = document.getElementById('musicControl');
    var tooltip = musicBtn ? musicBtn.querySelector('.music-tooltip') : null;
    var isPlaying = false;
    var userInteracted = false;

    function updateUI(playing) {
        isPlaying = playing;
        if (playing) {
            musicBtn.classList.add('playing');
            if (tooltip) tooltip.textContent = '点击暂停音乐';
        } else {
            musicBtn.classList.remove('playing');
            if (tooltip) tooltip.textContent = '点击播放音乐';
        }
    }

    function togglePlay() {
        if (audio.paused) {
            audio.play().then(function() {
                updateUI(true);
            }).catch(function(err) {
                console.warn('音乐播放失败:', err);
                updateUI(false);
            });
        } else {
            audio.pause();
            updateUI(false);
        }
    }

    if (musicBtn) {
        musicBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            userInteracted = true;
            togglePlay();
        });
    }

    var wasPlayingBeforeHidden = false;
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            wasPlayingBeforeHidden = !audio.paused;
            if (wasPlayingBeforeHidden) {
                audio.pause();
                updateUI(false);
            }
        } else {
            if (wasPlayingBeforeHidden && userInteracted) {
                audio.play().then(function() {
                    updateUI(true);
                }).catch(function() {});
            }
        }
    });


    // ============================================================
    //  5. 移动端汉堡菜单（含音乐按钮屏蔽）
    // ============================================================
    var mobileMenu = document.getElementById('mobileMenu');
    var menuToggle = document.getElementById('menuToggle');
    var menuIconBars = document.getElementById('menuIconBars');
    var menuIconClose = document.getElementById('menuIconClose');
    var menuCloseBtn = document.getElementById('menuCloseBtn');
    var menuOverlay = document.getElementById('menuOverlay');
    var menuLinks = document.querySelectorAll('#mobileMenu .menu-links a');
    var menuCopyBtn = document.getElementById('menuCopyBtn');
    var bodyEl = document.body;
    var musicControl = document.getElementById('musicControl');

    var isMenuOpen = false;

    function openMenu() {
        if (isMenuOpen) return;
        isMenuOpen = true;
        menuIconBars.style.display = 'none';
        menuIconClose.style.display = '';
        mobileMenu.classList.add('menu-open');
        bodyEl.classList.add('menu-open-state');
        mobileMenu.setAttribute('aria-hidden', 'false');
        menuToggle.setAttribute('aria-expanded', 'true');
        if (musicControl) musicControl.style.pointerEvents = 'none';
        setTimeout(function() {
            menuCloseBtn.focus();
        }, 100);
    }

    function closeMenu() {
        if (!isMenuOpen) return;
        isMenuOpen = false;
        menuIconBars.style.display = '';
        menuIconClose.style.display = 'none';
        mobileMenu.classList.remove('menu-open');
        bodyEl.classList.remove('menu-open-state');
        mobileMenu.setAttribute('aria-hidden', 'true');
        menuToggle.setAttribute('aria-expanded', 'false');
        if (musicControl) musicControl.style.pointerEvents = 'auto';
        if (menuCopyBtn.classList.contains('copied')) {
            menuCopyBtn.classList.remove('copied');
            menuCopyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> 复制服务器地址';
        }
        menuToggle.focus();
    }

    function toggleMenu() {
        if (isMenuOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMenu();
        });
    }
    if (menuCloseBtn) {
        menuCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeMenu();
        });
    }
    if (menuOverlay) {
        menuOverlay.addEventListener('click', function(e) {
            e.stopPropagation();
            closeMenu();
        });
    }
    if (menuLinks) {
        menuLinks.forEach(function(link) {
            link.addEventListener('click', function() {
                closeMenu();
            });
        });
    }

    // 菜单内复制IP
    if (menuCopyBtn && ipText) {
        menuCopyBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(ipText.innerText.trim());
                var originalHtml = menuCopyBtn.innerHTML;
                menuCopyBtn.classList.add('copied');
                menuCopyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
                setTimeout(function() {
                    if (menuCopyBtn.classList.contains('copied')) {
                        menuCopyBtn.classList.remove('copied');
                        menuCopyBtn.innerHTML = originalHtml;
                    }
                }, 2000);
                setTimeout(function() {
                    if (isMenuOpen) closeMenu();
                }, 1200);
            } catch (err) {
                try {
                    var range = document.createRange();
                    range.selectNode(ipText);
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(range);
                    document.execCommand('copy');
                    window.getSelection().removeAllRanges();
                    var originalHtml2 = menuCopyBtn.innerHTML;
                    menuCopyBtn.classList.add('copied');
                    menuCopyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"  aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> 已复制';
                    setTimeout(function() {
                        if (menuCopyBtn.classList.contains('copied')) {
                            menuCopyBtn.classList.remove('copied');
                            menuCopyBtn.innerHTML = originalHtml2;
                        }
                    }, 2000);
                    setTimeout(function() {
                        if (isMenuOpen) closeMenu();
                    }, 1200);
                } catch (fallbackErr) {
                    alert('复制失败，请手动复制地址：' + ipText.innerText.trim());
                }
            }
        });
    }

    var resizeTimer = null;
    window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (window.innerWidth >= 768 && isMenuOpen) {
                closeMenu();
            }
            resizeTimer = null;
        }, 200);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isMenuOpen) {
            closeMenu();
        }
    });

    if (mobileMenu) {
        mobileMenu.setAttribute('aria-hidden', 'true');
    }
    if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false');
    }

    var menuPanel = document.querySelector('#mobileMenu .menu-panel');
    if (menuPanel) {
        menuPanel.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    console.log('✅ FrostCraft 优化版已加载');
})();