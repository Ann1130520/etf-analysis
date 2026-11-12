/**
 * 台股 ETF 四強情報戰情室 (Taiwan ETF Big 4 Intelligence App)
 * Focus: 元大台灣50 (0050), 元大高股息 (0056), 主動統一台股增長 (00981A), 元大臺灣價值高息 (00940)
 * With Benchmarks: 台積電 (2330), 台股加權 (^TWII), 美國 S&P 500 (^GSPC), 費半 (^SOX), 日經225 (^N225)
 */

const ETF_CODES = ['0050', '0056', '00981A', '00940'];

const ETF_META = {
  '0050': {
    name: '元大台灣50 (0050)',
    shortName: '0050 台灣50',
    color: '#10b981',
    textColor: 'text-emerald-400',
    ter: 0.00355,
    annualDiv: 1.60,
    freqLabel: '半年配',
    freqCount: 2,
    buyMax: 99.5,
    nearBuy: 103.5,
    sellMin: 120.0
  },
  '0056': {
    name: '元大高股息 (0056)',
    shortName: '0056 高股息',
    color: '#3b82f6',
    textColor: 'text-blue-400',
    ter: 0.00335,
    annualDiv: 4.936,
    freqLabel: '季配息',
    freqCount: 4,
    buyMax: 52.5,
    nearBuy: 54.5,
    sellMin: 62.0
  },
  '00981A': {
    name: '主動統一台股增長 (00981A)',
    shortName: '00981A 主動統一',
    color: '#a855f7',
    textColor: 'text-purple-400',
    ter: 0.0110,
    annualDiv: 1.67,
    freqLabel: '季配息',
    freqCount: 4,
    buyMax: 24.5,
    nearBuy: 26.0,
    sellMin: 31.5
  },
  '00940': {
    name: '元大臺灣價值高息 (00940)',
    shortName: '00940 價值高息',
    color: '#f59e0b',
    textColor: 'text-amber-400',
    ter: 0.00335,
    annualDiv: 0.58,
    freqLabel: '月配息',
    freqCount: 12,
    buyMax: 12.2,
    nearBuy: 12.7,
    sellMin: 14.2
  }
};

let liveMarketData = {
  price0050: 99.7,
  price0056: 52.3,
  price00981A: 24.27,
  price00940: 12.13,
  div0050: 1.60,
  div0056: 4.936,
  div00981A: 1.67,
  div00940: 0.58,
  usdTwd: 32.15,
  lastUpdated: '2026-11-10 22:56:33'
};

let currentChartTimeframe = '1Y';
let currentChartMode = 'PCT'; // 'PCT' or 'RAW'
let datasetVisibilityState = [true, true, true, true, true, true, true, true, false];
let basePayloadCache = null;
let latestRealtimeState = { isPaused: false, inFlight: false };

document.addEventListener('DOMContentLoaded', () => {
  const safeRun = (fn) => { try { fn(); } catch (e) { console.error('Init error:', e); } };
  safeRun(initTabs);
  safeRun(initHoldingsInspector);
  safeRun(initGeopoliticsWarRoom);
  safeRun(initCharts);
  safeRun(initNewsCenter);
  safeRun(initSensitivityCalculator);
  safeRun(initTickerUpdater);
  safeRun(initMobileBenchmarkToggle);
  safeRun(initPortfolioTracker);
  safeRun(initLiteratureSystem);
  safeRun(initDividendCalculator);
  safeRun(initMacroFeeSimulator);
  safeRun(initChecklistAndNotes);
  safeRun(initEtfCursor);
  loadLiveExternalData();
});

/* ========================================================
   0. LIVE EXTERNAL DATA & 15s REAL-TIME CNYES SYNC
   ======================================================== */
const CNYES_REALTIME_SYMBOLS = [
  'TWS:0050:STOCK',
  'TWS:0056:STOCK',
  'TWS:00981A:STOCK',
  'TWS:00940:STOCK',
  'TWS:2330:STOCK',
  'TWS:TSE01:INDEX',
  'GI:INX:INDEX',
  'GI:SOX:INDEX',
  'GI:NKY:INDEX',
  'FX:USDTWD:FOREX'
].join(',');

function formatLocalTimestamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function setUpdateTimestamp(text, highlight = false) {
  liveMarketData.lastUpdated = text;
  const timeElem = document.getElementById('last-update-time');
  if (!timeElem) return;
  timeElem.textContent = text;
  timeElem.classList.remove('text-sky-600', 'font-semibold');
  if (highlight) {
    timeElem.classList.add('text-sky-600', 'font-semibold');
  }
}

function setSyncBadgeState(mode) {
  const dot = document.getElementById('live-sync-dot');
  const label = document.getElementById('live-sync-label');
  const toggle = document.getElementById('live-sync-toggle');
  if (!dot || !label) return;

  if (mode === 'live') {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    label.textContent = '即時連線 15s';
    if (toggle) toggle.title = '點擊暫停 15 秒即時報價同步';
  } else if (mode === 'paused') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    label.textContent = '即時已暫停';
    if (toggle) toggle.title = '點擊恢復 15 秒即時報價同步';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-sky-500';
    label.textContent = '基準快取模式';
    if (toggle) toggle.title = '目前顯示基準資料，點擊可重試即時報價';
  }
}

function flashElementUpdate(el) {
  if (!el) return;
  el.classList.remove('ring-2', 'ring-sky-400/70', 'bg-sky-100/50');
  void el.offsetWidth;
  el.classList.add('ring-2', 'ring-sky-400/70', 'bg-sky-100/50', 'rounded');
  setTimeout(() => {
    el.classList.remove('ring-2', 'ring-sky-400/70', 'bg-sky-100/50', 'rounded');
  }, 900);
}

async function fetchCnyesRealtimeQuotes() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://ws.api.cnyes.com/ws/api/v1/quote/quotes/${CNYES_REALTIME_SYMBOLS}?t=${Date.now()}`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const map = {};
    rows.forEach(item => {
      const sym = item['0'];
      const price = Number(item['6']);
      if (!sym || !Number.isFinite(price) || price <= 0) return;
      map[sym] = {
        price,
        change: Number.isFinite(Number(item['11'])) ? Number(item['11']) : 0,
        change_percent: Number.isFinite(Number(item['56'])) ? Number(item['56']) : 0,
        high: Number.isFinite(Number(item['12'])) ? Number(item['12']) : null,
        low: Number.isFinite(Number(item['13'])) ? Number(item['13']) : null,
        volume: Number.isFinite(Number(item['800001'])) ? Number(item['800001']) : null
      };
    });
    return map;
  } finally {
    clearTimeout(timer);
  }
}

function buildMergedPayload(basePayload, realtimeMap) {
  if (!basePayload) return { payload: null, updatedCount: 0 };
  const payload = JSON.parse(JSON.stringify(basePayload));
  let updatedCount = 0;

  const applyQuote = (targetObj, q, roundDigits = 2) => {
    if (!targetObj || !q) return;
    targetObj.price = Number(q.price.toFixed(roundDigits));
    targetObj.change = Number(q.change.toFixed(roundDigits));
    targetObj.change_percent = Number(q.change_percent.toFixed(2));
    if (q.high) targetObj.high = Number(q.high.toFixed(roundDigits));
    if (q.low) targetObj.low = Number(q.low.toFixed(roundDigits));
    if (q.volume !== null) targetObj.volume = q.volume;
    targetObj.status = 'success';
    updatedCount += 1;
  };

  ETF_CODES.forEach(code => {
    const q = realtimeMap[`TWS:${code}:STOCK`];
    const s = payload.etfs && payload.etfs[code];
    if (q && s) {
      applyQuote(s, q, 2);
      const divAmt = s.dividend_1y?.total_amount || ETF_META[code].annualDiv;
      if (!s.dividend_1y) s.dividend_1y = {};
      s.dividend_1y.total_amount = divAmt;
      s.dividend_1y.trailing_yield_pct = Number(((divAmt / s.price) * 100).toFixed(2));
      if (s.technicals) {
        const ma20 = Number(s.technicals.ma20);
        const ma60 = Number(s.technicals.ma60);
        if (Number.isFinite(ma20) && ma20 > 0) {
          s.technicals.bias_20 = Number((((s.price - ma20) / ma20) * 100).toFixed(2));
        }
        if (Number.isFinite(ma60) && ma60 > 0) {
          s.technicals.bias_60 = Number((((s.price - ma60) / ma60) * 100).toFixed(2));
        }
        if (Number.isFinite(ma20) && Number.isFinite(ma60)) {
          if (s.price >= ma20 && ma20 >= ma60) s.technicals.trend = '多頭排列 (站穩月季線)';
          else if (s.price >= ma20) s.technicals.trend = '短線轉強 (站上20MA月線)';
          else if (s.price >= ma60) s.technicals.trend = '月線下震盪 (季線有撐)';
          else s.technicals.trend = '回測整理 (跌破月季線)';
        }
      }
    }
  });

  if (realtimeMap['TWS:2330:STOCK'] && payload.tw_benchmarks?.['2330']) {
    applyQuote(payload.tw_benchmarks['2330'], realtimeMap['TWS:2330:STOCK'], 2);
  }
  const idxMap = {
    tw: 'TWS:TSE01:INDEX',
    us: 'GI:INX:INDEX',
    sox: 'GI:SOX:INDEX',
    jp: 'GI:NKY:INDEX'
  };
  Object.entries(idxMap).forEach(([key, sym]) => {
    if (realtimeMap[sym] && payload.global_indices?.[key]) {
      applyQuote(payload.global_indices[key], realtimeMap[sym], 2);
    }
  });
  if (realtimeMap['FX:USDTWD:FOREX'] && payload.macro?.usd_twd) {
    applyQuote(payload.macro.usd_twd, realtimeMap['FX:USDTWD:FOREX'], 3);
  }

  return { payload, updatedCount };
}

function readPortfolioHoldings() {
  try {
    return JSON.parse(localStorage.getItem('etf_big4_portfolio_v1') || '{}');
  } catch (e) {
    return {};
  }
}

function getEtfActionDecision(code, s, inst, holding, macro) {
  const meta = ETF_META[code];
  const price = Number(s.price) || liveMarketData[`price${code}`];
  const ma20 = Number(s.technicals?.ma20) || price;
  const rsi14 = Number(s.technicals?.rsi14) || 50;
  const bias20 = Number.isFinite(Number(s.technicals?.bias_20))
    ? Number(s.technicals.bias_20)
    : Number((((price - ma20) / ma20) * 100).toFixed(2));
  const instLots = inst ? Math.round(Number(inst.total_lots) || 0) : 0;
  const divAmt = s.dividend_1y?.total_amount || meta.annualDiv;
  const divYield = s.dividend_1y?.trailing_yield_pct ?? Number(((divAmt / price) * 100).toFixed(2));

  const cost = holding && parseFloat(holding.cost) > 0 ? parseFloat(holding.cost) : null;
  const lots = holding && parseFloat(holding.lots) > 0 ? parseFloat(holding.lots) : null;
  const roi = cost ? ((price - cost) / cost) * 100 : null;

  let score = 50;
  if (price <= meta.buyMax) score += 26;
  else if (price <= meta.nearBuy) score += 14;
  else if (price >= meta.sellMin) score -= 28;

  if (rsi14 <= 38) score += 14;
  else if (rsi14 >= 72) score -= 18;
  else if (rsi14 >= 65) score -= 8;

  if (bias20 <= -2.5) score += 10;
  else if (bias20 >= 6) score -= 10;

  if (instLots >= 3000) score += 8;
  else if (instLots <= -3000) score -= 8;

  if (roi !== null && roi >= 20 && price >= meta.nearBuy) score -= 10;
  if (roi !== null && roi <= -8 && price <= meta.nearBuy) score += 8;

  score = Math.max(5, Math.min(98, Math.round(score)));

  let action = '定期定額續抱';
  let badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
  let cardTone = 'border-sky-200/80 bg-white/75';
  if (price >= meta.sellMin || score <= 30) {
    action = '高檔再平衡 / 逢高減碼';
    badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    cardTone = 'border-rose-200/90 bg-white/80';
  } else if (price <= meta.buyMax || score >= 74) {
    action = '強力買進 / 分批加碼';
    badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    cardTone = 'border-emerald-200/90 bg-white/80';
  } else if (price <= meta.nearBuy || score >= 60) {
    action = '緊鄰買區 / 逢低承接';
    badgeClass = 'bg-teal-50 text-teal-800 border-teal-200';
    cardTone = 'border-teal-200/80 bg-white/75';
  } else if (score <= 42) {
    action = '觀望少追價 / 等回測月線';
    badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    cardTone = 'border-amber-200/80 bg-white/75';
  }

  const usdTwd = macro?.usd_twd?.price;
  const reasons = [];
  if (price <= meta.buyMax) reasons.push(`現價 ${price} 元落在低估強力加碼區（<= ${meta.buyMax}）`);
  else if (price <= meta.nearBuy) reasons.push(`貼近價值承接區（<= ${meta.nearBuy}），殖利率約 ${Number(divYield).toFixed(2)}%`);
  else if (price >= meta.sellMin) reasons.push(`現價高於警戒上緣 ${meta.sellMin} 元，宜適度鎖定資本利得`);
  else reasons.push(`月線乖離 ${bias20 >= 0 ? '+' : ''}${bias20}%、RSI(14) ${rsi14}，估值處合理帶`);

  if (instLots !== 0) {
    reasons.push(`三大法人近期${instLots > 0 ? '買超' : '賣超'} ${Math.abs(instLots).toLocaleString()} 張`);
  }
  if (usdTwd && code === '0050' && usdTwd >= 32.3) {
    reasons.push(`匯率 ${usdTwd.toFixed(2)} 留意權值外資調節`);
  }

  let portfolioNote = '尚未輸入個人庫存，可在「個人損益試算」填入均價連動判斷';
  if (roi !== null) {
    const sign = roi >= 0 ? '+' : '';
    portfolioNote = roi >= 18
      ? `你的持倉 ${lots} 張目前 ${sign}${roi.toFixed(1)}%，可部分停利再平衡轉入高息防守`
      : (roi <= -5
        ? `你的持倉 ${lots} 張目前 ${sign}${roi.toFixed(1)}%，逢回可分批攤平降低成本`
        : `你的持倉 ${lots} 張（均價 ${cost}）損益 ${sign}${roi.toFixed(1)}%，按紀律續抱領息`);
  }

  return {
    code,
    meta,
    price,
    score,
    action,
    badgeClass,
    cardTone,
    divYield: Number(divYield).toFixed(2),
    bias20,
    rsi14,
    instLots,
    roi,
    reasonText: reasons.join('；'),
    portfolioNote
  };
}

