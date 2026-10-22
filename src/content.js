(() => {
  'use strict';

  const ROOT_ID = 'member-id-collector-root';
  const ID_RE = /^\d{17,20}$/;
  let runToken = 0;
  let dismissed = false;

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

  function addIdsFromElement(el, ids, kind) {
    if (kind === 'bans') {
      const avatar = el.querySelector('img[src*="/avatars/"]');
      const match = avatar?.getAttribute('src')?.match(/\/avatars\/(\d{17,20})\//);
      if (match) {
        ids.add(match[1]);
        return;
      }
      const id = getActualUserId(el);
      if (id && ID_RE.test(id)) ids.add(id);
      return;
    }
    const id = getActualUserId(el);
    if (id && ID_RE.test(id)) ids.add(id);
  }

  function isScrollable(el) {
    return el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2;
  }

  function findScrollContainer(kind) {
    if (kind === 'members') {
      const wrap = document.querySelector('[class*="membersWrap"]');
      if (!wrap) return null;
      const candidates = [wrap, ...wrap.querySelectorAll('*')].filter(isScrollable);
      return candidates.find(el => el.matches('[class*="scroller"]')) || candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
    }
    const banLists = [...document.querySelectorAll('[class*="scroller"]')]
      .filter(el => isScrollable(el) && el.querySelector('[class*="bannedUser"]'));
    return banLists.sort((a, b) => a.scrollHeight - b.scrollHeight)[0] || null;
  }

  function makePanel() {
    if (document.getElementById(ROOT_ID)) return;
    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#f2f3f5;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box} .box{width:278px;background:#232428;border:1px solid #41434a;border-radius:12px;box-shadow:0 8px 28px #0008;overflow:hidden}
        header{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;background:#2b2d31;font-weight:700}
        button{border:0;border-radius:6px;padding:8px 10px;color:#fff;background:#5865f2;cursor:pointer;font:inherit}
        button.secondary{background:#4e5058} button.stop{background:#da373c} button:disabled{opacity:.55;cursor:default}
        .body{padding:12px;display:grid;gap:8px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .status{min-height:34px;padding:8px;background:#1e1f22;border-radius:6px;color:#c4c7ce;word-break:break-word}
        .hint{font-size:11px;color:#b5bac1}.close{padding:2px 7px;background:transparent;font-size:18px}
      </style>
      <div class="box"><header><span>メンバー ID 収集</span><button class="close" aria-label="閉じる">×</button></header>
      <div class="body"><div class="actions"><button id="members">メンバー一覧</button><button id="bans" class="secondary">BAN 一覧</button></div>
      <div class="actions"><button id="stop" class="stop" disabled>一時停止</button><button id="export" class="secondary" disabled>ID をTEXT保存</button></div>
      <div class="status" id="status">収集したい一覧を Discord 上に表示してください。</div>
      <div class="hint">進捗は別々に保存され、同じサーバーなら再読み込み後も再開できます。収集は一時停止を押すまで続きます。</div></div></div>`;
    document.documentElement.appendChild(host);
    const $ = selector => shadow.querySelector(selector);
    const status = $('#status');
    let ids = new Set();
    let running = false;
    let activeKind = 'members';
    let activeContainer = null;

    const storageKey = kind => {
      const guildId = location.pathname.match(/\/channels\/(\d{17,20})/)?.[1] || 'current';
      return `member-id-collector:v1:${guildId}:${kind}`;
    };
    function readSession(kind) {
      try {
        const value = JSON.parse(localStorage.getItem(storageKey(kind)) || 'null');
        return value && Array.isArray(value.ids) ? value : null;
      } catch { return null; }
    }
    function writeSession(kind, scrollTop) {
      try {
        localStorage.setItem(storageKey(kind), JSON.stringify({
          ids: Array.from(ids),
          scrollTop: Math.max(0, Math.floor(scrollTop || 0)),
          updatedAt: Date.now()
        }));
        return true;
      } catch (error) {
        status.textContent = `進捗を保存できませんでした: ${error.message}`;
        return false;
      }
    }
    function getCombinedIds() {
      const members = readSession('members');
      const bans = readSession('bans');
      return new Set([...(members?.ids || []), ...(bans?.ids || []), ...ids].filter(id => ID_RE.test(id)));
    }
    function updateResumeLabels() {
      const members = readSession('members');
      const bans = readSession('bans');
      $('#members').textContent = members ? `メンバー再開（${members.ids.length}件）` : 'メンバー一覧';
      $('#bans').textContent = bans ? `BAN再開（${bans.ids.length}件）` : 'BAN 一覧';
      if (!running) {
        const latest = !members ? (bans ? 'bans' : null)
          : !bans ? 'members'
          : (bans.updatedAt || 0) > (members.updatedAt || 0) ? 'bans' : 'members';
        if (latest) {
          activeKind = latest;
          $('#stop').disabled = false;
          $('#stop').textContent = `途中再開（${latest === 'members' ? 'メンバー' : 'BAN'}）`;
        } else {
          $('#stop').disabled = true;
          $('#stop').textContent = '一時停止';
        }
      }
    }

    function finish(message) {
      const pausedKind = activeKind;
      running = false;
      let saved = true;
      if (activeContainer) {
        const rows = pausedKind === 'members'
          ? activeContainer.querySelectorAll('[data-list-item-id^="members-"]')
          : activeContainer.querySelectorAll('[class*="bannedUser"]');
        rows.forEach(row => addIdsFromElement(row, ids, pausedKind));
        saved = writeSession(pausedKind, activeContainer.scrollTop);
      }
      activeContainer = null;
      $('#stop').disabled = true;
      $('#members').disabled = false;
      $('#bans').disabled = false;
      $('#export').disabled = getCombinedIds().size === 0;
      updateResumeLabels();
      // Keep this same control available as the resume action immediately after pausing.
      activeKind = pausedKind;
      $('#stop').disabled = false;
      $('#stop').textContent = `途中再開（${pausedKind === 'members' ? 'メンバー' : 'BAN'}）`;
      status.textContent = `${message}（合計 ${ids.size} 件）${saved ? '・進捗を保存しました' : '・進捗保存に失敗しました。TXT 保存を実行してください'}`;
    }
    function save() {
      const combined = getCombinedIds();
      if (!combined.size) {
        status.textContent = '保存する ID がありません。メンバーか BAN の収集を行ってください。';
        return;
      }
      ids = combined;
      const blob = new Blob([Array.from(combined).join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'discord_member_and_ban_ids.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `メンバーと BAN の ID を統合して保存しました（重複除外後 ${combined.size} 件）`;
    }
    function collect(kind) {
      const container = findScrollContainer(kind);
      if (!container) {
        status.textContent = kind === 'members'
          ? 'メンバー欄が見つかりません。サーバーを開き、右側のメンバー一覧を表示してください。'
          : 'BAN 一覧が見つかりません。サーバー設定の BAN 一覧を開いてください。';
        return;
      }
      runToken++;
      const token = runToken;
      activeKind = kind;
      activeContainer = container;
      const previous = readSession(kind);
      const resume = Boolean(previous);
      ids = new Set(resume ? previous.ids.filter(id => ID_RE.test(id)) : []);
      running = true;
      $('#stop').disabled = false;
      $('#stop').textContent = '一時停止';
      $('#members').disabled = true;
      $('#bans').disabled = true;
      $('#export').disabled = true;
      container.scrollTop = resume ? Math.min(previous.scrollTop || 0, container.scrollHeight) : 0;
      const label = kind === 'members' ? 'メンバー一覧' : 'BAN 一覧';
      status.textContent = `${label}を${resume ? '再開' : '新規開始'}します… ${ids.size} 件を復元`;
      const tick = () => {
        if (!running || token !== runToken) return;
        const rows = kind === 'members'
          ? container.querySelectorAll('[data-list-item-id^="members-"]')
          : container.querySelectorAll('[class*="bannedUser"]');
        rows.forEach(row => addIdsFromElement(row, ids, kind));
        writeSession(kind, container.scrollTop);
        const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
        status.textContent = `${label}を読み取り中… ${ids.size} 件${atBottom ? '（末尾で待機中）' : ''}`;
        container.scrollTop = Math.min(container.scrollTop + Math.max(240, Math.floor(container.clientHeight * 0.8)), container.scrollHeight);
        setTimeout(tick, 500);
      };
      setTimeout(tick, 250);
    }
    $('#members').addEventListener('click', () => collect('members'));
    $('#bans').addEventListener('click', () => collect('bans'));
    $('#stop').addEventListener('click', () => {
      if (running) {
        runToken++;
        finish('一時停止しました');
      } else {
        collect(activeKind);
      }
    });
    $('#export').addEventListener('click', save);
    $('.close').addEventListener('click', () => {
      if (running) { runToken++; finish('パネルを閉じました。進捗を保存しました'); }
      dismissed = true;
      host.remove();
    });

    ids = getCombinedIds();
    $('#export').disabled = ids.size === 0;
    updateResumeLabels();
    if (ids.size) status.textContent = `保存済み ID ${ids.size} 件を読み込みました。TXT 保存でメンバーと BAN を統合できます。`;
  }

  const observer = new MutationObserver(() => {
    if (!dismissed && location.hostname === 'discord.com' && !document.getElementById(ROOT_ID)) makePanel();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  makePanel();
})();
