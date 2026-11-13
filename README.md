# 成都文理 · 赛博代刷助手

在线课程辅助工具：**自动播放 / 续播 · 强制倍速 · 播完自动下一节 · 验证码自动识别（ddddocr）**。

适用站点（同平台两套部署，脚本自动适配）：

- `https://cdcas.chaoxiankeji.com/*`（超贤科技）
- `https://cdcas.duxingkej.com/*`（成都文理学院实训平台 · 读行科技）

`@match` 已限定这两个域名，脚本内部还有 hostname 白名单二次校验。

| 项 | 值 |
|---|---|
| 项目名 | 成都文理 · 赛博代刷助手 |
| 命名空间 | `local.cdwl.cyber` |
| 作者 / 版权 | 成都文理 · 赛博代刷 © 2025 |
| 许可 | PolyForm Noncommercial 1.0.0（**禁止商用**，见 [LICENSE](LICENSE)） |
| 版本 | 油猴版 `6.1` / Console 版 `6.1c` |
| 调试接口 | 默认不暴露；`debug:true` 后以随机名（如 `_k3f9a2`）挂载 |
| 配置键 | `localStorage['__CDWL_CYBER_CFG__']` |

---

## 1. 文件清单

```
course-helper/
├─ cdwl-cyber-helper.user.js      油猴脚本（v6.1，跨页存活，日常使用）
├─ cdwl-cyber-helper.console.js   同功能 Console 版（v6.1c，不装油猴时用）
├─ README.md                      本文档
├─ LICENSE                        非商业许可 + 免责声明（全文）
├─ _tools/
│  └─ study-probe.console.js      进度上报抓包 / 直提探针（Console 版，默认 dry-run）
└─ ocr/
   ├─ ddddocr_server.py           本地验证码识别服务（标准库 http.server + ddddocr）
   ├─ start-ocr.bat               Windows 一键启动（建 venv / 装依赖 / 起服务）
   ├─ requirements.txt            依赖清单（ddddocr==1.5.6）
   └─ .venv/                      已装好的运行环境（Python 3.9 + ddddocr 1.5.6 + onnxruntime）
```

两个脚本功能完全一致：

| | 油猴版 `cdwl-cyber-helper.user.js` | Console 版 `cdwl-cyber-helper.console.js` |
|---|---|---|
| 安装 | Tampermonkey 里粘贴保存 | 每页 F12 粘贴 |
| 整页跳转（自动下一节）后 | **自动继续** | **失效，需重新粘贴** |
| 访问 127.0.0.1 | `GM_xmlhttpRequest` | `fetch`（服务端已带 CORS 头） |

> Console 版 = 油猴版去头、去站点守卫、GM 换 fetch 生成的镜像，两者共用同一份 localStorage 配置。

---

## 2. 快速开始（3 步）

1. **启动 OCR 服务**：双击 `ocr/start-ocr.bat`，窗口留着别关。
   浏览器打开 <http://127.0.0.1:8899/health>，看到 `{"ok": true, "engine": "ddddocr", "port": 8899}` 即正常。
2. **装脚本**：Tampermonkey → 添加新脚本 → 粘贴 `cdwl-cyber-helper.user.js` → `Ctrl+S`。
3. **打开任意课程页**（`/user/node?nodeId=...`），刷新。右下角出现小面板即生效。

控制台应打印：

```
[赛博代刷] 注入 v6.1 | 已启动
[赛博代刷] 仅供个人学习研究使用，禁止商用。使用风险与后果由使用者自行承担。
[赛博代刷] 已启动 v6.1 | 节点 1765885 | 2/40 | 倍速 1x | 验证码 自动
[赛博代刷] OCR 服务已连接： http://127.0.0.1:8899/ocr
```

一键自检：`__DBG__.selfTest()`。

---

## 3. OCR 服务

### 启动

```bat
:: 方式一：双击
ocr\start-ocr.bat
```

```powershell
# 方式二：PowerShell
cd D: \course-helper\ocr
.\.venv\Scripts\python.exe .\ddddocr_server.py 8899
```

端口可用参数更换，客户端会自动探测 `8899 / 8900 / 8000 / 5000`。

### 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回 `{"ok":true,"engine":"ddddocr","port":8899}` |
| POST | `/ocr` | body `{"image":"<纯 base64，不带 data: 前缀>"}`，返回 `{"code":"a1b2"}` |
| GET | `/` | 说明页（浏览器打开可确认服务活着） |

### 环境重建 / 端口占用

