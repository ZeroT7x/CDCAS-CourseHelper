#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证码 OCR 服务（ddddocr）· 零 Web 框架依赖版
只用 Python 标准库 + ddddocr，不需要 flask / flask-cors。

安装（只需一条）：
    python -m pip install ddddocr

运行：
    python ddddocr_server.py            # 默认 127.0.0.1:8899
    python ddddocr_server.py 8900       # 换端口

接口：
    GET  /health   -> {"ok": true, "engine": "ddddocr", "port": 8899}
    POST /ocr      -> body {"image": "<纯 base64，不要 data: 前缀>"}
                     返回 {"code": "8f3k"}
    GET  /         -> 说明页（浏览器打开可确认服务活着）

自测：
    浏览器打开 http://127.0.0.1:8899/health 看到 {"ok": true ...} 即成功。

颜色：
    - 终端是 TTY 且支持 ANSI 时自动上色；
    - 输出被重定向到文件/管道时自动关闭颜色；
    - 设置环境变量 NO_COLOR=1 强制关闭；
    - 设置环境变量 FORCE_COLOR=1 强制开启（如某些 IDE 终端）。
"""

import base64
import json
import os
import socket
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 尽量用 UTF-8 输出，避免 Windows GBK 控制台打印中文/框线字符报错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "127.0.0.1"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

_ocr = None
_lock = threading.Lock()


# ── 终端着色（TTY 自动检测；支持 NO_COLOR / FORCE_COLOR）─────────
def _enable_windows_ansi() -> bool:
    """在 Windows 10+ 启用 ANSI VT 序列；其他平台直接返回 True。"""
    if os.name != "nt":
        return True
    try:
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetStdHandle.restype = wintypes.HANDLE
        kernel32.GetStdHandle.argtypes = [wintypes.DWORD]
        kernel32.GetConsoleMode.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel32.GetConsoleMode.restype = wintypes.BOOL
        kernel32.SetConsoleMode.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel32.SetConsoleMode.restype = wintypes.BOOL

        ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
        for std_id in (-11, -12):  # STDOUT, STDERR
            h = kernel32.GetStdHandle(std_id)
            if not h:
                return False
            mode = wintypes.DWORD()
            if not kernel32.GetConsoleMode(h, ctypes.byref(mode)):
                return False
            if not kernel32.SetConsoleMode(h, mode.value | ENABLE_VIRTUAL_TERMINAL_PROCESSING):
                return False
        return True
    except Exception:
        return False


def _supports_color() -> bool:
    # https://no-color.org/
    if os.environ.get("NO_COLOR") is not None:
        return False
    if os.environ.get("FORCE_COLOR"):
        _enable_windows_ansi()
        return True
    try:
        if not sys.stdout.isatty():
            return False
    except Exception:
        return False
    return _enable_windows_ansi()


_COLOR = _supports_color()


def _c(code: str) -> str:
    return f"\033[{code}m" if _COLOR else ""


class C:
    """ANSI 颜色常量；不支持颜色时全部为空串，拼接零副作用。"""
    RESET = _c("0")
    BOLD = _c("1")
    DIM = _c("2")
    BLACK = _c("30")
    RED = _c("31")
    GREEN = _c("32")
    YELLOW = _c("33")
    BLUE = _c("34")
    MAGENTA = _c("35")
    CYAN = _c("36")
    WHITE = _c("37")
    BRIGHT_RED = _c("91")
    BRIGHT_GREEN = _c("92")
    BRIGHT_YELLOW = _c("93")
    BRIGHT_CYAN = _c("96")
    BG_RED = _c("41")
    BG_YELLOW = _c("43")


def cprint(msg: str, color: str = "", bold: bool = False) -> None:
    """带颜色的 print；无颜色能力时退化为普通 print。"""
    if not _COLOR:
        print(msg)
        return
    prefix = (C.BOLD if bold else "") + color
    print(f"{prefix}{msg}{C.RESET}")


# ── OCR 核心 ────────────────────────────────────────────────────
def get_ocr():
    global _ocr
    with _lock:
        if _ocr is None:
            import ddddocr
            # beta=True 对带干扰线/粘连的验证码更稳
            _ocr = ddddocr.DdddOcr(show_ad=False, beta=True)
        return _ocr


def clean_b64(s: str) -> str:
    if not s:
        return ""
    s = s.strip()
    if "," in s and s.lower().startswith("data:"):
        s = s.split(",", 1)[1]
    s = s.replace("\n", "").replace("\r", "").replace(" ", "")
    # 兼容 URL-safe base64，并补齐 padding
    s = s.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return s


class Handler(BaseHTTPRequestHandler):
    server_version = "CXOCR/2.0"
    protocol_version = "HTTP/1.1"

    # ── 工具 ──────────────────────────────────────────────
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _send(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_html(self, html, code=200):
        body = html.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):
        # 访问日志：灰色 [ocr] 前缀，正文默认色，避免喧宾夺主
        print(f"{C.DIM}[ocr]{C.RESET} {fmt % args}")

    # ── 路由 ──────────────────────────────────────────────
    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self._cors()
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/health", "/ping"):
            return self._send({"ok": True, "engine": "ddddocr", "port": PORT})
        if path == "/":
            html = (
                "<html><meta charset='utf-8'>"
                "<body style='font:14px system-ui;padding:24px'>"
                "<h3>验证码 OCR 服务运行中</h3>"
                "<p>健康检查：<a href='/health'>/health</a></p>"
                "<p>识别接口：POST /ocr　body: {\"image\": \"&lt;纯base64&gt;\"}</p>"
                "</body></html>"
            )
            return self._send_html(html)
        return self._send({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/ocr", "/predict", "/"):
            return self._send({"ok": False, "error": "not found"}, 404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n) if n else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8", "ignore") or "{}")
            except Exception:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}

            b64 = clean_b64(
                payload.get("image") or payload.get("img") or payload.get("b64") or ""
            )
            if not b64:
                return self._send({"code": "", "error": "empty image"}, 400)
            try:
                data = base64.b64decode(b64, validate=False)
            except Exception as e:
                return self._send({"code": "", "error": "bad base64: %s" % e}, 400)
            if len(data) < 60:
                return self._send(
                    {"code": "", "error": "image too small (%d bytes)" % len(data)}, 400
                )

            text = get_ocr().classification(data)
            text = "".join(ch for ch in str(text) if ch.isalnum()).strip()

            # 识别成功：绿色高亮结果
            print(
                f"{C.DIM}[ocr]{C.RESET} {len(data)} bytes -> "
                f"{C.BRIGHT_GREEN}{text!r}{C.RESET}"
            )
            return self._send({"code": text})
        except ImportError:
            return self._send(
                {"code": "", "error": "ddddocr 未安装：python -m pip install ddddocr"}, 500
            )
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            traceback.print_exc()
            return self._send({"code": "", "error": str(e)}, 500)


LINE = "=" * 70


def main():
    # Windows：直接把标题栏改成醒目提示，最小化时也能看到
    if os.name == "nt":
        os.system("title CXOCR %d - DO NOT CLOSE THIS WINDOW（请勿关闭）" % PORT)

    try:
        import ddddocr  # noqa: F401
    except ImportError:
        cprint(LINE, C.RED, bold=True)
        cprint(" 缺少 ddddocr，先执行：", C.RED, bold=True)
        cprint("     python -m pip install ddddocr", C.YELLOW)
        cprint(" （首次会下载 onnxruntime，约 100MB，耐心等）", C.YELLOW)
        cprint(LINE, C.RED, bold=True)
        sys.exit(1)

    # 端口占用检查
    try:
        s = socket.socket()
        s.settimeout(0.3)
        busy = s.connect_ex((HOST, PORT)) == 0
        s.close()
        if busy:
            cprint(f" [!] 端口 {PORT} 已被别的程序占用，换一个：", C.RED, bold=True)
            cprint(f"     python ddddocr_server.py 8900", C.YELLOW)
            sys.exit(2)
    except Exception:
        pass

    # ── 启动横幅（青色） ───────────────────────────────────
    cprint(LINE, C.CYAN, bold=True)
    cprint(f" 验证码 OCR 服务已启动  ·  端口 {PORT}", C.BRIGHT_CYAN, bold=True)
    cprint(f"   健康检查 : {C.BRIGHT_CYAN}http://{HOST}:{PORT}/health{C.RESET}", C.CYAN)
    cprint(f"   识别接口 : {C.BRIGHT_CYAN}http://{HOST}:{PORT}/ocr{C.RESET}", C.CYAN)
    cprint(
        f'   浏览器打开 health 看到 {C.GREEN}{{"ok": true}}{C.RESET}{C.CYAN} 即正常。',
        C.CYAN,
    )
    cprint(LINE, C.CYAN, bold=True)

    # ── ★ 本窗口不要关：红底白字 + 黄底黑字，最醒目 ────────
    print()
    cprint("*" * 70, C.BRIGHT_RED, bold=True)
    cprint(
        "  ！！本窗口不要关！！  关掉窗口 = OCR 服务立即停止  ",
        C.BG_RED + C.WHITE, bold=True,
    )
    cprint(
        "  ！！要停止服务请按 Ctrl + C，不要直接点右上角 X    ",
        C.BG_YELLOW + C.BLACK, bold=True,
    )
    cprint("*" * 70, C.BRIGHT_RED, bold=True)
    print()

    # 预热模型，避免第一次识别等 3 秒
    try:
        get_ocr()
        cprint(" 模型已加载，可以开始识别了", C.BRIGHT_GREEN, bold=True)
    except Exception as e:
        cprint(f" 模型预热失败：{e}", C.RED, bold=True)

    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        cprint("\n 已停止（收到 Ctrl + C）", C.YELLOW)


if __name__ == "__main__":
    main()