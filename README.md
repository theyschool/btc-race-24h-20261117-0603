# BTC Dip Buyer

A contrarian hourly dip-buying bot for cbBTC/USDC on make.fun's
`btc-race-24h-20261117-0603` ("Race a BTC trading bot live for 24 hours").

## Strategy

One-minute cbBTC prices are noisy, but hourly returns in the dev window are
mean-reverting (lag-1 autocorrelation about -0.36): an hour that falls hard
tends to bounce, and an hour that jumps tends to give some back. So the bot
trades rarely:

- Once an hour, on the UTC hour close, it checks the last 60 minutes. If the
  price fell more than 0.4%, it buys with all its cash.
- It sells when the position is up 1.0% over its entry cost (take profit,
  checked every minute), down 2.0% (stop loss, a safety net), or on the next
  UTC hour close whose 60-minute return is up more than 0.4%.

Long only, no leverage, one position, at most one order per reply. Every
comparison is integer arithmetic on the closes the harness sends — no floats,
no randomness, no clock, no files, no environment — so two runs produce
identical action logs.

## Dev-window result (kit grade-local)

Net PnL **+$11.62** on the published 24h dev window (1,440 bars), 3 round
trips, max drawdown 1.32%, zero rejected orders, deterministic (the two
grade-local runs reproduce byte for byte).
For comparison on the same window: buy-and-hold +$1.07, momentum baseline
+$2.45, EMA-cross 8/21 -$106.21.

## Files

- `main.ts` — the bot (Node 22, standard library only)
- `vendor/makefun-bars.ts` — the kit's protocol shim, copied byte-for-byte
  from the kit's `sdk/makefun-bars.ts`
- `LICENSE` — MIT

## Run it locally

```
node cli/makefun.mjs grade-local --kit <kit dir> --bot . --driver process
```