```powershell
# 重建运行环境（会重新下载 ddddocr，约 75MB）
cd D:\course-helper\ocr
Remove-Item .venv -Recurse -Force
.\start-ocr.bat

# 端口被占用
Get-NetTCPConnection -LocalPort 8899 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 4. 配置

### 4.1 面板控件（即时生效、自动保存）

| 控件 | 作用 |
|---|---|
| `1x 2x 4x 8x` | 倍速，当前值绿底高亮 |
| 启用脚本 | **总开关**。关闭后：倍速回 1x、取消静音、不自动播放、不跳节、不处理验证码；面板变灰 |
| 自动下一节 | 播完是否进入目录里的下一节（考试节点默认停） |
| 自动识别验证码 | 验证码出现时自动识别并提交；关闭后只在面板手打 |

### 4.2 配置文件（localStorage）

键名：`__CDWL_CYBER_CFG__`，油猴版与 Console 版共用。旧版本键 `__CX_PLAY_CFG__` 会在首次加载时**自动迁移并删除**。

```js
// 查看
JSON.parse(localStorage.getItem('__CDWL_CYBER_CFG__'))

// 改单项（示例：默认 8x、关闭静音）
__DBG__.cfg.rate = 8;
__DBG__.cfg.muted = false;
localStorage.setItem('__CDWL_CYBER_CFG__', JSON.stringify(__DBG__.cfg));

// 重置全部
localStorage.removeItem('__CDWL_CYBER_CFG__');
```

### 4.3 全部字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关，对应面板「启用脚本」 |
| `rate` | `1` | 目标倍速，**默认 1x（不加速）**；`playbackRate` setter 会把低于它的值抬回。要加速请在面板点 2x/4x/8x，或 `__DBG__.setRate(4)` |
| `muted` | `true` | 自动静音 |
| `autoPlay` | `true` | 暂停/卡顿/切后台后自动续播 |
| `autoNext` | `true` | 播完自动进下一节 |
| `skipExam` | `true` | 标题含「考试/测试/测验」的节点不自动进入 |
| `delay` | `2000` | 播完后等待毫秒数再跳（给进度上报留时间） |
| `tail` | `1.5` | 距结尾多少秒算「播完」 |
| `solveCaptcha` | `true` | 验证码自动识别，对应面板开关 |
| `capCaseTry` | `true` | 大小写轮换重试（原样→小写→大写→首字母大写） |
| `capRetry` | `3` | 识别不通过时换图重试轮数 |
| `ocrUrl` | `http://127.0.0.1:8899/ocr` | OCR 端点，换端口时改这里 |
| `hidePanel` | `false` | 面板是否折叠 |
| `panelPos` | `null` | 面板拖动后的坐标 `{left, top}` |
| `debug` | `false` | true 时以随机名字暴露调试接口；默认不暴露 |
| `autoNextMode` | `'auto'` | `auto`=自动跳节；`prompt`=只在提示，手动点才跳 |
| `humanFill` | `true` | 填验证码前先派发 mousedown、提交前补 keypress(13)，抹平自动化差异 |
| `delayMin` / `delayMax` | `15000` / `60000` | 播完到跳节的停留区间（随机），真人不会秒跳 |
| `restEvery` | `4` | 每学 N 节休息一次，0=不休息 |
| `restMin` / `restMax` | `300000` / `900000` | 休息时长区间（5–15 分钟，随机） |
| `dailyMaxSections` | `0` | 单日自动学习节数上限，0=不限 |
| `typeMin` / `typeMax` | `70` / `240` | 验证码逐字符键入间隔（ms） |
| `stuckReload` | `true` | 播放位置长期不动（卡死）时自动刷新 |

---

## 5. 面板

```
● 倍速                      ▾
第 5/40 节 · 4x · 03:21/12:18
━━━━━━━━━━━━━━──────────
[ 1x ][ 2x ][ 4x ][ 8x ]
───────────────
⬤ 启用脚本
⬤ 自动下一节
⬤ 自动识别验证码
```

- **状态点**：绿=播放中、黄=暂停、橙=验证码弹出、灰=未检测到播放器/已停用
- **进度条**：`currentTime / 总时长`
- **拖动 / 折叠**：按住标题栏拖动（位置会记住）；点 `▾` 收起
- **提示条**：平时隐藏，只在「播完切换 / 验证码 / 异常」时出现
- **手打行**：OCR 连不上或认不出时自动展开，带验证码缩略图（点图放大），回车提交

---

## 6. 验证码流程

