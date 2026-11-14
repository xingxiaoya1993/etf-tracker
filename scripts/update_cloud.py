#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
云端数据更新（GitHub Actions 用，仅依赖标准库）

流程：
  1. 读 data/etf-data.json
  2. 从上交所接口补齐缺失交易日的 ETF 份额（510300 / 510310 / 510330）
  3. 从新浪接口补齐沪深300、上证指数的收盘价
  4. 重新排序、写回 data/etf-data.json

任何一步失败都不会破坏原文件：抓不到就保留旧数据，退出码仍为 0，
避免 GitHub Actions 天天报红；具体原因打印在日志里。
"""

import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "data", "etf-data.json")

ETFS = ["510300", "510310", "510330"]
TZ = datetime.timezone(datetime.timedelta(hours=8))
MAX_BACKFILL_DAYS = 20          # 每次最多补 20 个工作日，避免一次跑太久
INDEX_DAYS = 30                 # 新浪接口一次取最近 30 个交易日

SSE_URL = "https://query.sse.com.cn/commonQuery.do"
SSE_PARAMS = {
    "jsonCallBack": "jsonpCallback",
    "isPagination": "true",
    "pageHelp.pageSize": "10000",
    "pageHelp.pageNo": "1",
    "sqlId": "COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L",
    "STAT_DATE": "",
    "_": "",
}
HEADERS_SSE = {
    "Accept": "*/*",
    "Referer": "https://www.sse.com.cn/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
HEADERS_SINA = {
    "Referer": "https://finance.sina.com.cn/",
    "User-Agent": "Mozilla/5.0",
}


def log(msg):
    print(msg, flush=True)


def http_get(url, headers, timeout=25):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_jsonp(text):
    start = text.find("(")
    end = text.rfind(")")
    if start < 0 or end <= start:
        raise ValueError("不是合法的 JSONP 响应")
    return json.loads(text[start + 1:end])


def fetch_etf_shares(date_str):
    """返回 {code: shares_万份} 或 None"""
    params = dict(SSE_PARAMS)
    params["STAT_DATE"] = date_str
    params["_"] = str(int(time.time() * 1000))
    url = SSE_URL + "?" + urllib.parse.urlencode(params)
    text = http_get(url, HEADERS_SSE)
    data = parse_jsonp(text)
    rows = (data.get("pageHelp") or {}).get("data") or []
    found = {}
    for row in rows:
        code = str(row.get("SEC_CODE", "")).strip()
        if code not in ETFS:
            continue
        if str(row.get("STAT_DATE", "")).strip() != date_str:
            continue
        try:
            shares = float(str(row.get("TOT_VOL", "")).replace(",", ""))
        except (TypeError, ValueError):
            continue
        found[code] = round(shares, 2)
    return found or None


def fetch_kline(symbol, datalen=INDEX_DAYS):
    """返回 [(date, close), ...] 或 None"""
    url = ("https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
           "CN_MarketData.getKLineData?symbol=%s&scale=240&ma=no&datalen=%d" % (symbol, datalen))
    text = http_get(url, HEADERS_SINA)
    rows = json.loads(text)
    out = []
    for row in rows:
        day = str(row.get("day", ""))[:10]
        try:
            close = float(row.get("close"))
        except (TypeError, ValueError):
            continue
        if len(day) == 10:
            out.append((day, round(close, 3)))
    return out or None


def weekdays_between(start, end):
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur.strftime("%Y-%m-%d"))
        cur += datetime.timedelta(days=1)
    return days


def to_date(value, default=None):
    try:
        return datetime.datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return default


def merge_series(rows, additions):
    """rows: [[date, value], ...]；additions: {date: value}"""
    table = {r[0]: r[1] for r in rows if isinstance(r, list) and len(r) >= 2}
    changed = 0
    for date, value in additions.items():
        if table.get(date) != value:
            table[date] = value
            changed += 1
    merged = [[d, table[d]] for d in sorted(table)]
    return merged, changed


def main():
    log("=" * 60)
    log(" ETF 数据云端更新")
    log(" 时间: %s" % datetime.datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S"))
    log("=" * 60)

    if not os.path.isfile(DATA_FILE):
        log("[ERROR] 找不到 %s，请确认仓库里有 data/etf-data.json" % DATA_FILE)
        return 1

    with open(DATA_FILE, "r", encoding="utf-8") as fh:
        payload = json.load(fh)

    etfs = payload.get("etfs") or {}
    hs300 = payload.get("hs300") or []
    sse = payload.get("sse") or []

    today = datetime.datetime.now(TZ).date()
    total_changed = 0

    # ---------- 1. ETF 份额 ----------
    known = []
    for code in ETFS:
        for row in etfs.get(code) or []:
            if isinstance(row, list) and row:
                known.append(str(row[0])[:10])
    last_date = max(known) if known else None
    log("\n[1/3] ETF 份额：现有最新 %s" % (last_date or "无"))

    if last_date:
        start = to_date(last_date) + datetime.timedelta(days=1)
        targets = weekdays_between(start, today)[-MAX_BACKFILL_DAYS:]
        log("      待检查交易日: %d 个%s" % (len(targets), ("（" + targets[0] + " ~ " + targets[-1] + "）") if targets else ""))
        for date_str in targets:
            try:
                found = fetch_etf_shares(date_str)
            except Exception as exc:  # noqa: BLE001
                log("      [跳过] %s 抓取失败: %s" % (date_str, exc))
                continue
            if not found:
                log("      [--] %s 无数据（非交易日或尚未发布）" % date_str)
                continue
            for code, shares in found.items():
                rows, changed = merge_series(etfs.get(code) or [], {date_str: shares})
                etfs[code] = rows
                total_changed += changed
            log("      [OK] %s 新增/更新 %d 只" % (date_str, len(found)))
    else:
        log("      [WARN] 本地没有 ETF 数据，跳过（无法自动重建全部历史）")

    # ---------- 2. 指数 ----------
    log("\n[2/3] 指数收盘价")
    for symbol, key, name in (("sh000300", "hs300", "沪深300"), ("sh000001", "sse", "上证指数")):
        try:
            rows = fetch_kline(symbol)
        except Exception as exc:  # noqa: BLE001
            log("      [跳过] %s 抓取失败: %s" % (name, exc))
            continue
        if not rows:
            log("      [跳过] %s 无数据" % name)
            continue
        source = hs300 if key == "hs300" else sse
        merged, changed = merge_series(source, dict(rows))
        if key == "hs300":
            hs300 = merged
        else:
            sse = merged
        total_changed += changed
        log("      [OK] %s：最新 %s（变更 %d 条）" % (name, rows[-1][0], changed))

    # ---------- 3. 写回 ----------
    log("\n[3/3] 写回数据文件")
    if not total_changed:
        log("      数据没有变化，不写入文件")
        payload["builtAt"] = payload.get("builtAt")
        return 0

    all_dates = [r[0] for code in ETFS for r in (etfs.get(code) or [])]
    payload["schema"] = payload.get("schema", 1)
    payload["etfs"] = {code: etfs.get(code, []) for code in sorted(etfs)}
    payload["hs300"] = hs300
    payload["sse"] = sse
    payload["latestDate"] = max(all_dates) if all_dates else (payload.get("latestDate") or "")
    payload["builtAt"] = datetime.datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
    payload["updatedAt"] = payload["builtAt"]
    payload["source"] = "上交所 + 新浪财经（云端自动更新）"

    with open(DATA_FILE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    log("      完成：变更 %d 条，最新数据日期 %s" % (total_changed, payload["latestDate"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
