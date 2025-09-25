import type { Interval } from '@hyperlocal/types';

export function intervalToMs(i: Interval): number {
  switch(i){
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1d': return 86_400_000;
    default: return 0 as never;
  }
}