1. 检测到**可见的**验证码弹窗（`#video-captcha` 有内容，或可见的 `.layui-layer` 内含 `/service/code` 图片）
2. 立即 `pause()`，状态显示「验证码出现，已暂停播放，识别后自动继续」
3. canvas 截取**屏幕上那张图**的像素（不重新请求 URL，避免平台换图）
4. ddddocr 识别 → 同时写入可见输入框与隐藏的 `#yzCode`
5. 依次尝试提交：`.layui-layer-btn0` → `cap.btn` → `findConfirm` → **回车** → 任意按钮 → `form.submit`，每步校验弹窗是否关闭
6. 弹窗消失 → 自动 `play()` 续播；未通过 → 换大小写 / 换图重试（3 轮）→ 仍失败展开手打行

已适配的平台弹窗结构：

```html
<div class="layui-layer">
  <input id="yzCode" style="display:none">              <!-- 隐藏取值容器，也写 -->
  <input placeholder="请输入验证码">                     <!-- 可见框，无 id/name/maxlength -->
  <img id="codeImg" style="opacity:0">                  <!-- 透明占位，跳过 -->
  <img src="/service/code/aa?r=...">                    <!-- 真图，canvas 截取 -->
  <a class="layui-layer-btn0">开始播放</a>               <!-- 提交按钮 -->
</div>
```

---

## 7. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `__DBG__ is not defined` | 脚本没注入当前页 | Tampermonkey 图标该页应为 1；版本必须 **6.1**；只留一份脚本；Console 上下文选 `top` |
| 面板出现但 `OCR 未连接` | 服务没起 / 端口不同 | 双击 `start-ocr.bat`；`__DBG__.pingOcr()`；`__DBG__.ocrTest()` 看原始返回 |
| 识别出字但平台不认 | 模型认错字符 | `__DBG__.capDebug()` 会打印要提交的那张图（放大 3 倍），据此调 `charset_range` |
| 填了码没提交 | 按钮没绑上 | 控制台有 `[赛博代刷] 提交策略 xxx 弹窗仍在/已关闭`；六条全「仍在」请查 `layer.open({...})` 配置 |
| 验证通过后仍暂停 | 残留隐藏弹窗被当成验证码 | 5.5 已修（只认可见弹窗 + 1.5s 防抖）；若仍出现看日志「暂停原因：页面上有可见的验证码弹窗」 |
| 倍速点了不变色 | 页面按钮样式覆盖 | 已用注入样式表 + `data-on`，不受页面 CSS 影响 |
| 后台学时不见涨 | 平台按服务端真实时长累加 | 倍速降到 2x/1x；或按抓到的上报接口补 `studyTime` |
| 跳节后脚本失效 | 用的是 Console 版 | Console 版整页跳转会丢，重新粘贴；要跨页请用油猴版 |

### 调试接口

> **v6.0 起默认不挂全局接口**（固定名字 `__DBG__` / `CYBER` 本身就是最容易被页面脚本探测的指纹）。
> 需要调试时：打开配置里的 `debug` 开关 → 刷新 → 控制台会打印本次的**随机接口名**（形如 `_k3f9a2`），
> 下文所有 `__DBG__` 都替换成那个名字即可。
>
> ```js
> const k = '__CDWL_CYBER_CFG__';
> localStorage.setItem(k, JSON.stringify(Object.assign(JSON.parse(localStorage.getItem(k) || '{}'), { debug: true })));
> location.reload();
> ```


```js
__DBG__.version                 // "5.0"
__DBG__.selfTest()              // 表格：版本/节点/进度/倍速/验证码/OCR
__DBG__.capDebug()              // 验证码诊断：容器结构 + 定位结果 + 要提交的图 + OCR 文本
__DBG__.pingOcr()               // 重新探测 OCR 端点
__DBG__.ocrTest()               // 打 /health 与 /ocr，打印状态码与返回体
__DBG__.findCaptcha()           // 当前定位到的验证码 {type,input,img,box,btn}
__DBG__.captchaHint()           // 页面上是否有可见验证码
__DBG__.solveCaptcha()          // 立刻跑一次识别
__DBG__.showManual(__DBG__.findCaptcha())  // 唤起手打面板
__DBG__.nextNode()              // 下一节 {id,href,title,exam?}
__DBG__.progress()              // {index,total}
__DBG__.goNext('手动')           // 立刻换节
__DBG__.setEnabled(false)       // 关总开关
__DBG__.setRate(8)              // 等价于点 8x
__DBG__.isBusy()                // 验证码流程是否在进行
__DBG__.status()                // 当前状态文案
```