function renderOverviewActionAdvisor(data) {
  const grid = document.getElementById('action-advice-grid');
  const overallBadge = document.getElementById('action-overall-badge');
  const overallSummary = document.getElementById('action-overall-summary');
  if (!grid || !data?.etfs) return;

  const holdings = readPortfolioHoldings();
  const decisions = ETF_CODES
    .filter(code => data.etfs[code]?.status === 'success')
    .map(code => getEtfActionDecision(code, data.etfs[code], data.institutional?.[code], holdings[code], data.macro));

  if (decisions.length === 0) return;

  const avgScore = Math.round(decisions.reduce((acc, d) => acc + d.score, 0) / decisions.length);
  const topPick = [...decisions].sort((a, b) => b.score - a.score)[0];

  if (overallBadge) {
    overallBadge.textContent = `綜合操作評分 ${avgScore} / 100 · 首選關注 ${topPick.code}`;
    overallBadge.className = avgScore >= 65
      ? 'text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold'
      : (avgScore <= 42
        ? 'text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold'
        : 'text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold');
  }

  if (overallSummary) {
    overallSummary.innerHTML = `依「位階區間、20MA乖離、RSI(14)、法人籌碼與個人庫存報酬」動態運算：<strong class="text-slate-900">${topPick.meta.shortName}</strong>（建議：<strong class="text-emerald-700">${topPick.action}</strong>，目標承接參考 ≤ ${topPick.meta.nearBuy} 元）。`;
  }

  grid.innerHTML = decisions.map(d => `
    <div class="rounded-xl p-3 border ${d.cardTone} shadow-sm flex flex-col justify-between gap-2">
      <div>
        <div class="flex items-center justify-between gap-1 mb-1">
          <span class="text-xs font-bold text-slate-900">${d.meta.shortName}</span>
          <span class="text-[10px] font-mono text-slate-600">評分 ${d.score}</span>
        </div>
        <div class="flex items-baseline justify-between mb-1.5">
          <span class="text-base font-bold font-mono text-slate-900">NT$ ${d.price}</span>
          <span class="text-[10px] font-mono text-slate-600">殖利率 ${d.divYield}%</span>
        </div>
        <div class="mb-2">
          <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${d.badgeClass}">${d.action}</span>
        </div>
        <p class="text-[11px] text-slate-700 leading-relaxed">${d.reasonText}。</p>
      </div>
      <div class="pt-2 border-t border-sky-900/10 text-[10px] text-slate-600 leading-snug">
        <i class="fa-solid fa-wallet text-sky-700 mr-1"></i>${d.portfolioNote}
      </div>
    </div>
  `).join('');
}

function renderOverviewMomentumReason(data) {
  if (!data?.etfs) return;
  const titleEl = document.getElementById('momentum-reason-title');
  const verdictEl = document.getElementById('momentum-verdict-badge');
  const pillsEl = document.getElementById('momentum-etf-pills');
  const summaryEl = document.getElementById('momentum-summary-line');
  const marketBox = document.getElementById('reason-market-box');
  const chipBox = document.getElementById('reason-chip-tech-box');
  const macroBox = document.getElementById('reason-macro-box');
  const newsBox = document.getElementById('reason-news-box');

  const valid = ETF_CODES.map(code => ({ code, s: data.etfs[code] })).filter(x => x.s?.status === 'success');
  if (valid.length === 0) return;

  const avgPct = valid.reduce((sum, x) => sum + (Number(x.s.change_percent) || 0), 0) / valid.length;
  const upCount = valid.filter(x => (Number(x.s.change_percent) || 0) >= 0).length;
  const twPct = Number(data.global_indices?.tw?.change_percent) || 0;
  const soxPct = Number(data.global_indices?.sox?.change_percent) || 0;
  const tsmcPct = Number(data.tw_benchmarks?.['2330']?.change_percent) || 0;

  if (titleEl) {
    titleEl.textContent = avgPct >= 0.35
      ? 'ETF 四強走強歸因分析（同步連線解讀）'
      : (avgPct <= -0.35 ? 'ETF 四強回檔歸因分析（同步連線解讀）' : 'ETF 四強震盪整理歸因（即時盤中歸因）');
  }
  if (verdictEl) {
    const sign = avgPct >= 0 ? '+' : '';
    verdictEl.textContent = `四強均幅 ${sign}${avgPct.toFixed(2)}% · ${upCount}/${valid.length} 檔紅盤`;
    verdictEl.className = avgPct >= 0.3
      ? 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200'
      : (avgPct <= -0.3
        ? 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200'
        : 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200');
  }

  if (pillsEl) {
    pillsEl.innerHTML = valid.map(({ code, s }) => {
      const pct = Number(s.change_percent) || 0;
      const isUp = pct >= 0;
      const cls = isUp
        ? 'bg-rose-50 text-rose-800 border-rose-200'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200';
      return `<span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${cls}">${code} ${s.price} (${isUp ? '+' : ''}${pct.toFixed(2)}%)</span>`;
    }).join('');
  }

  if (summaryEl) {
    const leader = [...valid].sort((a, b) => Math.abs(b.s.change_percent || 0) - Math.abs(a.s.change_percent || 0))[0];
    const leadPct = Number(leader.s.change_percent) || 0;
    const fxPrice = data.macro?.usd_twd?.price ? Number(data.macro.usd_twd.price).toFixed(2) : '-';
    summaryEl.textContent = `盤中焦點由 ${leader.code}（${leadPct >= 0 ? '+' : ''}${leadPct.toFixed(2)}%）領動；台股大盤 ${twPct >= 0 ? '+' : ''}${twPct.toFixed(2)}%、台積電 ${tsmcPct >= 0 ? '+' : ''}${tsmcPct.toFixed(2)}%、費半 ${soxPct >= 0 ? '+' : ''}${soxPct.toFixed(2)}%，匯率 USD/TWD ${fxPrice}。`;
  }

  if (marketBox) {
    marketBox.textContent = `台積電 (2330) ${tsmcPct >= 0 ? '+' : ''}${tsmcPct.toFixed(2)}% 直接牽動 0050（權重近六成）與主動成長型 00981A 淨值波動；費半 ${soxPct >= 0 ? '+' : ''}${soxPct.toFixed(2)}% 引導 AI 供應鏈強弱。`;
  }

  if (chipBox && data.institutional) {
    const totalLots = ETF_CODES.reduce((acc, code) => acc + Math.round(data.institutional[code]?.total_lots || 0), 0);
    const ma20List = valid.filter(x => x.s.technicals?.ma20).map(x => `${x.code}:${x.s.price >= x.s.technicals.ma20 ? '上' : '下'}月線`);
    chipBox.textContent = `四強近一交易日三大法人合計${totalLots >= 0 ? '買超' : '賣超'} ${Math.abs(totalLots).toLocaleString()} 張；均線站位 ${ma20List.join(' / ') || '計算中'}。`;
  }

  if (macroBox && data.macro) {
    const fx = data.macro.usd_twd;
    const y10 = data.macro.us_10y;
    macroBox.textContent = `USD/TWD 報 ${fx?.price ? Number(fx.price).toFixed(2) : '-'}（外資匯出入風向），美債10Y殖利率 ${y10?.price ? Number(y10.price).toFixed(2) + '%' : '-'}（高股息折現比較基準）。`;
  }

  if (newsBox) {
    const topNews = Array.isArray(data.live_news) && data.live_news.length > 0
      ? data.live_news[0].title
      : '高股息換股季節與主動式 ETF 動能輪動為近期主要關注焦點';
    newsBox.textContent = topNews;
  }

  renderOverviewActionAdvisor(data);
}

function applyMarketDataToUI(data, flash = false) {
  if (!data) return;

  function setChangePill(elemId, pct) {
    const el = document.getElementById(elemId);
    if (!el || pct === undefined || pct === null) return;
    const isUp = pct >= 0;
    const sign = isUp ? '+' : '';
    el.textContent = `${sign}${pct}%`;
    el.className = isUp
      ? 'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200'
      : 'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  ETF_CODES.forEach(code => {
    const s = data.etfs && data.etfs[code];
    const inst = data.institutional && data.institutional[code];
    const meta = ETF_META[code];
    if (!s || s.status !== 'success') return;

    const prevPrice = liveMarketData[`price${code}`];
    liveMarketData[`price${code}`] = s.price;
    const divAmt = s.dividend_1y?.total_amount || meta.annualDiv;
    const divYield = s.dividend_1y?.trailing_yield_pct ?? Number(((divAmt / s.price) * 100).toFixed(2));
    liveMarketData[`div${code}`] = divAmt;

    const tickPrice = document.getElementById(`ticker-${code}-price`);
    const tickChg = document.getElementById(`ticker-${code}-change`);
    if (tickPrice) {
      tickPrice.textContent = s.price;
      if (flash && prevPrice !== s.price) flashElementUpdate(tickPrice);
    }
    if (tickChg) {
      const isUp = s.change >= 0;
      const colorClass = isUp ? 'text-rose-600' : 'text-emerald-600';
      const icon = isUp ? 'fa-caret-up' : 'fa-caret-down';
      const sign = isUp ? '+' : '';
      tickChg.className = `${colorClass} font-mono text-[10px] flex items-center font-semibold`;
      tickChg.innerHTML = `<i class="fa-solid ${icon} mr-0.5"></i>${sign}${s.change_percent}%`;
    }

    const ovPrice = document.getElementById(`overview-${code}-price`);
    if (ovPrice) {
      ovPrice.textContent = s.price;
      if (flash && prevPrice !== s.price) flashElementUpdate(ovPrice);
    }
    setChangePill(`overview-${code}-change`, s.change_percent);

    if (s.technicals) {
      const ovTech = document.getElementById(`overview-${code}-tech`);
      if (ovTech) ovTech.textContent = `${s.technicals.ma20 ?? '-'} / ${s.technicals.rsi14 ?? '-'}`;
    }

    const ovDiv = document.getElementById(`overview-${code}-div`);
    const ovYld = document.getElementById(`overview-${code}-yield`);
    if (ovDiv) ovDiv.textContent = `${Number(divAmt).toFixed(2)}元`;
    if (ovYld) ovYld.textContent = `${Number(divYield).toFixed(2)}%`;

    const ovInst = document.getElementById(`overview-${code}-inst`);
    if (ovInst && inst) {
      const tot = Math.round(inst.total_lots);
      ovInst.textContent = `${tot >= 0 ? '+' : ''}${tot.toLocaleString()}張`;
      ovInst.className = tot >= 0 ? 'text-rose-700 font-mono font-bold' : 'text-emerald-700 font-mono font-bold';
    }

    const sigPrice = document.getElementById(`signals-${code}-price`);
    if (sigPrice) sigPrice.textContent = `NT$ ${s.price}`;
    const sigMetric = document.getElementById(`signals-${code}-metric`);
    if (sigMetric) sigMetric.textContent = `${Number(divYield).toFixed(2)}% / ${(meta.ter * 100).toFixed(2)}%`;

    const sigBadge = document.getElementById(`signals-${code}-badge`);
    if (sigBadge) {
      if (s.price <= meta.buyMax) {
        sigBadge.textContent = '🟢 進入強力加碼區';
        sigBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200';
      } else if (s.price <= meta.nearBuy) {
        sigBadge.textContent = '🟡 緊鄰買進區 / 分批承接';
        sigBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200';
      } else if (s.price >= meta.sellMin) {
        sigBadge.textContent = '🔴 過熱減碼 / 再平衡區';
        sigBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200';
      } else {
        sigBadge.textContent = '🔵 合理定投 / 續抱觀察';
        sigBadge.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200';
      }
    }

    const sigTechBox = document.getElementById(`signals-${code}-tech-inst`);
    if (sigTechBox) {
      const ma20 = s.technicals?.ma20 ?? '-';
      const rsi = s.technicals?.rsi14 ?? '-';
      const trend = s.technicals?.trend ?? '資料同步中';
      const totLots = inst ? Math.round(inst.total_lots) : 0;
      const fLots = inst ? Math.round(inst.foreign_lots) : 0;
      const totColor = totLots >= 0 ? 'text-rose-700' : 'text-emerald-700';
      sigTechBox.innerHTML = `
        <div><span class="text-slate-600">20MA月線:</span> <strong class="text-slate-900 font-mono">${ma20}</strong></div>
        <div><span class="text-slate-600">RSI(14):</span> <strong class="text-amber-700 font-mono">${rsi}</strong></div>
        <div class="col-span-2 text-slate-700 border-t border-sky-900/10 pt-1 flex justify-between">
          <span>法人: <strong class="${totColor} font-mono">${totLots >= 0 ? '+' : ''}${totLots.toLocaleString()}張</strong></span>
          <span class="text-[10px] text-slate-600">外:${fLots >= 0 ? '+' : ''}${fLots.toLocaleString()}</span>
        </div>
        <div class="col-span-2 text-[10px] text-sky-700 font-medium"><i class="fa-solid fa-chart-line mr-1"></i>${trend}</div>
      `;
    }

    const compVal = document.getElementById(`comp-${code}-val`);
    if (compVal) {
      compVal.innerHTML = `現價 <strong class="text-slate-900">${s.price}元</strong> | 1Y配息 ${Number(divAmt).toFixed(2)}元 | 殖利率 ${Number(divYield).toFixed(2)}%`;
    }

    const pfCur = document.getElementById(`pf-${code}-cur`);
    if (pfCur) pfCur.textContent = `現價 ${s.price}`;
    const simBase = document.getElementById(`sim-${code}-baseprice`);
    if (simBase) simBase.textContent = s.price;
  });

  if (data.global_indices) {
    const g = data.global_indices;
    const updateIndexTicker = (key, priceElemId, changeElemId) => {
      if (g[key] && g[key].status === 'success') {
        const item = g[key];
        const priceElem = document.getElementById(priceElemId);
        const changeElem = document.getElementById(changeElemId);
        if (priceElem) priceElem.textContent = Math.round(item.price).toLocaleString();
        if (changeElem) {
          const isUp = item.change >= 0;
          const colorClass = isUp ? 'text-rose-600' : 'text-emerald-600';
          const sign = isUp ? '+' : '';
          changeElem.className = `${colorClass} font-mono text-[10px] font-semibold`;
          changeElem.textContent = `${sign}${item.change_percent}%`;
        }
      }
    };
    updateIndexTicker('tw', 'ticker-idx-tw', 'ticker-idx-tw-change');
    updateIndexTicker('us', 'ticker-idx-us', 'ticker-idx-us-change');
    updateIndexTicker('sox', 'ticker-idx-sox', 'ticker-idx-sox-change');
    updateIndexTicker('jp', 'ticker-idx-jp', 'ticker-idx-jp-change');
  }

  if (data.tw_benchmarks?.['2330']?.status === 'success') {
    const b = data.tw_benchmarks['2330'];
    const pEl = document.getElementById('ticker-2330-price');
    const cEl = document.getElementById('ticker-2330-change');
    const rEl = document.getElementById('ticker-2330-range');
    const vEl = document.getElementById('ticker-2330-vol');
    if (pEl) pEl.textContent = `NT$ ${b.price.toLocaleString()}`;
    if (cEl) {
      const isUp = b.change >= 0;
      const sign = isUp ? '+' : '';
      cEl.className = `${isUp ? 'text-rose-600' : 'text-emerald-600'} font-mono text-[10px] flex items-center font-semibold`;
      cEl.innerHTML = `<i class="fa-solid ${isUp ? 'fa-caret-up' : 'fa-caret-down'} mr-0.5"></i>${sign}${b.change} (${sign}${b.change_percent}%)`;
    }
    if (rEl && b.high && b.low) rEl.textContent = `高/低: ${b.high.toLocaleString()} / ${b.low.toLocaleString()}`;
    if (vEl && b.volume) vEl.textContent = `量: ${Math.round(b.volume / 1000).toLocaleString()}張`;
  }

  if (data.macro) {
    if (data.macro.usd_twd?.status === 'success') {
      const fx = data.macro.usd_twd;
      liveMarketData.usdTwd = fx.price;
      const el = document.getElementById('ticker-fx-price');
      const ch = document.getElementById('ticker-fx-change');
      const geoFx = document.getElementById('geo-fx-price');
      if (el) el.textContent = fx.price.toFixed(2);
      if (geoFx) geoFx.textContent = fx.price.toFixed(2);
      if (ch) {
        const sign = fx.change_percent >= 0 ? '+' : '';
        ch.textContent = `${sign}${fx.change_percent}%`;
        ch.className = `${fx.change_percent >= 0 ? 'text-rose-600' : 'text-emerald-600'} font-mono text-[10px] font-semibold`;
      }
    }
    if (data.macro.us_10y?.status === 'success') {
      const y = data.macro.us_10y;
      const el = document.getElementById('ticker-us10y-price');
      const ch = document.getElementById('ticker-us10y-change');
      const geoY = document.getElementById('geo-us10y-price');
      if (el) el.textContent = `${y.price.toFixed(2)}%`;
      if (geoY) geoY.textContent = `${y.price.toFixed(2)}%`;
      if (ch) {
        const sign = y.change_percent >= 0 ? '+' : '';
        ch.textContent = `${sign}${y.change_percent}%`;
        ch.className = `${y.change_percent >= 0 ? 'text-rose-600' : 'text-emerald-600'} font-mono text-[10px] font-semibold`;
      }
    }
  }

  if (data.institutional) {
    const tbody = document.getElementById('inst-table-body');
    const dateEl = document.getElementById('inst-report-date');
    const rowsOrder = [
      { code: '0050', name: '0050 台灣50', color: 'text-emerald-700' },
      { code: '0056', name: '0056 高股息', color: 'text-sky-700' },
      { code: '00981A', name: '00981A 主動統一', color: 'text-purple-700' },
      { code: '00940', name: '00940 價值高息', color: 'text-amber-700' },
      { code: '2330', name: '台積電 (2330)', color: 'text-cyan-700' }
    ];
    if (tbody) {
      let firstDate = '';
      const htmlRows = rowsOrder.map(r => {
        const item = data.institutional[r.code];
        if (!item) return '';
        if (!firstDate && item.date) firstDate = item.date;
        const fmt = (val) => {
          const num = Math.round(val);
          const cls = num > 0 ? 'text-rose-700' : (num < 0 ? 'text-emerald-700' : 'text-slate-500');
          return `<span class="${cls}">${num > 0 ? '+' : ''}${num.toLocaleString()}</span>`;
        };
        return `
          <tr class="hover:bg-sky-50/70">
            <td class="py-2 px-2 font-sans font-bold ${r.color}">${r.name}</td>
            <td class="py-2 px-2 text-right">${fmt(item.foreign_lots)}</td>
            <td class="py-2 px-2 text-right">${fmt(item.trust_lots)}</td>
            <td class="py-2 px-2 text-right">${fmt(item.dealer_lots)}</td>
            <td class="py-2 px-2 text-right font-bold">${fmt(item.total_lots)} 張</td>
          </tr>
        `;
      }).join('');
      if (htmlRows) tbody.innerHTML = htmlRows;
      if (dateEl && firstDate && firstDate.length === 8) {
        dateEl.textContent = `資料日期：${firstDate.slice(0, 4)}-${firstDate.slice(4, 6)}-${firstDate.slice(6, 8)}`;
      }
    }
  }

  window.latestPayloadCache = data;
  renderOverviewMomentumReason(data);
  renderTechnicalsPanel(data);
  if (typeof window.triggerPortfolioUpdate === 'function') window.triggerPortfolioUpdate();
  if (typeof window.triggerCalculatorUpdate === 'function') window.triggerCalculatorUpdate();
}

