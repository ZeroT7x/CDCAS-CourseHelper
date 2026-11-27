// 由 cdwl-cyber-helper.user.js 生成 cdwl-cyber-helper.console.js。
// 用法：node tools/build-console.mjs    （只维护油猴版，改完跑一下）
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const src = readFileSync(new URL('cdwl-cyber-helper.user.js', root)).toString().replace(/\r\n/g, '\n');

const ver = /\/\/ @version\s+(\S+)/.exec(src)?.[1];
const iife = src.indexOf('(function () {');
if (!ver || iife < 0) throw new Error('油猴版结构不符：没找到 @version 或 (function () {');

let body = src.slice(iife);
function rep(from, to) {
  const n = body.split(from).length - 1;
  if (n !== 1) throw new Error(`锚点应恰好出现 1 次（实际 ${n}）：${from.slice(0, 50)}`);
  body = body.replace(from, () => to);
}

rep(`const VERSION = '${ver}';`, `const VERSION = '${ver}c';`);

// 站点守卫：Console 版没有 @match，改成只提示不拦截
rep(
  `  if (!isSupportedHost()) {
    console.log('%c[赛博代刷] 非目标站点（' + location.hostname + '），跳过', 'color:#9aa0a6');
    return;
  }`,
  `  // 油猴版按 @match 精确注入；Console 版没有 @match，因此只提示不拦截，
  // 让用户在其它部署上也能手动粘贴尝试。
  if (!isSupportedHost()) {
    console.log('%c[赛博代刷] 注意：当前不在支持站点列表，功能照常尝试', 'color:#ffa94d');
  }`,
);

rep(
  '  // 同一页重复注入（例如同时装了旧版和副本）时只保留先启动的一份，避免双倍定时器/双击提交。',
  '  // 同一页重复粘贴（例如贴了两遍或与油猴版并存）时只保留先启动的一份，\n  // 避免双倍定时器 / 双击提交。',
);

rep(
  '  function fetchB64(src) {',
  '  // Console 版没有 GM_xmlhttpRequest，会自动走 fetch 兜底（同源验证码图可直接取）。\n' +
  '  function fetchB64(src) {',
);
rep(
  '  function httpJson(url, body, timeout) {',
  '  // Console 版没有 GM_xmlhttpRequest，会自动走 fetch 兜底；跨域请求 127.0.0.1\n' +
  '  // 需要 OCR 服务端放行 CORS，否则会失败并回退手打。\n' +
  '  function httpJson(url, body, timeout) {',
);

const header = `/* ============================================================================
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
 * 本文件由 tools/build-console.mjs 从油猴版 ${ver} 自动生成，请勿手工修改。
 * 与油猴版功能一致：真实键盘/指针交互链、验证码流程、拟人操作、单实例保护、
 * 错误兜底均相同。区别只在依赖：没有 GM_xmlhttpRequest（fetchB64 / httpJson
 * 走 fetch 兜底，跨域访问 127.0.0.1 需 OCR 服务端放行 CORS）；没有脚本存储和
 * 菜单命令（配置存 localStorage，调试开关也在这里改）。
 * ============================================================================ */`;

writeFileSync(new URL('cdwl-cyber-helper.console.js', root), header + '\n\n' + body);
console.log('已生成 cdwl-cyber-helper.console.js（v' + ver + 'c）');
