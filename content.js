(function () {
  'use strict';

  const CONFIG_KEY = 'zl_apply_config_v1';
  const SEARCH_RE = /(^|\.)sou\.zhaopin\.com$/;

  const WORDS = {
    applied: ['已投递', '已申请', '已沟通', '投递成功', '申请成功', '继续沟通'],
    applyButtons: ['立即投递'],
    success: ['投递成功', '申请成功', '简历投递成功', '投递已发送', '简历已发送', '已投递', '已发送', '沟通成功'],
    verify: ['验证码', '安全验证', '滑块', '拖动滑块', '请登录', '扫码登录', '登录智联', '身份验证'],
    close: ['我知道了', '知道了', '好的', '好', '确定', '确认', '关闭', '完成'],
  };

  const state = {
    running: false,
    applying: false,
    collapsed: false,
  };

  let cfg = {
    max: 30,
    intervalSeconds: 8,
    excludeWords: '外包,培训,销售,客服,保险',
    skipApplied: true,
  };

  function loadConfig() {
    try {
      cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'));
    } catch (_) {}
  }

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function isSearchPage() {
    return SEARCH_RE.test(location.hostname) || location.pathname.includes('/sou');
  }

  function maxCount() {
    return Math.max(1, Number(cfg.max) || 30);
  }

  function intervalSeconds() {
    const value = Number(cfg.intervalSeconds);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, '');
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function includesAny(text, words) {
    return words.some(word => word && text.includes(word));
  }

  function isDisabledLike(el) {
    let node = el;
    while (node && node !== document.body && node.nodeType === 1) {
      const className = String(node.className || '').toLowerCase();
      const ariaDisabled = node.getAttribute && node.getAttribute('aria-disabled') === 'true';
      const disabledAttr = node.hasAttribute && node.hasAttribute('disabled');
      const style = getComputedStyle(node);
      if (node.disabled || disabledAttr || ariaDisabled || style.pointerEvents === 'none' || style.cursor === 'not-allowed' || Number(style.opacity || 1) < 0.45 || /disabled|disable|inactive|forbid|readonly/.test(className)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function isNextPageControl(el) {
    const label = `${textOf(el)}${el.getAttribute('aria-label') || ''}${el.getAttribute('title') || ''}`.trim();
    const className = String(el.className || '').toLowerCase();
    if (!/(下一页|next|后一页|后页)/i.test(label) && !/next/.test(className)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.width <= 240 && rect.height <= 90;
  }

  function excludeList() {
    return String(cfg.excludeWords || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  }

  function getCards() {
    const selectors = [
      '.joblist-box__item',
      '.job-list-box > div',
      '[class*="joblist"] > [class*="item"]',
      '.positionlist .positionlist-item',
      '[class*="job"][class*="item"]',
      '[class*="position"][class*="item"]',
    ];
    for (const selector of selectors) {
      const cards = Array.from(document.querySelectorAll(selector)).filter(el => {
        const text = textOf(el);
        return visible(el) && text && (/薪|经验|学历|公司|职位|招聘|投递|申请|[Kk]/.test(text));
      });
      if (cards.length) return cards;
    }
    return Array.from(document.querySelectorAll('div,li'))
      .filter(el => visible(el) && /投递|申请/.test(textOf(el)) && /薪|年|K|k|经验|学历/.test(textOf(el)))
      .slice(0, 80);
  }

  function shouldApply(card) {
    const text = textOf(card);
    if (!text) return false;
    if (cfg.skipApplied && includesAny(text, WORDS.applied)) return false;
    return !excludeList().some(word => text.includes(word));
  }

  function findApplyButton(scope) {
    if (!scope) return null;
    const scopeRect = scope.getBoundingClientRect();
    const candidates = Array.from(scope.querySelectorAll('button,a,[role="button"],.btn,[class*="btn"],[class*="apply"],[class*="deliver"],[class*="send"],span,div'));
    const matches = [];

    for (const el of candidates) {
      if (!visible(el) || textOf(el) !== '立即投递') continue;

      let node = el;
      while (node && node !== scope && node.nodeType === 1) {
        if (visible(node) && textOf(node) === '立即投递') {
          const rect = node.getBoundingClientRect();
          const buttonSized =
            rect.width >= 40 &&
            rect.height >= 18 &&
            rect.width <= 180 &&
            rect.height <= 70 &&
            rect.width <= scopeRect.width * 0.45 &&
            rect.height <= scopeRect.height * 0.35;
          if (buttonSized) matches.push(node);
        }
        node = node.parentElement;
      }
    }

    matches.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    });
    return matches[0] || null;
  }

  function clickElement(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (_) {}
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    if (target && !el.contains(target) && !target.contains(el)) return false;
    ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      (target || el).dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    });
    return true;
  }

  function overlayText() {
    return Array.from(document.querySelectorAll('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="popup"],[class*="verify"],[class*="captcha"],.el-dialog__wrapper,.ant-modal-wrap'))
      .filter(visible)
      .map(textOf)
      .join('\n');
  }

  function hasVerificationOrLogin() {
    if (/login|passport|verify/i.test(location.href)) return true;
    const nodes = Array.from(document.querySelectorAll('iframe[src*="captcha"],iframe[src*="verify"],[class*="captcha"],[class*="verify"],.geetest_panel'));
    return nodes.some(visible) || includesAny(overlayText(), WORDS.verify);
  }

  function hasSuccessSignal() {
    return includesAny(textOf(document.body), WORDS.success) ||
      textOf(document.body).includes('恭喜您，投递成功') ||
      /success|deliver|apply|resume|delivery/i.test(location.href);
  }

  async function tryCloseSuccessPage() {
    state.running = false;
    await wait(800);
    try {
      window.close();
    } catch (_) {}
    await wait(500);
    try {
      window.open('', '_self');
      window.close();
    } catch (_) {}
  }

  function closeSuccessDialog() {
    const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],.btn,[class*="btn"],[class*="close"],[aria-label],[title],span,div'))
      .filter(visible)
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width <= 260 && rect.height <= 90 && includesAny(`${textOf(el)}${el.getAttribute('title') || ''}${el.getAttribute('aria-label') || ''}`, WORDS.close);
      });
    return candidates.some(clickElement);
  }

  async function applyCard(card, progress) {
    if (state.applying) return false;
    state.applying = true;
    try {
      if (hasVerificationOrLogin()) {
        stopAuto('检测到登录或安全验证，已暂停。');
        return false;
      }

      try {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
      await wait(500);

      const btn = findApplyButton(card);

      if (!btn) return false;

      const btnRect = btn.getBoundingClientRect();
      setStatus(`点击立即投递按钮：${btn.tagName.toLowerCase()} ${Math.round(btnRect.width)}x${Math.round(btnRect.height)}`);
      clickElement(btn);
      setStatus('已点击立即投递，等待投递结果...');
      await wait(1800);

      if (hasVerificationOrLogin()) {
        stopAuto('点击后出现登录或安全验证，已暂停。');
        return false;
      }

      closeSuccessDialog();
      await wait(800);
      return true;
    } finally {
      state.applying = false;
    }
  }

  async function goNextPage() {
    const controls = Array.from(document.querySelectorAll('a,button,[role="button"],li[class*="next"],[class*="next"]'))
      .filter(visible)
      .filter(isNextPageControl)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    const next = controls[0];
    if (!next || isDisabledLike(next)) return false;

    const beforeUrl = location.href;
    const beforeText = textOf(getCards()[0] || document.body).slice(0, 120);
    clickElement(next);
    await wait(2500);
    const afterText = textOf(getCards()[0] || document.body).slice(0, 120);
    return location.href !== beforeUrl || afterText !== beforeText;
  }

  async function startAuto(startIndex, appliedCount) {
    if (state.running) return;
    if (!isSearchPage()) {
      setStatus('请先回到智联搜索结果页再开始。');
      return;
    }

    state.running = true;
    updateButtons();

    let applied = Number(appliedCount) || 0;
    let index = Math.max(0, Number(startIndex) || 0);
    const max = maxCount();

    while (state.running && applied < max) {
      const cards = getCards();
      if (!cards.length) {
        stopAuto('当前页面没有找到职位卡片。');
        break;
      }

      if (index >= cards.length) {
        const hasNext = await goNextPage();
        if (!hasNext) {
          stopAuto(`已无下一页，停止投递。本次已投递 ${applied}/${max} 个。`);
          break;
        }
        index = 0;
        setStatus('已进入下一页，继续投递...');
        continue;
      }

      const card = cards[index];
      const title = (card.innerText || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || `第 ${index + 1} 个职位`;

      if (!shouldApply(card)) {
        setStatus(`跳过 ${index + 1}/${cards.length}：${title}`);
        index += 1;
        await wait(400);
        continue;
      }

      setStatus(`投递 ${applied + 1}/${max}，当前页 ${index + 1}/${cards.length}：${title}`);
      const ok = await applyCard(card, { running: true, searchUrl: location.href, nextIndex: index + 1, applied, max });
      index += 1;

      if (ok) {
        applied += 1;
        const interval = intervalSeconds();
        if (state.running && applied < max && interval > 0) {
          setStatus(`已投递 ${applied}/${max}，等待 ${interval}s...`);
          await wait(interval * 1000);
        }
      } else {
        await wait(800);
      }
    }

    if (state.running) stopAuto(`自动投递完成，已投递 ${applied}/${max} 个。`);
  }

  function stopAuto(message) {
    state.running = false;
    updateButtons();
    if (message) setStatus(message);
  }

  function setStatus(text) {
    const el = document.querySelector('#zl_assist_panel .zl-status');
    if (el) el.textContent = text;
  }

  function updateButtons() {
    const panel = document.getElementById('zl_assist_panel');
    if (!panel) return;
    const auto = panel.querySelector('[data-action="auto"]');
    const stop = panel.querySelector('[data-action="stop"]');
    if (auto) auto.disabled = state.running;
    if (stop) stop.disabled = !state.running;
  }

  function createPanel() {
    if (!isSearchPage()) {
      const panel = document.getElementById('zl_assist_panel');
      if (panel) panel.remove();
      return;
    }
    if (document.getElementById('zl_assist_panel')) return;
    const panel = document.createElement('div');
    panel.id = 'zl_assist_panel';
    panel.innerHTML = [
      '<div class="zl-header">',
        '<div class="zl-title">智联 投递助手</div>',
        '<button class="zl-collapse" type="button" title="收起">-</button>',
      '</div>',
      '<div class="zl-body">',
        '<div class="zl-note">先在智联页面自行搜索和筛选职位，本插件只按当前结果投递简历。</div>',
        '<div class="zl-field">',
          '<div class="zl-label">投递总数</div>',
          '<input class="zl-input" data-field="max" type="number" min="1">',
        '</div>',
        '<div class="zl-field">',
          '<div class="zl-label">投递间隔 秒</div>',
          '<input class="zl-input" data-field="intervalSeconds" type="number">',
        '</div>',
        '<div class="zl-field">',
          '<div class="zl-label">排除词</div>',
          '<textarea class="zl-input zl-textarea" data-field="excludeWords" placeholder="用逗号分隔"></textarea>',
        '</div>',
        '<label class="zl-check zl-field">',
          '<input type="checkbox" data-field="skipApplied">',
          '<span>跳过已投递/已申请</span>',
        '</label>',
        '<div class="zl-status">在职位搜索结果页点击“开始投递”。</div>',
        '<div class="zl-actions">',
          '<button class="zl-button zl-button-primary" data-action="auto" type="button">开始投递</button>',
          '<button class="zl-button zl-button-danger" data-action="stop" type="button">停止</button>',
        '</div>',
      '</div>',
    ].join('');

    document.documentElement.appendChild(panel);
    syncForm(panel);
    bindPanel(panel);
    makeDraggable(panel);
    updateButtons();
  }

  function syncForm(panel) {
    panel.querySelector('[data-field="max"]').value = cfg.max;
    panel.querySelector('[data-field="intervalSeconds"]').value = cfg.intervalSeconds ?? '';
    panel.querySelector('[data-field="excludeWords"]').value = cfg.excludeWords;
    panel.querySelector('[data-field="skipApplied"]').checked = Boolean(cfg.skipApplied);
  }

  function readForm(panel) {
    cfg.max = Math.max(1, Number(panel.querySelector('[data-field="max"]').value) || 30);
    cfg.intervalSeconds = panel.querySelector('[data-field="intervalSeconds"]').value.trim();
    cfg.excludeWords = panel.querySelector('[data-field="excludeWords"]').value.trim();
    cfg.skipApplied = panel.querySelector('[data-field="skipApplied"]').checked;
    saveConfig();
  }

  function bindPanel(panel) {
    panel.addEventListener('input', event => {
      if (event.target.matches('.zl-input')) readForm(panel);
    });
    panel.addEventListener('change', () => readForm(panel));
    panel.addEventListener('click', event => {
      const action = event.target.dataset.action;
      if (!action) return;
      readForm(panel);
      if (action === 'auto') startAuto(0, 0);
      if (action === 'stop') stopAuto('已停止自动投递。');
    });
    panel.querySelector('.zl-collapse').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      panel.querySelector('.zl-body').style.display = state.collapsed ? 'none' : '';
      panel.querySelector('.zl-collapse').textContent = state.collapsed ? '+' : '-';
    });
  }

  function makeDraggable(panel) {
    const header = panel.querySelector('.zl-header');
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener('mousedown', event => {
      if (event.target.closest('button')) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      panel.style.left = Math.max(8, event.clientX - offsetX) + 'px';
      panel.style.top = Math.max(8, event.clientY - offsetY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function watchRoute() {
    let last = location.href;
    setInterval(() => {
      if (location.href === last) return;
      last = location.href;
      setTimeout(() => {
        if (!isSearchPage() && hasSuccessSignal()) tryCloseSuccessPage();
        createPanel();
      }, 800);
    }, 700);
  }

  function init() {
    loadConfig();
    if (!isSearchPage() && hasSuccessSignal()) tryCloseSuccessPage();
    createPanel();
    watchRoute();
    const observer = new MutationObserver(() => {
      if (isSearchPage() && !document.getElementById('zl_assist_panel')) createPanel();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
