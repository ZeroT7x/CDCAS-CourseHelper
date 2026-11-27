// ==UserScript==
// @name         成都文理 · 赛博代刷助手
// @namespace    local.cdwl.cyber
// @version      7.0
// @description  在线课程辅助：自动播放/续播、播完自动下一节、验证码自动识别（ddddocr）
// @author       成都文理 · 赛博代刷
// @license      PolyForm-Noncommercial-1.0.0（禁止商用 / NonCommercial）
// @match        https://cdcas.chaoxiankeji.com/*
// @match        http://cdcas.chaoxiankeji.com/*
// @match        https://cdcas.duxingkej.com/*
// @match        http://cdcas.duxingkej.com/*
// @match        https://*.taiskeji.com/*
// @match        http://*.taiskeji.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==
// ---------------------------------------------------------------------------
// 项目：成都文理 · 赛博代刷助手（油猴脚本）
// 命名空间：local.cdwl.cyber
// 作者：成都文理 · 赛博代刷
// Copyright (c) 2025 成都文理 · 赛博代刷
// 许可：PolyForm Noncommercial 1.0.0（禁止商用，详见 LICENSE）
// ---------------------------------------------------------------------------
// 【免责声明 / Disclaimer】
// 1. 本脚本仅供个人学习、研究与自用，禁止任何形式的商业使用（包括但不限于：
//    售卖、代刷收费、付费分发、嵌入商业产品或服务、以本脚本招揽客户）。
// 2. 本脚本与目标网站及其运营方无任何关联，未获其授权、认可或背书。
// 3. 脚本按“现状（AS IS）”提供，不承诺可用性、准确性或连续性；因使用或无法
//    使用本脚本造成的任何直接或间接损失，作者不承担任何责任。
// 4. 使用本脚本即表示你已阅读并同意上述条款；如不同意，请立即停止使用并删除。
// 5. 违反上述条款将自动终止你的使用授权。
// ---------------------------------------------------------------------------


