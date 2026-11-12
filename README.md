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
| 版本 | 油猴版 `5.0` / Console 版 `5.0c` |
| 全局接口 | `__CYBER__`（别名 `CYBER`） |
| 配置键 | `localStorage['__CDWL_CYBER_CFG__']` |

---

## 1. 文件清单

```
course-helper/
├─ cdwl-cyber-helper.user.js      油猴脚本（v5.0，跨页存活，日常使用）
├─ cdwl-cyber-helper.console.js   同功能 Console 版（v5.0c，不装油猴时用）
├─ README.md                      本文档
├─ LICENSE                        非商业许可 + 免责声明（全文）
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
[赛博代刷] 注入 v5.0 | __CYBER__ 可用
[赛博代刷] 仅供个人学习研究使用，禁止商用。使用风险与后果由使用者自行承担。
[赛博代刷] 已启动 v5.0 | 节点 1765885 | 2/40 | 倍速 1x | 验证码 自动
[赛博代刷] OCR 服务已连接： http://127.0.0.1:8899/ocr
```

一键自检：`__CYBER__.selfTest()`。

---

## 3. OCR 服务

### 启动

```bat
:: 方式一：双击
ocr\start-ocr.bat
```

```powershell
# 方式二：PowerShell
cd D:\deepseek-harness\default-workspace\course-helper\ocr
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
cd D:\deepseek-harness\default-workspace\course-helper\ocr
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
__CYBER__.cfg.rate = 8;
__CYBER__.cfg.muted = false;
localStorage.setItem('__CDWL_CYBER_CFG__', JSON.stringify(__CYBER__.cfg));

// 重置全部
localStorage.removeItem('__CDWL_CYBER_CFG__');
```

### 4.3 全部字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关，对应面板「启用脚本」 |
| `rate` | `1` | 目标倍速，**默认 1x（不加速）**；`playbackRate` setter 会把低于它的值抬回。要加速请在面板点 2x/4x/8x，或 `__CYBER__.setRate(4)` |
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
| `__CYBER__ is not defined` | 脚本没注入当前页 | Tampermonkey 图标该页应为 1；版本必须 **5.0**；只留一份脚本；Console 上下文选 `top` |
| 面板出现但 `OCR 未连接` | 服务没起 / 端口不同 | 双击 `start-ocr.bat`；`__CYBER__.pingOcr()`；`__CYBER__.ocrTest()` 看原始返回 |
| 识别出字但平台不认 | 模型认错字符 | `__CYBER__.capDebug()` 会打印要提交的那张图（放大 3 倍），据此调 `charset_range` |
| 填了码没提交 | 按钮没绑上 | 控制台有 `[赛博代刷] 提交策略 xxx 弹窗仍在/已关闭`；六条全「仍在」请查 `layer.open({...})` 配置 |
| 验证通过后仍暂停 | 残留隐藏弹窗被当成验证码 | 5.5 已修（只认可见弹窗 + 1.5s 防抖）；若仍出现看日志「暂停原因：页面上有可见的验证码弹窗」 |
| 倍速点了不变色 | 页面按钮样式覆盖 | 已用注入样式表 + `data-on`，不受页面 CSS 影响 |
| 后台学时不见涨 | 平台按服务端真实时长累加 | 倍速降到 2x/1x；或按抓到的上报接口补 `studyTime` |
| 跳节后脚本失效 | 用的是 Console 版 | Console 版整页跳转会丢，重新粘贴；要跨页请用油猴版 |

### 调试接口

```js
__CYBER__.version                 // "5.0"
__CYBER__.selfTest()              // 表格：版本/节点/进度/倍速/验证码/OCR
__CYBER__.capDebug()              // 验证码诊断：容器结构 + 定位结果 + 要提交的图 + OCR 文本
__CYBER__.pingOcr()               // 重新探测 OCR 端点
__CYBER__.ocrTest()               // 打 /health 与 /ocr，打印状态码与返回体
__CYBER__.findCaptcha()           // 当前定位到的验证码 {type,input,img,box,btn}
__CYBER__.captchaHint()           // 页面上是否有可见验证码
__CYBER__.solveCaptcha()          // 立刻跑一次识别
__CYBER__.showManual(__CYBER__.findCaptcha())  // 唤起手打面板
__CYBER__.nextNode()              // 下一节 {id,href,title,exam?}
__CYBER__.progress()              // {index,total}
__CYBER__.goNext('手动')           // 立刻换节
__CYBER__.setEnabled(false)       // 关总开关
__CYBER__.setRate(8)              // 等价于点 8x
__CYBER__.isBusy()                // 验证码流程是否在进行
__CYBER__.status()                // 当前状态文案
```

---

## 8. 机制说明（便于二次修改）

- **倍速**：改写 `HTMLMediaElement.prototype.playbackRate` setter，低于 `CFG.rate` 的赋值一律抬回，`ratechange` 再兜一次；总开关关闭时原样透传。
- **自动下一节**：`ended` + `timeupdate` 尾段双触发 → 等 `delay` → `location.href = 下一节.href`。目录来自 `.detmain-navlist a[href*="/user/node"]`，`javascript:void(0)` 的分组标题自动排除。
- **验证码可见性**：`shown()` 连祖先一起判 `display/visibility`，并排除 `opacity:0`，避免把隐藏占位/已关闭弹窗当成验证码。
- **取图**：`data:` 直接切 base64；同源 `<img>` canvas 截屏；`<canvas>` 用 `toDataURL`；跨域污染才退回请求。
- **防挂机**：覆盖 `document.hidden` / `visibilityState`，每 30 秒伪造一次鼠标键盘活动。
- **命名规范**：全局接口 `__CYBER__` / `CYBER`；DOM `#__cyber_panel__`、`#__cyber_style__`、`data-cyber-ver`；CSS 类前缀 `cy-`；日志前缀 `[赛博代刷]`。

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
