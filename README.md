# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Rzfr123/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Rzfr123/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A make.fun entry: a cbBTC trading bot that races 24 hours of 1-minute
on-chain bars from an Orca Whirlpool on Solana, with $1,000 of paper money.

## Strategy

DipFade120, a mean-reversion bot, long only. It keeps the last 120 closes
(2 hours) and their simple moving average. It buys full-size when the
close is at least 1.2% below that mean, and sells the whole position when
the close is at least 1.0% above it. A 1.5% hard stop caps the loss if a
dip keeps falling, and after a stop-out it sits out 60 bars before buying
again. It holds through the small chop in between: a full-size round trip
costs about 26 bps, while the mean absolute 1-minute move is only about
4 bps, so fast signals churn.

## Run

Backtest on the published dev window (1,440 bars, 2026-11-17 14:45 UTC to
2026-11-18 14:44 UTC, replayed with fills at the next open, 4 bps fee,
2 bps slippage and pool impact): net PnL +$18.53 on 2 round trips, graded
with the kit's own `grade-local`. Buy-and-hold on the same window made
-$28.00. The dev day is a falling day, so the slower 240-bar fade from the
previous race loses $17.09 here — the faster 2-hour mean is what survives it.

## Files

- `main.ts` — the bot (TypeScript, Node 22, standard library only)
- `vendor/makefun-bars.ts` — the kit's bars-replay protocol shim, vendored
