// Contrarian hourly dip-buyer for cbBTC/USDC.
//
// Idea, in one paragraph: one-minute cbBTC prices are noisy, but the hourly
// returns in the dev window are mean-reverting (lag-1 autocorrelation about
// -0.36): an hour that falls hard tends to be followed by a bounce, and an
// hour that jumps tends to give some of it back. So this bot does almost
// nothing most of the time. Once an hour, on the UTC hour close, it looks at
// the last 60 minutes: if the price fell more than 0.4% it buys with all its
// cash, then waits for the bounce. It sells when the position is up 1% over
// its cost (take profit, checked every minute), when it is down 2% (stop
// loss, a safety net that never fired on the dev window), or on the next
// UTC hour close whose 60-minute return is up more than 0.4%. That is the
// whole strategy: four round trips on the dev window, no leverage, long only.
//
// Why not trend following or fast mean reversion: I backtested both on the
// published dev window with an exact replica of the fill math (4 bps fee,
// 2 bps slippage, constant-product impact on the bar's open depth). Every
// EMA-cross variant lost money (EMA 8/21: -$106 on 68 trades), every
// trailing-stop variant lost money, and every rolling (every-minute)
// mean-reversion variant lost money. The 1-minute noise (about 6 bps) is
// bigger than the edge at short horizons, and a full round trip costs about
// 26 bps, so frequent trading just pays fees. The only things that made
// money on dev were buy-and-hold (+$1.07), the momentum baseline (+$2.45)
// and this hourly contrarian (+$11.62 on the official grade-local).
//
// Determinism: every comparison is BigInt arithmetic on the closes the
// harness sends (no floats, no randomness, no clock, no files, no
// environment). The same bars give the same orders, run after run.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 60; // bars in the lookback hour
// Buy when the 60-minute return is below -0.4%: close * 1000 < close60 * 996.
const DOWN_NUM = 996n;
// Sell when the 60-minute return is above +0.4%: close * 1000 > close60 * 1004.
const UP_NUM = 1004n;
// Take profit at +1.0% over the entry cost; stop loss at -2.0% under it.
const TP_NUM = 101n;
const SL_NUM = 98n;
const MAX_SLIPPAGE_BPS = 100; // 1% past the latest close, like the baselines
const MIN_NOTIONAL = 1_000_000n; // 1 USDC in quote units

// Closes seen so far, in bar order (warm-up bars included, so the 60-minute
// lookback is real prices even on the first scored bars).
const closes: bigint[] = [];

function sellAll(state: BarsState): SellInput[] {
  const held = state.positions.get(SYMBOL);
  if (held === undefined || held.qty === 0n) return [];
  return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    closes.push(BigInt(bar.c));
    if (state.warmingUp) return [];
    // The hour signal fires only on a bar that closes on a UTC hour boundary.
    const onHour = bar.t % 3600000 === 0;
    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      if (value * 100n >= cost * TP_NUM) return sellAll(state);
      if (value * 100n <= cost * SL_NUM) return sellAll(state);
      if (onHour && closes.length > WINDOW) {
        const prev = closes[closes.length - WINDOW - 1];
        const cur = closes[closes.length - 1];
        if (cur * 1000n > prev * UP_NUM) return sellAll(state);
      }
      return [];
    }
    if (onHour && closes.length > WINDOW) {
      const prev = closes[closes.length - WINDOW - 1];
      const cur = closes[closes.length - 1];
      if (cur * 1000n < prev * DOWN_NUM && state.cash >= MIN_NOTIONAL) {
        const buy: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [buy];
      }
    }
    return [];
  },
});