---

## 8. 机制说明（便于二次修改）

- **倍速**：改写 `HTMLMediaElement.prototype.playbackRate` setter，低于 `CFG.rate` 的赋值一律抬回，`ratechange` 再兜一次；总开关关闭时原样透传。
- **自动下一节**：`ended` + `timeupdate` 尾段双触发 → 等 `delay` → `location.href = 下一节.href`。目录来自 `.detmain-navlist a[href*="/user/node"]`，`javascript:void(0)` 的分组标题自动排除。
- **验证码可见性**：`shown()` 连祖先一起判 `display/visibility`，并排除 `opacity:0`，避免把隐藏占位/已关闭弹窗当成验证码。
- **取图**：`data:` 直接切 base64；同源 `<img>` canvas 截屏；`<canvas>` 用 `toDataURL`；跨域污染才退回请求。
- **防挂机**：覆盖 `document.hidden` / `visibilityState`，每 30 秒伪造一次鼠标键盘活动。
- **命名规范**：全局接口 `__DBG__` / `CYBER`；DOM `#__cyber_panel__`、`#__cyber_style__`、`data-cyber-ver`；CSS 类前缀 `cy-`；日志前缀 `[赛博代刷]`。

---

## 8.4 类人化设计（社区经验 + 实测结论）

一封毕业学长的邮件 + `iFulling/cdcasSK` 源码对照后确认，平台的判定不是单一阈值，而是多重特征叠加。本脚本按"越像人越好"整改：

| 特征 | 平台怎么看 | 本脚本的做法 |
|---|---|---|
| 验证码填法 | 直接 `value = code` 一眼是机器；真人会先点输入框（触发 `mousedown`，平台据此打 `tw='_'`），再逐字符敲 | 鼠标事件序列 → `focus` → **逐字符键入**（70–240ms 随机）→ 补 `keypress(13)` |
| 播完立刻跳下一节 | 秒跳 + 连续几小时，是典型的脚本节奏 | 播完随机停留 **15–60 秒** 才跳 |
| 长时间不间断 | 人不会连学 3 小时不停 | 每 **4 节**休息 **5–15 分钟**；可设单日节数上限 |
| 倍速 | 学时来自平台每秒 +1 的计数器，倍速不增加学时，只额外暴露跳变 | 默认 **1x**；社区项目 `cdcasSK` 同样把 `playbackRate` 写死 1.0 |
| 固定 DOM / 全局变量 | 页面脚本一句 `if (window.__X__)` 就能判定外挂 | id / class 前缀每次加载随机；默认不挂任何全局变量 |
| 伪造可见性 / 假鼠标事件 | `isTrusted=false` 可被直接识别 | 已全部移除（不再覆盖 `document.hidden`、不 dispatch 假 mouse 事件） |

**能力边界**：浏览器里注入的任何事件 `isTrusted` 永远是 `false`，脚本无论如何都做不到"真事件"。要彻底可信只有两条路——真人在场点按，或用 Playwright / Puppeteer 通过 CDP 派发真实输入（`cdcasSK` 走的是"浏览器自动化"路线）。纯油猴脚本只能把时序、序列、节奏做到接近人类。

## 8.5 进度上报协议（已逆向，源码 `/static/user/js/video.js`）

> 结论先说：**请求没有隐藏**，就是一个明文表单 POST；而且**倍速对学时几乎无效**——学时来自平台自己的 1 秒计数器，与 `playbackRate` 无关。

### 接口

| 接口 | 时机 | 参数 | 返回 |
|---|---|---|---|
| `POST /user/node/study` | 播放中每 10s（支持 `sendBeacon` 时 30s）；play/pause/ended 时；`beforeunload` 时（`close=1`） | `nodeId`、`studyId`、`studyTime`、可选 `code`（验证码，取前 4 位 + `_`） | `{status, state, studyId, need_code}` |
| `POST /service/sign` | 页面加载时**一次** | header `Authorization: sign`；body `appId/nonce/timestamp/nodeId/userId/studyId/studyTime` | 仅日志，无界面作用 |

关键点：**进度接口本身不带签名**，签名只用于开头那次 `/service/sign`。

### 计时机制（为什么 4x 没用）

```js
window.setInterval(function () {
  if (playState == 'playing') { totalTime++; }   // 每 1 秒 +1，与播放倍速无关
}, 1000);

// 每 10/30 秒上报：studyTime = totalTime
```

