import os
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))

ETF_SYMBOLS = {
    "0050": "0050.TW",
    "0056": "0056.TW",
    "00981A": "00981A.TW",
    "00940": "00940.TW"
}


def get_tw_now():
    tz_tw = timezone(timedelta(hours=8))
    return datetime.now(tz_tw).strftime("%Y-%m-%d %H:%M:%S")


def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(0.0, diff)) / period
        avg_loss = (avg_loss * (period - 1) + max(0.0, -diff)) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 1)


def fetch_quote_with_technicals(symbol, include_technicals=False, include_dividends=False):
    rng = "1y" if (include_technicals or include_dividends) else "5d"
    events_param = "&events=div,split" if include_dividends else ""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={rng}{events_param}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            meta = res['meta']

            price = round(float(meta.get('regularMarketPrice', 0.0)), 2)
            prev_close = round(float(meta.get('chartPreviousClose', price)), 2)

            closes_raw = res.get('indicators', {}).get('quote', [{}])[0].get('close', [])
            closes = [float(c) for c in closes_raw if c is not None]
            if len(closes) >= 2:
                prev_close = round(closes[-2], 2)
                if price == 0.0:
                    price = round(closes[-1], 2)

            change = round(price - prev_close, 2)
            pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            high = round(float(meta.get('regularMarketDayHigh', price)), 2)
            low = round(float(meta.get('regularMarketDayLow', price)), 2)
            volume = int(meta.get('regularMarketVolume', 0) or 0)

            result = {
                "symbol": symbol,
                "price": price,
                "prev_close": prev_close,
                "change": change,
                "change_percent": pct,
                "high": high,
                "low": low,
                "volume": volume,
                "status": "success"
            }

            if include_technicals and len(closes) >= 20:
                ma5 = round(sum(closes[-5:]) / 5, 2)
                ma20 = round(sum(closes[-20:]) / 20, 2)
                ma60 = round(sum(closes[-60:]) / 60, 2) if len(closes) >= 60 else None
                ma240 = round(sum(closes[-240:]) / 240, 2) if len(closes) >= 200 else round(sum(closes) / len(closes), 2)
                rsi14 = calc_rsi(closes, 14)

                bias_20 = round((price - ma20) / ma20 * 100, 2) if ma20 else 0.0
                bias_60 = round((price - ma60) / ma60 * 100, 2) if ma60 else None

                if ma60 and price > ma20 and ma20 > ma60:
                    trend = "多頭排列 (站上月線與季線)"
                elif price > ma20:
                    trend = "短期轉強 (站上20MA月線)"
                elif ma60 and price < ma20 and price > ma60:
                    trend = "回測季線震盪整理"
                else:
                    trend = "均線下方弱勢整理"

                result["technicals"] = {
                    "ma5": ma5,
                    "ma20": ma20,
                    "ma60": ma60,
                    "ma240": ma240,
                    "bias_20": bias_20,
                    "bias_60": bias_60,
                    "rsi14": rsi14,
                    "trend": trend
                }

            if include_dividends:
                divs = res.get('events', {}).get('dividends', {})
                tz_tw = timezone(timedelta(hours=8))
                div_list = []
                for k in sorted(divs.keys()):
                    amt = round(float(divs[k].get('amount', 0.0)), 4)
                    dt_str = datetime.fromtimestamp(int(k), tz=tz_tw).strftime("%Y-%m-%d")
                    div_list.append({"date": dt_str, "amount": amt})
                trailing_div = round(sum(d["amount"] for d in div_list), 3)
                trailing_yield = round((trailing_div / price) * 100, 2) if price > 0 else 0.0
                result["dividend_1y"] = {
                    "total_amount": trailing_div,
                    "count": len(div_list),
                    "trailing_yield_pct": trailing_yield,
                    "recent": div_list[-6:]
                }

            return result
    except Exception as e:
        print(f"Error fetching quote {symbol}: {e}")
        return {
            "symbol": symbol,
            "status": "error",
            "error": str(e)
        }


