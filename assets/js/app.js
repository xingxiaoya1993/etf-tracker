/* ETF 份额追踪 · 手机版逻辑 */
(function () {
  'use strict';

  var CONFIG = {
    etfs: ['510300', '510310', '510330'],
    colors: {
      '510300': '#f4553d',
      '510310': '#2fbf6b',
      '510330': '#58a6ff',
      hs300: '#f0b72f',
      sse: '#b184ff'
    },
    names: {
      '510300': '300ETF 华泰柏瑞',
      '510310': '沪深300ETF 易方达',
      '510330': '华夏300ETF'
    }
  };

  var DEFAULT_DATA_URL = './data/etf-data.json';
  var KEY_PAYLOAD = 'etf.payload.v2';
  var KEY_META = 'etf.meta.v2';
  var KEY_URL = 'etf.dataUrl.v1';
  var KEY_INSTALL_HIDE = 'etf.installHidden.v1';

  var state = {
    payload: null,
    meta: null,
    range: '1Y',
    display: 'etf',
    chart: null,
    loading: false
  };

  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ---------------- 缓存 ---------------- */
  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  function getDataUrl() {
    try {
      var custom = localStorage.getItem(KEY_URL);
      if (custom && custom.trim()) return custom.trim();
    } catch (e) { /* ignore */ }
    return DEFAULT_DATA_URL;
  }

  /* ---------------- 工具 ---------------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function parseDate(value) {
    if (!value) return null;
    var d;
    if (value instanceof Date) {
      d = value;
    } else if (typeof value === 'string' && value.indexOf('T') < 0) {
      d = new Date(value.replace(/-/g, '/'));
    } else {
      d = new Date(value);
    }
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDateTime(value) {
    var d = parseDate(value);
    if (!d) return value ? String(value) : '';
    return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function relTime(value) {
    var d = parseDate(value);
    if (!d) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 0) diff = 0;
    var minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' 天前';
    return fmtDateTime(value);
  }

  function fmtDateShort(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    return parts.length === 3 ? parts[1] + '-' + parts[2] : dateStr;
  }

  function fmtNum(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '--';
    return Number(v).toFixed(digits === undefined ? 2 : digits);
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function toast(message) {
    var t = el.toast;
    if (!t) return;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ---------------- 数据校验 ---------------- */
  function isValidPayload(p) {
    return !!(p && p.etfs && typeof p.etfs === 'object' && Array.isArray(p.hs300) && p.hs300.length > 1);
  }

  /* ---------------- 渲染 ---------------- */
  function latestDateOf(payload) {
    var latest = payload && payload.latestDate ? payload.latestDate : '';
    if (latest) return latest;
    var d = '';
    (payload.hs300 || []).forEach(function (row) { if (row[0] > d) d = row[0]; });
    return d;
  }

  function renderStatus() {
    var p = state.payload;
    if (!p) return;
    var latest = latestDateOf(p);
    el.dataDate.textContent = '数据日期 ' + latest;

    var dataTime = p.builtAt || (state.meta && state.meta.fetchedAt) || '';
    if (dataTime) {
      el.fetchedAt.textContent = '更新于 ' + relTime(dataTime);
      el.fetchedAt.title = fmtDateTime(dataTime) + '（' + relTime(dataTime) + '）';
    } else {
      el.fetchedAt.textContent = '';
    }

    var latestDate = parseDate(latest);
    var staleDays = latestDate ? daysBetween(latestDate, new Date()) : 0;
    if (staleDays > 7) {
      el.staleTag.classList.remove('hidden');
      el.staleTag.textContent = '数据 ' + staleDays + ' 天前';
    } else {
      el.staleTag.classList.add('hidden');
    }

    if (el.sourceLine) {
      el.sourceLine.textContent = '数据源：' + (p.source || '本地数据') +
        ' · 生成时间：' + (p.builtAt || '—') +
        ' · 手机拉取：' + (state.meta && state.meta.fetchedAt ? fmtDateTime(state.meta.fetchedAt) : '—');
    }
  }

  function renderIndexes() {
    var p = state.payload;
    var host = el.indexGrid;
    if (!p || !p.hs300 || p.hs300.length < 2) {
      host.innerHTML = '';
      return;
    }

    var hs = p.hs300;
    var hsToday = hs[hs.length - 1];
    var hsPrev = hs[hs.length - 2];
    var hsDelta = hsToday[1] - hsPrev[1];
    var hsPct = hsPrev[1] ? (hsDelta / hsPrev[1]) * 100 : 0;

    var html = '<div class="index-card hs300">' +
      '<div class="index-name">沪深300</div>' +
      '<div class="index-value">' + fmtNum(hsToday[1], 2) + '</div>' +
      '<div class="index-meta">' +
      '<span class="delta ' + (hsDelta >= 0 ? 'up' : 'down') + '">' + (hsDelta >= 0 ? '+' : '') + fmtNum(hsDelta, 2) + '</span>' +
      '<span class="delta ' + (hsDelta >= 0 ? 'up' : 'down') + '">' + (hsPct >= 0 ? '+' : '') + fmtNum(hsPct, 2) + '%</span>' +
      '<span>' + fmtDateShort(hsToday[0]) + '</span>' +
      '</div></div>';

    if (p.sse && p.sse.length > 1) {
      var s = p.sse;
      var sToday = s[s.length - 1];
      var sPrev = s[s.length - 2];
      var sDelta = sToday[1] - sPrev[1];
      var sPct = sPrev[1] ? (sDelta / sPrev[1]) * 100 : 0;
      html += '<div class="index-card sse">' +
        '<div class="index-name">上证指数</div>' +
        '<div class="index-value">' + fmtNum(sToday[1], 2) + '</div>' +
        '<div class="index-meta">' +
        '<span class="delta ' + (sDelta >= 0 ? 'up' : 'down') + '">' + (sDelta >= 0 ? '+' : '') + fmtNum(sDelta, 2) + '</span>' +
        '<span class="delta ' + (sDelta >= 0 ? 'up' : 'down') + '">' + (sPct >= 0 ? '+' : '') + fmtNum(sPct, 2) + '%</span>' +
        '<span>' + fmtDateShort(sToday[0]) + '</span>' +
        '</div></div>';
    }

    host.innerHTML = html;
  }

  function changeChip(date, value) {
    var cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    var arrow = value > 0 ? '↑' : value < 0 ? '↓' : '·';
    return '<span class="change-chip"><span class="d">' + fmtDateShort(date) + '</span>' +
      '<b class="' + cls + '">' + arrow + ' ' + fmtNum(Math.abs(value), 2) + '</b></span>';
  }

  function renderEtfList() {
    var p = state.payload;
    var host = el.etfList;
    if (!p || !p.etfs) { host.innerHTML = ''; return; }

    var html = '';
    CONFIG.etfs.forEach(function (code) {
      var rows = p.etfs[code];
      if (!rows || rows.length < 3) {
        html += '<div class="etf-card" style="--c:' + (CONFIG.colors[code] || '#58a6ff') + '">' +
          '<div class="etf-top"><div class="etf-id"><div class="etf-code">' + code + '</div>' +
          '<div class="etf-name">' + (CONFIG.names[code] || '') + '</div></div>' +
          '<div class="etf-scale"><b>--</b><span>亿份</span></div></div></div>';
        return;
      }

      var today = rows[rows.length - 1];
      var prev = rows[rows.length - 2];
      var prev2 = rows[rows.length - 3];
      // shares 单位为万份，换算成亿份
      var scale = today[1] / 10000;
      var chg1 = (prev[1] - prev2[1]) / 10000;
      var chg2 = (today[1] - prev[1]) / 10000;

      html += '<div class="etf-card" style="--c:' + (CONFIG.colors[code] || '#58a6ff') + '">' +
        '<div class="etf-top">' +
        '<div class="etf-id"><div class="etf-code">' + code + '</div>' +
        '<div class="etf-name">' + (CONFIG.names[code] || '') + '</div></div>' +
        '<div class="etf-scale"><b>' + fmtNum(scale, 2) + '</b><span>亿份</span></div>' +
        '</div>' +
        '<div class="etf-changes">' + changeChip(prev[0], chg1) + changeChip(today[0], chg2) + '</div>' +
        '</div>';
    });

    host.innerHTML = html;
  }

  /* ---------------- 图表 ---------------- */
  function ensureChart() {
    if (state.chart || typeof echarts === 'undefined') return state.chart;
    state.chart = echarts.init(el.chart, null, { renderer: 'canvas' });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { state.chart && state.chart.resize(); });
      ro.observe(el.chart);
    } else {
      window.addEventListener('resize', function () { state.chart && state.chart.resize(); });
    }
    return state.chart;
  }

  function toMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) { map[row[0]] = row[1]; });
    return map;
  }

  function subtractMonths(dateStr, months) {
    var d = new Date(dateStr + 'T00:00:00');
    var day = d.getDate();
    d.setMonth(d.getMonth() - months);
    if (d.getDate() < day) d.setDate(0);
    return d;
  }

  function rangeStart(latest, range) {
    if (range === 'ALL') return null;
    var months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 }[range] || 12;
    return subtractMonths(latest, months);
  }

  function buildDates(payload) {
    var set = {};
    var dates = [];
    var push = function (d) { if (!set[d]) { set[d] = 1; dates.push(d); } };
    (payload.hs300 || []).forEach(function (r) { push(r[0]); });
    (payload.sse || []).forEach(function (r) { push(r[0]); });
    CONFIG.etfs.forEach(function (code) {
      (payload.etfs[code] || []).forEach(function (r) { push(r[0]); });
    });
    dates.sort();
    return dates;
  }

  function renderChart() {
    var p = state.payload;
    if (!p) return;
    if (!ensureChart()) return;

    var allDates = buildDates(p);
    if (!allDates.length) return;

    var latest = latestDateOf(p) || allDates[allDates.length - 1];
    var start = rangeStart(latest, state.range);
    var startStr = start ? (start.getFullYear() + '-' + pad2(start.getMonth() + 1) + '-' + pad2(start.getDate())) : null;
    var dates = startStr ? allDates.filter(function (d) { return d >= startStr; }) : allDates;

    var hsMap = toMap(p.hs300);
    var sseMap = toMap(p.sse);
    var etfMaps = {};
    CONFIG.etfs.forEach(function (code) { etfMaps[code] = toMap(p.etfs[code]); });

    var showEtf = state.display === 'etf' || state.display === 'all';
    var showIndex = state.display === 'index' || state.display === 'all';

    var yAxis = [];
    var series = [];
    var legend = [];

    if (showEtf) {
      yAxis.push({
        type: 'value',
        position: 'left',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#7d8a9a', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(125,138,154,0.14)' } }
      });

      CONFIG.etfs.forEach(function (code) {
        legend.push(code);
        series.push({
          name: code,
          type: 'line',
          smooth: true,
          symbol: 'none',
          sampling: 'lttb',
          yAxisIndex: 0,
          lineStyle: { width: 1.8, color: CONFIG.colors[code] },
          itemStyle: { color: CONFIG.colors[code] },
          emphasis: { focus: 'series' },
          data: dates.map(function (d) {
            var v = etfMaps[code][d];
            return v === undefined ? null : +(v / 10000).toFixed(2);
          })
        });
      });
    }

    if (showIndex) {
      yAxis.push({
        type: 'value',
        position: 'right',
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#7d8a9a', fontSize: 10 },
        splitLine: { show: false }
      });
      var idxAxis = yAxis.length - 1;

      legend.push('沪深300');
      series.push({
        name: '沪深300',
        type: 'line',
        smooth: true,
        symbol: 'none',
        sampling: 'lttb',
        yAxisIndex: idxAxis,
        lineStyle: { width: 1.6, color: CONFIG.colors.hs300, type: 'solid' },
        itemStyle: { color: CONFIG.colors.hs300 },
        data: dates.map(function (d) { var v = hsMap[d]; return v === undefined ? null : v; })
      });

      if (p.sse && p.sse.length) {
        legend.push('上证指数');
        series.push({
          name: '上证指数',
          type: 'line',
          smooth: true,
          symbol: 'none',
          sampling: 'lttb',
          yAxisIndex: idxAxis,
          lineStyle: { width: 1.4, color: CONFIG.colors.sse, type: 'dashed' },
          itemStyle: { color: CONFIG.colors.sse },
          data: dates.map(function (d) { var v = sseMap[d]; return v === undefined ? null : v; })
        });
      }
    }

    var longRange = dates.length > 120;

    var option = {
      animation: false,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' },
      legend: {
        type: 'scroll',
        top: 0,
        left: 0,
        right: 0,
        itemWidth: 12,
        itemHeight: 3,
        itemGap: 10,
        textStyle: { color: '#a9b4c2', fontSize: 10 },
        pageIconSize: 9,
        data: legend
      },
      grid: { left: 4, right: 4, top: 40, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(22,29,39,0.96)',
        borderColor: '#2a3341',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: '#e6edf3', fontSize: 11 },
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(88,166,255,0.5)', width: 1 } },
        formatter: function (params) {
          if (!params || !params.length) return '';
          var lines = ['<div style="color:#7d8a9a;font-size:10px;margin-bottom:4px">' + params[0].axisValue + '</div>'];
          params.forEach(function (item) {
            if (item.value === null || item.value === undefined || item.value === '-') return;
            var unit = item.seriesName.indexOf('指数') >= 0 || item.seriesName === '沪深300' ? '' : ' 亿份';
            var value = typeof item.value === 'number' ? item.value.toFixed(2) : item.value;
            lines.push('<div style="display:flex;gap:6px;align-items:center;line-height:1.7">' +
              '<span style="width:7px;height:7px;border-radius:2px;background:' + item.color + '"></span>' +
              '<span style="flex:1;color:#a9b4c2">' + item.seriesName + '</span>' +
              '<b style="font-variant-numeric:tabular-nums">' + value + unit + '</b></div>');
          });
          return lines.join('');
        }
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: '#2a3341' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#7d8a9a',
          fontSize: 9,
          hideOverlap: true,
          formatter: function (value) {
            if (!value) return '';
            return longRange ? value.slice(2, 7) : value.slice(5);
          }
        }
      },
      yAxis: yAxis,
      dataZoom: [
        { type: 'inside', start: 0, end: 100, minValueSpan: 10 }
      ],
      series: series
    };

    state.chart.setOption(option, true);
    state.chart.resize();

    el.chartHint.textContent = showEtf && showIndex ? '左轴：份额（亿份） · 右轴：指数'
      : showEtf ? '左轴：份额（亿份）' : '右轴：指数（点）';
  }

  function renderAll() {
    renderStatus();
    renderIndexes();
    renderEtfList();
    renderChart();
  }

  /* ---------------- 数据加载 ---------------- */
  function applyPayload(payload, meta) {
    state.payload = payload;
    state.meta = meta || state.meta || {};
    writeJSON(KEY_PAYLOAD, payload);
    writeJSON(KEY_META, state.meta);
  }

  function fetchData(options) {
    options = options || {};
    var silent = !!options.silent;
    var url = getDataUrl();
    var bust = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    var previousLatest = state.payload ? latestDateOf(state.payload) : '';

    if (state.loading) return;
    state.loading = true;
    if (!silent) el.refreshBtn.classList.add('spinning');

    fetch(bust, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!isValidPayload(payload)) throw new Error('数据格式不正确');
        var meta = { fetchedAt: new Date().toISOString(), url: url };
        applyPayload(payload, meta);
        renderAll();
        var latest = latestDateOf(payload);
        if (silent) {
          if (previousLatest && latest !== previousLatest) toast('数据已自动更新至 ' + latest);
          return;
        }
        if (previousLatest && latest === previousLatest) {
          toast('已是最新数据（' + latest + '）');
        } else if (previousLatest) {
          toast('数据已更新至 ' + latest);
        } else {
          toast('数据加载完成 · ' + latest);
        }
      })
      .catch(function (err) {
        if (!state.payload) {
          el.fetchedAt.textContent = '数据加载失败';
          toast('加载失败：' + err.message);
        } else if (!silent) {
          toast('刷新失败，继续显示缓存数据');
        }
      })
      .then(function () {
        state.loading = false;
        el.refreshBtn.classList.remove('spinning');
        updateOfflineBar();
      });
  }

  /* ---------------- 交互 ---------------- */
  function setActive(node, value) {
    Array.prototype.forEach.call(node.querySelectorAll('button[data-value]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-value') === value);
    });
  }

  function bindSegmented(node, onPick) {
    node.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-value]');
      if (!btn) return;
      setActive(node, btn.getAttribute('data-value'));
      onPick(btn.getAttribute('data-value'));
    });
  }

  function openSheet() {
    el.dataUrlInput.value = localStorage.getItem(KEY_URL) || '';
    el.dataUrlInput.placeholder = DEFAULT_DATA_URL;
    var meta = state.meta || {};
    var lines = [];
    if (meta.fetchedAt) lines.push('上次拉取：' + fmtDateTime(meta.fetchedAt));
    if (meta.url) lines.push('来源：' + meta.url);
    if (state.payload) lines.push('数据日期：' + latestDateOf(state.payload) + ' · 记录数：' + (state.payload.etfs && state.payload.etfs['510300'] ? state.payload.etfs['510300'].length : '—'));
    el.cacheMeta.textContent = lines.join('\n');
    el.sheetMask.classList.remove('hidden');
  }

  function closeSheet() {
    el.sheetMask.classList.add('hidden');
  }

  function updateOfflineBar() {
    if (!el.offlineBar) return;
    el.offlineBar.classList.toggle('hidden', navigator.onLine !== false);
  }

  function setupInstall() {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    var hidden = false;
    try { hidden = localStorage.getItem(KEY_INSTALL_HIDE) === '1'; } catch (e) { /* ignore */ }
    if (isStandalone || hidden) return;

    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferred = event;
      el.installText.textContent = '安装到桌面，全屏使用';
      el.installBar.classList.remove('hidden');
    });

    var ua = navigator.userAgent;
    var isIOS = /iPhone|iPad|iPod/.test(ua);
    if (isIOS) {
      el.installText.textContent = '在 Safari 中点「分享 → 添加到主屏幕」即可安装';
      el.installBtn.classList.add('hidden');
      el.installBar.classList.remove('hidden');
    }

    el.installBtn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; el.installBar.classList.add('hidden'); });
    });

    el.installClose.addEventListener('click', function () {
      el.installBar.classList.add('hidden');
      try { localStorage.setItem(KEY_INSTALL_HIDE, '1'); } catch (e) { /* ignore */ }
    });
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;

    // 新版本接管后自动刷新一次，App 代码即自动升级，无需重装
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        function activate(worker) {
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }

        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.addEventListener('updatefound', function () { activate(reg.installing); });

        // 每小时检查一次是否有新版本
        setInterval(function () { reg.update(); }, 60 * 60 * 1000);
      }).catch(function () { /* ignore */ });
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    el.refreshBtn = $('refreshBtn');
    el.settingsBtn = $('settingsBtn');
    el.dataDate = $('dataDate');
    el.fetchedAt = $('fetchedAt');
    el.staleTag = $('staleTag');
    el.indexGrid = $('indexGrid');
    el.etfList = $('etfList');
    el.chart = $('chart');
    el.chartHint = $('chartHint');
    el.offlineBar = $('offlineBar');
    el.installBar = $('installBar');
    el.installText = $('installText');
    el.installBtn = $('installBtn');
    el.installClose = $('installClose');
    el.sheetMask = $('sheetMask');
    el.dataUrlInput = $('dataUrlInput');
    el.cacheMeta = $('cacheMeta');
    el.toast = $('toast');
    el.rangeSeg = $('rangeSeg');
    el.displaySeg = $('displaySeg');
    el.sourceLine = $('sourceLine');

    var cached = readJSON(KEY_PAYLOAD);
    var meta = readJSON(KEY_META) || {};
    if (isValidPayload(cached)) {
      state.payload = cached;
      state.meta = meta;
      renderAll();
    }

    // 支持通过链接参数直接打开指定视图，例如 ?range=3Y&display=all
    try {
      var params = new URLSearchParams(location.search);
      var qRange = params.get('range');
      var qDisplay = params.get('display');
      if (['1M', '3M', '6M', '1Y', '3Y', 'ALL'].indexOf(qRange) >= 0) {
        state.range = qRange;
        setActive(el.rangeSeg, qRange);
      }
      if (['etf', 'index', 'all'].indexOf(qDisplay) >= 0) {
        state.display = qDisplay;
        setActive(el.displaySeg, qDisplay);
      }
      if (params.get('settings') === '1') {
        setTimeout(openSheet, 300);
      }
    } catch (e) { /* ignore */ }

    bindSegmented(el.rangeSeg, function (value) {
      state.range = value;
      renderChart();
    });

    bindSegmented(el.displaySeg, function (value) {
      state.display = value;
      renderChart();
    });

    el.refreshBtn.addEventListener('click', function () { fetchData(); });
    el.settingsBtn.addEventListener('click', openSheet);
    el.sheetMask.addEventListener('click', function (event) {
      if (event.target === el.sheetMask) closeSheet();
    });

    $('saveUrlBtn').addEventListener('click', function () {
      var value = el.dataUrlInput.value.trim();
      try {
        if (value) localStorage.setItem(KEY_URL, value);
        else localStorage.removeItem(KEY_URL);
      } catch (e) { /* ignore */ }
      closeSheet();
      fetchData();
    });

    $('resetUrlBtn').addEventListener('click', function () {
      try { localStorage.removeItem(KEY_URL); } catch (e) { /* ignore */ }
      el.dataUrlInput.value = '';
      toast('已恢复默认数据地址');
    });

    $('clearCacheBtn').addEventListener('click', function () {
      try {
        localStorage.removeItem(KEY_PAYLOAD);
        localStorage.removeItem(KEY_META);
      } catch (e) { /* ignore */ }
      closeSheet();
      toast('缓存已清除，正在重新加载');
      setTimeout(function () { location.reload(); }, 600);
    });

    window.addEventListener('online', function () { updateOfflineBar(); fetchData(); });
    window.addEventListener('offline', updateOfflineBar);
    updateOfflineBar();

    if (location.protocol === 'file:') {
      el.offlineBar.classList.remove('hidden');
      el.offlineBar.textContent = '当前是本地文件方式，数据无法加载。请用「启动手机版.cmd」或部署后的网址打开。';
    }

    setupInstall();
    setupServiceWorker();

    fetchData();

    // ---- 自动更新：切回前台、联网、定时，都会静默拉取最新数据 ----
    var AUTO_REFRESH_MS = 30 * 60 * 1000;     // 前台每 30 分钟
    var RESUME_REFRESH_MS = 10 * 60 * 1000;   // 切回前台超过 10 分钟

    function lastFetchAt() {
      var d = state.meta && state.meta.fetchedAt ? parseDate(state.meta.fetchedAt) : null;
      return d ? d.getTime() : 0;
    }

    function autoRefresh() {
      if (state.loading || navigator.onLine === false) return;
      if (Date.now() - lastFetchAt() < RESUME_REFRESH_MS) return;
      fetchData({ silent: true });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') autoRefresh();
    });

    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchAt() < AUTO_REFRESH_MS) return;
      autoRefresh();
    }, 60 * 1000);

    // 相对时间（“3 分钟前”）每分钟刷新一次
    setInterval(function () {
      if (state.payload) renderStatus();
    }, 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
