# -*- coding: utf-8 -*-
r"""
本地服务器：给手机访问 / 调试用。

    python tools\serve.py            # 默认 0.0.0.0:8080
    python tools\serve.py --port 9000

启动后会打印本机在局域网里的地址，手机连同一个 WiFi 打开即可。
"""
import argparse
import http.server
import os
import socket
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        ".webmanifest": "application/manifest+json",
        ".json": "application/json; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    })

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        path = self.path.split("?")[0]
        if path.endswith(".json") or path.endswith("sw.js"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s - %s\n" % (self.address_string(), fmt % args))


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()

    socketserver.TCPServer.allow_reuse_address = True

    httpd = None
    port = args.port
    for candidate in range(args.port, args.port + 10):
        try:
            httpd = socketserver.ThreadingTCPServer((args.host, candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if httpd is None:
        raise SystemExit("端口 %d~%d 都被占用，请用 --port 换一个。" % (args.port, args.port + 9))

    with httpd:
        print("=" * 56)
        print(" ETF 份额追踪 · 本地服务器已启动")
        print(" 目录: %s" % ROOT)
        print(" 本机: http://localhost:%d/" % port)
        for ip in lan_ips():
            print(" 手机: http://%s:%d/   （需同一 WiFi）" % (ip, port))
        if port != args.port:
            print(" 注意: %d 端口被占用，已自动改用 %d" % (args.port, port))
        print(" 按 Ctrl+C 停止")
        print("=" * 56)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")


if __name__ == "__main__":
    main()