async function refreshLiveMarketData(isManual = false) {
  if (latestRealtimeState.inFlight) return;
  if (!isManual && latestRealtimeState.isPaused) return;
  latestRealtimeState.inFlight = true;

  try {
    if (!basePayloadCache) {
      try {
        const res = await fetch(`latest_data.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) basePayloadCache = await res.json();
      } catch (fetchErr) {
        // Fallback for file:// protocol where fetch() is blocked by CORS
      }
      if (!basePayloadCache && window.__ETF_EMBEDDED_DATA__) {
        basePayloadCache = window.__ETF_EMBEDDED_DATA__;
      }
      if (basePayloadCache?.history) {
        if (basePayloadCache.history['1Y']?.labels) globalHistoricalData['1Y'] = basePayloadCache.history['1Y'];
        if (basePayloadCache.history['2Y']?.labels) globalHistoricalData['2Y'] = basePayloadCache.history['2Y'];
        renderOverviewCombinedChart();
      }
      if (basePayloadCache?.live_news?.length > 0) {
        renderNewsCards([...basePayloadCache.live_news, ...newsDatabase]);
      }
    }

    if (!basePayloadCache) return;

    try {
      const realtimeMap = await fetchCnyesRealtimeQuotes();
      const { payload, updatedCount } = buildMergedPayload(basePayloadCache, realtimeMap);
      if (payload && updatedCount > 0) {
        setUpdateTimestamp(formatLocalTimestamp(new Date()), true);
        setSyncBadgeState(latestRealtimeState.isPaused ? 'paused' : 'live');
        applyMarketDataToUI(payload, isManual);
        return;
      }
    } catch (rtErr) {
      console.warn('Cnyes live sync fallback to base payload:', rtErr);
    }

    setUpdateTimestamp(basePayloadCache.last_updated || formatLocalTimestamp(new Date()), isManual);
    setSyncBadgeState(latestRealtimeState.isPaused ? 'paused' : 'cached');
    applyMarketDataToUI(basePayloadCache, false);
  } catch (err) {
    console.log('Using cached/default ETF figures:', err);
  } finally {
    latestRealtimeState.inFlight = false;
  }
}

async function loadLiveExternalData() {
  return refreshLiveMarketData(false);
}

/* ========================================================
   1. TAB SWITCHING SYSTEM
   ======================================================== */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-600', 'hover:text-sky-900', 'hover:bg-white/60');
      });
      button.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-sm');
      button.classList.remove('text-slate-600', 'hover:text-sky-900', 'hover:bg-white/60');

      tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            if (targetTab === 'geopolitics') {
              renderGeoFeeDragChart();
              renderGeoRiskReturnChart();
            } else if (targetTab === 'overview') {
              if (overviewChartInstance) overviewChartInstance.resize();
            } else if (targetTab === 'comparison') {
              if (radarChartInstance) radarChartInstance.resize();
              if (sectorChartInstance) sectorChartInstance.resize();
            } else if (targetTab === 'industry') {
              if (concentrationChartInstance) concentrationChartInstance.resize();
              if (yieldExpenseChartInstance) yieldExpenseChartInstance.resize();
            } else if (targetTab === 'technicals') {
              renderTechnicalsCharts();
            }
          });
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
}

/* ========================================================
   2. CHARTS IMPLEMENTATION (Chart.js)
   ======================================================== */
let overviewChartInstance = null;
let radarChartInstance = null;
let sectorChartInstance = null;
let concentrationChartInstance = null;
let yieldExpenseChartInstance = null;
let geoFeeDragChartInstance = null;
let geoRiskReturnChartInstance = null;
let techMaChartInstance = null;
let techInstChartInstance = null;

const chartColors = {
  etf0050: '#10b981',
  etf0056: '#3b82f6',
  etf00981a: '#a855f7',
  etf00940: '#f59e0b',
  tsmc: '#06b6d4',
  tw: '#f43f5e',
  us: '#eab308',
  sox: '#f97316',
  jp: '#ec4899',
  slateGrid: 'rgba(14, 116, 144, 0.14)',
  slateText: '#1e4e6e'
};

function initCharts() {
  renderOverviewCombinedChart();
  renderComparisonRadarChart();
  renderSectorAllocationChart();
  renderConcentrationChart();
  renderYieldExpenseChart();
  setupTimeframeButtons();
  setupChartModeButtons();
  setupLegendChips();
}

// Fallback Historical Data (overwritten by real weekly series from latest_data.json)
const globalHistoricalData = {
  '1Y': {
    labels: ['25/11', '25/12', '26/01', '26/02', '26/03', '26/04', '26/05', '26/06', '26/07', '26/08', '26/09', '26/11(現)'],
    raw: {
      etf0050: [76.5, 80.2, 84.0, 86.5, 89.0, 92.4, 95.8, 99.0, 103.5, 106.2, 104.8, 99.7],
      etf0056: [43.8, 45.2, 46.5, 48.0, 49.1, 50.6, 52.0, 53.5, 55.2, 56.0, 55.5, 52.3],
      etf00981a: [18.2, 19.6, 21.4, 22.8, 24.1, 25.5, 26.8, 28.4, 29.2, 28.9, 27.1, 24.27],
      etf00940: [10.4, 10.8, 11.1, 11.4, 11.7, 12.0, 12.3, 12.6, 12.9, 13.0, 12.8, 12.13],
      tsmc: [1680, 1780, 1890, 1960, 2050, 2120, 2200, 2290, 2380, 2420, 2360, 2285],
      tw: [33800, 35200, 36800, 37900, 39100, 40500, 41800, 43100, 44200, 44500, 43800, 42712],
      us: [6520, 6700, 6850, 6950, 7100, 7200, 7320, 7410, 7500, 7580, 7540, 7516],
      sox: [7600, 8100, 8450, 8800, 9100, 9350, 9600, 9850, 10200, 10350, 10150, 10081],
      jp: [49500, 51200, 53000, 54500, 56000, 57200, 58100, 59400, 60800, 61200, 60100, 60460]
    }
  },
  '2Y': {
    labels: ['24/11', '25/01', '25/03', '25/05', '25/07', '25/09', '25/11', '26/01', '26/03', '26/05', '26/08', '26/11(現)'],
    raw: {
      etf0050: [49.5, 53.0, 56.2, 62.0, 68.5, 73.0, 76.5, 84.0, 89.0, 95.8, 106.2, 99.7],
      etf0056: [36.8, 38.0, 39.2, 40.5, 41.8, 42.9, 43.8, 46.5, 49.1, 52.0, 56.0, 52.3],
      etf00981a: [null, null, null, 10.0, 12.8, 15.6, 18.2, 21.4, 24.1, 26.8, 28.9, 24.27],
      etf00940: [9.45, 9.65, 9.80, 9.95, 10.1, 10.25, 10.4, 11.1, 11.7, 12.3, 13.0, 12.13],
      tsmc: [1060, 1130, 1210, 1350, 1490, 1580, 1680, 1890, 2050, 2200, 2420, 2285],
      tw: [22800, 23500, 24800, 27500, 30200, 32100, 33800, 36800, 39100, 41800, 44500, 42712],
      us: [5900, 6050, 6150, 6250, 6380, 6450, 6520, 6850, 7100, 7320, 7580, 7516],
      sox: [5200, 5500, 5800, 6400, 6900, 7300, 7600, 8450, 9100, 9600, 10350, 10081],
      jp: [38800, 39800, 41200, 43500, 46000, 48000, 49500, 53000, 56000, 58100, 61200, 60460]
    }
  },
  'CYCLE': {
    labels: ['2021牛市', '2022升息熊市', '2023 AI起飛', '2024高息狂潮', '2025 0050分割', '2026創高後回測'],
    raw: {
      etf0050: [35.5, 27.2, 34.0, 49.0, 80.2, 99.7],
      etf0056: [33.0, 25.5, 36.5, 38.0, 45.2, 52.3],
      etf00981a: [null, null, null, null, 19.6, 24.27],
      etf00940: [null, null, null, 9.5, 10.8, 12.13],
      tsmc: [615, 448, 593, 1075, 1780, 2285],
      tw: [18218, 14137, 17930, 23035, 35200, 42712],
      us: [4766, 3839, 4769, 5950, 6700, 7516],
      sox: [3946, 2532, 4175, 5150, 8100, 10081],
      jp: [28791, 26094, 33464, 39894, 51200, 60460]
    }
  }
};

// Convert raw series to percentage returns starting from the first non-null point
function toPercentageReturn(series) {
  if (!series || series.length === 0) return [];
  const base = series.find(v => v !== null && v !== undefined && v > 0);
  if (!base) return series.map(() => null);
  return series.map(val => {
    if (val === null || val === undefined) return null;
    return Number((((val - base) / base) * 100).toFixed(1));
  });
}

function renderOverviewCombinedChart() {
  const ctx = document.getElementById('overviewCombinedChart');
  if (!ctx) return;

  const datasetConfig = globalHistoricalData[currentChartTimeframe] || globalHistoricalData['1Y'];
  const labels = datasetConfig.labels;
  const raw = datasetConfig.raw;
  const isPct = currentChartMode === 'PCT';

  const datasets = [
    {
      label: '0050 台灣50',
      data: isPct ? toPercentageReturn(raw.etf0050) : raw.etf0050,
      borderColor: chartColors.etf0050,
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      spanGaps: true,
      pointRadius: labels.length > 20 ? 1.2 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[0]
    },
    {
      label: '0056 高股息',
      data: isPct ? toPercentageReturn(raw.etf0056) : raw.etf0056,
      borderColor: chartColors.etf0056,
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      spanGaps: true,
      pointRadius: labels.length > 20 ? 1.2 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[1]
    },
    {
      label: '00981A 主動統一',
      data: isPct ? toPercentageReturn(raw.etf00981a) : raw.etf00981a,
      borderColor: chartColors.etf00981a,
      backgroundColor: 'rgba(168, 85, 247, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      spanGaps: true,
      pointRadius: labels.length > 20 ? 1.2 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[2]
    },
    {
      label: '00940 價值高息',
      data: isPct ? toPercentageReturn(raw.etf00940) : raw.etf00940,
      borderColor: chartColors.etf00940,
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      borderWidth: 2.6,
      yAxisID: isPct ? 'yMain' : 'yStock',
      tension: 0.3,
      spanGaps: true,
      pointRadius: labels.length > 20 ? 1.2 : 3.5,
      pointHoverRadius: 6,
      hidden: !datasetVisibilityState[3]
    },
    {
      label: '台積電 (2330)',
      data: isPct ? toPercentageReturn(raw.tsmc || []) : (raw.tsmc || []),
      borderColor: chartColors.tsmc,
      borderWidth: 2.0,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0.8 : 3,
      hidden: !datasetVisibilityState[4]
    },
    {
      label: '🇹🇼 台股加權',
      data: isPct ? toPercentageReturn(raw.tw) : raw.tw,
      borderColor: chartColors.tw,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[5]
    },
    {
      label: '🇺🇸 S&P500',
      data: isPct ? toPercentageReturn(raw.us) : raw.us,
      borderColor: chartColors.us,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[6]
    },
    {
      label: '💾 費半 SOX',
      data: isPct ? toPercentageReturn(raw.sox) : raw.sox,
      borderColor: chartColors.sox,
      borderDash: [4, 3],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[7]
    },
    {
      label: '🇯🇵 日經225',
      data: isPct ? toPercentageReturn(raw.jp) : raw.jp,
      borderColor: chartColors.jp,
      borderDash: [3, 2],
      borderWidth: 1.8,
      yAxisID: isPct ? 'yMain' : 'yIndex',
      tension: 0.3,
      pointRadius: labels.length > 20 ? 0 : 2.5,
      hidden: !datasetVisibilityState[8]
    }
  ];

  if (overviewChartInstance) overviewChartInstance.destroy();

  const scalesConfig = isPct ? {
    x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
    yMain: {
      type: 'linear',
      position: 'left',
      grid: { color: chartColors.slateGrid },
      ticks: {
        color: chartColors.slateText,
        font: { size: 11 },
        callback: val => `${val > 0 ? '+' : ''}${val}%`
      }
    }
  } : {
    x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
    yStock: {
      type: 'linear',
      position: 'left',
      grid: { color: chartColors.slateGrid },
      ticks: { color: chartColors.slateText, callback: val => `NT$ ${val}` }
    },
    yIndex: {
      type: 'linear',
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { color: '#f43f5e', callback: val => `${Math.round(val).toLocaleString()}` }
    }
  };

  overviewChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          titleColor: '#0c2942',
          bodyColor: '#1e4e6e',
          borderColor: 'rgba(14, 165, 233, 0.4)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              const label = context.dataset.label;
              const val = context.parsed.y;
              if (val === null || val === undefined) return `${label}: 尚未掛牌`;
              if (isPct) return `${label}: ${val > 0 ? '+' : ''}${val}%`;
              if (context.datasetIndex <= 3) return `${label}: NT$ ${val}`;
              return `${label}: ${val.toLocaleString()}`;
            }
          }
        }
      },
      scales: scalesConfig
    }
  });

  syncChipsWithChart();
}

function syncChipsWithChart() {
  document.querySelectorAll('.chart-toggle-chip').forEach(chip => {
    const idx = parseInt(chip.getAttribute('data-dataset-index'));
    if (overviewChartInstance && overviewChartInstance.isDatasetVisible(idx)) {
      chip.classList.add('opacity-100');
      chip.classList.remove('opacity-40', 'line-through');
    } else {
      chip.classList.add('opacity-40', 'line-through');
      chip.classList.remove('opacity-100');
    }
  });
}

function setupLegendChips() {
  document.querySelectorAll('.chart-toggle-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const idx = parseInt(chip.getAttribute('data-dataset-index'));
      if (overviewChartInstance) {
        const isVisible = overviewChartInstance.isDatasetVisible(idx);
        datasetVisibilityState[idx] = !isVisible;
        overviewChartInstance.setDatasetVisibility(idx, !isVisible);
        overviewChartInstance.update();
        syncChipsWithChart();
      }
    });
  });
}

function setupTimeframeButtons() {
  const buttons = document.querySelectorAll('.chart-timeframe-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('text-slate-400');
      currentChartTimeframe = btn.getAttribute('data-range');
      renderOverviewCombinedChart();
    });
  });
}

function setupChartModeButtons() {
  const btnPct = document.getElementById('chart-mode-pct');
  const btnRaw = document.getElementById('chart-mode-raw');
  if (!btnPct || !btnRaw) return;

  btnPct.addEventListener('click', () => {
    btnPct.classList.add('bg-blue-600', 'text-white');
    btnPct.classList.remove('text-slate-400');
    btnRaw.classList.remove('bg-blue-600', 'text-white');
    btnRaw.classList.add('text-slate-400');
    currentChartMode = 'PCT';
    renderOverviewCombinedChart();
  });

  btnRaw.addEventListener('click', () => {
    btnRaw.classList.add('bg-blue-600', 'text-white');
    btnRaw.classList.remove('text-slate-400');
    btnPct.classList.remove('bg-blue-600', 'text-white');
    btnPct.classList.add('text-slate-400');
    currentChartMode = 'RAW';
    renderOverviewCombinedChart();
  });
}

// 2. Comparison Radar Chart (四強)
function renderComparisonRadarChart() {
  const ctx = document.getElementById('comparisonRadarChart');
  if (!ctx) return;

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [
        '長期總報酬潛力',
        '現金殖利率',
        '低內扣費用優勢',
        'AI/半導體進攻力',
        '抗震防禦與分散度',
        '規模與市場流動性'
      ],
      datasets: [
        {
          label: '0050 台灣50',
          data: [95, 35, 92, 92, 62, 99],
          backgroundColor: 'rgba(16, 185, 129, 0.18)',
          borderColor: chartColors.etf0050,
          pointBackgroundColor: chartColors.etf0050,
          borderWidth: 2
        },
        {
          label: '0056 高股息',
          data: [74, 96, 94, 58, 86, 92],
          backgroundColor: 'rgba(59, 130, 246, 0.18)',
          borderColor: chartColors.etf0056,
          pointBackgroundColor: chartColors.etf0056,
          borderWidth: 2
        },
        {
          label: '00981A 主動統一',
          data: [94, 78, 42, 98, 52, 84],
          backgroundColor: 'rgba(168, 85, 247, 0.18)',
          borderColor: chartColors.etf00981a,
          pointBackgroundColor: chartColors.etf00981a,
          borderWidth: 2
        },
        {
          label: '00940 價值高息',
          data: [66, 68, 94, 48, 92, 76],
          backgroundColor: 'rgba(245, 158, 11, 0.18)',
          borderColor: chartColors.etf00940,
          pointBackgroundColor: chartColors.etf00940,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#0c2942', font: { size: 11, weight: 'bold' } } }
      },
      scales: {
        r: {
          min: 20,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: chartColors.slateGrid },
          angleLines: { color: chartColors.slateGrid },
          pointLabels: { color: '#1e4e6e', font: { size: 11, weight: '600' } }
        }
      }
    }
  });
}

// 3. Sector Allocation Chart (四強產業曝險)
function renderSectorAllocationChart() {
  const ctx = document.getElementById('sectorAllocationChart');
  if (!ctx) return;

  sectorChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['半導體 / IC設計', 'AI伺服器 / PCB零組件', '金融保險業', '航運 / 塑化 / 傳產內需'],
      datasets: [
        { label: '0050 台灣50', data: [67, 13, 12, 8], backgroundColor: chartColors.etf0050, borderRadius: 4 },
        { label: '0056 高股息', data: [14, 29, 26, 31], backgroundColor: chartColors.etf0056, borderRadius: 4 },
        { label: '00981A 主動統一', data: [31, 56, 4, 9], backgroundColor: chartColors.etf00981a, borderRadius: 4 },
        { label: '00940 價值高息', data: [18, 22, 27, 33], backgroundColor: chartColors.etf00940, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#0c2942', font: { size: 11, weight: '600' } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: 約 ${c.parsed.y}%` } }
      },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
        y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}%` }, max: 75 }
      }
    }
  });
}

// 4. Concentration & TSMC Weight Chart
function renderConcentrationChart() {
  const ctx = document.getElementById('concentrationChart');
  if (!ctx) return;

  concentrationChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0050 台灣50', '0056 高股息', '00981A 主動統一', '00940 價值高息'],
      datasets: [
        {
          label: '前十大持股總權重 (%)',
          data: [79.64, 44.16, 63.98, 33.55],
          backgroundColor: 'rgba(56, 189, 248, 0.75)',
          borderRadius: 4
        },
        {
          label: '台積電 (2330) 單一權重 (%)',
          data: [58.30, 0.0, 14.98, 0.0],
          backgroundColor: 'rgba(16, 185, 129, 0.9)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
        y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}%` }, max: 90 }
      }
    }
  });
}

