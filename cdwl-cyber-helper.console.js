/* ============================================================================
 * 项目：成都文理 · 赛博代刷助手（Console 版）
 * 作者：成都文理 · 赛博代刷
 * Copyright (c) 2025 成都文理 · 赛博代刷
 * 许可：PolyForm Noncommercial 1.0.0（禁止商用，详见 LICENSE）
 * ---------------------------------------------------------------------------
 * 【免责声明 / Disclaimer】
 * 1. 本脚本仅供个人学习、研究与自用，禁止任何形式的商业使用（包括但不限于：
 *    售卖、代刷收费、付费分发、嵌入商业产品或服务、以本脚本招揽客户）。
 * 2. 本脚本与目标网站及其运营方无任何关联，未获其授权、认可或背书。
 * 3. 脚本按“现状（AS IS）”提供，不承诺可用性、准确性或连续性；因使用或无法
 *    使用本脚本造成的任何直接或间接损失，作者不承担任何责任。
 * 4. 使用本脚本即表示你已阅读并同意上述条款；如不同意，请立即停止使用并删除。
 * 5. 违反上述条款将自动终止你的使用授权。
 * ---------------------------------------------------------------------------
 * 用法：课程页 F12 → Console → 粘贴本文件 → 回车（整页跳转后需重新粘贴）
 * ============================================================================ */

