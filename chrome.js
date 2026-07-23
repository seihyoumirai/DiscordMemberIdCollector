(function() {
    'use strict';
    window.forceStopDiscordScroll = false;
    window.stopMemberId = function() {
        window.forceStopDiscordScroll = true;
        console.log('%c[Discord] データを保存します...', 'color: yellow');
    };
    window.startMemberId = function(maxWaitCount = 40, scrollSpeed = 500) {
        const memberContainer = document.querySelector('[class*="membersWrap"]') || 
                               document.querySelector('div[role="list"]');
        if (!memberContainer) {
            alert('メンバー一覧が見つかりません。');
            return;
        }
        let scroller = memberContainer.querySelector('[class*="scroller"]') || memberContainer;
        let collected = new Set();
        let lastSize = 0;
        let noChangeCount = 0;
        window.forceStopDiscordScroll = false;
        scroller.scrollTop = 0;
        console.log(`%c[Discord] 収集を開始します...`, 'color: lime');
        function getActualUserId(element) {
            const reactKey = Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
            if (!reactKey) return null;
            let current = element[reactKey];
            while (current) {
                if (current.memoizedProps) {
                    if (current.memoizedProps.user && current.memoizedProps.user.id) {
                        return current.memoizedProps.user.id;
                    }
                    if (current.memoizedProps.userId) {
                        return current.memoizedProps.userId;
                    }
                    if (current.memoizedProps.member && current.memoizedProps.member.userId) {
                        return current.memoizedProps.member.userId;
                    }
                }
                current = current.return;
            }
            return null;
        }
        const scrollInterval = setInterval(() => {
            const memberElements = memberContainer.querySelectorAll('[data-list-item-id^="members-"]');
            memberElements.forEach(el => {
                const realUserId = getActualUserId(el);
                if (realUserId && /^\d{17,20}$/.test(realUserId)) {
                    collected.add(realUserId);
                }
            });
            if (collected.size > lastSize) {
                lastSize = collected.size;
                noChangeCount = 0;
                console.log(`%c現在 ${collected.size} 人のIDを収集済み`, 'color: cyan');
            } else {
                noChangeCount++;
                console.log(`新規なし... 待機 ${noChangeCount} / ${maxWaitCount}`);
            }
            scroller.scrollTop += scrollSpeed;
            if (noChangeCount >= maxWaitCount || window.forceStopDiscordScroll) {
                clearInterval(scrollInterval);
                const stopReason = window.forceStopDiscordScroll ? "手動停止" : "自動終了";
                console.log(`%c[完了 - ${stopReason}] 合計 ${collected.size} 人のIDを収集しました`, 'color: lime; font-weight: bold');
                if (collected.size === 0) {
                    alert('IDを取得できませんでした。');
                    return;
                }
                const textContent = Array.from(collected).join('\n');
                const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `discord_ID_data.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log('%c[Discord] ファイルがダウンロードされました！', 'color: lime');
            }
        }, 1500); 
    };
    console.log('%c[Discord] スクリプト読み込み完了', 'color: orange');
})();