(function () {
  'use strict';

  const VERSION = '7.0';
  // 面板的 id / class 前缀每次加载随机生成，不留固定的 DOM 指纹
  const K = 'c' + Math.random().toString(36).slice(2, 8);
  const ID = { panel: K + '_panel', style: K + '_style', manual: K + '_manual', prev: K + '_prev', min: K + '_min', master: K + '_master' };
  const TITLE = '赛博助手';
  // 支持的站点（同平台多套部署）；不带子域的域名同时匹配它的所有子域名
  const HOSTS = ['cdcas.chaoxiankeji.com', 'cdcas.duxingkej.com', 'taiskeji.com'];
  const isSupportedHost = () => HOSTS.some((h) => location.hostname === h || location.hostname.endsWith('.' + h));

  if (!isSupportedHost()) {
    console.log('%c[赛博代刷] 非目标站点（' + location.hostname + '），跳过', 'color:#9aa0a6');
    return;
  }

  // 同一页重复注入（例如同时装了旧版和副本）时只保留先启动的一份，避免双倍定时器/双击提交。
  // 不挂固定全局变量做标记（页面脚本一句 if (window.__X__) 就能据此判定），直接查已有面板的标题。
  try {
    if (Array.prototype.some.call(document.querySelectorAll('span'), (el) => el.textContent === TITLE)) {
      console.warn('%c[赛博代刷] 已有一份脚本在运行，本次注入已跳过', 'color:#ffa94d;font-weight:600');
      return;
    }
  } catch (e) {}

  /* ==== 1. 接口优先 ==== */
  const API = { version: VERSION, ready: false, errors: [] };
  const DBG_NAME = '_' + Math.random().toString(36).slice(2, 8);
  try { console.log('%c[赛博代刷] 注入 v' + VERSION, 'color:#28c76f;font-weight:700', '| 已启动'); } catch (e) {}
  try {
    console.log('%c[赛博代刷] 仅供个人学习研究使用，禁止商用。使用风险与后果由使用者自行承担。', 'color:#9aa0a6');
  } catch (e) {}

  /* ==== 2. 配置 ==== */
  const KEY = '__CDWL_CYBER_CFG__';
  // 配置优先存油猴的脚本存储（页面脚本连 localStorage 的键都枚举不到）；
  // 没有 GM 存储（Console 版）时退回 localStorage。
  const LEGACY_KEY = '__CX_PLAY_CFG__';
  const gmStore = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const DEFAULT = {
    enabled: true,
    muted: true,
    autoPlay: true,
    autoNext: true,
    skipExam: true,
    tail: 1.5,
    solveCaptcha: true,
    capCaseTry: true,
    capRetry: 3,
    ocrUrl: 'http://127.0.0.1:8899/ocr',
    hidePanel: false,
    panelPos: null,
    debug: false,          // true 才用随机名字暴露调试接口（默认不暴露，降低指纹）
    playbackRate: 1,   // 倍速，默认 1；可改 1.25/1.5，部分平台会检测异常
  };
  const CFG = normalizeConfig(Object.assign({}, DEFAULT, load()));
  // 调试接口：默认不挂任何全局变量；配置 debug:true 时才用随机名字挂到 window
  function exposeApi() {
    if (!CFG.debug) {
      try { console.log('%c[赛博代刷] 调试接口未开启（开启方式见 README「调试接口」）', 'color:#9aa0a6'); } catch (e) {}
      return;
    }
    try {
      window[DBG_NAME] = API;
      console.log('%c[赛博代刷] 本次调试接口名：' + DBG_NAME, 'color:#8ab4f8;font-weight:700', '例：' + DBG_NAME + '.selfTest()');
    } catch (e) {}
  }
  exposeApi();
  // 油猴菜单里的开关：配置存在脚本存储里，页面上没有别的入口能改 debug
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('开 / 关调试接口（刷新后生效）', () => { CFG.debug = !CFG.debug; save(); });
    }
  } catch (e) {}
  function normalizeConfig(cfg) {
    const bool = (v, fallback) => (typeof v === 'boolean' ? v : v == null ? fallback : !/^(false|0|no|off)$/i.test(String(v)));
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    ['enabled', 'muted', 'autoPlay', 'autoNext', 'skipExam', 'solveCaptcha', 'capCaseTry', 'hidePanel', 'debug']
      .forEach((k) => { cfg[k] = bool(cfg[k], DEFAULT[k]); });
    cfg.tail = num(cfg.tail, 0.2, 30, DEFAULT.tail);
    cfg.capRetry = Math.floor(num(cfg.capRetry, 0, 10, DEFAULT.capRetry));
    cfg.playbackRate = num(cfg.playbackRate, 0.25, 4, DEFAULT.playbackRate);
    cfg.ocrUrl = typeof cfg.ocrUrl === 'string' ? cfg.ocrUrl.trim() : DEFAULT.ocrUrl;
    const pos = cfg.panelPos;
    cfg.panelPos = pos && Number.isFinite(Number(pos.left)) && Number.isFinite(Number(pos.top))
      ? { left: Number(pos.left), top: Number(pos.top) }
      : null;
    return cfg;
  }
  function load() {
    try {
      if (gmStore) {
        const cur = GM_getValue(KEY, '');
        if (typeof cur === 'string' && cur) return JSON.parse(cur) || {};
        for (const k of [KEY, LEGACY_KEY]) {
          const legacy = localStorage.getItem(k);
          if (!legacy) continue;
          localStorage.removeItem(k);
          GM_setValue(KEY, legacy);
          return JSON.parse(legacy) || {};
        }
        return {};
      }
      const cur = localStorage.getItem(KEY);
      if (cur) return JSON.parse(cur) || {};
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
      }
      return legacy ? JSON.parse(legacy) || {} : {};
    } catch (e) { return {}; }
  }
  function save() {
    try {
      if (gmStore) GM_setValue(KEY, JSON.stringify(CFG));
      else localStorage.setItem(KEY, JSON.stringify(CFG));
    } catch (e) {}
  }

  const log = (...a) => console.log('%c[赛博代刷]', 'color:#28c76f;font-weight:600', ...a);
  const warn = (...a) => console.warn('%c[赛博代刷]', 'color:#ffa94d;font-weight:600', ...a);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const hid = (id) => { const el = document.getElementById(id); return el ? String(el.value) : ''; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => min + Math.random() * (max - min);   // 随机数（用于各类抖动/随机等待）

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
  let capBusy = false, capTries = 0, capAt = 0, capAttempt = 0;
  let capManual = false, capSession = '', capImageKey = '', capToken = 0;
  const capFlowActive = (token) => CFG.enabled && CFG.solveCaptcha && !capManual &&
    (token == null || token === capToken);
  function resetCapAttempts() {
    capTries = 0; capAttempt = 0; capAt = 0;
    capSession = ''; capImageKey = '';
  }

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
  function totalDuration(v) {
    v = v || player();
    if (v && isFinite(v.duration) && v.duration > 0) return v.duration;
    return declaredDuration();
  }

  /* ==== 3. 验证码存在性 ==== */
  const captchaPresent = () => {
    const box = document.getElementById('video-captcha');
    if (!box || !box.children || !box.children.length || !shown(box)) return false;
    // 容器本身可能一直可见，真正关闭后只留下 display:none/opacity:0 的旧节点；
    // 必须再确认里面还有可见输入框或验证码图，否则会永久卡在暂停。
    return !!findVisibleCodeInput(box) || !!firstImage(box);
  };

  // 只认"看得见的"验证码：弹窗关掉后 #yzCode / #codeImg 往往还留在 DOM 里，
  // 判存在会把播放一直卡在暂停（这就是"验证过了还暂停"的原因）。
  // 页面每 250ms 就会触发 timeupdate，短缓存能避免反复做全页 DOM 扫描。
  let capHintAt = 0, capHintVal = false;
  function captchaHint(force) {
    const now = Date.now();
    if (!force && now - capHintAt < 200) return capHintVal;
    capHintVal = captchaHintUncached();
    capHintAt = now;
    return capHintVal;
  }
  function captchaHintUncached() {
    if (captchaPresent()) return true;
    try {
      for (const layer of document.querySelectorAll('.layui-layer, [class*="layui-layer"]')) {
        if (inOwnPanel(layer) || !shown(layer)) continue;
        if (!hasVisibleCodeImage(layer)) continue;
        const box = layer.querySelector('.layui-layer-wrap') || layer;
        if (!visible(box)) continue;
        const input = findCodeInput(box, true) || findVisibleCodeInput(box);
        if (input) return true;
      }
      // 平台自己的 #video-captcha 也匹配 [id*="captcha"]，必须排除，
      // 否则空容器会被当成"验证码出现"，把播放一直卡住。
      for (const c of document.querySelectorAll('[class*="captcha"],[id*="captcha"],[class*="vcode"],[id*="vcode"],[class*="verify"],[id*="verify"],[class*="yzm"],[id*="yzm"]')) {
        if (c.id === 'video-captcha' || inOwnPanel(c)) continue;
        if (!shown(c)) continue;
        if (findCodeInput(c)) return true;
      }
      for (const el of document.querySelectorAll('input[maxlength="4"],input[maxlength="5"],input[maxlength="6"]')) {
        if (inOwnPanel(el) || !shown(el)) continue;
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
    }).filter(Boolean).map((item, index) => Object.assign({}, item, { index }));
  }
  function currentNodeId() {
    const v = hid('video-nodeId');
    if (/^\d+$/.test(v)) return v;
    const act = $('.detmain-navlist a.on') || $('.detmain-tabs a.on');
    const m = act && (act.getAttribute('href') || '').match(/nodeId=(\d+)/);
    if (m) return m[1];
    const u = String(location.search || '').match(/[?&]nodeId=(\d+)/);
    return u ? u[1] : '';
  }
  // 修正：遇到考试节点先记录、继续找后面的非考试节点；后面全是考试才返回兜底
  function nextNode() {
    const links = nodeLinks();
    if (!links.length) return null;
    const idx = links.findIndex((l) => l.id === currentNodeId());
    if (idx < 0) return links[0];
    let firstExam = null;
    for (let i = idx + 1; i < links.length; i++) {
      const c = links[i];
      if (/考试|测试|测验|exam|quiz/i.test(c.title)) {
        if (CFG.skipExam) {
          if (!firstExam) firstExam = Object.assign({}, c, { exam: true });
          continue;                       // 跳过考试，继续找后续视频
        }
        return c;                         // 不跳过考试：直接返回，交给 goNext 停下
      }
      return c;                           // 首个非考试节点
    }
    return firstExam;                     // 后面全是考试
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
    if (n.exam) { state.status = '后面只剩考试节点，已停下：' + n.title; return; }
    busy = true; armed = false; lastAt = Date.now();
    const targetIndex = Number.isFinite(n.index) ? n.index + 1 : progress().index + 1;
    const waitMs = rand(1000, 3000);   // 进入下一节前随机等待 1-3 秒
    state.status = '播完（' + why + '）→ ' + (waitMs / 1000).toFixed(1) + 's 后进入第 ' + targetIndex + ' 节';
    log(state.status);
    await sleep(waitMs);

    // 等待期间用户可能关闭自动换节，或平台弹出验证码；不能继续导航。
    if (!CFG.enabled || !CFG.autoNext) {
      busy = false; armed = true;
      state.status = '自动换节已取消';
      return false;
    }
    if (captchaHint(true)) {
      busy = false; armed = true;
      state.status = '检测到验证码，已取消本次换节';
      return false;
    }

    const unlockIfStayed = () => setTimeout(() => {
      if (busy) { busy = false; armed = true; }
    }, 4000);
    try { location.href = n.href; unlockIfStayed(); return true; } catch (e) {
      const link = $('.detmain-navlist a[href*="nodeId=' + n.id + '"]');
      if (link) { link.click(); unlockIfStayed(); return true; }
    }
    busy = false; armed = true;
    state.status = '进入下一节失败，已保留当前页';
    warn(state.status);
    return false;
  }

  const watched = new WeakSet();   // 记录已接管的 <video>，不给页面元素挂自定义属性
  function watchPlayer(v) {
    if (watched.has(v)) return;
    watched.add(v);
    v.addEventListener('ended', () => goNext('ended'), true);
    let tailTryAt = 0;
    v.addEventListener('timeupdate', () => {
      if (!CFG.enabled || !CFG.autoNext || !armed || busy) return;
      if (Date.now() - tailTryAt < 1200) return;   // 限制尾段重复触发/扫 DOM 的频率
      const total = totalDuration(v);
      if (total && v.currentTime >= total - CFG.tail) {
        tailTryAt = Date.now();
        goNext('尾段');
      }
    }, true);
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
    if (!el) return false;
    // checkVisibility 一次判完元素及其祖先的 display / visibility / opacity
    if (typeof el.checkVisibility === 'function') {
      try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && visible(el); } catch (e) {}
    }
    let n = el;
    while (n && n.nodeType === 1) {
      try {
        if (n.style && n.style.display === 'none') return false;
        const st = (n.ownerDocument.defaultView || window).getComputedStyle(n);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      } catch (e) {}
      n = n.parentElement;
    }
    return visible(el);
  }

  function deepAll(root, sel) {
    const out = [];
    (function walk(node) {
      if (!node || !node.querySelectorAll) return;
      node.querySelectorAll(sel).forEach((el) => out.push(el));
      node.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
    })(root);
    return out;
  }
  const inOwnPanel = (el) => !!(el.closest && el.closest('#' + ID.panel));

  // 平台验证码弹窗（layui）的固定特征
  const LAYER_SEL = '.layui-layer, .layui-layer-wrap, [class*="layui-layer"]';
  const CODE_IMG_RE = /\/service\/code|codeImg|captcha|verify|vcode|yzm/i;
  const hasVisibleCodeImage = (root) => deepAll(root, 'img').some((im) =>
    CODE_IMG_RE.test(im.getAttribute('src') || '') && shown(im));

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
      // #yzCode 是本脚本要写入的提交字段，不是答案源；旧值会导致下一次验证码
      // 直接提交上一轮的码，必须排除。
      if (el.id === 'yzCode' || String(el.name || '').toLowerCase() === 'yzcode') continue;
      if (CODE_RE.test(clean(el.value))) return clean(el.value);
    }
    return '';
  }

  function findCaptcha() {
    const cands = [], seenInputs = new Set();
    const push = (o) => {
      if (!o || !o.input || inOwnPanel(o.input) || seenInputs.has(o.input)) return;
      seenInputs.add(o.input);
      cands.push(o);
    };

    const box = document.getElementById('video-captcha');
    if (box && box.children.length && shown(box)) {
      const input = findCodeInput(box, true) || findVisibleCodeInput(box);
      push({ input, img: firstImage(box), box, btn: findConfirm(box), score: 100, type: 'video-captcha' });
    }

    // ① layui 弹窗（本平台实际形态）：只认可见的层。
    //    关窗后 #yzCode / #codeImg 常留在 DOM 里，判存在会反复"识别已通过的验证码"。
    for (const layer of deepAll(document, '.layui-layer')) {
      if (inOwnPanel(layer) || !shown(layer)) continue;
      const wrap = layer.querySelector('.layui-layer-wrap') || layer;
      if (!hasVisibleCodeImage(layer)) continue;
      const input = findCodeInput(wrap, true) || findVisibleCodeInput(wrap);
      if (!input) continue;
      push({ input, img: firstImage(wrap), box: layer, btn: findConfirm(layer), score: 120, type: 'layui' });
    }
    // ② 其它 layui 弹窗里带 /service/code 图的
    for (const layer of deepAll(document, LAYER_SEL)) {
      if (inOwnPanel(layer) || !shown(layer)) continue;
      if (!hasVisibleCodeImage(layer)) continue;
      const input = findCodeInput(layer, true);
      if (!input) continue;
      push({ input, img: firstImage(layer), box: layer, btn: findConfirm(layer), score: 110, type: 'layui' });
    }

    for (const c of deepAll(document, '[class*="captcha"],[id*="captcha"],[class*="vcode"],[id*="vcode"],[class*="verify"],[id*="verify"],[class*="yzm"],[id*="yzm"]')) {
      if (inOwnPanel(c) || !shown(c)) continue;
      const input = findCodeInput(c);
      if (!input) continue;
      push({ input, img: firstImage(c), box: c, btn: findConfirm(c), score: 80, type: 'container' });
    }
    if (!cands.length) {
      for (const input of deepAll(document, 'input').filter((el) => isCodeInput(el, false))) {
        if (inOwnPanel(input) || !shown(input)) continue;
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
      if (inOwnPanel(el) || !shown(el)) return false;
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
          let done = false, timer = 0;
          const finish = (b) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            el.removeEventListener('load', onLoad);
            el.removeEventListener('error', onErr);
            res(b);
          };
          const onLoad = () => finish(draw());
          const onErr = () => finish('');
          el.addEventListener('load', onLoad);
          el.addEventListener('error', onErr);
          timer = setTimeout(() => finish(draw()), 900);
        }).then((b) => (b ? b : fetchB64(img.src)));
      }
    }
    return fetchB64(img.src);
  }

  function blobToB64(blob) {
    return new Promise((res) => {
      if (!blob || typeof FileReader !== 'function') return res('');
      try {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || '').split(',')[1] || '');
        fr.onerror = () => res('');
        fr.readAsDataURL(blob);
      } catch (e) { res(''); }
    });
  }

  function fetchB64(src) {
    if (!src) return Promise.resolve('');
    if (String(src).startsWith('data:')) return Promise.resolve(String(src).split(',')[1] || '');
    return new Promise((res) => {
      let settled = false;
      const finish = (b) => {
        if (settled) return;
        settled = true;
        res(b || '');
      };

      if (typeof GM_xmlhttpRequest === 'function') {
        try {
          GM_xmlhttpRequest({
            method: 'GET', url: src, responseType: 'blob', timeout: 8000,
            onload: (r) => blobToB64(r.response).then(finish, () => finish('')),
            onerror: () => finish(''), ontimeout: () => finish(''), onabort: () => finish(''),
          });
          return;
        } catch (e) {}
      }

      if (typeof fetch === 'function') {
        fetch(src, { cache: 'no-store' })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((blob) => blobToB64(blob))
          .then(finish)
          .catch(() => finish(''));
        return;
      }
      finish('');
    });
  }

  const sigOf = (b64) => (b64 ? b64.length + ':' + b64.slice(0, 20) + ':' + b64.slice(-20) : '');

  /* ==== 7. OCR ==== */
  function ocrCandidates() {
    const list = [state.ocrActive, CFG.ocrUrl, 'http://127.0.0.1:8899/ocr', 'http://localhost:8899/ocr',
      'http://127.0.0.1:8900/ocr', 'http://127.0.0.1:8000/ocr', 'http://127.0.0.1:5000/ocr'];
    return list.filter((v, i) => v && list.indexOf(v) === i);
  }
  function httpJson(url, body, timeout) {
    return new Promise((res) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        res(result);
      };
      const ms = timeout || 6000;

      if (typeof GM_xmlhttpRequest === 'function') {
        try {
          GM_xmlhttpRequest({
            method: body ? 'POST' : 'GET', url,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            data: body ? JSON.stringify(body) : undefined,
            timeout: ms,
            onload: (r) => finish({ ok: r.status >= 200 && r.status < 400, status: r.status, text: String(r.responseText || '') }),
            onerror: () => finish({ ok: false, status: 0, text: 'network error' }),
            ontimeout: () => finish({ ok: false, status: 0, text: 'timeout' }),
            onabort: () => finish({ ok: false, status: 0, text: 'aborted' }),
          });
          return;
        } catch (e) {}
      }

      if (typeof fetch === 'function') {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => {
          if (controller) { try { controller.abort(); } catch (e) {} }
          finish({ ok: false, status: 0, text: 'timeout' });
        }, ms);
        fetch(url, {
          method: body ? 'POST' : 'GET',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller ? controller.signal : undefined,
          cache: 'no-store',
        }).then((r) => r.text().then((text) => finish({
          ok: r.ok, status: r.status, text: String(text || ''),
        }))).catch((e) => finish({ ok: false, status: 0, text: String(e && e.message || 'network error') }))
          .finally(() => clearTimeout(timer));
        return;
      }

      finish({ ok: false, status: 0, text: 'no transport' });
    });
  }

  async function pingOcr() {
    for (const url of ocrCandidates()) {
      const base = url.replace(/\/ocr\/?$/, '');
      const r = await httpJson(base + '/health', null, 2500);
      if (r.ok && /(?:^|[^a-z])true(?:[^a-z]|$)/i.test(r.text)) {
        state.ocrOk = true; state.ocrActive = url; state.ocrErr = '';
        log('OCR 服务已连接：', url);
        updatePanel();
        return true;
      }
      state.ocrErr = base + ' -> ' + (r.status || r.text);
    }
    state.ocrOk = false; state.ocrActive = '';
    log('本地 OCR 服务未连接（可选组件），验证码将展开手打框。启用方法见 README「验证码兜底」'
      + (CFG.debug ? '；启动服务后执行 ' + DBG_NAME + '.pingOcr() 重试' : ''));
    updatePanel();
    return false;
  }

  async function ocr(b64) {
    if (!b64) return '';
    const url = state.ocrActive || CFG.ocrUrl;
    const r = await httpJson(url, { image: b64 }, 12000);
    if (!r.ok) { state.ocrErr = 'HTTP ' + r.status + (r.text ? ' ' + r.text.slice(0, 120) : ''); return ''; }
    let code = '';
    try {
      const j = JSON.parse(r.text);
      if (j.error) { state.ocrErr = String(j.error); return ''; }
      code = String(j.code ?? j.text ?? j.result ?? '').replace(/[^0-9a-zA-Z]/g, '');
    } catch (e) {
      code = String(r.text || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 8);
    }
    if (!CODE_RE.test(code)) {
      state.ocrErr = 'OCR 结果格式异常：' + JSON.stringify(code).slice(0, 80);
      return '';
    }
    state.ocrErr = '';
    return code;
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

  /* ==== 8. 填值 / 点击 / 刷新（真实交互链） ==== */

  // ---- 8.0 事件与 DOM 工具 ----
  const PE = window.PointerEvent || window.MouseEvent;

  // 在实例上遮蔽只读 getter（KeyboardEvent 构造器忽略 keyCode/which/charCode）
  function setEventProp(ev, name, value) {
    try {
      Object.defineProperty(ev, name, { configurable: true, get: () => value });
    } catch (e) {}
    return ev;
  }

  function nativeSetValue(input, v) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(input, v);
    else input.value = v;
  }

  const isAsciiPrintable = (ch) => {
    const cp = ch.codePointAt(0);
    return cp >= 32 && cp <= 126;
  };

  const KEY_CODE = {
    Backquote: 192, Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221,
    Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191,
  };
  const SHIFTED_CODE = {
    '~': 'Backquote', '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4',
    '%': 'Digit5', '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9',
    ')': 'Digit0', '_': 'Minus', '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight',
    '|': 'Backslash', ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash',
  };
  const PLAIN_CODE = {
    ' ': 'Space', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight',
    '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period',
    '/': 'Slash', '`': 'Backquote',
  };
  function keyOf(ch) {
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp <= 126) {
      const isLetter = /[a-z]/i.test(ch);
      const isDigit = /[0-9]/.test(ch);
      const up = ch.toUpperCase();
      const shift = /[A-Z]/.test(ch) || Object.prototype.hasOwnProperty.call(SHIFTED_CODE, ch);
      const code = isLetter ? 'Key' + up
        : isDigit ? 'Digit' + ch
          : SHIFTED_CODE[ch] || PLAIN_CODE[ch] || '';
      const keyCode = isLetter ? up.charCodeAt(0)
        : isDigit ? cp
          : KEY_CODE[code] || cp;
      return {
        key: ch, code, keyCode, which: keyCode, charCode: cp, shift,
        shiftKey: shift, ctrlKey: false, altKey: false, metaKey: false, ime: false,
      };
    }
    return {
      key: ch, code: 'Process', keyCode: 229, which: 229, charCode: cp,
      shift: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ime: true,
    };
  }

  function buildKeyboardInit(k, type) {
    const mods = {
      shiftKey: !!k.shiftKey, ctrlKey: !!k.ctrlKey, altKey: !!k.altKey, metaKey: !!k.metaKey,
    };
    if (type === 'keypress') {
      return Object.assign({ key: k.key, code: k.code, keyCode: k.charCode, which: k.charCode, charCode: k.charCode }, mods);
    }
    return Object.assign({ key: k.key, code: k.code, keyCode: k.keyCode, which: k.which, charCode: 0 }, mods);
  }

  function mkKeyEvent(type, k, extra) {
    const init = buildKeyboardInit(k, type);
    const ev = new KeyboardEvent(type, Object.assign({
      bubbles: true,
      cancelable: type !== 'keyup',
      composed: true,
      view: window,
      isComposing: false,
      repeat: false,
      location: 0,
    }, init, extra || {}));
    setEventProp(ev, 'keyCode', init.keyCode);
    setEventProp(ev, 'which', init.which);
    setEventProp(ev, 'charCode', init.charCode);
    try { ev.getModifierState = (name) => name === 'Shift' ? !!k.shiftKey : false; } catch (e) {}
    return ev;
  }

  function mkInputEvent(type, inputType, data, isComposing) {
    let ev;
    try {
      ev = new InputEvent(type, {
        bubbles: true,
        cancelable: type === 'beforeinput',
        composed: true,
        view: window,
        inputType: inputType || '',
        data: data == null ? null : data,
        isComposing: !!isComposing,
      });
    } catch (e) {
      ev = new Event(type, { bubbles: true, cancelable: type === 'beforeinput' });
      setEventProp(ev, 'inputType', inputType || '');
      setEventProp(ev, 'data', data == null ? null : data);
      setEventProp(ev, 'isComposing', !!isComposing);
      setEventProp(ev, 'dataTransfer', null);
      setEventProp(ev, 'targetRanges', []);
    }
    if (ev.inputType == null) setEventProp(ev, 'inputType', inputType || '');
    if (ev.data === undefined) setEventProp(ev, 'data', data == null ? null : data);
    if (ev.isComposing === undefined) setEventProp(ev, 'isComposing', !!isComposing);
    if (!ev.targetRanges) setEventProp(ev, 'targetRanges', []);
    return ev;
  }

  function mkCompositionEvent(type, data) {
    try {
      return new CompositionEvent(type, {
        bubbles: true, cancelable: true, composed: true, view: window,
        data: data == null ? '' : String(data),
      });
    } catch (e) {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      setEventProp(ev, 'data', data == null ? '' : String(data));
      return ev;
    }
  }

  const KEY_SHIFT     = { key: 'Shift',     code: 'ShiftLeft', keyCode: 16, which: 16, charCode: 0,  shift: false, ime: false };
  const KEY_BACKSPACE = { key: 'Backspace', code: 'Backspace', keyCode: 8,  which: 8,  charCode: 0,  shift: false, ime: false };
  const KEY_ENTER     = { key: 'Enter',     code: 'Enter',     keyCode: 13, which: 13, charCode: 13, shift: false, ime: false };

  // IME 组合期间的键盘事件：keyCode/which=229，keypress charCode=0
  function mkProcessKeyEvent(type, ch) {
    const ev = new KeyboardEvent(type, {
      bubbles: true,
      cancelable: type !== 'keyup',
      composed: true,
      view: window,
      key: ch || 'Process',
      code: 'Process',
      isComposing: type !== 'keyup',
      repeat: false,
      location: 0,
    });
    setEventProp(ev, 'keyCode', 229);
    setEventProp(ev, 'which', 229);
    setEventProp(ev, 'charCode', 0);
    return ev;
  }

  // ---- 8.1 键盘事件链 ----
  // ASCII：  [Shift down] → keydown → keypress → beforeinput(insertText)
  //          → input(insertText) → keyup → [Shift up]
  // IME：    compositionstart → compositionupdate → keydown(229,isComposing)
  //          → keypress(229) → beforeinput(insertCompositionText,isComposing)
  //          → input(insertCompositionText,isComposing) → keyup(229) → compositionend
  //          → input(insertCompositionText,isComposing=false)  ← 真实浏览器终值确认
  // Backspace：keydown → beforeinput(deleteContentBackward) → input(deleteContentBackward) → keyup
  // Enter：  keydown → keypress → keyup
  async function typeAsciiChar(input, ch) {
    const k = keyOf(ch);
    if (k.shift) {
      input.dispatchEvent(mkKeyEvent('keydown', KEY_SHIFT));
      await sleep(rand(25, 80));
    }
    input.dispatchEvent(mkKeyEvent('keydown', k));
    await sleep(rand(4, 14));
    input.dispatchEvent(mkKeyEvent('keypress', k));
    await sleep(rand(2, 8));

    const bi = mkInputEvent('beforeinput', 'insertText', ch, false);
    const ok = input.dispatchEvent(bi);
    if (ok) {
      nativeSetValue(input, (input.value || '') + ch);
      input.dispatchEvent(mkInputEvent('input', 'insertText', ch, false));
    }

    await sleep(rand(8, 30));
    input.dispatchEvent(mkKeyEvent('keyup', k));
    if (k.shift) {
      await sleep(rand(15, 60));
      input.dispatchEvent(mkKeyEvent('keyup', KEY_SHIFT));
    }
  }

  async function typeImeChar(input, ch) {
    input.dispatchEvent(mkCompositionEvent('compositionstart', ''));
    await sleep(rand(20, 60));
    input.dispatchEvent(mkCompositionEvent('compositionupdate', ch));
    await sleep(rand(8, 30));

    input.dispatchEvent(mkProcessKeyEvent('keydown', ch));
    await sleep(rand(4, 12));
    input.dispatchEvent(mkProcessKeyEvent('keypress', ch));
    await sleep(rand(2, 8));

    const bi = mkInputEvent('beforeinput', 'insertCompositionText', ch, true);
    const ok = input.dispatchEvent(bi);
    if (ok) {
      nativeSetValue(input, (input.value || '') + ch);
      input.dispatchEvent(mkInputEvent('input', 'insertCompositionText', ch, true));
    }

    await sleep(rand(15, 45));
    input.dispatchEvent(mkProcessKeyEvent('keyup', ch));
    await sleep(rand(30, 100));
    input.dispatchEvent(mkCompositionEvent('compositionend', ch));

    // 真实浏览器在 compositionend 后追加一次 input（isComposing=false）
    await sleep(rand(0, 16));
    if (ok) {
      input.dispatchEvent(mkInputEvent('input', 'insertCompositionText', ch, false));
    }
  }

  async function pressBackspace(input) {
    input.dispatchEvent(mkKeyEvent('keydown', KEY_BACKSPACE));
    await sleep(rand(3, 10));

    const bi = mkInputEvent('beforeinput', 'deleteContentBackward', null, false);
    const ok = input.dispatchEvent(bi);
    if (ok) {
      const v = input.value || '';
      nativeSetValue(input, v.slice(0, Math.max(0, v.length - 1)));
      input.dispatchEvent(mkInputEvent('input', 'deleteContentBackward', null, false));
    }

    await sleep(rand(8, 30));
    input.dispatchEvent(mkKeyEvent('keyup', KEY_BACKSPACE));
  }

  async function pressEnter(input) {
    input.dispatchEvent(mkKeyEvent('keydown', KEY_ENTER));
    await sleep(rand(3, 10));
    input.dispatchEvent(mkKeyEvent('keypress', KEY_ENTER));
    await sleep(rand(5, 20));
    input.dispatchEvent(mkKeyEvent('keyup', KEY_ENTER));
  }

  // ---- 8.2 填值 ----
  async function fill(input, val) {
    if (!input) return;
    // 真人是先用鼠标点一下输入框（pointerdown / mousedown → 聚焦 → click），不是凭空 focus()
    if (!(await clickIt(input))) { try { input.focus({ preventScroll: true }); } catch (e) {} }
    await sleep(rand(40, 120));

    // 清空已有内容：逐个 Backspace，走完整 beforeinput/input 链
    const existing = String(input.value || '');
    for (let i = 0; i < existing.length; i++) {
      await pressBackspace(input);
      await sleep(rand(20, 60));
    }

    let typos = 0;
    const text = String(val || '');
    for (const ch of text) {
      // 偶发手滑：先打错一个字符 → 停顿 → Backspace 修正（每次填码最多 2 次）
      if (typos < 2 && ch !== ' ' && Math.random() < 0.05) {
        typos++;
        const pool = 'abcdefghjkmnpqrstuvwxyz23456789';
        const wrong = pool[Math.floor(rand(0, pool.length))];
        if (isAsciiPrintable(wrong)) await typeAsciiChar(input, wrong);
        else await typeImeChar(input, wrong);
        await sleep(rand(250, 700));
        await pressBackspace(input);
        await sleep(rand(120, 400));
      }

      if (isAsciiPrintable(ch)) await typeAsciiChar(input, ch);
      else await typeImeChar(input, ch);
      await sleep(rand(70, 320));
    }
    typedInputs.add(input);
  }

  // ---- 8.3 指针事件链 ----
  let mouseAt = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
  let lastPointerTarget = null;

  const bezier1D = (p0, p1, p2, p3, t) => {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  };
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function makePointerMove(x, y, mx, my) {
    const init = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      movementX: mx, movementY: my,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: -1, buttons: 0,
    };
    const ev = new PE('pointermove', init);

    // coalesced events：在相邻两个 pointermove 之间插入子样本
    const sub = 2 + Math.floor(rand(0, 3));
    const coalesced = [];
    for (let j = 1; j <= sub; j++) {
      const f = j / (sub + 1);
      const cx = Math.round(x - mx * (1 - f));
      const cy = Math.round(y - my * (1 - f));
      coalesced.push(new PE('pointermove', Object.assign({}, init, {
        clientX: cx, clientY: cy, screenX: cx, screenY: cy,
        movementX: Math.round(mx / (sub + 1)),
        movementY: Math.round(my / (sub + 1)),
      })));
    }
    try {
      ev.getCoalescedEvents = () => coalesced;
      ev.getPredictedEvents = () => [];
    } catch (e) {}
    return ev;
  }

  function mkMouseMove(x, y, mx, my) {
    return new MouseEvent('mousemove', {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      movementX: mx, movementY: my, button: -1, buttons: 0,
    });
  }

  function commonAncestor(a, b) {
    for (let n = a; n; n = n.parentElement) if (n === b || n.contains(b)) return n;
    return null;
  }

  // 指针换目标时的 hover 事件链，顺序同浏览器：out / leave（旧目标）→ over / enter（新目标）
  function dispatchHover(from, to, x, y) {
    const init = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: -1, buttons: 0,
    };
    const stop = from && to ? commonAncestor(from, to) : null;
    const local = Object.assign({}, init, { bubbles: false, relatedTarget: null });
    if (from) {
      const out = Object.assign({}, init, { relatedTarget: to });
      from.dispatchEvent(new PE('pointerout', out));
      from.dispatchEvent(new MouseEvent('mouseout', out));
      for (let n = from; n && n !== stop; n = n.parentElement) {
        n.dispatchEvent(new PE('pointerleave', local));
        n.dispatchEvent(new MouseEvent('mouseleave', local));
      }
    }
    if (to) {
      const over = Object.assign({}, init, { relatedTarget: from });
      to.dispatchEvent(new PE('pointerover', over));
      to.dispatchEvent(new MouseEvent('mouseover', over));
      const chain = [];
      for (let n = to; n && n !== stop; n = n.parentElement) chain.push(n);
      for (let i = chain.length - 1; i >= 0; i--) {
        chain[i].dispatchEvent(new PE('pointerenter', local));
        chain[i].dispatchEvent(new MouseEvent('mouseenter', local));
      }
    }
  }

  function dispatchPointerMove(ev) {
    const at = (e) => {
      try { return document.elementFromPoint(e.clientX, e.clientY); } catch (err) {}
      return null;
    };
    // 真实鼠标每个采样点都有 mousemove，最后一个采样点再跟一个 pointermove
    let samples = [];
    try { samples = ev.getCoalescedEvents() || []; } catch (e) {}
    for (const c of samples) {
      try { (at(c) || document).dispatchEvent(mkMouseMove(c.clientX, c.clientY, c.movementX, c.movementY)); } catch (e) {}
    }
    const target = at(ev);
    const prev = lastPointerTarget;
    if (prev !== target && (!prev || prev.isConnected)) dispatchHover(prev, target, ev.clientX, ev.clientY);
    (target || document).dispatchEvent(ev);
    (target || document).dispatchEvent(mkMouseMove(ev.clientX, ev.clientY, ev.movementX, ev.movementY));
    lastPointerTarget = target;
  }

  async function movePointerTo(tx, ty) {
    const sx = mouseAt.x, sy = mouseAt.y;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;

    // 垂直方向随机弯曲，形成自然弧线
    const px = dist ? -dy / dist : 0;
    const py = dist ? dx / dist : 0;
    const bow = rand(-0.1, 0.1) * dist;
    const c1 = { x: sx + dx * 0.33 + px * bow, y: sy + dy * 0.33 + py * bow };
    const c2 = { x: sx + dx * 0.66 + px * bow, y: sy + dy * 0.66 + py * bow };

    const steps = Math.max(6, Math.min(40, Math.round(dist / 12))) + Math.floor(rand(0, 5));
    let lastX = sx, lastY = sy;
    for (let i = 1; i <= steps; i++) {
      const t = easeInOutCubic(i / steps);
      const nx = bezier1D(sx, c1.x, c2.x, tx, t) + rand(-1.2, 1.2);
      const ny = bezier1D(sy, c1.y, c2.y, ty, t) + rand(-1.2, 1.2);
      const cx = Math.round(nx), cy = Math.round(ny);
      const mx = cx - lastX, my = cy - lastY;
      lastX = cx; lastY = cy;
      dispatchPointerMove(makePointerMove(cx, cy, mx, my));
      await sleep(rand(7, 18));
    }
    mouseAt = { x: tx, y: ty };
  }

  // ---- 8.4 点击 ----
  async function clickIt(el) {
    if (!el || el.disabled || !visible(el)) return false;
    try {
      el.scrollIntoView({ block: 'center' });
      await sleep(rand(150, 500));
      // 等待期间弹窗可能已关闭/按钮已重绘，避免对已脱离 DOM 的节点发事件。
      if (el.isConnected === false || el.disabled || !visible(el)) return false;

      const r = el.getBoundingClientRect();
      const tx = Math.round(r.left + r.width * rand(0.25, 0.75));
      const ty = Math.round(r.top + r.height * rand(0.25, 0.75));

      // 1) 带轨迹移动到落点
      await movePointerTo(tx, ty);

      // 2) 落点附近的最后一次微移动（pointermove + mousemove，保证 pointerdown 前有移动）
      const jx = Math.round(tx + rand(-2, 2)), jy = Math.round(ty + rand(-2, 2));
      el.dispatchEvent(makePointerMove(jx, jy, jx - tx, jy - ty));
      el.dispatchEvent(mkMouseMove(jx, jy, jx - tx, jy - ty));
      await sleep(rand(20, 60));

      // 3) pointerdown → mousedown
      const downInit = {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: jx, clientY: jy, screenX: jx, screenY: jy,
        pointerId: 1, pointerType: 'mouse', isPrimary: true,
        button: 0, buttons: 1,
      };
      el.dispatchEvent(new PE('pointerdown', downInit));
      el.dispatchEvent(new MouseEvent('mousedown', downInit));
      // mousedown 的默认行为是转移焦点：上一个聚焦元素（如验证码输入框）会按真实顺序
      // 收到 change → blur → focusout，按钮收到 focus → focusin
      transferFocus(el);
      await sleep(rand(45, 150));

      // 4) pointerup → mouseup
      const upInit = Object.assign({}, downInit, { buttons: 0 });
      el.dispatchEvent(new PE('pointerup', upInit));
      el.dispatchEvent(new MouseEvent('mouseup', upInit));
      await sleep(rand(10, 40));
      if (el.isConnected === false || el.disabled) return false;

      // 5) click：用原生 click 保留默认行为（表单提交 / 导航等）
      el.click();
      return true;
    } catch (e) { return false; }
  }

  const typedInputs = new WeakSet();   // 被脚本逐字键入过的输入框：失焦时才补 change

  // 焦点转移交给浏览器原生执行；页面没有系统焦点时（后台窗口 / 失活的标签页）浏览器不派发
  // 聚焦与失焦事件，这里把没触发的按真实顺序补上，保证任何状态下事件序列都一致且不重复。
  function transferFocus(el) {
    const prev = document.activeElement;
    if (!el || !prev || prev === el || prev.nodeType !== 1) return;
    const seen = {};
    const on = (e) => { seen[e.type] = true; };
    const onPrev = ['change', 'blur', 'focusout'], onEl = ['focus', 'focusin'];
    onPrev.forEach((t) => prev.addEventListener(t, on));
    onEl.forEach((t) => el.addEventListener(t, on));
    try { el.focus({ preventScroll: true }); } catch (e) {}
    // 点在不可聚焦的元素上：真实行为是焦点回到 body
    const toBody = document.activeElement === prev;
    if (toBody) { try { prev.blur(); } catch (e) {} }
    onPrev.forEach((t) => prev.removeEventListener(t, on));
    onEl.forEach((t) => el.removeEventListener(t, on));

    if (prev !== document.body && prev !== document.documentElement) {
      if (/^(INPUT|TEXTAREA)$/.test(prev.tagName) && typedInputs.has(prev) && !seen.change) {
        prev.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (!seen.blur) prev.dispatchEvent(new FocusEvent('blur', { composed: true, view: window }));
      if (!seen.focusout) {
        prev.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true, view: window, relatedTarget: toBody ? null : el }));
      }
    }
    typedInputs.delete(prev);
    if (!toBody) {
      if (!seen.focus) el.dispatchEvent(new FocusEvent('focus', { composed: true, view: window }));
      if (!seen.focusin) {
        el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true, view: window, relatedTarget: prev }));
      }
    }
  }

  async function refreshCaptcha(box) {
    const btn = deepAll(box, 'a,button,span,i,img').find((el) => /(换一张|刷新|看不清|点击刷新)/.test(clean(el.textContent || '')) && visible(el));
    if (btn) {
      await clickIt(btn);
      await sleep(rand(300, 700));
      return '点击换图';
    }
    const img = (firstImage(box) || {}).el;
    if (img && img.src) {
      img.src = img.src.replace(/[?&]t=\d+/, '') + (img.src.includes('?') ? '&' : '?') + 't=' + Date.now();
      await waitImageLoaded(img, 2500);
      return '刷新图片';
    }
    return '无刷新控件';
  }

  /* ==== 9. 手打兜底 ==== */
  function showManual(reason, b64) {
    state.status = '需手打验证码' + (reason ? '（' + reason + '）' : '');
    capManual = true;
    capToken++;                       // 取消仍在等待中的自动识别流程
    if (b64) {
      state.capB64 = b64;
      state.capSig = sigOf(b64);
    } else {
      state.capB64 = '';
      state.capSig = '';
    }
    const panel = document.getElementById(ID.panel);
    if (panel) {
      panel.classList.remove(K + '-collapsed');
      if (CFG.hidePanel) { CFG.hidePanel = false; save(); }
    }
    const row = document.getElementById(ID.manual);
    if (!row) { capManual = false; return; }
    row.style.display = 'block';
    const prev = document.getElementById(ID.prev);
    if (prev) {
      if (b64) { prev.src = 'data:image/png;base64,' + b64; prev.style.display = 'block'; }
      else prev.style.display = 'none';
    }
    const inp = document.getElementById(ID.min);
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); }
    updatePanel();
  }
  function hideManual() {
    capManual = false;
    const row = document.getElementById(ID.manual);
    if (row) row.style.display = 'none';
  }

  // 把验证码写进所有相关输入框（可见框 + 隐藏的 #yzCode），并触发平台监听
  async function fillAll(cap, code) {
    try { await fill(cap.input, code); } catch (e) {}
    try {
      const yz = document.getElementById('yzCode');
      if (yz && yz !== cap.input) {
        const isEditable = (yz.tagName === 'INPUT' || yz.tagName === 'TEXTAREA') && visible(yz);
        if (isEditable) {
          await fill(yz, code);          // 可见框走完整 beforeinput 链
        } else {
          nativeSetValue(yz, code);
          yz.dispatchEvent(new Event('input', { bubbles: true }));
          yz.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } catch (e) {}
    return code;
  }

  // 轮询等待验证码弹窗关闭（每 180ms 检查一次，最长 timeout 毫秒）
  function waitCaptchaClosed(timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (!captchaHint(true)) return resolve(true);
        if (Date.now() - start > (timeout || 1500)) return resolve(false);
        setTimeout(check, 180);
      };
      check();
    });
  }

  // 等待 <img> 加载完成（含错误处理），返回是否成功
  function waitImageLoaded(el, timeout) {
    return new Promise((resolve) => {
      if (!el || el.tagName !== 'IMG') return resolve(false);
      if (el.complete && el.naturalWidth > 0) return resolve(true);
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { el.removeEventListener('load', onLoad); el.removeEventListener('error', onErr); } catch (e) {}
        resolve(ok);
      };
      const onLoad = () => finish(true);
      const onErr = () => finish(false);
      const timer = setTimeout(() => finish(el.complete && el.naturalWidth > 0), timeout || 2500);
      try {
        el.addEventListener('load', onLoad, { once: true });
        el.addEventListener('error', onErr, { once: true });
      } catch (e) { finish(false); }
    });
  }

  // 模拟"看到验证码后定睛观察"的准备延迟：整体定睛 + 逐字符扫视
  function humanReadDelay(codeLen) {
    const len = Math.max(3, Math.min(6, Number(codeLen) || 4));
    const look = rand(900, 1900);
    const perChar = rand(55, 145) * len;
    return Math.round(look + perChar);
  }

  // 提交按钮安全判定：防止误点页面其它"确定/关闭"按钮
  function isButtonSafe(el, expectedText) {
    if (!el || el.isConnected === false || !shown(el) || el.disabled ||
        el.getAttribute('aria-disabled') === 'true') return false;
    const label = clean(el.textContent || el.value || '');
    if (expectedText) return expectedText.test(label);
    return /^(确定|确认|提交|验证|继续|开始播放|继续播放|开始学习|进入学习|播放|OK|下一节|下一步)$/.test(label);
  }

  // 提交：多策略连发，每策略后轮询等待弹窗关闭
  async function submitCode(cap, guard) {
    const open = () => captchaHint(true);
    const inCapBox = (btn) => {
      if (!btn) return false;
      if (cap.box && cap.box.contains(btn)) return true;
      const layer = btn.closest && btn.closest('.layui-layer');
      return !!(layer && cap.input && layer.contains(cap.input));
    };

    // 同一个按钮只点一次：服务端校验稍慢就连点同一个按钮，是最扎眼的异常
    const clicked = new Set();
    const clickOnce = async (btn) => {
      if (!btn) return false;
      if (clicked.has(btn)) return 'dup';
      const ok = await clickIt(btn);
      if (ok) clicked.add(btn);
      return ok;
    };

    const strategies = [
      ['layer-btn0', async () => {
        const layer = cap.input && cap.input.closest && cap.input.closest('.layui-layer');
        if (!layer) return false;
        const btn = layer.querySelector('.layui-layer-btn0');
        if (!isButtonSafe(btn) || !inCapBox(btn)) return false;
        return await clickOnce(btn);
      }],
      ['cap.btn', async () => {
        if (!isButtonSafe(cap.btn, /^(确定|确认|提交|验证|继续|开始播放|继续播放|开始学习|进入学习|播放|OK)$/)) return false;
        return await clickOnce(cap.btn);
      }],
      ['findConfirm', async () => {
        const btn = findConfirm(cap.box || document);
        if (!isButtonSafe(btn)) return false;
        return await clickOnce(btn);
      }],
      ['Enter', async () => {
        const t = cap.input || document.getElementById('yzCode');
        if (!t) return false;
        try { if (visible(t)) t.focus(); } catch (e) {}
        await sleep(rand(40, 120));
        await pressEnter(t);
        return true;
      }],
      ['layer-btn-any', async () => {
        const btns = Array.from(document.querySelectorAll('.layui-layer .layui-layer-btn a, .layui-layer-btn a'))
          .filter((el) => visible(el) && inCapBox(el));
        const first = btns.find((el) => /开始播放|确定|确认|提交|验证|继续/.test(clean(el.textContent)));
        if (!first) return false;
        return await clickOnce(first);
      }],
      ['form-submit', () => {
        const form = cap.input.form || (cap.input.closest && cap.input.closest('form'));
        if (!form || typeof form.requestSubmit !== 'function') return false;
        // 不要退回 form.submit()：它会绕过 submit 监听器，可能直接刷新页面丢状态。
        try { form.requestSubmit(); return true; } catch (e) { return false; }
      }],
    ];

    for (const [name, fn] of strategies) {
      if (guard && !guard()) return { ok: false, by: 'cancelled' };
      if (!open()) return { ok: true, by: name + '（已经关闭）' };
      let did = false;
      try { did = await fn(); } catch (e) { did = false; }
      if (did === 'dup') { log('提交策略', name, '与前面是同一个按钮，跳过'); continue; }
      if (!did) { log('提交策略', name, '不可用'); continue; }
      // 校验接口慢的时候别急着换下一种提交方式，多等一会儿
      const closed = await waitCaptchaClosed(4000);
      log('提交策略', name, closed ? '弹窗已关闭 ✓' : '弹窗仍在');
      if (closed) return { ok: true, by: name };
    }
    return { ok: !open(), by: 'none' };
  }

  async function submitManual() {
    if (capBusy) {
      state.status = '自动识别正在进行，请稍候再手打提交';
      updatePanel();
      return false;
    }
    const inp = document.getElementById(ID.min);
    const raw = String((inp && inp.value) || '').trim();
    const code = raw.replace(/[^0-9A-Za-z]/g, '').slice(0, 8);
    if (inp && inp.value !== code) inp.value = code;
    const cap = findCaptcha();
    if (!cap || !code) {
      state.status = !cap ? '验证码弹窗已消失' : '请输入验证码';
      updatePanel();
      return false;
    }

    const token = ++capToken;          // 取消仍在等待中的自动识别流程
    capManual = true;
    capBusy = true;
    try {
      const now = await captureB64(cap.img);
      if (token !== capToken || !CFG.enabled) return false;
      const sig = sigOf(now);
      if (state.capSig && sig && sig !== state.capSig) {
        showManual('图片已刷新，请重新输入', now);
        return false;
      }
      await fillAll(cap, code);
      if (token !== capToken || !CFG.enabled) return false;
      state.status = '已提交手打验证码 ' + code + '，校验中…';
      updatePanel();
      const r = await submitCode(cap, () => CFG.enabled);
      state.status = r.ok
        ? '验证码通过 ✓ 继续播放'
        : '提交未生效（' + r.by + '），请调整后重试';
      if (r.ok) {
        state.capPassAt = Date.now();
        resetCapAttempts();
        hideManual();
        resume();
      } else {
        warn(state.status);
      }
      return r.ok;
    } catch (e) {
      warn('手打提交异常', e);
      return false;
    } finally {
      capBusy = false;
      updatePanel();
    }
  }
  function resume() {
    const v = player();
    if (!v || !CFG.enabled) return;
    try { v.muted = CFG.muted; v.play().catch(() => {}); } catch (e) {}
  }

  /* ==== 10. 自动识别 ==== */
  function captchaVariants(text) {
    const list = [];
    const add = (v) => {
      v = String(v || '');
      if (v && list.indexOf(v) < 0) list.push(v);
    };
    add(text);
    if (CFG.capCaseTry && /[a-zA-Z]/.test(text)) {
      add(text.toLowerCase());
      add(text.toUpperCase());
      add(text.toLowerCase().replace(/^([a-z])/, (m) => m.toUpperCase()));
    }
    return list;
  }

  async function solveCaptcha(presetCap) {
    if (!capFlowActive() || capBusy) return false;
    const cap = presetCap || findCaptcha();
    if (!cap) return false;

    const token = ++capToken;
    capBusy = true;                    // 必须在首个 await 前置位，阻止 tick 重入
    try {
      state.status = '验证码出现：已暂停，正在识别…';

      // 先取图，把图片签名纳入 key，区分“同一 URL 换了图”和“同一张图重试”。
      const b64 = await captureB64(cap.img);
      if (!capFlowActive(token)) return false;
      if (b64) { state.capB64 = b64; state.capSig = sigOf(b64); }

      const boxKey = cap.box ? (cap.box.id || String(cap.box.className || '') || cap.type) : cap.type;
      const sessionKey = currentNodeId() + '|' + cap.type + '|' + boxKey;
      const imageKey = (cap.img ? (cap.img.src || 'noimg') : 'noimg') + '|' + state.capSig;
      if (sessionKey !== capSession) {
        capSession = sessionKey;
        capTries = 0;
        capAttempt = 0;
        capAt = 0;
      }
      if (imageKey !== capImageKey) {
        capImageKey = imageKey;
        capAttempt = 0;
      }
      if (capAt && Date.now() - capAt < 1500) return false;

      // 路径 A：DOM 里直接读到答案
      if (cap.code) {
        log('DOM 读到验证码：', cap.code);
        await waitImageLoaded(cap.img && cap.img.el, 2000);
        if (!capFlowActive(token)) return false;
        await sleep(humanReadDelay(cap.code.length));
        if (!capFlowActive(token)) return false;
        await fillAll(cap, cap.code);
        if (!capFlowActive(token)) return false;
        await sleep(rand(320, 880));                 // 核对停顿
        const r = await submitCode(cap, () => capFlowActive(token));
        capAt = Date.now();
        if (!capFlowActive(token)) return false;
        if (r.ok || !captchaHint(true)) {
          state.status = '验证码通过 ✓ 继续播放';
          state.capPassAt = Date.now();
          resetCapAttempts();
          hideManual();
          log(state.status);
          resume();
          return true;
        }
        capTries++;
        if (capTries >= Math.max(1, CFG.capRetry)) {
          showManual('多次失败', state.capB64);
        } else {
          const how = await refreshCaptcha(cap.box || document);
          state.status = '验证码未通过（' + capTries + '/' + CFG.capRetry + '），' + how;
          warn(state.status);
        }
        return false;
      }

      // 路径 B：OCR 识别
      if (state.ocrOk !== true) await pingOcr();
      if (!capFlowActive(token)) return false;
      let text = b64 ? await ocr(b64) : '';
      if (!capFlowActive(token)) return false;
      // 之前健康、这次却网络失败：重新探测一次端点，避免服务重启后一直卡在旧端口。
      if (!text && b64 && /^HTTP (?:0|5\d\d)\b/.test(state.ocrErr || '')) {
        state.ocrOk = null;
        await pingOcr();
        if (!capFlowActive(token)) return false;
        text = await ocr(b64);
        if (!capFlowActive(token)) return false;
      }
      if (!text || !CODE_RE.test(text)) {
        capAt = Date.now();
        warn('识别失败：' + (b64 ? ('OCR 返回无效 ' + JSON.stringify(text) + ' ' + (state.ocrErr || '')) : '没取到图片') + ' → 手打');
        showManual(b64 ? 'OCR 没认出来' : '没取到图', b64);
        return false;
      }

      const variants = captchaVariants(text);
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

      // OCR 本身的 1~3s 已相当于“看图”时间，这里只加"看懂了准备打字"的短延迟
      await waitImageLoaded(cap.img && cap.img.el, 1500);
      if (!capFlowActive(token)) return false;
      await sleep(rand(400, 900) + Math.min(600, text.length * 60));
      if (!capFlowActive(token)) return false;
      await fillAll(cap, ans);
      if (!capFlowActive(token)) return false;
      await sleep(rand(320, 880));                   // 核对停顿

      const r = await submitCode(cap, () => capFlowActive(token));
      capAt = Date.now();
      if (!capFlowActive(token)) return false;
      const stillOpen = r.by !== 'cancelled' && captchaHint(true);
      state.status = r.ok && !stillOpen
        ? '验证码通过 ✓（' + r.by + '）'
        : '已填码但提交未生效（尝试了 ' + r.by + '）';

      if (stillOpen) {
        if (capAttempt + 1 < variants.length) {
          capAttempt++;
          state.status = '验证码未通过，换大小写（' + (capAttempt + 1) + '/' + variants.length + '）';
          warn(state.status);
        } else {
          capAttempt = 0;
          capTries++;
          if (capTries >= Math.max(1, CFG.capRetry)) {
            showManual('多次失败', state.capB64);
          } else {
            const how = await refreshCaptcha(cap.box || document);
            state.status = '验证码未通过（' + capTries + '/' + CFG.capRetry + '），' + how;
            warn(state.status);
          }
        }
      } else {
        state.status = '验证码通过 ✓ 继续播放';
        state.capPassAt = Date.now();
        resetCapAttempts();
        log(state.status);
        hideManual();
        resume();
        return true;
      }
      return false;
    } catch (e) {
      warn('验证码流程异常', e);
      return false;
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
      if (state.status.indexOf('暂停') < 0 && !capManual) {
        state.status = '验证码出现，已暂停播放，识别后自动继续';
        log('暂停原因：页面上有可见的验证码弹窗');
      }

      const cap = findCaptcha();
      if (!CFG.solveCaptcha) {
        // 关闭自动识别时也要给出手打入口；只展开一次，避免每秒重置输入框。
        if (!capManual) {
          showManual('自动识别已关闭');
          const previewToken = capToken;
          if (cap && cap.img) {
            captureB64(cap.img).then((b64) => {
              if (!b64 || previewToken !== capToken || !capManual || !captchaHint(true)) return;
              state.capB64 = b64;
              state.capSig = sigOf(b64);
              const prev = document.getElementById(ID.prev);
              if (prev) { prev.src = 'data:image/png;base64,' + b64; prev.style.display = 'block'; }
            }).catch(() => {});
          }
        }
        return;
      }
      if (capManual) return;
      if (!cap) {
        state.status = '验证码出现了但没定位到输入框' + (CFG.debug ? '，执行 ' + DBG_NAME + '.capDebug() 看结构' : '');
        return;
      }
      if (!capBusy) solveCaptcha(cap);
      return;
    }
    if (capHold) {
      capHold = false;
      resetCapAttempts();
      hideManual();
      state.status = '验证码已通过，继续播放';
      log(state.status);
      if (CFG.autoPlay) resume();
    }

    try {
      if (CFG.muted && !v.muted) v.muted = true;
      if (CFG.playbackRate && CFG.playbackRate !== 1 && v.playbackRate !== CFG.playbackRate) {
        try { v.playbackRate = CFG.playbackRate; } catch (e) {}
      }
      // simBreak=拟人"走神"暂停中、bootDelay=加载后的随机启动延迟，这两种情况都不抢着续播
      if (CFG.autoPlay && !simBreak && Date.now() - bootAt > bootDelay &&
          v.paused && !v.ended && v.readyState >= 2) v.play().catch(() => {});
    } catch (e) {}
    if (!armed && !busy && Date.now() - lastAt > 3000) armed = true;
  }

  /* ==== 12. 拟人操作 ==== */
  let simBreak = false;                        // 拟人"走神"暂停中，tick 暂不自动续播
  const bootAt = Date.now();                   // 页面加载时间
  const bootDelay = rand(1500, 5000);          // 加载后随机 1.5-5 秒再开始自动播放

  // 找一个点了不会有事的屏幕位置：落点是布局容器，它自己和祖先都不是可交互元素
  const BLANK_TAG = /^(DIV|SECTION|MAIN|ARTICLE|ASIDE|HEADER|FOOTER|NAV)$/;
  function blankPoint() {
    for (let i = 0; i < 6; i++) {
      const x = Math.round(rand(20, Math.max(40, window.innerWidth - 20)));
      const y = Math.round(rand(20, Math.max(40, window.innerHeight - 20)));
      const el = document.elementFromPoint(x, y);
      if (!el || !BLANK_TAG.test(el.tagName) || el.isContentEditable || inOwnPanel(el)) continue;
      if (el.closest('a,button,input,textarea,select,video,iframe,label,[contenteditable="true"],[role="button"],[onclick]')) continue;
      if (/btn|button|link|item|row|tab|menu|close|play|cap/i.test(String(el.className || ''))) continue;
      try { if ((el.ownerDocument.defaultView || window).getComputedStyle(el).cursor === 'pointer') continue; } catch (e) {}
      return { x, y, el };
    }
    return null;
  }

  // 以随机时间间隔做一件"人味"小事：小幅滚动 / 鼠标漫游 / 空白处点击 / 短暂走神暂停 / 发呆不动。
  function humanPulse() {
    const waitMs = rand(15000, 45000);            // 随机时间间隔：15-45 秒
    setTimeout(async () => {
      // 验证码活跃期完全静默，避免抢焦点/拖动进度/打乱 capHold
      if (capBusy || capManual || captchaHint()) {
        humanPulse();
        return;
      }
      if (CFG.enabled) {
        try {
          const dice = Math.random();
          if (dice < 0.20) {
            // 什么都不做（人也会发呆）
          } else if (dice < 0.50) {
            // 小幅滚动屏幕：1-3 段，方向随机，段间随机停顿
            const n = 1 + Math.floor(rand(0, 3));
            for (let i = 0; i < n; i++) {
              const dy = Math.round(rand(-180, 240));
              if (dy) window.scrollBy({ top: dy, behavior: 'smooth' });
              await sleep(rand(400, 1500));
            }
          } else if (dice < 0.75) {
            // 鼠标漫游：走完整 pointer 链，带 movementX/Y 与 coalesced events
            const n = 2 + Math.floor(rand(0, 4));
            for (let i = 0; i < n; i++) {
              const tx = Math.round(rand(20, Math.max(40, window.innerWidth - 20)));
              const ty = Math.round(rand(20, Math.max(40, window.innerHeight - 20)));
              await movePointerTo(tx, ty);
              await sleep(rand(200, 700));
            }
          } else if (dice < 0.90) {
            // 页面空白处点一下鼠标：只点确认过不是链接 / 按钮 / 播放器的容器，
            // 事件发给落点上真正的元素（真实点击命中的就是它）
            const p = blankPoint();
            if (p) {
              await movePointerTo(p.x, p.y);
              const o = { bubbles: true, cancelable: true, composed: true, view: window,
                clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
                pointerId: 1, pointerType: 'mouse', isPrimary: true,
                button: 0, buttons: 1 };
              p.el.dispatchEvent(new PE('pointerdown', o));
              p.el.dispatchEvent(new MouseEvent('mousedown', o));
              await sleep(rand(40, 140));
              const o2 = Object.assign({}, o, { buttons: 0 });
              p.el.dispatchEvent(new PE('pointerup', o2));
              p.el.dispatchEvent(new MouseEvent('mouseup', o2));
              p.el.dispatchEvent(new MouseEvent('click', o2));
            }
          } else {
            // 短暂"走神"：暂停视频 2-6 秒再续播（simBreak 期间 tick 不抢着恢复）
            const v = player();
            if (v && !v.paused) {
              simBreak = true;
              try {
                try { v.pause(); } catch (e) {}
                await sleep(rand(2000, 6000));
              } finally {
                simBreak = false;
                // 恢复播放前检查：若走神期间弹了验证码，或用户关了开关，就不续播
                if (CFG.enabled && CFG.autoPlay && !captchaHint()) {
                  try { v.play().catch(() => {}); } catch (e) {}
                }
              }
            }
          }
        } catch (e) {}
      }
      humanPulse();                              // 下一轮，间隔重新随机
    }, waitMs);
  }

  // 键盘 Activity 心跳：30-90s 随机按一个导航键（不触发默认行为，仅派发事件）
  const isEditableTarget = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')));
  function keyboardPulse() {
    const waitMs = rand(30000, 90000);
    setTimeout(async () => {
      const active = document.activeElement;
      // 不打断用户输入，也不在弹窗/验证码期间派发 Esc/Tab 等可能有关闭语义的键。
      if (CFG.enabled && !capBusy && !capManual && !captchaHint() &&
          !isEditableTarget(active) && !inOwnPanel(active)) {
        try {
          const KEYS = [
            { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            { key: 'ArrowUp',   code: 'ArrowUp',   keyCode: 38 },
            { key: 'PageDown',  code: 'PageDown',  keyCode: 34 },
            { key: 'PageUp',    code: 'PageUp',    keyCode: 33 },
          ];
          const k = KEYS[Math.floor(rand(0, KEYS.length))];
          const target = (active && active !== document.body) ? active : document.body;
          const base = { bubbles: true, cancelable: true, composed: true, view: window, key: k.key, code: k.code };
          const kd = new KeyboardEvent('keydown', base);
          setEventProp(kd, 'keyCode', k.keyCode); setEventProp(kd, 'which', k.keyCode); setEventProp(kd, 'charCode', 0);
          target.dispatchEvent(kd);
          await sleep(rand(40, 140));
          const ku = new KeyboardEvent('keyup', base);
          setEventProp(ku, 'keyCode', k.keyCode); setEventProp(ku, 'which', k.keyCode); setEventProp(ku, 'charCode', 0);
          target.dispatchEvent(ku);
        } catch (e) {}
      }
      keyboardPulse();
    }, waitMs);
  }

  /* ==== 13. UI ==== */
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '--:--';
    s = Math.floor(s);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  const CSS = [
    '#' + ID.panel + '{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:212px;box-sizing:border-box;',
    'padding:10px 11px 11px;border-radius:12px;',
    'background:linear-gradient(180deg,rgba(30,33,42,.97),rgba(18,20,26,.97))!important;',
    'border:1px solid rgba(255,255,255,.09)!important;',
    'box-shadow:0 12px 34px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05)!important;',
    'color:#e6e9ef!important;user-select:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);',
    'font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif!important;}',
    '#' + ID.panel + ' *{box-sizing:border-box;margin:0;padding:0;font-family:inherit!important;line-height:1.5!important}',
    '#' + ID.panel + ' .[K]-hd{display:flex;align-items:center;gap:7px;cursor:move;margin-bottom:8px!important}',
    '#' + ID.panel + ' .[K]-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:#8b93a1!important;',
    'box-shadow:0 0 0 3px rgba(139,147,161,.16)!important;transition:background .25s,box-shadow .25s}',
    '#' + ID.panel + ' .[K]-dot[data-s="play"]{background:#28c76f!important;box-shadow:0 0 0 3px rgba(40,199,111,.18)!important}',
    '#' + ID.panel + ' .[K]-dot[data-s="pause"]{background:#ffd166!important;box-shadow:0 0 0 3px rgba(255,209,102,.18)!important}',
    '#' + ID.panel + ' .[K]-dot[data-s="cap"]{background:#ffa94d!important;box-shadow:0 0 0 3px rgba(255,169,77,.18)!important}',
    '#' + ID.panel + ' .[K]-title{font-size:12px!important;font-weight:600!important;color:#e6e9ef!important;letter-spacing:.3px}',
    '#' + ID.panel + ' .[K]-fold{margin-left:auto!important;color:#8b93a1!important;font-size:11px!important;cursor:pointer;',
    'padding:0 2px!important;transition:transform .18s;display:inline-block}',
    '#' + ID.panel + '.[K]-collapsed .[K]-fold{transform:rotate(-90deg)}',
    '#' + ID.panel + '.[K]-collapsed .[K]-body{display:none}',
    '#' + ID.panel + ' .[K]-meta{color:#9aa4b2!important;font-size:11px!important;margin-bottom:7px!important;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#' + ID.panel + ' .[K]-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.1)!important;overflow:hidden;margin-bottom:9px!important}',
    '#' + ID.panel + ' .[K]-bar>i{display:block;height:100%;width:0;border-radius:2px;',
    'background:linear-gradient(90deg,#28c76f,#4ade80)!important;transition:width .45s linear}',
    '#' + ID.panel + ' .[K]-sw{display:flex;align-items:center;gap:8px;margin-top:8px!important;cursor:pointer;',
    'color:#c9d3e0!important;font-size:11px!important}',
    '#' + ID.panel + ' .[K]-sw input{position:absolute!important;opacity:0!important;width:0!important;height:0!important;pointer-events:none!important}',
    '#' + ID.panel + ' .[K]-track{position:relative;width:26px;height:15px;border-radius:99px;flex:0 0 auto;',
    'background:rgba(255,255,255,.14)!important;transition:background .2s;display:inline-block}',
    '#' + ID.panel + ' .[K]-knob{position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;',
    'background:#8b93a1!important;transition:left .2s,background .2s}',
    '#' + ID.panel + ' .[K]-sw input:checked~.[K]-track{background:#28c76f!important}',
    '#' + ID.panel + ' .[K]-sw input:checked~.[K]-track .[K]-knob{left:13px;background:#fff!important}',
    '#' + ID.panel + ' .[K]-manual{display:none;margin-top:8px!important;padding-top:8px!important;',
    'border-top:1px solid rgba(255,255,255,.08)!important}',
    '#' + ID.panel + ' .[K]-prev{display:none;width:100%;max-height:44px;object-fit:contain;background:#fff!important;',
    'border-radius:5px;margin-bottom:5px!important;cursor:zoom-in;image-rendering:pixelated}',
    '#' + ID.panel + ' .[K]-row{display:flex;gap:4px}',
    '#' + ID.panel + ' .[K]-min{flex:1;min-width:0;background:#2b2f3a!important;border:1px solid #5b8def!important;',
    'border-radius:5px!important;color:#fff!important;font-size:12px!important;padding:3px 6px!important;letter-spacing:2px}',
    '#' + ID.panel + ' .[K]-ok{flex:0 0 auto;cursor:pointer;border:0!important;border-radius:5px!important;',
    'padding:3px 8px!important;font-size:11px!important;color:#06240f!important;background:#28c76f!important;font-weight:600}',
    '#' + ID.panel + ' .[K]-msg{display:none;margin-top:8px!important;padding:5px 8px!important;border-radius:6px!important;',
    'font-size:11px!important;color:#ffc078!important;background:rgba(255,169,77,.12)!important;word-break:break-all}',
    '#' + ID.panel + '.[K]-off{background:linear-gradient(180deg,rgba(26,28,34,.97),rgba(16,17,22,.97))!important}',
    '#' + ID.panel + '.[K]-off .[K]-dot{background:#5b6270!important;box-shadow:none!important}',
    '#' + ID.panel + '.[K]-off .[K]-title{color:#8b93a1!important}',
    '#' + ID.panel + '.[K]-off .[K]-body{opacity:.45!important}',
    '#' + ID.panel + '.[K]-off .[K]-sw:not(.[K]-master){pointer-events:none!important}',
    '#' + ID.panel + ' .[K]-sw.[K]-master{padding-top:8px!important;border-top:1px solid rgba(255,255,255,.07)!important;',
    'color:#e6e9ef!important;font-weight:600!important}',
  ].join('');

  function injectCss() {
    if (document.getElementById(ID.style)) return;
    const st = document.createElement('style');
    st.id = ID.style;
    st.textContent = CSS.split('[K]').join(K);
    (document.head || document.documentElement).appendChild(st);
  }

  function updatePanel() {
    const box = document.getElementById(ID.panel);
    if (!box) return;
    const v = player(), p = progress(), total = totalDuration(v);
    const dot = box.querySelector('.' + K + '-dot');
    const meta = box.querySelector('.' + K + '-meta');
    const bar = box.querySelector('.' + K + '-bar > i');
    const msg = box.querySelector('.' + K + '-msg');

    box.classList.toggle(K + '-off', !CFG.enabled);
    const mode = !CFG.enabled ? 'idle' : !v ? 'idle' : state.capOnScreen ? 'cap' : v.paused ? 'pause' : 'play';
    if (dot && dot.getAttribute('data-s') !== mode) dot.setAttribute('data-s', mode);

    if (meta) {
      meta.textContent = !CFG.enabled
        ? '已停用：不自动播放、不跳节'
        : (p.total ? '第 ' + (p.index || '?') + '/' + p.total + ' 节' : '目录未识别') +
          (v ? ' · ' + fmt(v.currentTime) + '/' + fmt(total) : '');
    }
    if (bar) {
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
    capToken++;                       // 让正在等待的验证码流程尽快失效
    resetCapAttempts();
    save();
    const v = player();
    if (on) {
      capManual = false;
      if (v) {
        try { if (CFG.muted) v.muted = true; } catch (e) {}
      }
      state.status = '已启用';
    } else {
      capHold = false;
      hideManual();
      if (v) {
        try { v.muted = false; } catch (e) {}
      }
      state.status = '已停用';
    }
    updatePanel();
    log(CFG.enabled ? '已启用' : '已停用');
  }

  function makeDraggable(box, hd) {
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(K + '-fold')) return;
      const r = box.getBoundingClientRect();
      drag = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      box.style.right = 'auto'; box.style.bottom = 'auto';
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      try { hd.setPointerCapture(e.pointerId); } catch (err) {}
    });
    hd.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const maxLeft = Math.max(4, window.innerWidth - box.offsetWidth - 4);
      const maxTop = Math.max(4, window.innerHeight - box.offsetHeight - 4);
      box.style.left = Math.min(maxLeft, Math.max(4, ox + e.clientX - sx)) + 'px';
      box.style.top = Math.min(maxTop, Math.max(4, oy + e.clientY - sy)) + 'px';
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
    l.className = K + '-sw' + (cls ? ' ' + cls : '');
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    if (id) inp.id = id;
    inp.checked = !!checked;
    inp.onchange = () => onChange(inp.checked);
    const tr = document.createElement('span');
    tr.className = K + '-track';
    const kn = document.createElement('i');
    kn.className = K + '-knob';
    tr.appendChild(kn);
    const sp = document.createElement('span');
    sp.textContent = labelText;
    l.append(inp, tr, sp);
    return l;
  }

  function panel() {
    if (document.getElementById(ID.panel)) return;
    injectCss();

    const box = document.createElement('div');
    box.id = ID.panel;
    if (CFG.hidePanel) box.classList.add(K + '-collapsed');
    if (CFG.panelPos) {
      box.style.right = 'auto'; box.style.bottom = 'auto';
      box.style.left = Math.max(4, CFG.panelPos.left) + 'px';
      box.style.top = Math.max(4, CFG.panelPos.top) + 'px';
    }

    const hd = document.createElement('div');
    hd.className = K + '-hd';
    const dot = document.createElement('i');
    dot.className = K + '-dot';
    dot.setAttribute('data-s', 'idle');
    const title = document.createElement('span');
    title.className = K + '-title';
    title.textContent = TITLE;
    const fold = document.createElement('span');
    fold.className = K + '-fold';
    fold.textContent = '▾';
    hd.append(dot, title, fold);
    fold.onclick = () => {
      CFG.hidePanel = !CFG.hidePanel; save();
      box.classList.toggle(K + '-collapsed', CFG.hidePanel);
    };

    const body = document.createElement('div');
    body.className = K + '-body';

    const meta = document.createElement('div');
    meta.className = K + '-meta';
    const bar = document.createElement('div');
    bar.className = K + '-bar';
    bar.appendChild(document.createElement('i'));

    const master = mkSwitch('启用脚本', CFG.enabled, (on) => applyEnabled(on), K + '-master', ID.master);
    const autoSw = mkSwitch('自动下一节', CFG.autoNext, (on) => { CFG.autoNext = on; save(); });
    const capSw = mkSwitch('自动识别验证码', CFG.solveCaptcha, (on) => {
      CFG.solveCaptcha = on;
      capToken++;
      resetCapAttempts();
      save();
      if (on) {
        capManual = false;
        hideManual();
        if (state.ocrOk !== true) pingOcr();
      }
    }, K + '-capsw');

    const manual = document.createElement('div');
    manual.className = K + '-manual';
    manual.id = ID.manual;
    const prev = document.createElement('img');
    prev.className = K + '-prev';
    prev.id = ID.prev;
    prev.onclick = () => { if (prev.src) window.open(prev.src); };
    const row = document.createElement('div');
    row.className = K + '-row';
    const min = document.createElement('input');
    min.className = K + '-min';
    min.id = ID.min;
    min.placeholder = '手打验证码后回车';
    min.onkeydown = (e) => { if (e.key === 'Enter') submitManual(); };
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = K + '-ok';
    ok.textContent = '提交';
    ok.onclick = submitManual;
    row.append(min, ok);
    manual.append(prev, row);

    const msg = document.createElement('div');
    msg.className = K + '-msg';

    body.append(meta, bar, master, autoSw, capSw, manual, msg);
    box.append(hd, body);
    (document.body || document.documentElement).appendChild(box);

    try { makeDraggable(box, hd); } catch (e) {}
    setInterval(updatePanel, 1000);
    updatePanel();
  }

  /* ==== 14. 诊断 ==== */
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
    const out = {
      version: VERSION,
      host: location.hostname,
      injected: true,
      errors: API.errors,
      bootError: state.bootError && state.bootError.message,
      enabled: CFG.enabled,
      node: currentNodeId() || null,
      progress: progress(),
      duration: totalDuration(v),
      video: !!v,
      captchaContainer: captchaPresent(),
      captchaOnScreen: state.capOnScreen,
      capHold,
      capBusy,
      capManual,
      capTries,
      capAttempt,
      solveCaptcha: CFG.solveCaptcha,
      playbackRate: CFG.playbackRate,
      ocr: { ok: state.ocrOk, active: state.ocrActive || '(无)', err: state.ocrErr || '' },
    };
    console.table(out);
    return out;
  }

  /* ==== 15. 启动 ==== */
  Object.assign(API, {
    cfg: CFG, state,
    player, nodeLinks, currentNodeId, nextNode, progress, totalDuration, captchaPresent, captchaHint,
    goNext, panel, selfTest, updatePanel, tick, applyEnabled,
    findCaptcha, captureB64, solveCaptcha, pingOcr, ocrTest, ocr, capDebug,
    showManual, hideManual, submitManual, resume, refreshCaptcha,
    setEnabled: (on) => { applyEnabled(on); const cb = document.getElementById(ID.master); if (cb) cb.checked = !!on; },
    isEnabled: () => CFG.enabled,
    isBusy: () => capBusy,
    isManual: () => capManual,
    resetCapAttempts,
    status: () => state.status,
  });

  function boot() {
    panel();
    const p = progress();
    log('已启动 v' + VERSION + ' | 节点', currentNodeId() || '?', '|', p.index + '/' + p.total,
      '| 验证码', CFG.solveCaptcha ? '自动' : '手打',
      '| 倍速', CFG.playbackRate);
    // OCR 是可选组件，不在启动时探测，等验证码真出现再探（见 solveCaptcha）
    humanPulse();
    keyboardPulse();
    setInterval(tick, 800);
    setInterval(() => {
      if (!CFG.enabled || simBreak) return;
      const v = player();
      if (v && v.paused && CFG.autoPlay && !v.ended && !captchaHint()) v.play().catch(() => {});
    }, 30000);
    tick();
    updatePanel();
  }

  try { boot(); API.ready = true; } catch (e) {
    state.bootError = e;
    API.errors.push('boot: ' + e.message);
    console.error('%c[赛博代刷] 启动异常' + (CFG.debug ? '（' + DBG_NAME + '.selfTest() 可用）' : ''), 'color:#ff6b6b;font-weight:600', e);
  }
})();