(function () {
  'use strict';

  const VERSION = '5.0c';
  const HOSTS = ['cdcas.chaoxiankeji.com', 'cdcas.duxingkej.com'];

  if (HOSTS.indexOf(location.hostname) < 0) {
    console.log('%c[赛博代刷] 注意：当前不在支持站点列表（' + HOSTS.join(' / ') + '），功能照常尝试', 'color:#ffa94d');
  }

  /* ==== 0. 接口优先 ==== */
  const API = { version: VERSION, ready: false, errors: [] };
  try { window.__CYBER__ = API; } catch (e) {}
  try { window.CYBER = API; } catch (e) {}
  try { document.documentElement.setAttribute('data-cyber-ver', VERSION); } catch (e) {}
  try { console.log('%c[赛博代刷] 注入 v' + VERSION, 'color:#28c76f;font-weight:700', '| __CYBER__ 可用'); } catch (e) {}
  try {
    console.log('%c[赛博代刷] 仅供个人学习研究使用，禁止商用。使用风险与后果由使用者自行承担。', 'color:#9aa0a6');
  } catch (e) {}

  /* ==== 1. 配置 ==== */
  const KEY = '__CDWL_CYBER_CFG__';
  const DEFAULT = {
    enabled: true,
    rate: 1,
    muted: true,
    autoPlay: true,
    autoNext: true,
    skipExam: true,
    delay: 2000,
    tail: 1.5,
    solveCaptcha: true,
    capCaseTry: true,
    capRetry: 3,
    ocrUrl: 'http://127.0.0.1:8899/ocr',
    hidePanel: false,
    panelPos: null,
  };
  const CFG = Object.assign({}, DEFAULT, load());
  function load() {
    try {
      const cur = localStorage.getItem(KEY);
      if (cur) return JSON.parse(cur) || {};
      const legacy = localStorage.getItem('__CX_PLAY_CFG__');   // 旧版本配置自动迁移
      if (legacy) {
        const v = JSON.parse(legacy) || {};
        localStorage.setItem(KEY, JSON.stringify(v));
        localStorage.removeItem('__CX_PLAY_CFG__');
        return v;
      }
      return {};
    } catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) {} }

  const log = (...a) => console.log('%c[赛博代刷]', 'color:#28c76f;font-weight:600', ...a);
  const warn = (...a) => console.warn('%c[赛博代刷]', 'color:#ffa94d;font-weight:600', ...a);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const hid = (id) => { const el = document.getElementById(id); return el ? String(el.value) : ''; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const state = {
    status: '待机',
    bootError: null,
    ocrOk: null,
    ocrActive: '',
    ocrErr: '',
    capB64: '',
    capSig: '',
    capOnScreen: false,
    capPassAt: 0,     // 验证通过的时间戳，用于避免残留标记导致立刻二次暂停
  };
  let capHold = false;
  let capBusy = false, capTries = 0, capAt = 0, capKey = '', capAttempt = 0;

  /* ==== 2. 播放器挂钩 ==== */
  try {
    const proto = HTMLMediaElement.prototype;
    const rd = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
    if (rd && rd.get && rd.set) {
      Object.defineProperty(proto, 'playbackRate', {
        configurable: true, enumerable: rd.enumerable,
        get() { return rd.get.call(this); },
        set(v) {
          if (!CFG.enabled) { rd.set.call(this, Number(v) || 0); return; }
          rd.set.call(this, (Number(v) || 0) < CFG.rate ? CFG.rate : Number(v));
        },
      });
    }
  } catch (e) { API.errors.push('倍速钩子: ' + e.message); }
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  } catch (e) {}

  function player() {
    const inBox = $$('#videoContent video, .courseplay-video video, .ckplayer video');
    const list = inBox.length ? inBox : $$('video');
    if (!list.length) return null;
    return list.reduce((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height > ra.width * ra.height ? b : a;
    });
  }
  const declaredDuration = () => { const v = Number(hid('video-duration')); return Number.isFinite(v) && v > 0 ? v : 0; };
  function totalDuration() {
    const v = player();
    if (v && isFinite(v.duration) && v.duration > 0) return v.duration;
    return declaredDuration();
  }

  /* ==== 3. 验证码存在性 ==== */
  const captchaPresent = () => {
    const box = document.getElementById('video-captcha');
    return !!(box && box.children && box.children.length);
  };

  // 只认"看得见的"验证码：弹窗关掉后 #yzCode / #codeImg 往往还留在 DOM 里，
  // 判存在会把播放一直卡在暂停（这就是"验证过了还暂停"的原因）
  function captchaHint() {
    if (captchaPresent()) return true;
    try {
      for (const layer of document.querySelectorAll('.layui-layer, [class*="layui-layer"]')) {
        if (inOwnPanel(layer) || !shown(layer)) continue;
        const hasCodeImg = !!layer.querySelector('img[src*="/service/code"], #codeImg');
        if (!hasCodeImg) continue;
        const box = layer.querySelector('.layui-layer-wrap') || layer;
        if (!visible(box)) continue;
        const input = findCodeInput(box, true) || findVisibleCodeInput(box);
        if (input) return true;
      }
      // 平台自己的 #video-captcha 也匹配 [id*="captcha"]，必须排除，
      // 否则空容器会被当成"验证码出现"，把播放一直卡住。
      for (const c of document.querySelectorAll('[class*="captcha"],[id*="captcha"],[class*="vcode"],[id*="vcode"],[class*="verify"],[id*="verify"],[class*="yzm"],[id*="yzm"]')) {
        if (c.id === 'video-captcha' || inOwnPanel(c)) continue;
        if (!visible(c)) continue;
        if (findCodeInput(c)) return true;
      }
      for (const el of document.querySelectorAll('input[maxlength="4"],input[maxlength="5"],input[maxlength="6"]')) {
        if (inOwnPanel(el) || !visible(el)) continue;
        let up = el.parentElement, depth = 0;
        while (up && depth < 3) {
          if (firstImage(up)) return true;
          up = up.parentElement; depth++;
        }
      }
    } catch (e) {}
    return false;
  }

  /* ==== 4. 目录与换节 ==== */
  function nodeLinks() {
    const seen = new Set();
    return $$('.detmain-navlist a[href*="/user/node"]').map((a) => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/nodeId=(\d+)/);
      if (!m || seen.has(m[1])) return null;
      seen.add(m[1]);
      return { id: m[1], href, title: clean(a.getAttribute('title') || a.textContent || '') };
    }).filter(Boolean);
  }
  function currentNodeId() {
    const v = hid('video-nodeId');
    if (/^\d+$/.test(v)) return v;
    const act = $('.detmain-navlist a.on') || $('.detmain-tabs a.on');
    const m = act && (act.getAttribute('href') || '').match(/nodeId=(\d+)/);
    return m ? m[1] : '';
  }
  function nextNode() {
    const links = nodeLinks();
    if (!links.length) return null;
    const idx = links.findIndex((l) => l.id === currentNodeId());
    if (idx < 0) return links[0];
    for (let i = idx + 1; i < links.length; i++) {
      const c = links[i];
      if (/考试|测试|测验|exam|quiz/i.test(c.title) && CFG.skipExam) return Object.assign({}, c, { exam: true });
      return c;
    }
    return null;
  }
  const progress = () => {
    const links = nodeLinks();
    return { index: links.findIndex((l) => l.id === currentNodeId()) + 1, total: links.length };
  };

  let armed = true, busy = false, lastAt = 0;

  async function goNext(why) {
    if (!CFG.enabled || !CFG.autoNext || busy || captchaHint()) return;
    const n = nextNode();
    if (!n) { state.status = '已是最后一节'; return; }
    if (n.exam) { state.status = '下一节是考试，已停下：' + n.title; return; }
    busy = true; armed = false; lastAt = Date.now();
    const p = progress();
    state.status = '播完（' + why + '）→ ' + (CFG.delay / 1000) + 's 后进入第 ' + (p.index + 1) + ' 节';
    log(state.status);
    await sleep(CFG.delay);
    try { location.href = n.href; } catch (e) {
      const link = $('.detmain-navlist a[href*="nodeId=' + n.id + '"]');
      if (link) link.click();
    }
  }

  function watchPlayer(v) {
    if (v.__cxw__) return;
    v.__cxw__ = true;
    v.addEventListener('ended', () => goNext('ended'), true);
    v.addEventListener('timeupdate', () => {
      if (!CFG.enabled || !CFG.autoNext || !armed || busy || captchaHint()) return;
      const total = totalDuration();
      if (total && v.currentTime >= total - CFG.tail) goNext('尾段');
    }, true);
    v.addEventListener('ratechange', () => {
      if (!CFG.enabled) return;
      if (v.playbackRate < CFG.rate) { try { v.playbackRate = CFG.rate; } catch (e) {} }
    });
    log('已接管播放器，时长', totalDuration() || '未知');
  }

  /* ==== 5. 验证码定位 ==== */
  const CODE_RE = /^[0-9A-Za-z]{3,6}$/;

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      const st = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      // 平台用 opacity:0 放了一张透明占位图（#codeImg），必须排除，否则截到空白
      if (Number(st.opacity) === 0) return false;
    } catch (e) {}
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }
  // 连同祖先一起判可见：隐藏的容器里，子元素本身可能仍算出非零尺寸
  function shown(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      try {
        if (n.style && n.style.display === 'none') return false;
        const st = (n.ownerDocument.defaultView || window).getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
      } catch (e) {}
      n = n.parentElement;
    }
    return visible(el);
  }

  function deepAll(root, sel) {    const out = [];
    (function walk(node) {
      if (!node || !node.querySelectorAll) return;
      node.querySelectorAll(sel).forEach((el) => out.push(el));
      node.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
    })(root);
    return out;
  }
  const inOwnPanel = (el) => !!(el.closest && el.closest('#__cyber_panel__'));

  // 平台验证码弹窗（layui）的固定特征
  const LAYER_SEL = '.layui-layer, .layui-layer-wrap, [class*="layui-layer"]';
  const CODE_IMG_RE = /\/service\/code|codeImg|captcha|verify|vcode|yzm/i;

  function isCodeInput(el, allowAny) {
    if (!el || !visible(el)) return false;
    const t = (el.type || 'text').toLowerCase();
    if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'password', 'file', 'range', 'color'].includes(t)) return false;
    const hint = [el.name, el.id, el.placeholder, el.className, el.getAttribute('aria-label')].join(' ');
    if (/code|captcha|yzm|verify|vcode|check|验证码/i.test(hint)) return true;
    const ml = Number(el.getAttribute('maxlength') || 0);
    if (ml > 0 && ml <= 6) return true;
    return !!allowAny;   // 在已确认为验证码容器内，任何可见文本框都收
  }
  function findCodeInput(root, allowAny) {
    const list = deepAll(root, 'input,textarea').filter((el) => isCodeInput(el, allowAny));
    if (!list.length) return null;
    const scored = list.map((el) => {
      const hint = [el.name, el.id, el.placeholder, el.className].join(' ');
      let s = 0;
      if (/code|captcha|yzm|verify|vcode|check|验证码/i.test(hint)) s += 5;
      if (/验证码/.test(el.placeholder || '')) s += 4;
      const ml = Number(el.getAttribute('maxlength') || 0);
      if (ml && ml <= 6) s += 3;
      if (el.id === 'yzCode') s -= 6;          // 隐藏的值容器，不要填它
      return { el, s };
    }).sort((a, b) => b.s - a.s);
    return scored[0].el;
  }
  function findConfirm(root) {
    const BTN = /^(确定|确认|提交|验证|继续|开始播放|继续播放|开始学习|进入学习|播放|OK)$/;
    const label = (el) => clean(el.textContent || el.value || '');
    // layui 弹窗：按钮在 .layui-layer 里，而输入框可能在更内层的 .layui-layer-wrap，
    // 所以先往上找到整层，再取第一个按钮（"开始播放"）
    const layerRoot = (root && root.closest && root.closest('.layui-layer')) || root;
    const primary = layerRoot && layerRoot.querySelector && layerRoot.querySelector('.layui-layer-btn0');
    if (primary && visible(primary)) return primary;
    let hit = deepAll(root, 'button,a,[role="button"],input[type="submit"],input[type="button"]')
      .filter((el) => visible(el) && !el.disabled)
      .filter((el) => BTN.test(label(el)) || el.type === 'submit');
    if (hit.length) return hit[0];
    const all = deepAll(root, 'span,div').filter((el) => visible(el) && BTN.test(clean(el.textContent)));
    hit = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
    return hit[0] || null;
  }
  function firstImage(root) {
    const imgs = deepAll(root, 'img').filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 16 && r.width <= 340 && r.height >= 10 && r.height <= 150;
    });
    if (imgs.length) {
      // 优先 /service/code 这类验证码地址，再优先已加载完成的
      const bySrc = imgs.filter((el) => CODE_IMG_RE.test(el.getAttribute('src') || ''));
      const pool = bySrc.length ? bySrc : imgs;
      const ready = pool.find((el) => el.complete && el.naturalWidth > 0) || pool[0];
      return { kind: 'img', el: ready, src: ready.currentSrc || ready.src || '' };
    }
    const cvs = deepAll(root, 'canvas').filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 16 && r.width <= 340;
    });
    if (cvs.length) return { kind: 'canvas', el: cvs[0], src: 'canvas' };
    for (const el of deepAll(root, '*')) {
      if (!visible(el)) continue;
      let bg = '';
      try { bg = (el.ownerDocument.defaultView || window).getComputedStyle(el).backgroundImage || ''; } catch (e) {}
      const m = /url\(["']?(.+?)["']?\)/.exec(bg);
      if (m && m[1]) {
        const r = el.getBoundingClientRect();
        if (r.width >= 16 && r.width <= 340) return { kind: 'bg', el, src: m[1] };
      }
    }
    return null;
  }
  function textCode(root) {
    for (const el of deepAll(root, '[data-code],[data-value],[data-answer],img[alt],img[title],[title]')) {
      for (const a of ['data-code', 'data-value', 'data-answer', 'alt', 'title']) {
        const v = el.getAttribute && el.getAttribute(a);
        if (v && CODE_RE.test(clean(v))) return clean(v);
      }
    }
    for (const el of deepAll(root, 'input[type="hidden"]')) {
      if (CODE_RE.test(clean(el.value))) return clean(el.value);
    }
    return '';
  }

  function findCaptcha() {
    const cands = [];
    const push = (o) => { if (o && o.input && !inOwnPanel(o.input)) cands.push(o); };

    const box = document.getElementById('video-captcha');
    if (box && box.children.length) {
      push({ input: findCodeInput(box), img: firstImage(box), box, btn: findConfirm(box), score: 100, type: 'video-captcha' });
    }

    // ① layui 弹窗（本平台实际形态）：只认可见的层。
    //    关窗后 #yzCode / #codeImg 常留在 DOM 里，判存在会反复"识别已通过的验证码"。
    for (const layer of deepAll(document, '.layui-layer')) {
      if (inOwnPanel(layer) || !shown(layer)) continue;
      const wrap = layer.querySelector('.layui-layer-wrap') || layer;
      const hasCodeImg = !!layer.querySelector('#codeImg, img[src*="/service/code"]');
      if (!hasCodeImg) continue;
      const input = findCodeInput(wrap, true) || findVisibleCodeInput(wrap);
      if (!input) continue;
      push({ input, img: firstImage(wrap), box: layer, btn: findConfirm(layer), score: 120, type: 'layui' });
    }
    // ② 其它 layui 弹窗里带 /service/code 图的
    for (const layer of deepAll(document, LAYER_SEL)) {
      if (inOwnPanel(layer) || !shown(layer)) continue;
      const hasCodeImg = deepAll(layer, 'img').some((im) => CODE_IMG_RE.test(im.getAttribute('src') || '') && visible(im));
      if (!hasCodeImg) continue;
      const input = findCodeInput(layer, true);
      if (!input) continue;
      push({ input, img: firstImage(layer), box: layer, btn: findConfirm(layer), score: 110, type: 'layui' });
    }

    for (const c of deepAll(document, '[class*="captcha"],[id*="captcha"],[class*="vcode"],[id*="vcode"],[class*="verify"],[id*="verify"],[class*="yzm"],[id*="yzm"]')) {
      if (inOwnPanel(c)) continue;
      const input = findCodeInput(c);
      if (!input) continue;
      push({ input, img: firstImage(c), box: c, btn: findConfirm(c), score: 80, type: 'container' });
    }
    if (!cands.length) {
      for (const input of deepAll(document, 'input').filter((el) => isCodeInput(el, false))) {
        if (inOwnPanel(input)) continue;
        let up = input.parentElement, depth = 0;
        while (up && depth < 3) {
          const img = firstImage(up);
          if (img) { push({ input, img, box: up, btn: findConfirm(up), score: 40, type: 'near-input' }); break; }
          up = up.parentElement; depth++;
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    best.code = textCode(best.box || document) || '';
    return best;
  }

  // 兜底：容器内第一个可见文本框（layui 弹窗里输入框没有任何类名/属性）
  function findVisibleCodeInput(root) {
    const list = deepAll(root, 'input').filter((el) => {
      if (inOwnPanel(el) || !visible(el)) return false;
      const t = (el.type || 'text').toLowerCase();
      return !['hidden', 'checkbox', 'radio', 'submit', 'button', 'password', 'file'].includes(t);
    });
    return list[0] || null;
  }

  /* ==== 6. 取图（屏幕像素优先） ==== */
  function captureB64(img) {
    if (!img) return Promise.resolve('');
    const el = img.el;
    const doc = el && el.ownerDocument;
    if (img.kind === 'canvas' && el) {
      try { return Promise.resolve(String(el.toDataURL('image/png')).split(',')[1] || ''); } catch (e) { return Promise.resolve(''); }
    }
    if (img.src && String(img.src).startsWith('data:')) return Promise.resolve(String(img.src).split(',')[1] || '');
    if (img.kind === 'img' && el && doc) {
      const draw = () => {
        try {
          const w = el.naturalWidth || 0, h = el.naturalHeight || 0;
          if (!w || !h) return '';
          const c = doc.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          if (!g) return '';
          g.drawImage(el, 0, 0, w, h);
          return String(c.toDataURL('image/png')).split(',')[1] || '';
        } catch (e) { return ''; }
      };
      if (el.complete && el.naturalWidth > 0) {
        const b = draw();
        if (b) return Promise.resolve(b);
      } else {
        return new Promise((res) => {
          const done = () => res(draw());
          el.addEventListener('load', done, { once: true });
          el.addEventListener('error', () => res(''), { once: true });
          setTimeout(done, 900);
        }).then((b) => (b ? b : fetchB64(img.src)));
      }
    }
    return fetchB64(img.src);
  }

  function fetchB64(src) {
    if (!src) return Promise.resolve('');
    if (String(src).startsWith('data:')) return Promise.resolve(String(src).split(',')[1] || '');
    return new Promise((res) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET', url: src, responseType: 'blob', timeout: 8000,
          onload: (r) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(',')[1] || '');
            fr.onerror = () => res('');
            fr.readAsDataURL(r.response);
          },
          onerror: () => res(''), ontimeout: () => res(''),
        });
      } else if (typeof fetch === 'function') {
        fetch(src).then((r) => r.blob())
          .then((b) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result).split(',')[1] || '');
            fr.onerror = () => res('');
            fr.readAsDataURL(b);
          })
          .catch(() => res(''));
      } else res('');
    });
  }

  const sigOf = (b64) => (b64 ? b64.length + ':' + b64.slice(0, 20) + ':' + b64.slice(-20) : '');

  /* ==== 7. OCR ==== */
  function ocrCandidates() {
    const list = [CFG.ocrUrl, 'http://127.0.0.1:8899/ocr', 'http://localhost:8899/ocr',
      'http://127.0.0.1:8900/ocr', 'http://127.0.0.1:8000/ocr', 'http://127.0.0.1:5000/ocr'];
    return list.filter((v, i) => v && list.indexOf(v) === i);
  }
  function httpJson(url, body, timeout) {
    return new Promise((res) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: body ? 'POST' : 'GET', url,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          data: body ? JSON.stringify(body) : undefined,
          timeout: timeout || 6000,
          onload: (r) => res({ ok: r.status >= 200 && r.status < 400, status: r.status, text: String(r.responseText || '') }),
          onerror: () => res({ ok: false, status: 0, text: 'network error' }),
          ontimeout: () => res({ ok: false, status: 0, text: 'timeout' }),
        });
      } else if (typeof fetch === 'function') {
        const opt = body
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'GET' };
        fetch(url, opt).then((r) => r.text())
          .then((t) => res({ ok: true, status: 200, text: t }))
          .catch((e) => res({ ok: false, status: 0, text: 'fetch error: ' + e.message }));
      } else {
        res({ ok: false, status: 0, text: 'no transport' });
      }
    });
  }

  async function pingOcr() {
    for (const url of ocrCandidates()) {
      const base = url.replace(/\/ocr\/?$/, '');
      const r = await httpJson(base + '/health', null, 2500);
      if (r.ok && /true/.test(r.text)) {
        state.ocrOk = true; state.ocrActive = url; state.ocrErr = '';
        log('OCR 服务已连接：', url);
        updatePanel();
        return true;
      }
      state.ocrErr = base + ' -> ' + (r.status || r.text);
    }
    state.ocrOk = false; state.ocrActive = '';
    warn('OCR 服务未连接。启动：双击 ocr/start-ocr.bat，然后 __CYBER__.pingOcr() 重试');
    updatePanel();
    return false;
  }

  async function ocr(b64) {
    if (!b64) return '';
    const url = state.ocrActive || CFG.ocrUrl;
    const r = await httpJson(url, { image: b64 }, 12000);
    if (!r.ok) { state.ocrErr = 'HTTP ' + r.status; return ''; }
    try {
      const j = JSON.parse(r.text);
      if (j.error) { state.ocrErr = String(j.error); return ''; }
      return String(j.code ?? j.text ?? j.result ?? '').replace(/[^0-9a-zA-Z]/g, '');
    } catch (e) { return String(r.text || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 8); }
  }

  function ocrTest() {
    const url = state.ocrActive || CFG.ocrUrl;
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAFoAAAAiCAIAAABQu1n5AAAER0lEQVR4nO2ZS0hqWxjHPy1qm0q7NAi0CEI7xyYFFhY9LBAsgqL3hiY1iKAmRSBZDQJ7GA6C7AFBDqKRREUOqkE4yYFBDQwse9CLMCrISrHHdl/uXVxRKbvXe+yewf6N9L/WXmvtn8tvL5RBURTQ/A3T/4qG1hEKrSMIWkcQtI4gaB1B0DqCoHVEWYfP5ysuLsZxPCTX6/UMBqOmpuafDGKxWBobGwUCQVxcHI7jJSUlBoPhO06M1C+FJMnW1lYASExMDGmanJwEgOrq6i8H0el0DAYDAHAcl0qlQqEQLbW6uvrt7Y2KJr9Sh9PpVCqVaOkR69jZ2UEutFqt/+ZNJhOXywUAjUZD/f46PB6PTqfj8XgAkJCQ8F90tLW1AUBTU1NIrtfrASAtLY2KJl/UDoqiVlZWamtrhUJhfHw8h8ORSCQ9PT1OpzOw2+LiYm9v7/39PUEQa2tr4cd0OBz19fVJSUkcDqegoGB+ft7n8/lbXS4Xj8fz7zI/ZWVlAHB5een1eiF6hLfV0tKCumVmZspksvT0dPRWIBDc3d35uy0sLBAEsbu7S1GUzWYLszskEgmO40wmMzc398ePH2i0hoYGkiTDr2R9fR0AMAzz+XxU1Ainw2g0ohuzWCz+cGtri81mA8D4+PiHV4XXAQAikchut6Nwc3MTFYWZmZnwC62srASAqqoqKpqE0zE4OCgQCIaGhkLyjo4OAGhtbY1AB5PJ3N/fD8ynp6fR7guzEoPBgK61Wq3U71ZKR0dHAYAgiAh0yOXykPz5+TkmJgbVlA8HNBqNsbGxADA2NkZFmT+n+ZKnp6ejo6Pj42O73b6zs2M2m9FxK4JSlZOTE5Kw2eyMjIyTk5PDw0ORSBTSOjs729XVRZJkb2+vSqWCKPOFjo2NDa1Wazab/SdCJpPJ5/Pdbndk86FK8WHo8XgCQ6RgYmICAEZGRvr6+iD6hNMxNzfX3t6OPtLCwsKffyGVSqempvr7+yOb70OPLpcLnUH9yfPzM0EQJpMJwzCDwdDc3Azfwqc6SJJUq9UAoFarh4eHA5tubm4ins/hcIQkDw8P5+fnAJCdnY2Sx8dHhUJhtVpTU1NXV1fz8/Ph2/isqFxfX6MONpstMHe73RkZGQBQV1cXQSllsVhXV1eBuVarRRsQvX1/fy8tLQUAsVh8dnZGfS+f6nh5eeFwOADQ0dHx+vqKwuPj4/LycqSpoqIisnNHXl6e34jRaIyPjweA5eVllKCdmJycfHp6Sn074R60Go0G3UBKSopMJhOLxehB0NnZifZ2BDoUCgWLxYqLi5NKpZmZmWj8gYEB1MftdicmJobfzre3t9T/de5YWloqKiri8/kYhmVlZXV3d19cXHi9XgzDAODg4ODf6lCpVHt7e0qlksvlcjgcuVxuMpn8fba3t7/8dkdVB4P+Fy4Q+sfBIGgdQdA6gqB1BEHrCILWEQStAwL5Az+NDKADUayKAAAAAElFTkSuQmCC';
    console.group('%c[赛博代刷] OCR 测试', 'color:#8ab4f8;font-weight:600');
    console.log('端点:', url, '| 已探测:', state.ocrActive || '(无)');
    return httpJson(url.replace(/\/ocr\/?$/, '') + '/health', null, 2500).then((h) => {
      console.log('/health ->', h.status, h.text.slice(0, 160));
      return httpJson(url, { image: png }, 12000);
    }).then((r) => {
      console.log('/ocr ->', r.status, r.text.slice(0, 200));
      console.groupEnd();
      return r;
    });
  }

  /* ==== 8. 填值 / 点击 / 刷新 ==== */
  function fill(input, val) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(input, val); else input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function clickIt(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 };
      const P = window.PointerEvent || MouseEvent;
      el.dispatchEvent(new P('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new P('pointerup', Object.assign({}, o, { buttons: 0 })));
      el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, o, { buttons: 0 })));
      el.click();
      return true;
    } catch (e) { return false; }
  }
  function refreshCaptcha(box) {
    const btn = deepAll(box, 'a,button,span,i,img').find((el) => /(换一张|刷新|看不清|点击刷新)/.test(clean(el.textContent || '')) && visible(el));
    if (btn) { clickIt(btn); return '点击换图'; }
    const img = (firstImage(box) || {}).el;
    if (img && img.src) {
      img.src = img.src.replace(/[?&]t=\d+/, '') + (img.src.includes('?') ? '&' : '?') + 't=' + Date.now();
      return '刷新图片';
    }
    return '无刷新控件';
  }

  /* ==== 9. 手打兜底 ==== */
  function showManual(reason, b64) {
    state.status = '需手打验证码' + (reason ? '（' + reason + '）' : '');
    const row = document.getElementById('__cyber_manual__');
    if (!row) return;
    row.style.display = 'block';
    const prev = document.getElementById('__cyber_prev__');
    if (prev) {
      if (b64) { prev.src = 'data:image/png;base64,' + b64; prev.style.display = 'block'; }
      else prev.style.display = 'none';
    }
    const inp = document.getElementById('__cyber_min__');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); }
    updatePanel();
  }
  function hideManual() {
    const row = document.getElementById('__cyber_manual__');
    if (row) row.style.display = 'none';
  }
  // 把验证码写进所有相关输入框（可见框 + 隐藏的 #yzCode），并触发平台监听
  function fillAll(cap, code) {
    try { fill(cap.input, code); } catch (e) {}
    try {
      const yz = document.getElementById('yzCode');
      if (yz && yz !== cap.input) {
        yz.value = code;
        yz.dispatchEvent(new Event('input', { bubbles: true }));
        yz.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (e) {}
    return code;
  }

  // 提交：多策略连发，每一步都校验弹窗是否关闭，哪个成了记日志
  async function submitCode(cap) {
    const open = () => captchaHint();
    const pressEnter = (el) => {
      if (!el) return false;
      const opt = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', opt));
        el.dispatchEvent(new KeyboardEvent('keypress', opt));
        el.dispatchEvent(new KeyboardEvent('keyup', opt));
        return true;
      } catch (e) { return false; }
    };

    const strategies = [
      ['layer-btn0', () => {
        const layer = (cap.input.closest && cap.input.closest('.layui-layer')) || document;
        const btn = layer.querySelector('.layui-layer-btn0');
        return clickIt(btn);
      }],
      ['cap.btn', () => clickIt(cap.btn)],
      ['findConfirm', () => clickIt(findConfirm(cap.box || document))],
      ['Enter', () => pressEnter(cap.input) || pressEnter(document.getElementById('yzCode'))],
      ['layer-btn-any', () => {
        const btns = Array.from(document.querySelectorAll('.layui-layer .layui-layer-btn a, .layui-layer-btn a'))
          .filter((el) => visible(el));
        const first = btns.find((el) => /开始播放|确定|确认|提交|验证|继续/.test(clean(el.textContent)));
        return clickIt(first || btns[0]);
      }],
      ['form-submit', () => {
        const form = cap.input.form || (cap.input.closest && cap.input.closest('form'));
        if (!form) return false;
        try { form.requestSubmit ? form.requestSubmit() : form.submit(); return true; } catch (e) { return false; }
      }],
    ];

    for (const [name, fn] of strategies) {
      if (!open()) return { ok: true, by: name + '（已经关闭）' };
      let did = false;
      try { did = !!fn(); } catch (e) { did = false; }
      if (!did) { log('提交策略', name, '不可用'); continue; }
      await sleep(800);
      const still = open();
      log('提交策略', name, still ? '弹窗仍在' : '弹窗已关闭 ✓');
      if (!still) return { ok: true, by: name };
    }
    return { ok: !open(), by: 'none' };
  }

  async function submitManual() {
    const inp = document.getElementById('__cyber_min__');
    const code = (inp && inp.value || '').trim();
    const cap = findCaptcha();
    if (!cap || !code) return;
    const now = await captureB64(cap.img);
    const sig = sigOf(now);
    if (state.capSig && sig && sig !== state.capSig) {
      state.capSig = sig; state.capB64 = now;
      showManual('图片已刷新，请重新输入', now);
      return;
    }
    fillAll(cap, code);
    hideManual();
    state.status = '已提交手打验证码 ' + code + '，校验中…';
    const r = await submitCode(cap);
    state.status = r.ok ? '验证码通过 ✓ 继续播放' : '提交未生效（' + r.by + '），请手动点「开始播放」';
    if (r.ok) { state.capPassAt = Date.now(); resume(); }
    else warn(state.status);
  }
  function checkCaptchaCleared() {
    if (!captchaHint()) {
      state.status = '验证码已通过，继续播放';
      state.capPassAt = Date.now();
      hideManual();
      resume();
    }
  }
  function resume() {
    const v = player();
    if (!v || !CFG.enabled) return;
    try { v.muted = CFG.muted; v.playbackRate = CFG.rate; v.play().catch(() => {}); } catch (e) {}
  }

  /* ==== 10. 自动识别 ==== */
  async function solveCaptcha() {
    if (!CFG.enabled || !CFG.solveCaptcha || capBusy) return;
    const cap = findCaptcha();
    if (!cap) return;

    const key = (cap.img ? cap.img.src : 'noimg') + '|' + cap.type + '|' +
      ((cap.box && (cap.box.id || cap.box.className)) || '') + '|' + currentNodeId();
    if (key !== capKey) { capAttempt = 0; capKey = key; }
    else if (Date.now() - capAt < 5000) return;

    capBusy = true;
    try {
      state.status = '验证码出现：已暂停，正在识别…';
      const b64 = await captureB64(cap.img);
      if (b64) { state.capB64 = b64; state.capSig = sigOf(b64); }

      if (cap.code) {
        log('DOM 读到验证码：', cap.code);
        fill(cap.input, cap.code);
        await sleep(150);
        clickIt(cap.btn || findConfirm(cap.box || document));
        capAt = Date.now();
        await sleep(1500);
        checkCaptchaCleared();
        return;
      }

      if (state.ocrOk !== true) await pingOcr();
      const text = b64 ? await ocr(b64) : '';
      if (!text) {
        capAt = Date.now();
        warn('识别失败：' + (b64 ? ('OCR 返回空 ' + (state.ocrErr || '')) : '没取到图片') + ' → 手打');
        showManual(b64 ? 'OCR 没认出来' : '没取到图', b64);
        return;
      }

      const variants = [text];
      if (CFG.capCaseTry && /[a-zA-Z]/.test(text)) {
        variants.push(text.toLowerCase(), text.toUpperCase());
        const tc = text.toLowerCase().replace(/^([a-z])/, (m) => m.toUpperCase());
        if (variants.indexOf(tc) < 0) variants.push(tc);
      }
      const ans = variants[Math.min(capAttempt, variants.length - 1)];

      log('验证码识别', {
        定位: cap.type,
        图: cap.img ? cap.img.kind : '无',
        字节: b64.length,
        OCR文本: text,
        提交: ans,
        服务: state.ocrActive || '(未连接)',
        错误: state.ocrErr || '-',
      });

      fillAll(cap, ans);
      await sleep(150);
      const r = await submitCode(cap);
      capAt = Date.now();
      state.status = r.ok
        ? '验证码通过 ✓（' + r.by + '）'
        : '已填码但提交未生效（尝试了 ' + r.by + '）';

      await sleep(600);
      if (captchaHint()) {
        capTries++;
        if (capAttempt + 1 < variants.length) {
          capAttempt++;
          state.status = '验证码未通过，换大小写（' + (capAttempt + 1) + '/' + variants.length + '）';
          warn(state.status);
        } else {
          capAttempt = 0;
          const how = refreshCaptcha(cap.box || document);
          state.status = '验证码未通过（' + capTries + '/' + CFG.capRetry + '），' + how;
          warn(state.status);
          if (capTries > CFG.capRetry) { capTries = 0; showManual('多次失败', state.capB64); }
        }
      } else {
        capTries = 0; capAttempt = 0;
        state.status = '验证码通过 ✓ 继续播放';
        state.capPassAt = Date.now();
        log(state.status);
        hideManual();
        resume();
      }
    } catch (e) {
      warn('验证码流程异常', e);
    } finally {
      capBusy = false;
      updatePanel();
    }
  }

  /* ==== 11. 主循环 ==== */
  function tick() {
    if (!CFG.enabled) { if (capHold) capHold = false; state.capOnScreen = false; return; }
    const v = player();
    if (!v) return;
    watchPlayer(v);

    const capOn = captchaHint() && (Date.now() - (state.capPassAt || 0) > 1500);
    state.capOnScreen = capOn;

    if (capOn) {
      capHold = true;
      try { if (!v.paused) v.pause(); } catch (e) {}
      if (state.status.indexOf('暂停') < 0) {
        state.status = '验证码出现，已暂停播放，识别后自动继续';
        log('暂停原因：页面上有可见的验证码弹窗');
      }
      if (CFG.solveCaptcha) {
        solveCaptcha();
        if (!capBusy && !findCaptcha() && state.status.indexOf('没定位到') < 0) {
          state.status = '验证码出现了但没定位到输入框，执行 __CYBER__.capDebug() 看结构';
        }
      }
      return;
    }
    if (capHold) {
      capHold = false;
      state.status = '验证码已通过，继续播放';
      log(state.status);
      if (CFG.autoPlay) resume();
    }

    try {
      if (CFG.muted && !v.muted) v.muted = true;
      if (v.playbackRate < CFG.rate) v.playbackRate = CFG.rate;
      if (CFG.autoPlay && v.paused && !v.ended && v.readyState >= 2) v.play().catch(() => {});
    } catch (e) {}
    if (!armed && !busy && Date.now() - lastAt > 3000) armed = true;
  }

  /* ==== 12. UI ==== */
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '--:--';
    s = Math.floor(s);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  const CSS = [
    '#__cyber_panel__{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:212px;box-sizing:border-box;',
    'padding:10px 11px 11px;border-radius:12px;',
    'background:linear-gradient(180deg,rgba(30,33,42,.97),rgba(18,20,26,.97))!important;',
    'border:1px solid rgba(255,255,255,.09)!important;',
    'box-shadow:0 12px 34px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05)!important;',
    'color:#e6e9ef!important;user-select:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
    'font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif!important;}',
    '#__cyber_panel__ *{box-sizing:border-box;margin:0;padding:0;font-family:inherit!important;line-height:1.5!important}',
    '#__cyber_panel__ .cy-hd{display:flex;align-items:center;gap:7px;cursor:move;margin-bottom:8px!important}',
    '#__cyber_panel__ .cy-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:#8b93a1!important;',
    'box-shadow:0 0 0 3px rgba(139,147,161,.16)!important;transition:background .25s,box-shadow .25s}',
    '#__cyber_panel__ .cy-dot[data-s="play"]{background:#28c76f!important;box-shadow:0 0 0 3px rgba(40,199,111,.18)!important}',
    '#__cyber_panel__ .cy-dot[data-s="pause"]{background:#ffd166!important;box-shadow:0 0 0 3px rgba(255,209,102,.18)!important}',
    '#__cyber_panel__ .cy-dot[data-s="cap"]{background:#ffa94d!important;box-shadow:0 0 0 3px rgba(255,169,77,.18)!important}',
    '#__cyber_panel__ .cy-title{font-size:12px!important;font-weight:600!important;color:#e6e9ef!important;letter-spacing:.3px}',
    '#__cyber_panel__ .cy-fold{margin-left:auto!important;color:#8b93a1!important;font-size:11px!important;cursor:pointer;',
    'padding:0 2px!important;transition:transform .18s;display:inline-block}',
    '#__cyber_panel__.cy-collapsed .cy-fold{transform:rotate(-90deg)}',
    '#__cyber_panel__.cy-collapsed .cy-body{display:none}',
    '#__cyber_panel__ .cy-meta{color:#9aa4b2!important;font-size:11px!important;margin-bottom:7px!important;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#__cyber_panel__ .cy-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.1)!important;overflow:hidden;margin-bottom:9px!important}',
    '#__cyber_panel__ .cy-bar>i{display:block;height:100%;width:0;border-radius:2px;',
    'background:linear-gradient(90deg,#28c76f,#4ade80)!important;transition:width .45s linear}',
    '#__cyber_panel__ .cy-rates{display:flex;gap:3px;padding:3px!important;border-radius:8px!important;background:rgba(255,255,255,.06)!important}',
    '#__cyber_panel__ .cy-rate{flex:1;appearance:none!important;-webkit-appearance:none!important;border:0!important;outline:0!important;',
    'border-radius:6px!important;padding:4px 0!important;font-size:11px!important;font-weight:600!important;cursor:pointer;',
    'background:transparent!important;color:#9aa4b2!important;transition:background .15s,color .15s,box-shadow .15s}',
    '#__cyber_panel__ .cy-rate:hover{color:#e6e9ef!important;background:rgba(255,255,255,.08)!important}',
    '#__cyber_panel__ .cy-rate[data-on="1"]{background:#28c76f!important;color:#06240f!important;',
    'box-shadow:0 2px 10px rgba(40,199,111,.4)!important}',
    '#__cyber_panel__ .cy-sw{display:flex;align-items:center;gap:8px;margin-top:8px!important;cursor:pointer;',
    'color:#c9d3e0!important;font-size:11px!important}',
    '#__cyber_panel__ .cy-sw input{position:absolute!important;opacity:0!important;width:0!important;height:0!important;pointer-events:none!important}',
    '#__cyber_panel__ .cy-track{position:relative;width:26px;height:15px;border-radius:99px;flex:0 0 auto;',
    'background:rgba(255,255,255,.14)!important;transition:background .2s;display:inline-block}',
    '#__cyber_panel__ .cy-knob{position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;',
    'background:#8b93a1!important;transition:left .2s,background .2s}',
    '#__cyber_panel__ .cy-sw input:checked~.cy-track{background:#28c76f!important}',
    '#__cyber_panel__ .cy-sw input:checked~.cy-track .cy-knob{left:13px;background:#fff!important}',
    '#__cyber_panel__ .cy-manual{display:none;margin-top:8px!important;padding-top:8px!important;',
    'border-top:1px solid rgba(255,255,255,.08)!important}',
    '#__cyber_panel__ .cy-prev{display:none;width:100%;max-height:44px;object-fit:contain;background:#fff!important;',
    'border-radius:5px;margin-bottom:5px!important;cursor:zoom-in;image-rendering:pixelated}',
    '#__cyber_panel__ .cy-row{display:flex;gap:4px}',
    '#__cyber_panel__ .cy-min{flex:1;min-width:0;background:#2b2f3a!important;border:1px solid #5b8def!important;',
    'border-radius:5px!important;color:#fff!important;font-size:12px!important;padding:3px 6px!important;letter-spacing:2px}',
    '#__cyber_panel__ .cy-ok{flex:0 0 auto;cursor:pointer;border:0!important;border-radius:5px!important;',
    'padding:3px 8px!important;font-size:11px!important;color:#06240f!important;background:#28c76f!important;font-weight:600}',
    '#__cyber_panel__ .cy-msg{display:none;margin-top:8px!important;padding:5px 8px!important;border-radius:6px!important;',
    'font-size:11px!important;color:#ffc078!important;background:rgba(255,169,77,.12)!important;word-break:break-all}',
    '#__cyber_panel__.cy-off{background:linear-gradient(180deg,rgba(26,28,34,.97),rgba(16,17,22,.97))!important}',
    '#__cyber_panel__.cy-off .cy-dot{background:#5b6270!important;box-shadow:none!important}',
    '#__cyber_panel__.cy-off .cy-title{color:#8b93a1!important}',
    '#__cyber_panel__.cy-off .cy-body{opacity:.45!important}',
    '#__cyber_panel__.cy-off .cy-rates{pointer-events:none!important}',
    '#__cyber_panel__.cy-off .cy-sw:not(.cy-master){pointer-events:none!important}',
    '#__cyber_panel__ .cy-sw.cy-master{padding-top:8px!important;border-top:1px solid rgba(255,255,255,.07)!important;',
    'color:#e6e9ef!important;font-weight:600!important}',
  ].join('');

  function injectCss() {
    if (document.getElementById('__cyber_style__')) return;
    const st = document.createElement('style');
    st.id = '__cyber_style__';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function updatePanel() {
    const box = document.getElementById('__cyber_panel__');
    if (!box) return;
    const v = player(), p = progress();
    const dot = box.querySelector('.cy-dot');
    const meta = box.querySelector('.cy-meta');
    const bar = box.querySelector('.cy-bar > i');
    const msg = box.querySelector('.cy-msg');

    box.classList.toggle('cy-off', !CFG.enabled);
    const mode = !CFG.enabled ? 'idle' : !v ? 'idle' : state.capOnScreen ? 'cap' : v.paused ? 'pause' : 'play';
    if (dot && dot.getAttribute('data-s') !== mode) dot.setAttribute('data-s', mode);

    if (meta) {
      meta.textContent = !CFG.enabled
        ? '已停用：不加速、不自动播放、不跳节'
        : (p.total ? '第 ' + (p.index || '?') + '/' + p.total + ' 节' : '目录未识别') +
          (v ? ' · ' + v.playbackRate + 'x · ' + fmt(v.currentTime) + '/' + fmt(totalDuration()) : '');
    }
    if (bar) {
      const total = totalDuration();
      bar.style.width = (!CFG.enabled || !v || !total ? 0 : Math.min(100, (v.currentTime / total) * 100)) + '%';
    }
    const text = state.bootError ? ('启动异常：' + state.bootError.message) : state.status;
    const show = !!text && text !== '待机' && text !== '等待播放器…' && text !== '新一集就绪';
    if (msg) {
      msg.textContent = show ? text : '';
      msg.style.display = show ? 'block' : 'none';
    }
  }

  function applyEnabled(on) {
    CFG.enabled = !!on;
    save();
    const v = player();
    if (v) {
      try {
        if (on) {
          v.playbackRate = CFG.rate;
          if (CFG.muted) v.muted = true;
          state.status = '已启用：' + CFG.rate + 'x 播放中';
        } else {
          capHold = false;
          v.playbackRate = 1;
          v.muted = false;
          state.status = '已停用';
          hideManual();
        }
      } catch (e) {}
    }
    updatePanel();
    log(CFG.enabled ? '已启用' : '已停用');
  }

  function makeDraggable(box, hd) {
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('cy-fold')) return;
      const r = box.getBoundingClientRect();
      drag = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      box.style.right = 'auto'; box.style.bottom = 'auto';
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      try { hd.setPointerCapture(e.pointerId); } catch (err) {}
    });
    hd.addEventListener('pointermove', (e) => {
      if (!drag) return;
      box.style.left = Math.max(4, ox + e.clientX - sx) + 'px';
      box.style.top = Math.max(4, oy + e.clientY - sy) + 'px';
    });
    const up = () => {
      if (!drag) return;
      drag = false;
      CFG.panelPos = { left: parseInt(box.style.left, 10) || 4, top: parseInt(box.style.top, 10) || 4 };
      save();
    };
    hd.addEventListener('pointerup', up);
    hd.addEventListener('pointercancel', up);
  }

  function mkSwitch(labelText, checked, onChange, cls, id) {
    const l = document.createElement('label');
    l.className = 'cy-sw' + (cls ? ' ' + cls : '');
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    if (id) inp.id = id;
    inp.checked = !!checked;
    inp.onchange = () => onChange(inp.checked);
    const tr = document.createElement('span');
    tr.className = 'cy-track';
    const kn = document.createElement('i');
    kn.className = 'cy-knob';
    tr.appendChild(kn);
    const sp = document.createElement('span');
    sp.textContent = labelText;
    l.append(inp, tr, sp);
    return l;
  }

  function panel() {
    if (document.getElementById('__cyber_panel__')) return;
    injectCss();

    const box = document.createElement('div');
    box.id = '__cyber_panel__';
    if (CFG.hidePanel) box.classList.add('cy-collapsed');
    if (CFG.panelPos) {
      box.style.right = 'auto'; box.style.bottom = 'auto';
      box.style.left = Math.max(4, CFG.panelPos.left) + 'px';
      box.style.top = Math.max(4, CFG.panelPos.top) + 'px';
    }

    const hd = document.createElement('div');
    hd.className = 'cy-hd';
    const dot = document.createElement('i');
    dot.className = 'cy-dot';
    dot.setAttribute('data-s', 'idle');
    const title = document.createElement('span');
    title.className = 'cy-title';
    title.textContent = '倍速';
    const fold = document.createElement('span');
    fold.className = 'cy-fold';
    fold.textContent = '▾';
    hd.append(dot, title, fold);
    fold.onclick = () => {
      CFG.hidePanel = !CFG.hidePanel; save();
      box.classList.toggle('cy-collapsed', CFG.hidePanel);
    };

    const body = document.createElement('div');
    body.className = 'cy-body';

    const meta = document.createElement('div');
    meta.className = 'cy-meta';
    const bar = document.createElement('div');
    bar.className = 'cy-bar';
    bar.appendChild(document.createElement('i'));

    const rates = document.createElement('div');
    rates.className = 'cy-rates';
    const setActive = (r) => {
      rates.querySelectorAll('.cy-rate').forEach((b) => {
        b.setAttribute('data-on', Number(b.dataset.rate) === Number(r) ? '1' : '0');
      });
    };
    [1, 2, 4, 8].forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cy-rate';
      b.dataset.rate = r;
      b.textContent = r + 'x';
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        CFG.rate = r; save();
        const v = player();
        if (v) { try { v.playbackRate = r; } catch (err) {} }
        setActive(r); updatePanel();
        log('倍速', r);
      });
      rates.appendChild(b);
    });
    setActive(CFG.rate);

    const master = mkSwitch('启用脚本', CFG.enabled, (on) => applyEnabled(on), 'cy-master', '__cyber_master__');
    const autoSw = mkSwitch('自动下一节', CFG.autoNext, (on) => { CFG.autoNext = on; save(); });
    const capSw = mkSwitch('自动识别验证码', CFG.solveCaptcha, (on) => {
      CFG.solveCaptcha = on; save();
      if (on) { capKey = ''; if (state.ocrOk !== true) pingOcr(); }
    }, 'cy-capsw');

    const manual = document.createElement('div');
    manual.className = 'cy-manual';
    manual.id = '__cyber_manual__';
    const prev = document.createElement('img');
    prev.className = 'cy-prev';
    prev.id = '__cyber_prev__';
    prev.onclick = () => { if (prev.src) window.open(prev.src); };
    const row = document.createElement('div');
    row.className = 'cy-row';
    const min = document.createElement('input');
    min.className = 'cy-min';
    min.id = '__cyber_min__';
    min.placeholder = '手打验证码后回车';
    min.onkeydown = (e) => { if (e.key === 'Enter') submitManual(); };
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'cy-ok';
    ok.textContent = '提交';
    ok.onclick = submitManual;
    row.append(min, ok);
    manual.append(prev, row);

    const msg = document.createElement('div');
    msg.className = 'cy-msg';

    body.append(meta, bar, rates, master, autoSw, capSw, manual, msg);
    box.append(hd, body);
    (document.body || document.documentElement).appendChild(box);

    try { makeDraggable(box, hd); } catch (e) {}
    setInterval(updatePanel, 1000);
    updatePanel();
  }

  /* ==== 13. 诊断 ==== */
  function capDebug() {
    console.group('%c[赛博代刷] 验证码诊断 v' + VERSION, 'color:#8ab4f8;font-weight:600');
    const box = document.getElementById('video-captcha');
    console.log('#video-captcha:', box ? ('子节点 ' + box.children.length) : '(页面上没有这个元素)');
    console.log('captchaHint():', captchaHint());
    if (box && box.children.length) {
      Array.from(box.querySelectorAll('*')).slice(0, 30).forEach((el) => {
        const r = el.getBoundingClientRect();
        console.log('  <' + el.tagName.toLowerCase() + '>', 'class=' + (el.className || '-'),
          'src=' + String(el.src || el.getAttribute('src') || '-').slice(0, 60),
          (r.width | 0) + 'x' + (r.height | 0));
      });
    }
    const cap = findCaptcha();
    console.log('定位:', cap ? {
      type: cap.type,
      input: cap.input.name || cap.input.id || cap.input.tagName,
      inputMaxLength: cap.input.getAttribute('maxlength'),
      img: cap.img ? cap.img.kind : null,
      imgSrc: cap.img ? String(cap.img.src).slice(0, 70) : null,
      btn: cap.btn ? clean(cap.btn.textContent) : null,
      domCode: cap.code || '',
    } : null);
    console.log('OCR 服务:', { ok: state.ocrOk, active: state.ocrActive || '(无)', err: state.ocrErr || '-' });
    return captureB64(cap && cap.img).then((b64) => {
      console.log('截取:', b64 ? (b64.length + ' bytes') : '失败');
      if (b64) {
        const im = new Image();
        im.src = 'data:image/png;base64,' + b64;
        im.style.cssText = 'border:1px solid #28c76f;background:#fff;zoom:3;image-rendering:pixelated';
        console.log('%c这张就是要提交的图：', 'color:#28c76f', im);
      }
      if (!b64) { console.groupEnd(); return { cap, ok: false }; }
      return ocr(b64).then((text) => {
        console.log('OCR 文本:', JSON.stringify(text));
        console.groupEnd();
        return { cap, bytes: b64.length, text };
      });
    });
  }

  function selfTest() {
    const v = player();
    const active = document.querySelector('#__cyber_panel__ .cy-rate[data-on="1"]');
    const out = {
      version: VERSION,
      host: location.hostname,
      injected: true,
      errors: API.errors,
      bootError: state.bootError && state.bootError.message,
      enabled: CFG.enabled,
      rate: v ? v.playbackRate : null,
      activeBtn: active ? active.textContent : null,
      node: currentNodeId() || null,
      progress: progress(),
      duration: totalDuration(),
      video: !!v,
      captchaContainer: captchaPresent(),
      captchaOnScreen: state.capOnScreen,
      capHold,
      solveCaptcha: CFG.solveCaptcha,
      ocr: { ok: state.ocrOk, active: state.ocrActive || '(无)', err: state.ocrErr || '' },
    };
    console.table(out);
    return out;
  }

  /* ==== 14. 启动 ==== */
  Object.assign(API, {
    cfg: CFG, state,
    player, nodeLinks, currentNodeId, nextNode, progress, totalDuration, captchaPresent, captchaHint,
    goNext, panel, selfTest, updatePanel, tick, applyEnabled,
    findCaptcha, captureB64, solveCaptcha, pingOcr, ocrTest, ocr, capDebug,
    showManual, submitManual, resume, refreshCaptcha,
    setEnabled: (on) => { applyEnabled(on); const cb = document.getElementById('__cyber_master__'); if (cb) cb.checked = !!on; },
    setRate: (r) => {
      const n = Number(r) || 4;
      const b = document.querySelector('#__cyber_panel__ .cy-rate[data-rate="' + n + '"]');
      if (b) b.click();
      else { CFG.rate = n; save(); updatePanel(); }
    },
    isEnabled: () => CFG.enabled,
    isBusy: () => capBusy,
    status: () => state.status,
  });

  function boot() {
    panel();
    const p = progress();
    log('已启动 v' + VERSION + ' | 节点', currentNodeId() || '?', '|', p.index + '/' + p.total,
      '| 倍速', CFG.rate + 'x', '| 验证码', CFG.solveCaptcha ? '自动' : '手打');
    pingOcr();
    setInterval(tick, 800);
    setInterval(() => {
      if (!CFG.enabled) return;
      const v = player();
      if (v && v.paused && CFG.autoPlay && !v.ended && !captchaHint()) v.play().catch(() => {});
    }, 30000);
    tick();
    updatePanel();
  }

  try { boot(); API.ready = true; } catch (e) {
    state.bootError = e;
    API.errors.push('boot: ' + e.message);
    console.error('%c[赛博代刷] 启动异常（__CYBER__.selfTest() 可用）', 'color:#ff6b6b;font-weight:600', e);
  }
})();
