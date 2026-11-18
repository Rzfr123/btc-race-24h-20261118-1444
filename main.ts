// DipFade120: a mean-reversion bot for make.fun btc-race-24h-20261118-1444.
//
// The dev day for this race (2026-11-17 14:45 UTC -> 2026-11-18 14:44 UTC,
// 1,440 one-minute cbBTC bars) is a falling day: buy-and-hold loses $28.00
// on $1,000, and the mean absolute 1-minute move is ~4 bps against ~26 bps
// of round-trip cost (4 bps fee + 2 bps slippage + pool impact, each way),
// so any bot trading on minute-scale signals churns itself to death. The
// money is in the multi-hour swings: the day's biggest 1-hour drop is
// -2.31% and its biggest 1-hour rise +1.19%, and prices keep snapping back
// toward their 2-hour mean.
//
// This bot therefore trades rarely, long only, against a 120-bar (2-hour)
// simple moving average of closes, kept as a running sum over a ring
// buffer so the mean costs O(1) per bar:
//
// - FLAT and the close is >= 1.2% below the 120-bar SMA: buy with all cash.
//   A dip that deep is far past the round-trip cost, so the reversion, when
//   it comes, pays several times over. The deeper 1.2% trigger (vs 0.8% on
//   the previous race's slower 240-bar mean) is what keeps the bot out of
//   the falling day's early legs: on this dev window the 240-bar fade loses
//   $17.09 while this one makes $18.53.
// - HOLDING and the close is >= 1.0% above the same SMA: sell everything,
//   banking the reversion past the mean.
// - HOLDING and the position is worth 1.5% under its cost: hard stop, sell
//   everything. It never fires on the dev window, but it caps the loss if
//   a dip keeps falling into a real trend instead of reverting. After a
//   stop-out the bot sits out the next 60 bars before buying again, so one
//   trend leg cannot trigger a chain of repeated stop-outs.
// - Otherwise hold through the chop, including flat bars.
//
// Offline sweep on the dev window (fills at the next open, 6 bps per side):
// the 120-bar window with dip 1.0-1.2% and spike 0.8-1.0% all net +$9.92 to
// +$18.53, and the chosen point is positive on both halves of the day
// (+$16.27 first half, +$2.22 second half). Slower windows (150-360 bars)
// lose on this window because their mean lags the downtrend; a 1.2% spike
// exit is too far and turns winners into losers. Trailing exits, a
// two-bar confirmation and end-of-window flattening were all tested and
// none improved the result, so the bot stays a pure fade.
//
// Determinism: decisions use only the closes the harness has sent, in
// float64, with no clock, no environment, no randomness and no network, so
// two runs on the same data produce the same orders.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 120; // bars behind the mean (2 hours of 1-minute bars)
const BUY_DIP_BPS = 120; // buy when close is >= 1.2% below the 120-bar SMA
const SELL_SPIKE_BPS = 100; // sell when close is >= 1.0% above the 120-bar SMA
const STOP_BPS = 150; // hard stop: sell when the position is 1.5% under cost
const MAX_SLIPPAGE_BPS = 100;
const STOP_COOLDOWN_BARS = 60; // after a stop-out, sit out 60 bars before buying again

// Bars seen so far, and the bar index of the most recent stop-loss exit
// (-1 when no stop has ever fired). A stop means the dip kept falling into
// a real trend instead of reverting, so the next dip leg is likely another
// leg of the same trend: re-buying into it immediately just repeats the
// loss. The cooldown costs nothing on the dev window (the stop never fires
// there) and only binds when the market has just proved the fade wrong.

// Ring buffer of the last WINDOW closes plus their running sum.
const ring: number[] = new Array<number>(WINDOW).fill(0);
let ringHead = 0;
let ringCount = 0;
let ringSum = 0;
let barIndex = 0;
let lastStopBar = -1;

function noteClose(price: number): void {
  if (ringCount < WINDOW) {
    ring[ringHead] = price;
    ringSum += price;
    ringHead = (ringHead + 1) % WINDOW;
    ringCount += 1;
  } else {
    ringSum -= ring[ringHead];
    ring[ringHead] = price;
    ringSum += price;
    ringHead = (ringHead + 1) % WINDOW;
  }
}

await runBars({
  onBatch(state, batch) {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) noteClose(Number(bar.c));
    }
    if (state.warmingUp || ringCount < WINDOW) return [];
    const mean = ringSum / WINDOW;
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const price = Number(close);
    const held = state.positions.get(SYMBOL);
    barIndex += 1;

    if (held === undefined) {
      // Flat: buy the dip, full size, once the close is far below the mean —
      // unless a stop-loss just fired and the cooldown is still running.
      const coolingDown = lastStopBar >= 0 && barIndex - lastStopBar <= STOP_COOLDOWN_BARS;
      if (!coolingDown && price * 10000 <= mean * (10000 - BUY_DIP_BPS)) {
        let notional = state.cash;
        const room = state.weightRoom(SYMBOL);
        if (room < notional) notional = room;
        if (notional === 0n || notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        const order: BuyInput = {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: notional,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [order];
      }
      return [];
    }

    // Holding: bank the reversion past the mean, or cut at the hard stop.
    const value = state.value(SYMBOL, held.qty);
    const underStop = value * 10000n <= held.cost * BigInt(10000 - STOP_BPS);
    if (price * 10000 >= mean * (10000 + SELL_SPIKE_BPS) || underStop) {
      if (underStop) lastStopBar = barIndex;
      const order: SellInput = {
        side: 'sell',
        symbol: SYMBOL,
        qty: held.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      };
      return [order];
    }
    return [];
  },
});