// 5. Yield vs Expense Ratio Chart
function renderYieldExpenseChart() {
  const ctx = document.getElementById('yieldExpenseChart');
  if (!ctx) return;

  yieldExpenseChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0050 台灣50', '0056 高股息', '00981A 主動統一', '00940 價值高息'],
      datasets: [
        {
          label: '近一年含息殖利率 (%)',
          data: [1.60, 9.44, 6.88, 4.78],
          backgroundColor: ['#10b981', '#3b82f6', '#a855f7', '#f59e0b'],
          borderRadius: 5
        },
        {
          label: '年度經理+保管費率 (%)',
          data: [0.355, 0.335, 1.10, 0.335],
          backgroundColor: '#ef4444',
          borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
        y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}%` } }
      }
    }
  });
}

/* ========================================================
   2.5 TOP 10 HOLDINGS INSPECTOR (成分股透視切換)
   ======================================================== */
function initHoldingsInspector() {
  const holdingsData = {
    '0050': {
      colorClass: 'text-emerald-400',
      note: '前十大合計佔 79.64% • 高度集中權值科技股，台積電單檔佔 58.30%',
      items: [
        { rank: 1, code: '2330', name: '台積電', weight: 58.30, sector: '晶圓代工' },
        { rank: 2, code: '2454', name: '聯發科', weight: 5.88, sector: 'IC設計' },
        { rank: 3, code: '2317', name: '鴻海', weight: 3.08, sector: 'AI伺服器組裝' },
        { rank: 4, code: '2308', name: '台達電', weight: 2.57, sector: '電源與散熱' },
        { rank: 5, code: '3711', name: '日月光投控', weight: 2.09, sector: '先進封裝' },
        { rank: 6, code: '1303', name: '南亞', weight: 1.49, sector: '電子材料/塑化' },
        { rank: 7, code: '2891', name: '中信金', weight: 1.36, sector: '金融保險' },
        { rank: 8, code: '2881', name: '富邦金', weight: 1.33, sector: '金融保險' },
        { rank: 9, code: '2383', name: '台光電', weight: 1.32, sector: '銅箔基板(CCL)' },
        { rank: 10, code: '2303', name: '聯電', weight: 1.22, sector: '晶圓代工' }
      ]
    },
    '0056': {
      colorClass: 'text-blue-400',
      note: '前十大合計佔 44.16% • 持股分散於金融、傳產航運與 AI 硬體代工',
      items: [
        { rank: 1, code: '1303', name: '南亞', weight: 8.60, sector: '電子材料/塑化' },
        { rank: 2, code: '2880', name: '華南金', weight: 4.84, sector: '金融保險' },
        { rank: 3, code: '2891', name: '中信金', weight: 4.49, sector: '金融保險' },
        { rank: 4, code: '2890', name: '永豐金', weight: 4.47, sector: '金融保險' },
        { rank: 5, code: '2357', name: '華碩', weight: 4.16, sector: 'PC/AI伺服器' },
        { rank: 6, code: '2886', name: '兆豐金', weight: 4.07, sector: '金融保險' },
        { rank: 7, code: '3231', name: '緯創', weight: 3.49, sector: 'AI伺服器' },
        { rank: 8, code: '2382', name: '廣達', weight: 3.45, sector: 'AI伺服器' },
        { rank: 9, code: '2603', name: '長榮', weight: 3.38, sector: '貨櫃航運' },
        { rank: 10, code: '2408', name: '南亞科', weight: 3.21, sector: '記憶體' }
      ]
    },
    '00981A': {
      colorClass: 'text-purple-400',
      note: '前十大合計佔 63.98% • 主動團隊每日動態調倉，重壓散熱/PCB/高速傳輸',
      items: [
        { rank: 1, code: '2330', name: '台積電', weight: 14.98, sector: '晶圓代工' },
        { rank: 2, code: '2454', name: '聯發科', weight: 8.09, sector: 'IC設計' },
        { rank: 3, code: '3017', name: '奇鋐', weight: 7.08, sector: 'AI液冷散熱' },
        { rank: 4, code: '2383', name: '台光電', weight: 6.99, sector: 'AI高速CCL' },
        { rank: 5, code: '3037', name: '欣興', weight: 6.05, sector: 'ABF載板' },
        { rank: 6, code: '3653', name: '健策', weight: 5.47, sector: '均熱片/散熱' },
        { rank: 7, code: '2345', name: '智邦', weight: 4.01, sector: 'AI高速交換器' },
        { rank: 8, code: '3711', name: '日月光投控', weight: 3.92, sector: '先進封裝' },
        { rank: 9, code: '6223', name: '旺矽', weight: 3.77, sector: '探針卡測試' },
        { rank: 10, code: '2327', name: '國巨', weight: 3.62, sector: '被動元件' }
      ]
    },
    '00940': {
      colorClass: 'text-amber-400',
      note: '前十大合計佔 33.55% • 權重上限控管最嚴格，強調低估值、航空、金融與電信防禦',
      items: [
        { rank: 1, code: '2357', name: '華碩', weight: 4.94, sector: '品牌PC/AI' },
        { rank: 2, code: '2618', name: '長榮航', weight: 3.72, sector: '航空客貨運' },
        { rank: 3, code: '2881', name: '富邦金', weight: 3.70, sector: '金融保險' },
        { rank: 4, code: '3034', name: '聯詠', weight: 3.49, sector: 'IC設計' },
        { rank: 5, code: '2891', name: '中信金', weight: 3.29, sector: '金融保險' },
        { rank: 6, code: '2892', name: '第一金', weight: 3.15, sector: '金融保險' },
        { rank: 7, code: '2379', name: '瑞昱', weight: 3.14, sector: 'IC設計' },
        { rank: 8, code: '3045', name: '台灣大', weight: 2.74, sector: '電信防禦' },
        { rank: 9, code: '2890', name: '永豐金', weight: 2.73, sector: '金融保險' },
        { rank: 10, code: '2610', name: '華航', weight: 2.65, sector: '航空客貨運' }
      ]
    }
  };

  function renderHoldings(code) {
    const container = document.getElementById('holdings-table-container');
    const info = holdingsData[code];
    if (!container || !info) return;

    const barColors = {
      '0050': 'bg-emerald-500',
      '0056': 'bg-blue-500',
      '00981A': 'bg-purple-500',
      '00940': 'bg-amber-500'
    };

    const rowsHtml = info.items.map(item => {
      const widthPct = Math.min(100, Math.round((item.weight / 60) * 100));
      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="py-2 px-3 font-mono text-slate-400">#${item.rank}</td>
          <td class="py-2 px-3 font-mono font-bold text-white">${item.code}</td>
          <td class="py-2 px-3 font-bold ${info.colorClass}">${item.name}</td>
          <td class="py-2 px-3 text-slate-300">${item.sector}</td>
          <td class="py-2 px-3 font-mono text-right text-white font-bold">${item.weight.toFixed(2)}%</td>
          <td class="py-2 px-3 w-36">
            <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full ${barColors[code]} rounded-full" style="width: ${Math.max(4, widthPct)}%"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="text-xs text-slate-300 bg-slate-950/70 px-3 py-2 rounded-lg border border-slate-800 mb-3 flex items-center justify-between">
        <span><strong class="${info.colorClass}">${code}</strong> ${info.note}</span>
      </div>
      <table class="w-full text-left text-xs border-collapse">
        <thead>
          <tr class="bg-slate-950/70 text-slate-400 border-b border-slate-800">
            <th class="py-2 px-3">排名</th>
            <th class="py-2 px-3">代號</th>
            <th class="py-2 px-3">成分股名稱</th>
            <th class="py-2 px-3">所屬產業</th>
            <th class="py-2 px-3 text-right">持股權重</th>
            <th class="py-2 px-3">權重占比條</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/80">${rowsHtml}</tbody>
      </table>
    `;
  }

  const btns = document.querySelectorAll('.hold-switch-btn');
  const activeBg = {
    '0050': 'bg-emerald-600',
    '0056': 'bg-blue-600',
    '00981A': 'bg-purple-600',
    '00940': 'bg-amber-600'
  };

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-hold-etf');
      btns.forEach(b => {
        b.classList.remove('active', 'bg-emerald-600', 'bg-blue-600', 'bg-purple-600', 'bg-amber-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      });
      btn.classList.add('active', activeBg[code], 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      renderHoldings(code);
    });
  });

  renderHoldings('0050');
}

