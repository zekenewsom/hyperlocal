'use client';
import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, CandlestickSeries } from 'lightweight-charts';

type Candle = { t:number; open:number; high:number; low:number; close:number; volume:number; };
type Feat = { t:number; rsi:number; atr:number; ewvol:number; vol_z:number; stoch_k:number; stoch_d:number; cvd?: number; ema_s?: number; ema_l?: number };

export default function Explorer(){
  const [coin,setCoin]=useState('BTC'); const [itv,setItv]=useState('1m');
  const [cd,setCd]=useState<Candle[]>([]); const [ft,setFt]=useState<Feat[]>([]);
  const [loading,setLoading]=useState(false);
  const [hasMore,setHasMore]=useState(true);
  // no explicit bulk loading button; we hydrate all data automatically per interval

  function intervalSec(itv: string){
    switch(itv){ case '1m': return 60; case '5m': return 300; case '15m': return 900; case '1h': return 3600; case '4h': return 14400; case '1d': return 86400; default: return 60; }
  }
  const [show, setShow] = useState({ rsi:false, atr:false, ewvol:false, stoch:false, volz:false, cvd:false, ema12:false, ema26:false });
  const [cadenceSec, setCadenceSec] = useState<number|null>(null);
  const [timeSinceTick, setTimeSinceTick] = useState<number|null>(null);

  // Auto-hydrate all historical data upon coin/interval change

  async function fetchCandles(before?: number) {
    const params = new URLSearchParams({ coin, interval: itv, limit: String(5000) });
    if (before) params.set('before', String(before));
    const r = await fetch(`/api/data/candles?${params.toString()}`);
    if (!r.ok) return [] as Candle[];
    return (await r.json()) as Candle[];
  }
  async function fetchFeatures(before?: number) {
    const params = new URLSearchParams({ coin, interval: itv, limit: String(5000) });
    if (before) params.set('before', String(before));
    const r = await fetch(`/api/data/features?${params.toString()}`);
    if (!r.ok) return [] as Feat[];
    return (await r.json()) as Feat[];
  }

  useEffect(()=>{ (async ()=>{
    setLoading(true);
    try {
      const [c,f] = await Promise.all([ fetchCandles(), fetchFeatures() ]);
      setCd(c); setFt(f);
      setHasMore((c?.length ?? 0) > 0);
      // Fit after initial load
      if (chartRef.current) setTimeout(()=> chartRef.current!.timeScale().fitContent(), 0);
      // Background hydrate all older slices sequentially until exhausted
      let aborted = false;
      const currCoin = coin, currItv = itv;
      (async () => {
        // Maintain local merged maps to avoid races with React state
        const candleMap: Record<number, Candle> = {};
        for (const it of c) candleMap[it.t] = it;
        const featMap: Record<number, Feat> = {};
        for (const it of f) featMap[it.t] = it;
        let batches = 0;
        while (!aborted) {
          if (coin !== currCoin || itv !== currItv) { aborted = true; break; }
          const timesC = Object.keys(candleMap);
          const timesF = Object.keys(featMap);
          let earliestC = Number.POSITIVE_INFINITY;
          for (let i=0;i<timesC.length;i++){ const v = Number(timesC[i]); if (v<earliestC) earliestC=v; }
          let earliestF = Number.POSITIVE_INFINITY;
          for (let i=0;i<timesF.length;i++){ const v = Number(timesF[i]); if (v<earliestF) earliestF=v; }
          const earliest = Math.min(earliestC, earliestF);
          if (!Number.isFinite(earliest)) break;
          const before = (earliest as number) - 1;
          const [olderC, olderF] = await Promise.all([
            fetchCandles(before),
            fetchFeatures(before),
          ]);
          const got = (olderC?.length ?? 0) + (olderF?.length ?? 0);
          if (got === 0) break;
          if (olderC && olderC.length) for (const it of olderC) candleMap[it.t] = it;
          if (olderF && olderF.length) for (const it of olderF) featMap[it.t] = it;
          batches++;
          if (batches >= 200) { console.warn('[explorer] stopped auto-hydrate after 200 batches'); break; }
        }
        // Publish the merged results once
        const asc = Object.values(candleMap).sort((a:any,b:any)=> a.t - b.t) as Candle[];
        setCd(asc);
        if (priceRef.current) priceRef.current.setData(asc.map(cc=> ({ time: cc.t >= 1e12 ? Math.trunc(cc.t/1000) : cc.t, open:cc.open, high:cc.high, low:cc.low, close:cc.close })));
        const ascF = Object.values(featMap).sort((a:any,b:any)=> a.t - b.t) as Feat[];
        setFt(ascF);
        setHasMore(false);
        if (!aborted && chartRef.current) chartRef.current.timeScale().fitContent();
      })();
    } finally { setLoading(false); }
  })(); }, [coin,itv]);

  const containerRef = useRef<HTMLDivElement|null>(null);
  const chartRef = useRef<any>(null);
  const priceRef = useRef<any>(null);
  const rsiRef = useRef<any>(null);
  const ewvolRef = useRef<any>(null);
  const atrRef = useRef<any>(null);
  const stochKRef = useRef<any>(null);
  const stochDRef = useRef<any>(null);
  const cvdRef = useRef<any>(null);
  const emaSRef = useRef<any>(null);
  const emaLRef = useRef<any>(null);
  const adjustingRangeRef = useRef(false);

  const fetchingOlderRef = useRef(false);
  const hasMoreRef = useRef(true);
  useEffect(()=> { hasMoreRef.current = hasMore; }, [hasMore]);

  useEffect(()=> {
    if(!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: 600,
      layout: { textColor: '#ddd', background: { color: '#0a0a0a' } },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      rightPriceScale: { borderVisible: false } as any,
      timeScale: { borderVisible: false } as any,
    });
    chartRef.current = chart;
    const price = chart.addSeries(CandlestickSeries); priceRef.current = price;
    // Hide last-value and price lines to avoid horizontal overlays
    price.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
    // Subscribe to left-edge scroll for auto-load older
    const onRange = (range: any) => {
      if (!range || adjustingRangeRef.current || fetchingOlderRef.current || !hasMoreRef.current || !priceRef.current) return;
      const earliestC = (cd.length ? cd[0]!.t : null);
      const earliestF = (ft.length ? ft[0]!.t : null);
      const earliest = Math.min(earliestC ?? Number.POSITIVE_INFINITY, earliestF ?? Number.POSITIVE_INFINITY);
      const from = (range.from ?? null) as number | null;
      const marginBars = 20; // hysteresis: prefetch ~20 bars before exact edge
      const thresh = intervalSec(itv) * marginBars;
      if (Number.isFinite(earliest) && from && from <= (earliest + thresh)) {
        // Load older slice before earliest
        fetchingOlderRef.current = true; setLoading(true);
        const before = earliest - 1;
        const prevRange = chartRef.current?.timeScale().getVisibleRange();
        Promise.all([ fetchCandles(before), fetchFeatures(before) ]).then(([olderC, olderF])=>{
          if ((olderC?.length ?? 0) === 0 && (olderF?.length ?? 0) === 0) { setHasMore(false); return; }
          // Merge candles
          let deltaBars = 0;
          if ((olderC?.length ?? 0) > 0) {
            const merged = [...olderC, ...cd].reduce((acc: Record<number,Candle>, x)=>{ acc[x.t]=x; return acc; }, {} as any);
            const asc = Object.values(merged).sort((a:any,b:any)=> a.t - b.t) as Candle[];
            // estimate newly revealed bars from earliest shift
            const newEarliest = asc.length ? asc[0]!.t : earliest;
            if (Number.isFinite(newEarliest) && Number.isFinite(earliest)) {
              deltaBars = Math.max(0, Math.round(((earliest as number) - (newEarliest as number)) / intervalSec(itv)));
            }
            setCd(asc);
            priceRef.current!.setData(asc.map(c=> ({ time: c.t >= 1e12 ? Math.trunc(c.t/1000) : c.t, open:c.open, high:c.high, low:c.low, close:c.close })));
          }
          // Merge features
          if ((olderF?.length ?? 0) > 0) {
            const mergedF = [...olderF, ...ft].reduce((acc: Record<number,Feat>, x)=>{ acc[x.t]=x; return acc; }, {} as any);
            const ascF = Object.values(mergedF).sort((a:any,b:any)=> a.t - b.t) as Feat[];
            setFt(ascF);
          }
          // Gently extend visible range to include new left-side bars
          if (prevRange && deltaBars > 0) {
            const shift = intervalSec(itv) * deltaBars;
            adjustingRangeRef.current = true;
            chartRef.current?.timeScale().setVisibleRange({ from: (prevRange.from ?? 0) - shift, to: prevRange.to });
            // release guard next tick
            setTimeout(()=> { adjustingRangeRef.current = false; }, 0);
          }
        }).finally(()=> { fetchingOlderRef.current = false; setLoading(false); });
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    return ()=> { chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange); chart.remove(); };
  }, []);

  useEffect(()=> {
    if (!priceRef.current) return;
    const toSec = (t:number) => t >= 1e12 ? Math.trunc(t/1000) : Math.trunc(t);
    const isFiniteNum = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
    // Ensure ascending times and unique per-second timestamps
    const cds = [...cd].sort((a,b)=> a.t - b.t);
    // Sanitize outliers: compute median of recent closes
    const closes = cds.map(x=> x.close).filter(Number.isFinite);
    const recent = closes.slice(-200);
    const arr = recent.length ? recent : closes;
    const sorted = [...arr].sort((a,b)=> a-b);
    const median: number = sorted.length ? Number(sorted[Math.floor(sorted.length/2)] ?? NaN) : NaN;
    const loCut = Number.isFinite(median) ? median/10 : -Infinity;
    const hiCut = Number.isFinite(median) ? median*10 : Infinity;
    const filtered = cds.filter(x=> x.high>=x.low && x.close>=loCut && x.close<=hiCut);
    const dropped = cds.length - filtered.length;
    if (dropped>0) console.log(`[explorer] dropped ${dropped} outlier bars (median=${Number.isFinite(median) ? median.toFixed(2) : 'NaN'})`);
    const priceData: any[] = [];
    let lastTs: number | null = null;
    for (const c of filtered) {
      const ts = toSec(c.t);
      if (lastTs !== null && ts === lastTs) continue;
      priceData.push({ time: ts, open:c.open, high:c.high, low:c.low, close:c.close });
      lastTs = ts;
    }
    priceRef.current.setData(priceData);
    // Compute median cadence from latest bars
    if (filtered.length >= 2) {
      const ts = filtered.map(x=> toSec(x.t));
      const diffs: number[] = [];
      for (let i = 1; i < ts.length; i++) diffs.push(ts[i]! - ts[i-1]!);
      const slice = diffs.slice(-50).filter((d)=> Number.isFinite(d) && d>0);
      const srt = slice.sort((a,b)=> a-b);
      const med = srt.length ? srt[Math.floor(srt.length/2)]! : null;
      setCadenceSec(med ?? null);
    } else {
      setCadenceSec(null);
    }
    // EMA 12 overlay on price pane
    if (show.ema12) {
      if (!emaSRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2 }, 0);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        emaSRef.current = s;
      }
      if (emaSRef.current) {
        const data: any[] = [];
        let last: number | null = null;
        for (const f of [...ft].sort((a,b)=> a.t - b.t)) {
          if (!isFiniteNum(f.ema_s)) continue;
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          data.push({ time: ts, value: f.ema_s as number });
          last = ts;
        }
        emaSRef.current.setData(data);
      }
    } else if (emaSRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(emaSRef.current);
      emaSRef.current = null;
    }

    // EMA 26 overlay on price pane
    if (show.ema26) {
      if (!emaLRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 2 }, 0);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        emaLRef.current = s;
      }
      if (emaLRef.current) {
        const data: any[] = [];
        let last: number | null = null;
        for (const f of [...ft].sort((a,b)=> a.t - b.t)) {
          if (!isFiniteNum(f.ema_l)) continue;
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          data.push({ time: ts, value: f.ema_l as number });
          last = ts;
        }
        emaLRef.current.setData(data);
      }
    } else if (emaLRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(emaLRef.current);
      emaLRef.current = null;
    }

    // Manage RSI series lifecycle & data
    if (show.rsi) {
      if (!rsiRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#4ade80', lineWidth: 2 }, 1);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        rsiRef.current = s;
      }
      if (rsiRef.current) {
        const fts = [...ft].sort((a,b)=> a.t - b.t);
        const rsiData: any[] = [];
        let last: number | null = null;
        for (const f of fts) {
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          if (!isFiniteNum(f.rsi)) continue;
          rsiData.push({ time: ts, value: f.rsi as number });
          last = ts;
        }
        rsiRef.current.setData(rsiData);
      }
    } else if (rsiRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(rsiRef.current);
      rsiRef.current = null;
    }

    // Manage EWVol series lifecycle & data
    if (show.ewvol) {
      if (!ewvolRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2 }, 2);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        ewvolRef.current = s;
      }
      if (ewvolRef.current) {
        const fts = [...ft].sort((a,b)=> a.t - b.t);
        const ewData: any[] = [];
        let last: number | null = null;
        for (const f of fts) {
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          if (!isFiniteNum(f.ewvol)) continue;
          ewData.push({ time: ts, value: f.ewvol as number });
          last = ts;
        }
        ewvolRef.current.setData(ewData);
      }
    } else if (ewvolRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(ewvolRef.current);
      ewvolRef.current = null;
    }

    // Manage ATR series
    if (show.atr) {
      if (!atrRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#eab308', lineWidth: 2 }, 2);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        atrRef.current = s;
      }
      if (atrRef.current) {
        const ats: any[] = [];
        let last: number | null = null;
        for (const f of [...ft].sort((a,b)=> a.t - b.t)) {
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          if (!isFiniteNum(f.atr)) continue;
          ats.push({ time: ts, value: f.atr as number });
          last = ts;
        }
        atrRef.current.setData(ats);
      }
    } else if (atrRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(atrRef.current);
      atrRef.current = null;
    }

    // Manage Stochastic %K and %D series
    if (show.stoch) {
      if (!stochKRef.current && chartRef.current) {
        const k = chartRef.current.addSeries(LineSeries, { color: '#0ea5e9', lineWidth: 1 }, 2);
        k.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        stochKRef.current = k;
      }
      if (!stochDRef.current && chartRef.current) {
        const d = chartRef.current.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 1, lineStyle: 1 }, 2);
        d.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        stochDRef.current = d;
      }
      if (stochKRef.current && stochDRef.current) {
        const kData: any[] = [];
        const dData: any[] = [];
        let last: number | null = null;
        for (const f of [...ft].sort((a,b)=> a.t - b.t)) {
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          if (isFiniteNum(f.stoch_k)) kData.push({ time: ts, value: f.stoch_k as number });
          if (isFiniteNum(f.stoch_d)) dData.push({ time: ts, value: f.stoch_d as number });
          last = ts;
        }
        stochKRef.current.setData(kData);
        stochDRef.current.setData(dData);
      }
    } else {
      if (stochKRef.current && chartRef.current) { chartRef.current?.removeSeries?.(stochKRef.current); stochKRef.current = null; }
      if (stochDRef.current && chartRef.current) { chartRef.current?.removeSeries?.(stochDRef.current); stochDRef.current = null; }
    }

    // Manage CVD series (volume delta)
    if (show.cvd) {
      if (!cvdRef.current && chartRef.current) {
        const s = chartRef.current.addSeries(LineSeries, { color: '#f87171', lineWidth: 2 }, 1);
        s.applyOptions({ lastValueVisible: false, priceLineVisible: false } as any);
        cvdRef.current = s;
      }
      if (cvdRef.current) {
        const data: any[] = [];
        let last: number | null = null;
        for (const f of [...ft].sort((a,b)=> a.t - b.t)) {
          const ts = toSec(f.t);
          if (last !== null && ts === last) continue;
          const val = isFiniteNum(f.cvd) ? (f.cvd as number) : null;
          if (val === null) continue;
          data.push({ time: ts, value: val });
          last = ts;
        }
        cvdRef.current.setData(data);
      }
    } else if (cvdRef.current && chartRef.current) {
      chartRef.current?.removeSeries?.(cvdRef.current);
      cvdRef.current = null;
    }
    // After setting data, keep current view
  }, [cd, ft, show]);

  // Poll ingestor status to compute time since last WS message
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const r = await fetch('/api/ingestor/status', { cache: 'no-store' });
        if (!mounted) return;
        if (r.ok) {
          const st = await r.json();
          if (st?.lastMessageTimestamp) {
            setTimeSinceTick(Date.now() - Number(st.lastMessageTimestamp));
          } else {
            setTimeSinceTick(null);
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Smoothly advance the display timer
  useEffect(() => {
    if (timeSinceTick === null) return;
    const id = setInterval(() => {
      setTimeSinceTick((prev) => (prev !== null ? prev + 500 : null));
    }, 500);
    return () => clearInterval(id);
  }, [timeSinceTick === null]);

  return (
    <main className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Asset Explorer</h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            timeSinceTick === null ? 'bg-neutral-600' :
            (timeSinceTick < 5000 ? 'bg-emerald-500 animate-pulse' : timeSinceTick < 15000 ? 'bg-yellow-500' : 'bg-red-500')
          }`} />
          <span className="text-sm text-neutral-400">
            {timeSinceTick === null ? 'Ingestor offline' : `Live tick: ${(timeSinceTick/1000).toFixed(1)}s ago`}
          </span>
        </div>
      </div>
      <div className="flex gap-3 items-center">
        <label>Coin</label>
        <select value={coin} onChange={e=>setCoin(e.target.value)} className="bg-neutral-900 rounded px-2 py-1">
          <option>BTC</option>
        </select>
        <label>Interval</label>
        <select value={itv} onChange={e=>setItv(e.target.value)} className="bg-neutral-900 rounded px-2 py-1">
          {['1m','5m','15m','1h','4h','1d'].map(x=>
            <option key={x}>{x}</option>
          )}
        </select>
        
        <div className="ml-6 flex gap-3 text-sm flex-wrap">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.ema12} onChange={e=>setShow(s=>({...s,ema12:e.target.checked}))}/>EMA 12</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.ema26} onChange={e=>setShow(s=>({...s,ema26:e.target.checked}))}/>EMA 26</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.stoch} onChange={e=>setShow(s=>({...s,stoch:e.target.checked}))}/>Stochastic</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.rsi} onChange={e=>setShow(s=>({...s,rsi:e.target.checked}))}/>RSI</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.atr} onChange={e=>setShow(s=>({...s,atr:e.target.checked}))}/>ATR</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.ewvol} onChange={e=>setShow(s=>({...s,ewvol:e.target.checked}))}/>EWVol</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={show.cvd} onChange={e=>setShow(s=>({...s,cvd:e.target.checked}))}/>CVD</label>
        </div>
      </div>
      {cadenceSec && (
        <div className="text-xs text-neutral-400">Live cadence ≈ {cadenceSec >= 60 ? `${Math.round(cadenceSec/60)}m` : `${cadenceSec}s`} (from recent bars)</div>
      )}
      <div ref={containerRef} className="rounded-xl border border-neutral-800 overflow-hidden" />
      {loading && <div className="text-neutral-400 text-sm">Loading older data…</div>}
      <p className="text-neutral-400 text-sm">Toggle overlays; indicators are computed from HL bars. Stoch default is on.</p>
    </main>
  );
}