def fetch_weekly_series(symbol, range_str="1y"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1wk&range={range_str}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            timestamps = res.get('timestamp', [])
            closes = res.get('indicators', {}).get('quote', [{}])[0].get('close', [])
            week_map = {}
            tz_tw = timezone(timedelta(hours=8))
            for ts, c in zip(timestamps, closes):
                if c is None:
                    continue
                dt = datetime.fromtimestamp(ts, tz=tz_tw)
                iso_year, iso_week, _ = dt.isocalendar()
                week_key = f"{iso_year}-W{iso_week:02d}"
                week_map[week_key] = (dt.strftime("%Y/%m/%d"), round(float(c), 2))
            return week_map
    except Exception as e:
        print(f"Error fetching weekly series {symbol} ({range_str}): {e}")
        return {}


def build_aligned_history(range_str="1y"):
    symbols = {
        "etf0050": "0050.TW",
        "etf0056": "0056.TW",
        "etf00981a": "00981A.TW",
        "etf00940": "00940.TW",
        "tsmc": "2330.TW",
        "tw": "^TWII",
        "us": "^GSPC",
        "sox": "^SOX",
        "jp": "^N225"
    }
    maps = {k: fetch_weekly_series(sym, range_str) for k, sym in symbols.items()}
    anchor_keys = sorted(maps["etf0050"].keys())
    if not anchor_keys:
        return None

    labels = []
    series = {k: [] for k in symbols.keys()}
    last_val = {}

    for wk in anchor_keys:
        date_label = maps["etf0050"][wk][0]
        labels.append(date_label[2:])
        for k in symbols.keys():
            if wk in maps[k]:
                val = maps[k][wk][1]
                last_val[k] = val
                series[k].append(val)
            else:
                if k in last_val:
                    series[k].append(last_val[k])
                else:
                    # For newly listed ETFs like 00981A before 2025-05, keep null before listing
                    earlier = [maps[k][m][1] for m in sorted(maps[k].keys()) if m <= wk]
                    if earlier:
                        val = earlier[-1]
                        last_val[k] = val
                        series[k].append(val)
                    else:
                        series[k].append(None)

    return {"labels": labels, "raw": series}


def fetch_twse_t86():
    url = "https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    targets = {"0050", "0056", "00981A", "00940", "2330"}
    inst_data = {}
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
        if data.get("stat") != "OK":
            return {}
        report_date = data.get("date", "")
        for row in data.get("data", []):
            code = row[0].strip()
            if code in targets:
                def to_lots(val_str):
                    try:
                        return round(int(val_str.replace(",", "").strip()) / 1000.0, 1)
                    except Exception:
                        return 0.0
                inst_data[code] = {
                    "date": report_date,
                    "foreign_lots": to_lots(row[4]),
                    "trust_lots": to_lots(row[10]),
                    "dealer_lots": to_lots(row[11]),
                    "total_lots": to_lots(row[-1])
                }
    except Exception as e:
        print(f"Error fetching TWSE T86: {e}")
    return inst_data


def fetch_etf_news():
    query = urllib.parse.quote("0050 OR 0056 OR 00981A OR 00940 ETF 配息")
    url = f"https://news.google.com/rss/search?q={query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})

    news_items = []
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            xml_data = resp.read()
            root = ET.fromstring(xml_data)
            items = root.findall('.//item')[:12]

            for idx, item in enumerate(items):
                title = item.find('title').text if item.find('title') is not None else ""
                link = item.find('link').text if item.find('link') is not None else ""
                pubDate = item.find('pubDate').text if item.find('pubDate') is not None else ""
                source_elem = item.find('source')
                source = source_elem.text if source_elem is not None else "財經新聞"

                clean_title = title
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    clean_title = parts[0]
                    if source == "財經新聞":
                        source = parts[1]

                if any(w in clean_title for w in ["跌", "降", "縮水", "破發", "風險", "賣超", "警戒", "壓力"]):
                    sentiment = "bear"
                    sentiment_label = "波動觀察"
                elif any(w in clean_title for w in ["漲", "新高", "填息", "買超", "暴增", "配息", "強", "績效", "受惠", "突破"]):
                    sentiment = "bull"
                    sentiment_label = "偏多焦點"
                else:
                    sentiment = "neutral"
                    sentiment_label = "市場追蹤"

                if any(k in clean_title for k in ["配息", "除息", "填息", "殖利率", "月配", "季配"]):
                    category = "dividend"
                elif any(k in clean_title for k in ["00981A", "主動", "經理人"]):
                    category = "active"
                elif any(k in clean_title for k in ["成分股", "換股", "納入", "剔除", "權重"]):
                    category = "rebalance"
                else:
                    category = "macro"

                news_items.append({
                    "id": f"live-{idx+1}",
                    "title": clean_title,
                    "link": link,
                    "pubDate": pubDate,
                    "source": source,
                    "sentiment": sentiment,
                    "sentimentLabel": sentiment_label,
                    "category": category,
                    "impact": "即時追蹤四強 ETF（0050、0056、00981A、00940）成分股權重與資金籌碼脈動"
                })
    except Exception as e:
        print(f"Error fetching news RSS: {e}")

    return news_items


def main():
    json_path = os.path.join(DIR, "latest_data.json")
    prev_data = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                prev_data = json.load(f)
        except Exception:
            prev_data = {}

    print("1. Fetching ETF Big 4 with Technicals & Dividends (0050, 0056, 00981A, 00940)...")
    etfs = {}
    for code, sym in ETF_SYMBOLS.items():
        etfs[code] = fetch_quote_with_technicals(sym, include_technicals=True, include_dividends=True)

    print("2. Fetching Global Indices, TSMC & Macro Rates...")
    idx_tw = fetch_quote_with_technicals("^TWII", include_technicals=False)
    idx_us = fetch_quote_with_technicals("^GSPC", include_technicals=False)
    idx_sox = fetch_quote_with_technicals("^SOX", include_technicals=False)
    idx_jp = fetch_quote_with_technicals("^N225", include_technicals=False)
    bench_2330 = fetch_quote_with_technicals("2330.TW", include_technicals=True)
    fx_usdtwd = fetch_quote_with_technicals("TWD=X", include_technicals=False)
    us_10y = fetch_quote_with_technicals("^TNX", include_technicals=False)

    print("3. Fetching TWSE Institutional Investors (T86)...")
    institutional = fetch_twse_t86()
    if not institutional and prev_data.get("institutional"):
        institutional = prev_data["institutional"]

    print("4. Fetching Real Weekly Historical Series (1Y & 2Y)...")
    history_1y = build_aligned_history("1y") or prev_data.get("history", {}).get("1Y")
    history_2y = build_aligned_history("2y") or prev_data.get("history", {}).get("2Y")

    print("5. Fetching live ETF news...")
    news = fetch_etf_news()

    output_data = {
        "last_updated": get_tw_now(),
        "etfs": etfs,
        "tw_benchmarks": {
            "2330": bench_2330
        },
        "global_indices": {
            "tw": idx_tw,
            "us": idx_us,
            "sox": idx_sox,
            "jp": idx_jp
        },
        "macro": {
            "usd_twd": fx_usdtwd,
            "us_10y": us_10y
        },
        "institutional": institutional,
        "history": {
            "1Y": history_1y,
            "2Y": history_2y
        },
        "live_news": news
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    js_path = os.path.join(DIR, "latest_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.__ETF_EMBEDDED_DATA__ = ")
        json.dump(output_data, f, ensure_ascii=False)
        f.write(";\n")

    print(f"Successfully generated {json_path} and {js_path}")
    for code in ["0050", "0056", "00981A", "00940"]:
        s = etfs[code]
        t = s.get("technicals", {})
        d = s.get("dividend_1y", {})
        print(f"{code:6s}: {s.get('price')} ({s.get('change_percent')}%) | MA20: {t.get('ma20')} | RSI: {t.get('rsi14')} | 1Y Div: {d.get('total_amount')} ({d.get('trailing_yield_pct')}%)")
    print(f"TSMC: {bench_2330.get('price')} | SOX: {idx_sox.get('price')} | USD/TWD: {fx_usdtwd.get('price')} | US10Y: {us_10y.get('price')}%")
    print(f"Institutional rows: {len(institutional)} | News items: {len(news)}")


if __name__ == '__main__':
    main()