/* ========================================================
   3. CURATED ETF NEWS & SENTIMENT CENTER
   ======================================================== */
const newsDatabase = [
  {
    id: 'base-1',
    title: '0050 受益人數續創新高！百元分割後定期定額扣款戶穩居全市場冠軍',
    category: 'macro',
    date: '2026-11-05',
    source: '臺灣證券交易所統計',
    sentiment: 'bull',
    sentimentLabel: '市值吸金',
    summary: '元大台灣50 (0050) 自調降經理費級距並完成分割後，單張門檻大幅降低，吸引大量年輕小資族與退休族逢回百元關卡持續加碼，總規模穩居 2.3 兆元以上。',
    impact: '逢回 90~100 元區間買盤承接力強勁，確立台股大盤長期中流砥柱地位。'
  },
  {
    id: 'base-2',
    title: '0056 第四季除息 1.72 元創今年單季新高，近一年合計配息 4.936 元殖利率突破 9%',
    category: 'dividend',
    date: '2026-10-22',
    source: '元大投信公告',
    sentiment: 'bull',
    sentimentLabel: '高息亮點',
    summary: '受惠成分股南亞、金融股與貨櫃航運長榮豐厚股息入帳及已實現資本利得挹注，0056 2026 年四季配息逐季走升，展現老牌高股息 ETF 的配息續航力。',
    impact: '高息現金流吸引力大增，回測 52 元支撐區吸引存股族進場等待填息。'
  },
  {
    id: 'base-3',
    title: '主動式 ETF 規模暴衝！00981A 重押奇鋐、台光電與健策，展現 AI 供應鏈選股彈性',
    category: 'active',
    date: '2026-11-01',
    source: '工商時報 / 投信資料',
    sentiment: 'bull',
    sentimentLabel: '主動領漲',
    summary: '主動統一台股增長 (00981A) 每日動態調倉聚焦 AI 液冷散熱、高速銅箔基板與 ABF 載板，規模躍升至 2,000 億元之上，成為台灣主動式 ETF 指標旗艦。',
    impact: '高 Beta 特性在費半反彈時漲幅領先大盤，惟回檔乖離亦較大，適合分批低接。'
  },
  {
    id: 'base-4',
    title: '00940 月配息連三月穩守 0.05~0.055 元水準，11 月成分股定審聚焦價值低估值股',
    category: 'rebalance',
    date: '2026-11-08',
    source: '經濟日報',
    sentiment: 'neutral',
    sentimentLabel: '穩健換股',
    summary: '元大臺灣價值高息 (00940) 憑藉華碩、長榮航、富邦金與聯詠等低估值高現金流標的支撐，近期月配金額逐步回穩至 0.055 元，法人亦見低檔逢低回補買盤。',
    impact: 'RSI 接近超賣區且外資單日轉買超，低價位有助小資族累積張數並避開二代健保。'
  }
];

let allActiveNews = [...newsDatabase];

function initNewsCenter() {
  renderNewsCards(allActiveNews);

  const filterButtons = document.querySelectorAll('.news-filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      });
      btn.classList.add('active', 'bg-blue-600', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');

      const filter = btn.getAttribute('data-filter');
      const searchQuery = document.getElementById('news-search-input').value.toLowerCase().trim();
      applyNewsFilter(filter, searchQuery);
    });
  });

  const searchInput = document.getElementById('news-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const activeFilterBtn = document.querySelector('.news-filter-btn.active');
      const filter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';
      applyNewsFilter(filter, e.target.value.toLowerCase().trim());
    });
  }
}

