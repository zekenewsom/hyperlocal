export function microprice(bid:number, bidSz:number, ask:number, askSz:number){
  const denom = bidSz + askSz; if (denom<=0) return Number.NaN;
  return (ask*bidSz + bid*askSz)/denom;
}
export function obiTop(bids: Array<{price:number,size:number}>, asks: Array<{price:number,size:number}>, N=5){
  const sb = bids.slice(0,N).reduce((s,l)=>s+l.size,0);
  const sa = asks.slice(0,N).reduce((s,l)=>s+l.size,0);
  const den = sb+sa; return den>0 ? (sb - sa)/den : 0;
}
export function obiCum(bids: Array<{price:number,size:number}>, asks: Array<{price:number,size:number}>){
  const sb = bids.reduce((s,l)=>s+l.size,0);
  const sa = asks.reduce((s,l)=>s+l.size,0);
  const den = sb+sa; return den>0 ? (sb - sa)/den : 0;
}
export function cvdUpdate(prev:number, trades: Array<{side:'buy'|'sell'|'undetermined', size:number}>){
  let v = prev;
  for (const t of trades) { if (t.side==='buy') v += t.size; else if (t.side==='sell') v -= t.size; }
  return v;
}