- `totalTime` 是纯 JS 计数器，`playbackRate=4` 时**仍然每真实秒 +1**；
- 上报只在 `totalTime > 上次已报值` 时才发（`if (totalTime <= studyTime) return`）；
- 所以 4x 只是画面快进，学时按真实秒数累积 → 「倍速刷课学时不见涨」由此而来。

### 服务端约束（客户端可见部分）

| 字段 / 行为 | 含义 |
|---|---|
| `status: true` + `studyId` | 接受本次上报，并返回本次会话 `studyId`（下一条要带上） |
| `need_code: 1` | 要求**图片验证码**（`/service/code` + `/service/code/aa`，4 位），提交时放进 `code` |
| `need_code: 2` | 要求**点选验证码**（第三方 `captcha({clicks:3, ak:...})`，dunclick 接口） |
| `state: 1` | 判定异常，客户端暂停并提示「网络课程出现问题」 |
| 多窗口检测 | 每秒读 `localStorage['node_play_'+schoolId+userId]`，与本页 `nodeId` 不一致就弹窗并暂停 |
| 拖动限制 | `studyState < 2` 时 `timeScheduleAdjust: 5`（只允许 ±5 秒微调） |
| 鼠标轨迹 | 代码里有采集（`xlogs`），但上报语句被注释掉了 |

### 能不能不播直接提交？

能发，但**是否被接受取决于服务端对「节奏」的校验**，客户端代码看不到。验证方法（1 条请求即可判定）：

```js
// 抓包探针（_tools/study-probe.console.js）
__STUDY__.step(30)         // dry-run：只打印将要发送的内容
__STUDY__.step(30, true)   // 真发一条：把 studyTime 从当前值 +30
```

- 返回 `{"status":true,"studyId":...}` 且无 `need_code` → 服务端只按累计值记账，可以直接推进；
- 返回 `need_code` / `state:1` → 服务端在校验节奏（真实秒数、请求间隔、会话指纹），一次性大批量会被拦。

配套文件：`_tools/study-probe.console.js`（抓包 + 预演 + 连发，默认 dry-run）。

---

## 9. 版权、许可与免责声明

```
项目：成都文理 · 赛博代刷助手
作者：成都文理 · 赛博代刷
版权：Copyright (c) 2025 成都文理 · 赛博代刷
许可：PolyForm Noncommercial 1.0.0（禁止商用）
```

完整条款见 **[LICENSE](LICENSE)**。要点：

### 9.1 允许

- 个人学习、研究、自用；
- 阅读与修改源码以适配自己的场景（修改版须保留版权与许可声明）；
- 非商业性分享转载，须注明出处并保留本声明。

### 9.2 禁止（重点）

- **任何商业使用**：售卖脚本或修改版、打包进付费软件/服务、以「代刷 / 代学 / 包过」名义收费、集成进商业产品或 SaaS、用本脚本招揽客户或广告引流；
- 移除、篡改、隐藏脚本头部的版权、许可与免责声明；
- 用于违反目标网站条款、侵害他人权益或违反当地法律法规的用途；
- 以本项目名义作出任何承诺、担保或背书。

> 如需商用，须事先取得著作权人书面许可；未获许可的商业使用均属侵权。

### 9.3 免责声明

1. 本项目与目标网站及其运营方**无任何关联**，未获其授权、认可或背书。
2. 按**「现状（AS IS）」**提供，不附带任何明示或默示担保（含适销性、特定用途适用性、不侵权）。
3. 不承诺可用性、准确性、连续性；目标网站改版、接口变动、风控调整都可能导致失效。
4. 因使用或无法使用本项目造成的**任何直接、间接、附带、特殊或后果性损失**（学业成绩、账号状态、数据丢失、设备损坏、第三方索赔等），作者与贡献者**不承担任何责任**。
5. 使用本项目即视为已阅读并同意全部条款；**不同意请立即停止使用并删除全部文件**。
6. 是否符合所在学校/单位规定与当地法律法规，由使用者自行确认并承担后果。

### 9.4 落地位置

- 两个脚本的**文件头**均含完整版权块 + 免责声明（油猴版另在 `@author` / `@license` / `@namespace` / `@name` 标注）；
- 脚本注入时控制台打印一次：`[赛博代刷] 仅供个人学习研究使用，禁止商用。使用风险与后果由使用者自行承担。`
- 修改作者信息时同步改三处：文件头块、`// @author`、`// @namespace`（Console 版只有头块）；
- 分发时请一并保留 `LICENSE` 与 `ocr/` 下第三方组件的许可信息（ddddocr / onnxruntime / OpenCV / Pillow 各自遵循原始许可）。