function applyNewsFilter(filter, query) {
  const filtered = allActiveNews.filter(item => {
    const matchesCategory = (filter === 'all' || item.category === filter);
    const matchesSearch = query === '' ||
      item.title.toLowerCase().includes(query) ||
      (item.summary && item.summary.toLowerCase().includes(query)) ||
      (item.impact && item.impact.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });
  renderNewsCards(filtered);
}

function renderNewsCards(items) {
  const container = document.getElementById('news-container');
  if (!container) return;
  allActiveNews = items;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 text-center py-12 text-slate-500 text-xs">
        <i class="fa-solid fa-folder-open text-2xl mb-2"></i>
        <p>查無符合關鍵字之 ETF 新聞情報</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(news => {
    const sentimentBadge = news.sentiment === 'bull'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-up"></i> ${news.sentimentLabel || '偏多焦點'}</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1"><i class="fa-solid fa-shield"></i> ${news.sentimentLabel || '市場追蹤'}</span>`;

    const titleHtml = news.link
      ? `<a href="${news.link}" target="_blank" rel="noopener noreferrer" class="hover:underline flex items-center justify-between gap-2"><span>${news.title}</span><i class="fa-solid fa-arrow-up-right-from-square text-[11px] text-blue-400 shrink-0"></i></a>`
      : news.title;

    return `
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between group">
        <div>
          <div class="flex items-center justify-between text-xs mb-2">
            <span class="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
              <i class="fa-regular fa-calendar text-[11px]"></i> ${news.date || news.pubDate || '即時'}
              <span class="mx-1">•</span>
              <span class="text-slate-300 font-medium">${news.source}</span>
            </span>
            ${sentimentBadge}
          </div>
          <h3 class="text-sm font-bold text-white group-hover:text-blue-400 transition leading-snug mb-2">
            ${titleHtml}
          </h3>
          <p class="text-xs text-slate-300 leading-relaxed mb-4">
            ${news.summary || '點擊標題可檢視新聞原始出處與完整報導內文。'}
          </p>
        </div>
        <div class="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-[11px] text-slate-300">
          <strong class="text-amber-400 flex items-center gap-1 mb-0.5">
            <i class="fa-solid fa-lightbulb"></i> ETF 配置影響解讀：
          </strong>
          <span class="text-slate-400">${news.impact}</span>
        </div>
      </div>
    `;
  }).join('');
}

/* ========================================================
   4. SENSITIVITY & DCA COMPOUNDING CALCULATOR (四強)
   ======================================================== */
function initSensitivityCalculator() {
  const sMkt = document.getElementById('slider-mkt-return');
  const sAlpha = document.getElementById('slider-alpha');
  const sDca = document.getElementById('slider-dca');
  const sYears = document.getElementById('slider-years');
  const resetBtn = document.getElementById('reset-sim-btn');

  if (!sMkt) return;

  function calcFutureValueDCA(monthly, annualNetRate, years) {
    const months = years * 12;
    const r = annualNetRate / 12;
    if (Math.abs(r) < 1e-6) return monthly * months;
    return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  }

  function recalculate() {
    const mktPct = parseFloat(sMkt.value);
    const alphaPct = parseFloat(sAlpha.value);
    const monthly = parseFloat(sDca.value);
    const years = parseInt(sYears.value);

    document.getElementById('val-mkt-return').textContent = `${mktPct.toFixed(1)}%`;
    document.getElementById('val-alpha').textContent = `${alphaPct >= 0 ? '+' : ''}${alphaPct.toFixed(1)}% / 年`;
    document.getElementById('val-dca').textContent = `NT$ ${monthly.toLocaleString()}`;
    document.getElementById('val-years').textContent = `${years} 年`;

    const principal = monthly * 12 * years;
    const prinEl = document.getElementById('sim-total-principal');
    if (prinEl) prinEl.textContent = `NT$ ${principal.toLocaleString()}`;

    // Net expected CAGR per ETF style (gross return adjusted by Beta/style - TER)
    const netRates = {
      '0050': (mktPct / 100) - ETF_META['0050'].ter,
      '0056': ((mktPct * 0.86) / 100) - ETF_META['0056'].ter,
      '00981A': ((mktPct + alphaPct) / 100) - ETF_META['00981A'].ter,
      '00940': ((mktPct * 0.78) / 100) - ETF_META['00940'].ter
    };

    const divRates = {
      '0050': (liveMarketData.div0050 || 1.60) / (liveMarketData.price0050 || 99.7),
      '0056': (liveMarketData.div0056 || 4.936) / (liveMarketData.price0056 || 52.3),
      '00981A': (liveMarketData.div00981A || 1.67) / (liveMarketData.price00981A || 24.27),
      '00940': (liveMarketData.div00940 || 0.58) / (liveMarketData.price00940 || 12.13)
    };

    ETF_CODES.forEach(code => {
      const fv = calcFutureValueDCA(monthly, netRates[code], years);
      const curPrice = liveMarketData[`price${code}`] || 50;
      const lots = fv / (curPrice * 1000);
      const estAnnualDiv = fv * divRates[code];

      const fvEl = document.getElementById(`sim-${code}-fv`);
      const cagrEl = document.getElementById(`sim-${code}-cagr`);
      const lotsEl = document.getElementById(`sim-${code}-lots`);
      const divEl = document.getElementById(`sim-${code}-div`);
      const baseEl = document.getElementById(`sim-${code}-baseprice`);

      if (baseEl) baseEl.textContent = curPrice;
      if (fvEl) fvEl.textContent = `NT$ ${Math.round(fv).toLocaleString()}`;
      if (cagrEl) cagrEl.textContent = `${(netRates[code] * 100).toFixed(2)}%`;
      if (lotsEl) lotsEl.textContent = `${lots.toFixed(1)} 張`;
      if (divEl) {
        divEl.textContent = code === '00940'
          ? `NT$ ${Math.round(estAnnualDiv / 12).toLocaleString()} / 月`
          : `NT$ ${Math.round(estAnnualDiv).toLocaleString()}`;
      }
    });

    const vEl = document.getElementById('sim-00981A-verdict');
    if (vEl) {
      if (alphaPct > 0.75) {
        vEl.textContent = `Alpha (+${alphaPct}%) 已超越主動費率，淨報酬領先 0050`;
        vEl.className = 'text-[11px] text-purple-300 pt-1.5 border-t border-slate-800/80';
      } else {
        vEl.textContent = `Alpha (${alphaPct >= 0 ? '+' : ''}${alphaPct}%) 尚未覆蓋 1.10% 費率，0050 較佔優`;
        vEl.className = 'text-[11px] text-rose-400 pt-1.5 border-t border-slate-800/80';
      }
    }
  }

  window.triggerCalculatorUpdate = recalculate;
  [sMkt, sAlpha, sDca, sYears].forEach(el => el.addEventListener('input', recalculate));

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      sMkt.value = 9;
      sAlpha.value = 2.5;
      sDca.value = 15000;
      sYears.value = 10;
      recalculate();
    });
  }

  recalculate();
}

/* ========================================================
   5. REAL-TIME TICKER REFRESH (15s AUTO SYNC + VISIBILITY)
   ======================================================== */
function initTickerUpdater() {
  const refreshBtn = document.getElementById('refresh-data-btn');
  const syncToggle = document.getElementById('live-sync-toggle');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      setUpdateTimestamp(formatLocalTimestamp(new Date()), true);
      refreshLiveMarketData(true).finally(() => {
        setTimeout(() => {
          if (icon) icon.classList.remove('fa-spin');
        }, 500);
      });
    });
  }

  if (syncToggle) {
    syncToggle.addEventListener('click', () => {
      latestRealtimeState.isPaused = !latestRealtimeState.isPaused;
      if (latestRealtimeState.isPaused) {
        setSyncBadgeState('paused');
      } else {
        setSyncBadgeState('live');
        refreshLiveMarketData(true);
      }
    });
  }

  setInterval(() => {
    if (!latestRealtimeState.isPaused && !document.hidden) {
      refreshLiveMarketData(false);
    }
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !latestRealtimeState.isPaused) {
      refreshLiveMarketData(false);
    }
  });
}

/* ========================================================
   6. LITERATURE REVIEW INTERACTION SYSTEM
   ======================================================== */
function initLiteratureSystem() {
  const filterBtns = document.querySelectorAll('.lit-filter-btn');
  const searchInput = document.getElementById('lit-search-input');
  const litCards = document.querySelectorAll('.lit-card');
  const copyBtns = document.querySelectorAll('.copy-citation-btn');
  const scaleBadgeEl = document.getElementById('lit-scale-badge');
  const totalCount = litCards.length;

  function updateScaleBadge(visibleCount) {
    if (!scaleBadgeEl) return;
    if (visibleCount === totalCount) {
      scaleBadgeEl.innerHTML = `<i class="fa-solid fa-layer-group text-sky-600"></i>已收錄 <span id="lit-total-count">${totalCount}</span> 篇文獻`;
    } else {
      scaleBadgeEl.innerHTML = `<i class="fa-solid fa-filter text-indigo-600"></i>顯示 <span id="lit-total-count">${visibleCount}</span> / 共 ${totalCount} 篇`;
    }
  }

  function filterLiterature() {
    const activeBtn = document.querySelector('.lit-filter-btn.active');
    const category = activeBtn ? activeBtn.getAttribute('data-filter') : 'all';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let visibleCount = 0;
    litCards.forEach(card => {
      const cardCat = card.getAttribute('data-category');
      const text = card.textContent.toLowerCase();
      const matchCat = category === 'all' || cardCat === category;
      const matchQuery = query === '' || text.includes(query);
      const isVisible = matchCat && matchQuery;
      card.classList.toggle('hidden', !isVisible);
      if (isVisible) visibleCount += 1;
    });
    updateScaleBadge(visibleCount);
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active', 'bg-indigo-600', 'text-white');
        b.classList.add('bg-sky-50', 'text-slate-700');
      });
      btn.classList.add('active', 'bg-indigo-600', 'text-white');
      btn.classList.remove('bg-sky-50', 'text-slate-700');
      filterLiterature();
    });
  });

  if (searchInput) searchInput.addEventListener('input', filterLiterature);
  filterLiterature();

  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const citation = btn.getAttribute('data-citation');
      if (citation) {
        navigator.clipboard.writeText(citation).then(() => {
          const originalHtml = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check text-emerald-600"></i> 已複製！';
          btn.classList.add('border-emerald-500');
          setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('border-emerald-500');
          }, 2000);
        });
      }
    });
  });
}

/* ========================================================
   7. MOBILE BENCHMARK COLLAPSE TOGGLE
   ======================================================== */
function initMobileBenchmarkToggle() {
  const toggleBtn = document.getElementById('toggle-benchmark-bar');
  const content = document.getElementById('benchmark-row-content');
  if (!toggleBtn || !content) return;

  toggleBtn.addEventListener('click', () => {
    const isHidden = content.classList.toggle('hidden');
    toggleBtn.textContent = isHidden ? '展開風向' : '收合基準';
  });
}

/* ========================================================
   8. PERSONAL PORTFOLIO P&L TRACKER (localStorage)
   ======================================================== */
function initPortfolioTracker() {
  const STORAGE_KEY = 'etf_big4_portfolio_v1';

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { saved = {}; }

  ETF_CODES.forEach(code => {
    const costEl = document.getElementById(`pf-${code}-cost`);
    const lotsEl = document.getElementById(`pf-${code}-lots`);
    if (costEl && saved[code]?.cost !== undefined) costEl.value = saved[code].cost;
    if (lotsEl && saved[code]?.lots !== undefined) lotsEl.value = saved[code].lots;
  });

  function calculatePortfolio() {
    let totalCost = 0;
    let totalValue = 0;
    let totalDiv = 0;
    const newSaved = {};

    ETF_CODES.forEach(code => {
      const costEl = document.getElementById(`pf-${code}-cost`);
      const lotsEl = document.getElementById(`pf-${code}-lots`);
      const resEl = document.getElementById(`pf-${code}-result`);
      if (!costEl || !lotsEl || !resEl) return;

      const cost = parseFloat(costEl.value);
      const lots = parseFloat(lotsEl.value);
      newSaved[code] = { cost: costEl.value, lots: lotsEl.value };

      if (!isNaN(cost) && cost > 0 && !isNaN(lots) && lots > 0) {
        const cur = liveMarketData[`price${code}`];
        const annualDivPerShare = liveMarketData[`div${code}`] || ETF_META[code].annualDiv;
        const invested = cost * lots * 1000;
        const mktVal = cur * lots * 1000;
        const estDiv = annualDivPerShare * lots * 1000;
        const pnl = mktVal - invested;
        const roi = ((cur - cost) / cost) * 100;

        totalCost += invested;
        totalValue += mktVal;
        totalDiv += estDiv;

        const isProfit = pnl >= 0;
        const pnlClass = isProfit ? 'text-rose-400' : 'text-emerald-400';
        const sign = isProfit ? '+' : '';
        const meta = ETF_META[code];
        const hint = cur >= meta.sellMin
          ? '<span class="text-rose-400 font-bold">達再平衡區</span>'
          : (cur <= meta.buyMax ? '<span class="text-emerald-400 font-bold">強力加碼區</span>' : `年息約 ${Math.round(estDiv).toLocaleString()}元`);

        resEl.innerHTML = `
          <div class="flex justify-between">
            <span>損益: <strong class="${pnlClass} font-mono">${sign}${Math.round(pnl).toLocaleString()}元</strong></span>
            <span class="${pnlClass} font-mono font-bold">${sign}${roi.toFixed(1)}%</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 flex justify-between">
            <span>市值: ${Math.round(mktVal).toLocaleString()}元</span>
            <span>${hint}</span>
          </div>
        `;
      } else {
        resEl.innerHTML = '<span class="text-slate-500">輸入均價與張數後自動計算損益</span>';
      }
    });

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newSaved)); } catch (e) {}

    const totCostEl = document.getElementById('pf-total-cost');
    const totValEl = document.getElementById('pf-total-value');
    const totDivEl = document.getElementById('pf-total-div');
    const totPnlEl = document.getElementById('pf-total-pnl');
    if (totCostEl) totCostEl.textContent = `NT$ ${Math.round(totalCost).toLocaleString()}`;
    if (totValEl) totValEl.textContent = `NT$ ${Math.round(totalValue).toLocaleString()}`;
    if (totDivEl) totDivEl.textContent = `NT$ ${Math.round(totalDiv).toLocaleString()} / 年`;
    if (totPnlEl) {
      const totalPnl = totalValue - totalCost;
      const totalRoi = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const sign = totalPnl >= 0 ? '+' : '';
      totPnlEl.textContent = `NT$ ${sign}${Math.round(totalPnl).toLocaleString()} (${sign}${totalRoi.toFixed(1)}%)`;
      totPnlEl.className = totalCost === 0
        ? 'text-slate-300 font-mono'
        : (totalPnl >= 0 ? 'text-rose-400 font-mono font-bold' : 'text-emerald-400 font-mono font-bold');
    }
  }

  window.triggerPortfolioUpdate = calculatePortfolio;
  document.querySelectorAll('.pf-input').forEach(el => {
    el.addEventListener('input', () => {
      calculatePortfolio();
      if (window.latestPayloadCache) {
        renderOverviewActionAdvisor(window.latestPayloadCache);
      }
    });
  });

  const resetBtn = document.getElementById('reset-portfolio-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      ETF_CODES.forEach(code => {
        const c = document.getElementById(`pf-${code}-cost`);
        const l = document.getElementById(`pf-${code}-lots`);
        if (c) c.value = '';
        if (l) l.value = '';
      });
      localStorage.removeItem(STORAGE_KEY);
      calculatePortfolio();
    });
  }

  calculatePortfolio();
}

/* ========================================================
   9. GLOBAL CAPITAL FLOWS WAR ROOM (SCENARIOS, MAP & CHARTS)
   ======================================================== */
function initGeopoliticsWarRoom() {
  setupGeoScenarios();
  setupGeoHotspots();
  renderGeoFeeDragChart();
  renderGeoRiskReturnChart();
}

function setupGeoScenarios() {
  const scenarios = {
    ai_boom: {
      absorb: '科技動能偏多 • 逢回承接',
      absorbClass: 'text-base font-black font-mono text-emerald-400 mt-0.5',
      scfi: '聚焦半導體與AI權值',
      scfiClass: 'text-base font-black font-mono text-amber-400 mt-0.5',
      winner: '0050 (核心) • 00981A (進攻)',
      action: '核心 60% 成長 + 40% 高息緩衝',
      actionClass: 'text-sm font-bold text-rose-400 mt-1'
    },
    rate_cut: {
      absorb: '資金寬鬆 • 殖利率利差擴大',
      absorbClass: 'text-base font-black font-mono text-blue-400 mt-0.5',
      scfi: '外資回補高息與金融權值',
      scfiClass: 'text-base font-black font-mono text-emerald-400 mt-0.5',
      winner: '0056 (9%高息) • 00940 (價值)',
      action: '積極鎖定高息 ETF 填息行情',
      actionClass: 'text-sm font-bold text-emerald-400 mt-1'
    },
    tariff_shock: {
      absorb: '波動加劇 • 避險情緒升溫',
      absorbClass: 'text-base font-black font-mono text-rose-400 mt-0.5',
      scfi: '外資調節高 Beta 科技股',
      scfiClass: 'text-base font-black font-mono text-amber-400 mt-0.5',
      winner: '00940 (電信/金融) • 0056 (防禦)',
      action: '保留現金分批撿 0050 跌深籌碼',
      actionClass: 'text-sm font-bold text-amber-400 mt-1'
    }
  };

  const btns = document.querySelectorAll('.geo-scenario-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('active', 'bg-blue-600', 'text-white');
      btn.classList.remove('text-slate-400');

      const s = scenarios[btn.getAttribute('data-geo-scenario')];
      if (!s) return;

      const elA = document.getElementById('geo-kpi-absorb');
      const elS = document.getElementById('geo-kpi-scfi');
      const elW = document.getElementById('geo-kpi-winner');
      const elAct = document.getElementById('geo-kpi-action');
      if (elA) { elA.textContent = s.absorb; elA.className = s.absorbClass; }
      if (elS) { elS.textContent = s.scfi; elS.className = s.scfiClass; }
      if (elW) elW.textContent = s.winner;
      if (elAct) { elAct.textContent = s.action; elAct.className = s.actionClass; }
    });
  });
}

function setupGeoHotspots() {
  const hotspots = {
    sox_ai: {
      badge: '科技主軸 • 核心引擎',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30',
      title: '費城半導體指數 (SOX) 與 AI 算力資本支出',
      icon: 'fa-solid fa-microchip text-2xl text-purple-400',
      desc: '台股加權指數與半導體供應鏈高度綁定美國雲端巨頭資本支出。當費半轉強時，含積量高的 0050 與重押 AI 散熱/PCB 的 00981A 具備最強向上攻擊動能。',
      traffic: 'SOX / 2330 連動領漲',
      cost: '高 Beta • 漲跌同步放大',
      p0050: 94, t0050: '94% (58.3% 台積電直接連動)',
      p0056: 55, t0056: '55% (AI組裝受惠，金融塑化緩衝)',
      p00981A: 96, t00981A: '96% (重壓AI散熱/PCB領漲)',
      p00940: 42, t00940: '42% (偏重價值防禦，AI彈性較低)',
      takeaway: '<strong>配置結論：</strong>看好 AI 與半導體多頭循環時，0050 與 00981A 是不可或缺的主攻手；若擔心費半劇烈回測，應適度提高 0056 與 00940 比例以降低組合回撤。'
    },
    fed_yield: {
      badge: '無風險利率定錨 • 股債比價',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30',
      title: '美國 10 年期公債殖利率與 Fed 降息路徑',
      icon: 'fa-solid fa-landmark text-2xl text-amber-400',
      desc: '美債殖利率逼近 5% 時會壓抑高估值科技股本益比；但對配息率逾 9% 的 0056 而言仍享有明顯利差空間，且一旦進入降息循環，高息與金融權值皆有望迎來估值重估。',
      traffic: '美債利率高檔震盪 (~4.98%)',
      cost: '0056 殖利率利差逾 +4.4%',
      p0050: 76, t0050: '76% (利率走低有利科技股估值)',
      p0056: 92, t0056: '92% (9%+ 高配息吸引避險資金)',
      p00981A: 72, t00981A: '72% (成長股對折現率變化敏感)',
      p00940: 84, t00940: '84% (金融股比重高，收益平穩)',
      takeaway: '<strong>配置結論：</strong>高利率環境下切忌追高高本益比題材，善用 0056 高現金殖利率作為下檔保護傘。'
    },
    tsmc_core: {
      badge: '護國神山效應 • 含積量差異',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      title: '台積電 (2330) 先進製程與權重極化效應',
      icon: 'fa-solid fa-crown text-2xl text-emerald-400',
      desc: '台積電佔 0050 高達 58.30%，形成「買 0050 等於半檔買台積電」的格局；00981A 主動將台積電控制在 14.98%，把更多權重分給中小型高成長供應鏈，而 0056/00940 則幾乎零持股。',
      traffic: '0050 含積量 58.3% vs 00981A 15.0%',
      cost: '兩極互補：0050 + 0056 零重疊',
      p0050: 98, t0050: '98% (拉積盤最大受惠者)',
      p0056: 18, t0056: '18% (無台積電，與 0050 完美互補)',
      p00981A: 78, t00981A: '78% (15%台積電 + 周邊設備測試)',
      p00940: 15, t00940: '15% (專注非台積電價值權值股)',
      takeaway: '<strong>配置結論：</strong>同時持有「0050 + 0056」或「0050 + 00940」能把單一壓寶台積電的風險降到最低，又不錯失神山紅利。'
    },
    etf_rebalance: {
      badge: '被動換股資金潮 • 季末焦點',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30',
      title: '5/11 月高股息 ETF 成分股定審與平準金效應',
      icon: 'fa-solid fa-arrows-rotate text-2xl text-blue-400',
      desc: '0056 (6/12月) 與 00940 (5/11月) 規模龐大，每次定期調整成分股都會引發市場資金搶先卡位「新納入股」與調節「剔除股」，同時須留意收益平準金動用比例。',
      traffic: '換股週轉率影響交易隱含成本',
      cost: '高股息換股摩擦成本約 0.2~0.4%',
      p0050: 90, t0050: '90% (換股極少，幾乎無摩擦成本)',
      p0056: 70, t0056: '70% (規模大，換股時易被市場吃豆腐)',
      p00981A: 75, t00981A: '75% (主動每日微調，無固定換股日遭狙擊問題)',
      p00940: 74, t00940: '74% (5/11月換股，低估值篩選穩定)',
      takeaway: '<strong>配置結論：</strong>00981A 採每日主動微調反而避開了被動高股息固定換股日被主力吃豆腐的弱點；0050 則幾乎零換股成本。'
    },
    fx_foreign: {
      badge: '外資提款機 vs 內資護盤',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30',
      title: 'USD/TWD 匯率波動與三大法人買賣超流向',
      icon: 'fa-solid fa-money-bill-transfer text-2xl text-teal-400',
      desc: '當台幣走貶破 32.8~33 元時，外資常先行提款權值股與 0050；反觀投信與存股內資逢低大買高股息 0056 與 00940，撐起台股下檔防線。',
      traffic: 'USD/TWD 32.95 偏貶震盪',
      cost: '外資調節 0050 / 低接 00940',
      p0050: 85, t0050: '85% (外資回補時漲勢最猛烈)',
      p0056: 80, t0056: '80% (內資長期定投撐盤力極強)',
      p00981A: 82, t00981A: '82% (外資與投信鎖碼中小型AI股)',
      p00940: 86, t00940: '86% (貶值期防禦與金融股相對抗跌)',
      takeaway: '<strong>配置結論：</strong>台幣貶值外資提款期正是分批撿便宜 0050 的好時機；一旦台幣轉升，外資回補 0050 將帶動強勁主升段。'
    },
    active_alpha: {
      badge: '主動選股試金石 • 費率門檻',
      badgeClass: 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30',
      title: '主動式 ETF 超額報酬 (Alpha) 與 1.10% 內扣成本考驗',
      icon: 'fa-solid fa-bolt text-2xl text-rose-400',
      desc: '00981A 每年經理費加保管費合計約 1.10%，比 0050 (0.355%) 多出約 0.75%。在產業輪動快速的 AI 時代，經理人選對散熱與銅箔基板可大勝大盤，但看錯時虧損亦會被費率放大。',
      traffic: '損益平衡 Alpha 門檻：+0.75%/年',
      cost: '主動費率 1.10% vs 被動 0.35%',
      p0050: 92, t0050: '92% (低費率算術定理長期勝率高)',
      p0056: 85, t0056: '85% (0.335% 低費用高息效率)',
      p00981A: 88, t00981A: '88% (看重團隊選股能力，衛星進攻首選)',
      p00940: 84, t00940: '84% (0.335% 低成本月配工具)',
      takeaway: '<strong>配置結論：</strong>將 00981A 定位為「10%~25% 主動衛星部位」，每半年檢視其含息績效是否打敗 0050 即可掌握主被動平衡。'
    }
  };

  function selectHotspot(key) {
    const d = hotspots[key];
    if (!d) return;

    document.querySelectorAll('.geo-hotspot-btn').forEach(b => {
      if (b.getAttribute('data-chokepoint') === key) {
        b.classList.add('active', 'bg-rose-600', 'text-white');
        b.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        b.classList.remove('active', 'bg-rose-600', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-300');
      }
    });

    const badgeEl = document.getElementById('geo-detail-badge');
    const titleEl = document.getElementById('geo-detail-title');
    const iconEl = document.getElementById('geo-detail-icon');
    const descEl = document.getElementById('geo-detail-desc');
    const trafficEl = document.getElementById('geo-detail-traffic');
    const costEl = document.getElementById('geo-detail-cost');
    const takeawayEl = document.getElementById('geo-detail-takeaway');

    if (badgeEl) { badgeEl.textContent = d.badge; badgeEl.className = d.badgeClass; }
    if (titleEl) titleEl.textContent = d.title;
    if (iconEl) iconEl.className = d.icon;
    if (descEl) descEl.textContent = d.desc;
    if (trafficEl) trafficEl.textContent = d.traffic;
    if (costEl) costEl.textContent = d.cost;
    if (takeawayEl) takeawayEl.innerHTML = d.takeaway;

    ETF_CODES.forEach(code => {
      const bar = document.getElementById(`geo-bar-${code}`);
      const txt = document.getElementById(`geo-bar-${code}-txt`);
      if (bar) bar.style.width = `${d[`p${code}`]}%`;
      if (txt) txt.textContent = d[`t${code}`];
    });
  }

  window.selectGeoHotspot = selectHotspot;

  document.querySelectorAll('.geo-hotspot, .geo-hotspot-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectHotspot(el.getAttribute('data-chokepoint'));
    });
  });
}

function renderGeoFeeDragChart() {
  const ctx = document.getElementById('geoFeeDragChart');
  if (!ctx) return;
  if (geoFeeDragChartInstance) geoFeeDragChartInstance.destroy();

  const years = [0, 3, 6, 9, 12, 15];
  const calcSeries = (rate) => years.map(y => Math.round(100 * Math.pow(1 + rate, y)));

  geoFeeDragChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years.map(y => `第 ${y} 年`),
      datasets: [
        {
          label: '被動低費率 (0.355% / 淨年化8.65%)',
          data: calcSeries(0.08645),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        },
        {
          label: '主動高費率無Alpha (1.10% / 淨年化7.90%)',
          data: calcSeries(0.079),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.10)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
        y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}萬` } }
      }
    }
  });
}

