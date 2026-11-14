# -*- coding: utf-8 -*-
r"""
把 ETF 份额追踪系统的数据打包成 App 用的 data/etf-data.json。

数据来源（自动按顺序尝试）：
  1. 原项目 HTML 里内嵌的 ETF_DATA / HS300_DATA / SSE_INDEX_DATA
     （即 桌面\ETF份额追踪系统\ETF份额追踪.html，每次更新后都是最新）
  2. 原项目 data/etf_data.json

用法：
    python tools\build_data.py
    python tools\build_data.py --src "C:\\path\\to\\ETF份额追踪.html"
"""
import argparse
import datetime
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(HERE)
DEFAULT_PROJECT = os.path.join(os.path.expanduser("~"), "Desktop", "ETF份额追踪系统")


def _decode_js_var(text, name):
    """从 HTML 文本中取出 `var NAME = <json>;` 的 JSON 值。"""
    marker = "var %s" % name
    idx = text.find(marker)
    if idx < 0:
        raise ValueError("找不到变量 %s" % name)
    eq = text.find("=", idx)
    start = eq + 1
    while start < len(text) and text[start] in " \t\r\n":
        start += 1
    value, _end = json.JSONDecoder().raw_decode(text, start)
    return value


def load_from_html(path):
    text = io.open(path, encoding="utf-8").read()
    etfs = _decode_js_var(text, "ETF_DATA")
    hs300 = _decode_js_var(text, "HS300_DATA")
    sse = _decode_js_var(text, "SSE_INDEX_DATA")
    updated = ""
    # 页面头部的更新时间，例如 <span id="updateTime">2026-11-14 12:46</span>
    key = 'id="updateTime"'
    if key in text:
        seg = text[text.find(key): text.find(key) + 200]
        if ">" in seg and "<" in seg:
            updated = seg.split(">", 1)[1].split("<", 1)[0].strip()
    return {
        "etfs": etfs,
        "hs300": hs300,
        "sse": sse,
        "updatedAt": updated,
        "source": os.path.basename(path),
    }


def load_from_json(path):
    data = json.load(io.open(path, encoding="utf-8"))
    etfs = data.get("etfs") or {}
    # 兼容 {"510300": {"data": [...]}} 的写法
    clean = {}
    for code, series in etfs.items():
        if isinstance(series, dict):
            series = series.get("data") or series.get("shares") or []
        clean[code] = series
    return {
        "etfs": clean,
        "hs300": data.get("hs300") or [],
        "sse": data.get("sse_index") or data.get("sse") or [],
        "updatedAt": data.get("last_update") or "",
        "source": os.path.basename(path),
    }


def normalize(raw):
    etfs = {}
    for code, series in raw["etfs"].items():
        rows = []
        for item in series:
            if not isinstance(item, dict):
                continue
            date = str(item.get("date", ""))[:10]
            shares = item.get("shares")
            if len(date) == 10 and isinstance(shares, (int, float)):
                rows.append([date, round(float(shares), 2)])
        rows.sort(key=lambda r: r[0])
        etfs[str(code)] = rows

    def clean_index(series):
        rows = []
        for item in series:
            if not isinstance(item, dict):
                continue
            date = str(item.get("date", ""))[:10]
            close = item.get("close")
            if len(date) == 10 and isinstance(close, (int, float)):
                rows.append([date, round(float(close), 3)])
        rows.sort(key=lambda r: r[0])
        return rows

    hs300 = clean_index(raw["hs300"])
    sse = clean_index(raw["sse"])

    if not etfs or not any(etfs.values()):
        raise SystemExit("错误：没有解析到任何 ETF 份额数据")
    if not hs300:
        raise SystemExit("错误：没有解析到沪深300数据")

    latest = max([r[0] for rows in etfs.values() for r in rows] or ["?"])
    return {
        "schema": 1,
        "updatedAt": raw.get("updatedAt") or "",
        "builtAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": raw.get("source", ""),
        "latestDate": latest,
        "etfs": etfs,
        "hs300": hs300,
        "sse": sse,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="ETF份额追踪.html 或 etf_data.json 的路径")
    ap.add_argument("--out", default=os.path.join(APP_ROOT, "data", "etf-data.json"))
    args = ap.parse_args()

    candidates = []
    if args.src:
        candidates.append(args.src)
    else:
        candidates += [
            os.path.join(DEFAULT_PROJECT, "ETF份额追踪.html"),
            os.path.join(DEFAULT_PROJECT, "data", "etf_data.json"),
        ]

    src = next((p for p in candidates if os.path.isfile(p)), None)
    if not src:
        raise SystemExit("找不到数据源，请用 --src 指定文件路径。已尝试：\n  " + "\n  ".join(candidates))

    raw = load_from_json(src) if src.lower().endswith(".json") else load_from_html(src)
    payload = normalize(raw)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with io.open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out) / 1024.0
    print("数据源 : %s" % src)
    print("输出   : %s (%.1f KB)" % (args.out, size))
    print("最新日期: %s   页面更新时间: %s" % (payload["latestDate"], payload["updatedAt"]))
    for code, rows in sorted(payload["etfs"].items()):
        print("  %s: %d 条, 最后 %s / %.2f 万份" % (code, len(rows), rows[-1][0], rows[-1][1]))


if __name__ == "__main__":
    main()