function renderGeoRiskReturnChart() {
  const ctx = document.getElementById('geoRiskReturnChart');
  if (!ctx) return;
  if (geoRiskReturnChartInstance) geoRiskReturnChartInstance.destroy();

  geoRiskReturnChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0050 台灣50', '0056 高股息', '00981A 主動統一', '00940 價值高息'],
      datasets: [
        {
          label: '牛市進攻彈性分數',
          data: [90, 68, 96, 58],
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderRadius: 5
        },
        {
          label: '熊市配息防禦分數',
          data: [62, 92, 54, 88],
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
      scales: {
        x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText } }
      }
    }
  });
}

/* ========================================================
   10. DIVIDEND TAX & 2ND-GEN NHI CALCULATOR (除息節稅試算)
   ======================================================== */
function initDividendCalculator() {
  const stockSel = document.getElementById('div-stock-select');
  const lotsIn = document.getElementById('div-lots-input');
  const payoutIn = document.getElementById('div-payout-input');
  const taxRatioIn = document.getElementById('div-taxable-ratio');
  if (!stockSel || !lotsIn || !payoutIn || !taxRatioIn) return;

  const presets = {
    '0056': { payout: 1.72, lots: 15, taxable: 75, freq: 4 },
    '00981A': { payout: 0.63, lots: 30, taxable: 65, freq: 4 },
    '00940': { payout: 0.055, lots: 100, taxable: 80, freq: 12 },
    '0050': { payout: 0.80, lots: 25, taxable: 95, freq: 2 }
  };

  function calcDiv() {
    const code = stockSel.value;
    const lots = Math.max(0, parseFloat(lotsIn.value) || 0);
    const payout = Math.max(0, parseFloat(payoutIn.value) || 0);
    const taxablePct = Math.max(0, Math.min(100, parseFloat(taxRatioIn.value) || 80));

    document.getElementById('div-taxable-label').textContent = `應稅股利佔 ${taxablePct}%`;

    const gross = Math.round(lots * 1000 * payout);
    const taxableBase = Math.round(gross * (taxablePct / 100));
    // Taiwan 2nd-gen NHI: taxable dividend portion (54C) >= 20,000 NTD incurs 2.11%
    const nhi = taxableBase >= 20000 ? Math.round(taxableBase * 0.0211) : 0;
    const net = gross - nhi;
    const freq = presets[code]?.freq || 4;
    const annualEst = gross * freq;
    const credit = Math.round(taxableBase * 0.085);

    document.getElementById('div-res-gross').textContent = `NT$ ${gross.toLocaleString()}`;
    document.getElementById('div-res-taxable').textContent = `NT$ ${taxableBase.toLocaleString()}`;
    document.getElementById('div-res-nhi').textContent = nhi > 0 ? `-NT$ ${nhi.toLocaleString()}` : 'NT$ 0 (免扣)';
    document.getElementById('div-res-net').textContent = `NT$ ${net.toLocaleString()}`;
    document.getElementById('div-res-annual').textContent = `NT$ ${annualEst.toLocaleString()} / 年`;
    document.getElementById('div-res-credit').textContent = `+NT$ ${credit.toLocaleString()} / 次`;

    const tipEl = document.getElementById('div-res-tip');
    if (tipEl) {
      const denom = payout * 1000 * (taxablePct / 100);
      const safeLots = denom > 0 ? (19999 / denom).toFixed(1) : '∞';
      tipEl.textContent = nhi > 0
        ? `💡 已達 2 萬元門檻！若欲合法避開 2.11% 二代健保補充保費，單次參與除息張數需控制在 ${safeLots} 張以下，或改拆部分資金至月配息 00940。`
        : `✅ 尚未觸及 2 萬元健保門檻！以目前應稅比例，單檔最多可持有約 ${safeLots} 張免扣補充保費。`;
    }
  }

  stockSel.addEventListener('change', () => {
    const p = presets[stockSel.value];
    if (p) {
      payoutIn.value = p.payout;
      lotsIn.value = p.lots;
      taxRatioIn.value = p.taxable;
    }
    calcDiv();
  });

  [lotsIn, payoutIn, taxRatioIn].forEach(el => el.addEventListener('input', calcDiv));
  calcDiv();
}

/* ========================================================
   11. TECHNICALS & INSTITUTIONAL FLOWS PANEL
   ======================================================== */
function renderTechnicalsPanel(data) {
  if (!data || !data.etfs) return;

  ETF_CODES.forEach(code => {
    const card = document.getElementById(`tech-card-${code}`);
    const s = data.etfs[code];
    const inst = data.institutional && data.institutional[code];
    const meta = ETF_META[code];
    if (!card || !s) return;

    const t = s.technicals || {};
    const rsi = t.rsi14 ?? '-';
    const rsiBadge = rsi >= 70
      ? '<span class="text-rose-400 font-bold">過熱</span>'
      : (rsi <= 35 ? '<span class="text-emerald-400 font-bold">近超賣</span>' : '<span class="text-amber-300">中性偏低</span>');
    const b20 = t.bias_20 ?? 0;
    const b60 = t.bias_60 ?? 0;
    const totLots = inst ? Math.round(inst.total_lots) : 0;

    card.innerHTML = `
      <div class="flex justify-between items-center border-b border-slate-800 pb-2">
        <strong class="${meta.textColor} text-sm">${meta.shortName}</strong>
        <span class="font-mono font-bold text-white">NT$ ${s.price}</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-[11px]">
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">5MA週線: <strong class="text-white font-mono">${t.ma5 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">20MA月線: <strong class="text-white font-mono">${t.ma20 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">60MA季線: <strong class="text-white font-mono">${t.ma60 ?? '-'}</strong></div>
        <div class="bg-slate-950/70 p-2 rounded border border-slate-800">240MA年線: <strong class="text-white font-mono">${t.ma240 ?? '-'}</strong></div>
      </div>
      <div class="flex justify-between items-center text-[11px] pt-1">
        <span>月線乖離: <strong class="${b20 >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${b20 >= 0 ? '+' : ''}${b20}%</strong></span>
        <span>季線乖離: <strong class="${b60 >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${b60 >= 0 ? '+' : ''}${b60}%</strong></span>
      </div>
      <div class="flex justify-between items-center text-[11px]">
        <span>RSI(14): <strong class="font-mono text-white">${rsi}</strong> (${rsiBadge})</span>
        <span>法人: <strong class="${totLots >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">${totLots >= 0 ? '+' : ''}${totLots.toLocaleString()}張</strong></span>
      </div>
      <div class="text-[11px] border-t border-slate-800/80 pt-2 text-sky-300 font-semibold">
        <i class="fa-solid fa-chart-line mr-1"></i>${t.trend || '趨勢計算中'}
      </div>
    `;
  });

  renderTechnicalsCharts();
}

function renderTechnicalsCharts() {
  const data = window.latestPayloadCache;
  if (!data) return;

  const ctxMa = document.getElementById('techMaChart');
  if (ctxMa && data.etfs) {
    if (techMaChartInstance) techMaChartInstance.destroy();
    const calcBias = (price, ma) => (price && ma) ? Number((((price - ma) / ma) * 100).toFixed(2)) : 0;

    techMaChartInstance = new Chart(ctxMa, {
      type: 'bar',
      data: {
        labels: ['5MA 週線乖離', '20MA 月線乖離', '60MA 季線乖離', '240MA 年線乖離'],
        datasets: ETF_CODES.map(code => {
          const item = data.etfs[code];
          const t = item?.technicals || {};
          const p = item?.price;
          return {
            label: ETF_META[code].shortName,
            data: [calcBias(p, t.ma5), t.bias_20 || 0, t.bias_60 || 0, calcBias(p, t.ma240)],
            backgroundColor: ETF_META[code].color,
            borderRadius: 4
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
        scales: {
          x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
          y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v}%` } }
        }
      }
    });
  }

  const ctxInst = document.getElementById('techInstChart');
  if (ctxInst && data.institutional) {
    if (techInstChartInstance) techInstChartInstance.destroy();
    const codes = ['0050', '0056', '00981A', '00940', '2330'];
    const labels = ['0050 台灣50', '0056 高股息', '00981A 主動統一', '00940 價值高息', '台積電 (2330)'];
    const foreign = codes.map(c => Math.round(data.institutional[c]?.foreign_lots || 0));
    const trust = codes.map(c => Math.round(data.institutional[c]?.trust_lots || 0));
    const dealer = codes.map(c => Math.round(data.institutional[c]?.dealer_lots || 0));

    techInstChartInstance = new Chart(ctxInst, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '外資 (張)', data: foreign, backgroundColor: '#ef4444', borderRadius: 3 },
          { label: '投信 (張)', data: trust, backgroundColor: '#f59e0b', borderRadius: 3 },
          { label: '自營商 (張)', data: dealer, backgroundColor: '#38bdf8', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#0c2942', font: { size: 11, weight: '600' } } } },
        scales: {
          x: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, font: { size: 10 } } },
          y: { grid: { color: chartColors.slateGrid }, ticks: { color: chartColors.slateText, callback: v => `${v.toLocaleString()}張` } }
        }
      }
    });
  }
}

/* ========================================================
   12. MACRO TER FEE DRAG SIMULATOR (內扣費用侵蝕試算)
   ======================================================== */
function initMacroFeeSimulator() {
  const sYears = document.getElementById('fee-years-slider');
  const sGross = document.getElementById('fee-gross-slider');
  const yVal = document.getElementById('fee-years-val');
  const gVal = document.getElementById('fee-gross-val');
  if (!sYears || !sGross) return;

  function calcFeeDrag() {
    const years = parseInt(sYears.value);
    const gross = parseFloat(sGross.value) / 100;
    if (yVal) yVal.textContent = `${years} 年`;
    if (gVal) gVal.textContent = `${(gross * 100).toFixed(1)}%`;

    const fvPassive = 1000000 * Math.pow(1 + (gross - 0.00355), years);
    const fvActive = 1000000 * Math.pow(1 + (gross - 0.0110), years);
    const drag = fvActive - fvPassive;

    const pEl = document.getElementById('fee-res-passive');
    const aEl = document.getElementById('fee-res-active');
    const dEl = document.getElementById('fee-res-drag');
    if (pEl) pEl.textContent = `NT$ ${Math.round(fvPassive).toLocaleString()}`;
    if (aEl) aEl.textContent = `NT$ ${Math.round(fvActive).toLocaleString()}`;
    if (dEl) dEl.textContent = `-NT$ ${Math.abs(Math.round(drag)).toLocaleString()}`;
  }

  sYears.addEventListener('input', calcFeeDrag);
  sGross.addEventListener('input', calcFeeDrag);
  calcFeeDrag();
}

/* ========================================================
   13. PRE-TRADE CHECKLIST & LOCAL TRADING NOTES
   ======================================================== */
function initChecklistAndNotes() {
  const checks = document.querySelectorAll('.trade-check');
  const badge = document.getElementById('checklist-score-badge');
  const bar = document.getElementById('checklist-progress-bar');
  const verdict = document.getElementById('checklist-verdict-box');

  function updateChecklist() {
    const total = checks.length;
    const checked = Array.from(checks).filter(c => c.checked).length;
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    if (bar) bar.style.width = `${pct}%`;
    if (badge) {
      badge.textContent = `當前把握度：${pct}% (${checked}/${total} 項)`;
      if (pct >= 75) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono';
      } else if (pct >= 50) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono';
      }
    }

    if (verdict) {
      if (pct >= 75) {
        verdict.innerHTML = '<strong class="text-emerald-400">決策建議：</strong>多項紀律條件高度符合！風險邊際佳，適合按計畫執行分批單筆加碼。';
      } else if (pct >= 50) {
        verdict.innerHTML = '<strong class="text-amber-400">決策建議：</strong>目前符合部分條件，適合維持每月定期定額並保留現金等待回測加碼。';
      } else {
        verdict.innerHTML = '<strong class="text-rose-400">決策建議：</strong>檢核尚未完備！建議先檢視溢價與資產配置比例，勿情緒追高。';
      }
    }
  }

  checks.forEach(c => c.addEventListener('change', updateChecklist));
  updateChecklist();

  const NOTE_KEY = 'etf_big4_trading_notes_v1';
  const notesArea = document.getElementById('trading-notes-area');
  const statusEl = document.getElementById('notes-save-status');
  const clearBtn = document.getElementById('clear-notes-btn');

  if (notesArea) {
    try {
      const savedNote = localStorage.getItem(NOTE_KEY);
      if (savedNote !== null) notesArea.value = savedNote;
    } catch (e) {}

    notesArea.addEventListener('input', () => {
      try {
        localStorage.setItem(NOTE_KEY, notesArea.value);
        if (statusEl) {
          statusEl.textContent = '已自動儲存 ✔';
          setTimeout(() => { statusEl.textContent = '已同步本機'; }, 1500);
        }
      } catch (e) {}
    });
  }

  if (clearBtn && notesArea) {
    clearBtn.addEventListener('click', () => {
      notesArea.value = '';
      try { localStorage.removeItem(NOTE_KEY); } catch (e) {}
      if (statusEl) statusEl.textContent = '已清空筆記';
    });
  }
}

/* ========================================================
   14. CUSTOM 4-ETF THEMED CURSOR (0050/0056/00981A/00940)
   ======================================================== */
function initEtfCursor() {
  const themes = [
    {
      name: '0050領航箭',
      icon: 'fa-rocket',
      primary: '#10B981',
      accent: '#A7F3D0',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:scale-105 transition flex items-center gap-1'
    },
    {
      name: '0056配息艦',
      icon: 'fa-coins',
      primary: '#3B82F6',
      accent: '#BAE6FD',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:scale-105 transition flex items-center gap-1'
    },
    {
      name: '00981A主動鋒',
      icon: 'fa-bolt',
      primary: '#A855F7',
      accent: '#E9D5FF',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:scale-105 transition flex items-center gap-1'
    },
    {
      name: '00940月配盾',
      icon: 'fa-shield-halved',
      primary: '#F59E0B',
      accent: '#FDE68A',
      badgeClass: 'px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:scale-105 transition flex items-center gap-1'
    }
  ];

  let currentIdx = Math.floor(Math.random() * themes.length);

  function buildCursorUri(theme, isHover = false) {
    const strokeCol = isHover ? '#FACC15' : '#FFFFFF';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <g transform="rotate(-38 16 16)">
        <path d="M16 2 L24 24 L16 19 L8 24 Z" fill="${theme.primary}" stroke="${strokeCol}" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="16" cy="12" r="2.6" fill="${theme.accent}"/>
      </g>
    </svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 3 3, auto`;
  }

  function applyCursor(idx) {
    const theme = themes[idx];
    const normalUri = buildCursorUri(theme, false);
    const hoverUri = buildCursorUri(theme, true);

    let styleTag = document.getElementById('dynamic-etf-cursor-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'dynamic-etf-cursor-style';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body { cursor: ${normalUri} !important; }
      a, button, input[type="range"], input[type="checkbox"], select, label, [role="button"], .geo-hotspot {
        cursor: ${hoverUri} !important;
      }
    `;

    const badge = document.getElementById('etf-cursor-badge');
    if (badge) {
      badge.className = theme.badgeClass;
      badge.innerHTML = `<i class="fa-solid ${theme.icon}"></i> 鼠標：${theme.name}`;
    }
  }

  applyCursor(currentIdx);

  const badge = document.getElementById('etf-cursor-badge');
  if (badge) {
    badge.addEventListener('click', () => {
      currentIdx = (currentIdx + 1) % themes.length;
      applyCursor(currentIdx);
    });
  }
}
