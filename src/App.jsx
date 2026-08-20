import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const SUITS = ["s", "h", "d", "c"];
const SUIT_SYMBOL = { s: "\u2660", h: "\u2665", d: "\u2666", c: "\u2663" };
const SUIT_RED = { s: false, h: true, d: true, c: false };
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const RANK_NAME = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
const RANK_PLURAL = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
  8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces",
};
const rankLabel = (r) => RANK_LABEL[r] || String(r);
const cardText = (c) => `${rankLabel(c.rank)}${c.suit}`;

const SEAT_NAMES = ["You", "Ace", "Deuce", "Trey", "Chris", "Mike"];
const STARTING_STACK = 1500;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s, id: `${r}${s}` });
  return deck;
}
function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function combinations(arr, k) {
  const results = [];
  const combo = [];
  function helper(start) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); helper(i + 1); combo.pop(); }
  }
  helper(0);
  return results;
}
function evaluate5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const uniqueRanks = [...new Set(ranks)];
  let isStraight = false, straightHigh = 0;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) { isStraight = true; straightHigh = uniqueRanks[0]; }
    else if (uniqueRanks.join(",") === "14,5,4,3,2") { isStraight = true; straightHigh = 5; }
  }
  const countMap = {};
  ranks.forEach((r) => (countMap[r] = (countMap[r] || 0) + 1));
  const groups = Object.entries(countMap)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  let category, tb = [];
  if (isStraight && isFlush) { category = 9; tb = [straightHigh]; }
  else if (groups[0].count === 4) { category = 8; tb = [groups[0].rank, groups[1].rank]; }
  else if (groups[0].count === 3 && groups[1] && groups[1].count >= 2) { category = 7; tb = [groups[0].rank, groups[1].rank]; }
  else if (isFlush) { category = 6; tb = [...ranks]; }
  else if (isStraight) { category = 5; tb = [straightHigh]; }
  else if (groups[0].count === 3) { category = 4; tb = [groups[0].rank, ...groups.slice(1).map((g) => g.rank)]; }
  else if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
    const pairs = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    category = 3; tb = [pairs[0], pairs[1], groups[2].rank];
  } else if (groups[0].count === 2) { category = 2; tb = [groups[0].rank, ...groups.slice(1).map((g) => g.rank)]; }
  else { category = 1; tb = [...ranks]; }
  while (tb.length < 5) tb.push(0);
  return { score: [category, ...tb], category, tb };
}
function compareScore(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function best7(cards7) {
  let best = null;
  for (const c of combinations(cards7, 5)) {
    const res = evaluate5(c);
    if (!best || compareScore(res.score, best.score) > 0) best = { ...res, cards: c };
  }
  return best;
}
function computeEquity(myHole, oppHoles, board, trials) {
  // Cost per trial scales with (opponents + 1) hand evaluations. Scale trial count down as the
  // table gets bigger so a 6-max equity check doesn't take 5x as long as a heads-up one did.
  if (trials === undefined) trials = Math.max(120, Math.round(800 / (oppHoles.length + 1)));
  if (!oppHoles.length) return 1;
  const known = new Set([...myHole, ...oppHoles.flat(), ...board].map((c) => c.id));
  const deckRemain = [];
  for (const s of SUITS) for (const r of RANKS) { const id = `${r}${s}`; if (!known.has(id)) deckRemain.push({ rank: r, suit: s, id }); }
  const need = 5 - board.length;
  const shareForBoard = (fullBoard) => {
    const myScore = best7([...myHole, ...fullBoard]).score;
    const oppScores = oppHoles.map((h) => best7([...h, ...fullBoard]).score);
    let top = myScore;
    for (const s of oppScores) if (compareScore(s, top) > 0) top = s;
    if (compareScore(myScore, top) < 0) return 0;
    const tiedCount = 1 + oppScores.filter((s) => compareScore(s, top) === 0).length;
    return 1 / tiedCount;
  };
  if (need === 0) return shareForBoard(board);
  let sum = 0;
  for (let t = 0; t < trials; t++) {
    const pool = [...deckRemain];
    const drawn = [];
    for (let k = 0; k < need; k++) {
      const idx = Math.floor(Math.random() * pool.length);
      drawn.push(pool[idx]);
      pool.splice(idx, 1);
    }
    sum += shareForBoard([...board, ...drawn]);
  }
  return sum / trials;
}

// Draw a plausible 2-card hand from the remaining deck whose Chen percentile falls within
// [minPct, maxPct] — used to sample what an opponent's range plausibly contains, without ever
// looking at their real cards. Falls back to any two cards if nothing in range is found quickly.
function sampleRangeHand(pool, minPct, maxPct, maxAttempts = 25) {
  for (let i = 0; i < maxAttempts && pool.length >= 2; i++) {
    const i1 = Math.floor(Math.random() * pool.length);
    let i2 = Math.floor(Math.random() * pool.length);
    while (i2 === i1) i2 = Math.floor(Math.random() * pool.length);
    const c1 = pool[i1], c2 = pool[i2];
    const { percentile } = preflopPercentile([c1, c2]);
    if (percentile >= minPct && percentile <= maxPct) return [c1, c2];
  }
  const i1 = Math.floor(Math.random() * pool.length);
  let i2 = Math.floor(Math.random() * pool.length);
  while (i2 === i1 && pool.length > 1) i2 = Math.floor(Math.random() * pool.length);
  return [pool[i1], pool[i2]];
}

// The bot-facing equity function: unlike computeEquity, this NEVER sees a real opponent card.
// Each opponent's hand is sampled fresh per trial from the range implied by their actions this
// hand (see inferOpponentRange), drawing only from cards not already known or assigned —
// which also means card removal (blockers) is automatically correct, for free.
function computeEquityInferred(myHole, opponentRanges, board, trials) {
  if (!opponentRanges.length) return 1;
  if (trials === undefined) trials = Math.max(90, Math.round(600 / (opponentRanges.length + 1)));
  const knownFixed = new Set([...myHole, ...board].map((c) => c.id));
  const baseDeck = [];
  for (const s of SUITS) for (const r of RANKS) { const id = `${r}${s}`; if (!knownFixed.has(id)) baseDeck.push({ rank: r, suit: s, id }); }
  const need = 5 - board.length;
  let sum = 0;
  for (let t = 0; t < trials; t++) {
    let pool = [...baseDeck];
    const oppHands = [];
    for (const range of opponentRanges) {
      const hand = sampleRangeHand(pool, range.min, range.max);
      oppHands.push(hand);
      const usedIds = new Set(hand.map((c) => c.id));
      pool = pool.filter((c) => !usedIds.has(c.id));
    }
    const drawn = [];
    for (let k = 0; k < need; k++) {
      const idx = Math.floor(Math.random() * pool.length);
      drawn.push(pool[idx]);
      pool.splice(idx, 1);
    }
    const fullBoard = [...board, ...drawn];
    const myScore = bestHand([...myHole, ...fullBoard]).score;
    const oppScores = oppHands.map((h) => bestHand([...h, ...fullBoard]).score);
    let top = myScore;
    for (const s of oppScores) if (compareScore(s, top) > 0) top = s;
    if (compareScore(myScore, top) < 0) continue;
    const tiedCount = 1 + oppScores.filter((s) => compareScore(s, top) === 0).length;
    sum += 1 / tiedCount;
  }
  return sum / trials;
}

function handName(res) {
  const { category, tb } = res;
  switch (category) {
    case 9: return tb[0] === 14 ? "Royal flush" : "Straight flush";
    case 8: return `Four of a kind, ${RANK_PLURAL[tb[0]]}`;
    case 7: return `Full house, ${RANK_PLURAL[tb[0]]} over ${RANK_PLURAL[tb[1]]}`;
    case 6: return "Flush";
    case 5: return "Straight";
    case 4: return `Three of a kind, ${RANK_PLURAL[tb[0]]}`;
    case 3: return `Two pair, ${RANK_PLURAL[tb[0]]} and ${RANK_PLURAL[tb[1]]}`;
    case 2: return `Pair of ${RANK_PLURAL[tb[0]]}`;
    default: return `${RANK_NAME[tb[0]]} high`;
  }
}

// Chen formula: a well-established quick heuristic for starting hand strength.
// Not a literal solved-game GTO chart (real GTO ranges depend on position and stack depth),
// but a standard, widely-used approximation that gives a real numeric score per hand.
function chenScore(hole) {
  const [a, b] = hole;
  const hi = Math.max(a.rank, b.rank), lo = Math.min(a.rank, b.rank);
  const cardPts = { 14: 10, 13: 8, 12: 7, 11: 6, 10: 5 };
  let pts = cardPts[hi] !== undefined ? cardPts[hi] : hi / 2;
  if (hi === lo) return Math.max(pts * 2, 5);
  const suited = a.suit === b.suit;
  const gap = hi - lo - 1;
  if (suited) pts += 2;
  if (gap === 1) pts -= 1;
  else if (gap === 2) pts -= 2;
  else if (gap === 3) pts -= 4;
  else if (gap >= 4) pts -= 5;
  if (gap <= 1 && hi < 12) pts += 1;
  return Math.max(Math.round(pts), 0);
}

// Precompute the percentile of every one of the 169 canonical starting hands by Chen score,
// so a dealt hand can be shown as "better than X% of starting hands" rather than a vague label.
const CHEN_PERCENTILES = (() => {
  const samples = [];
  for (let hi = 2; hi <= 14; hi++) {
    for (let lo = 2; lo <= hi; lo++) {
      if (hi === lo) samples.push({ key: `${hi}p`, score: chenScore([{ rank: hi, suit: "s" }, { rank: lo, suit: "s" }]) });
      else {
        samples.push({ key: `${hi}-${lo}s`, score: chenScore([{ rank: hi, suit: "s" }, { rank: lo, suit: "s" }]) });
        samples.push({ key: `${hi}-${lo}o`, score: chenScore([{ rank: hi, suit: "s" }, { rank: lo, suit: "h" }]) });
      }
    }
  }
  const sorted = [...samples].sort((x, y) => x.score - y.score);
  const map = {};
  sorted.forEach((s, i) => { map[s.key] = Math.round((i / (sorted.length - 1)) * 100); });
  return map;
})();
function preflopPercentile(hole) {
  const [a, b] = hole;
  const hi = Math.max(a.rank, b.rank), lo = Math.min(a.rank, b.rank);
  const key = hi === lo ? `${hi}p` : `${hi}-${lo}${a.suit === b.suit ? "s" : "o"}`;
  return { score: chenScore(hole), percentile: CHEN_PERCENTILES[key] ?? 50 };
}

// Generalized "best 5-card hand" for any 5, 6, or 7 known cards (flop, turn, or river).
function bestHand(cards) {
  if (cards.length === 5) return evaluate5(cards);
  let best = null;
  for (const c of combinations(cards, 5)) {
    const res = evaluate5(c);
    if (!best || compareScore(res.score, best.score) > 0) best = res;
  }
  return best;
}
const HAND_LADDER = [
  { cat: 1, name: "High card" }, { cat: 2, name: "Pair" }, { cat: 3, name: "Two pair" },
  { cat: 4, name: "Three of a kind" }, { cat: 5, name: "Straight" }, { cat: 6, name: "Flush" },
  { cat: 7, name: "Full house" }, { cat: 8, name: "Four of a kind" }, { cat: 9, name: "Straight flush" },
];

// Instead of a static "anything ranked higher beats you" ladder, simulate what's actually
// possible given the real remaining deck: deal a random plausible opponent hand plus whatever
// board cards are still to come, thousands of times, and report what genuinely showed up.
function simulateBeatingHands(myHole, board, trials = 500) {
  const known = new Set([...myHole, ...board].map((c) => c.id));
  const deckRemain = [];
  for (const s of SUITS) for (const r of RANKS) { const id = `${r}${s}`; if (!known.has(id)) deckRemain.push({ rank: r, suit: s, id }); }
  const need = 5 - board.length;
  const tally = {};
  let beatCount = 0;
  for (let t = 0; t < trials; t++) {
    const pool = [...deckRemain];
    const drawOpp = [];
    for (let k = 0; k < 2; k++) { const idx = Math.floor(Math.random() * pool.length); drawOpp.push(pool[idx]); pool.splice(idx, 1); }
    const drawBoard = [];
    for (let k = 0; k < need; k++) { const idx = Math.floor(Math.random() * pool.length); drawBoard.push(pool[idx]); pool.splice(idx, 1); }
    const finalBoard = [...board, ...drawBoard];
    const myRes = bestHand([...myHole, ...finalBoard]);
    const oppRes = bestHand([...drawOpp, ...finalBoard]);
    if (compareScore(oppRes.score, myRes.score) > 0) {
      beatCount++;
      tally[oppRes.category] = (tally[oppRes.category] || 0) + 1;
    }
  }
  const categories = Object.entries(tally)
    .map(([cat, count]) => ({
      cat: Number(cat),
      name: HAND_LADDER.find((h) => h.cat === Number(cat))?.name || "?",
      pct: Math.round((count / trials) * 100),
    }))
    .filter((c) => c.pct > 0)
    .sort((a, b) => b.cat - a.cat);
  return { beatPct: Math.round((beatCount / trials) * 100), categories };
}

function nextActiveIndex(players, from) {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!players[idx].out) return idx;
  }
  return from;
}
function nextActionableIndex(players, from) {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!players[idx].out && !players[idx].folded && !players[idx].allIn) return idx;
  }
  return -1;
}

function Card({ card, hidden, small }) {
  const w = small ? 34 : 46;
  const h = small ? 48 : 64;
  if (hidden) {
    return (
      <div style={{
        width: w, height: h, borderRadius: 6, background: "repeating-linear-gradient(135deg, var(--felt-card-back-a), var(--felt-card-back-a) 4px, var(--felt-card-back-b) 4px, var(--felt-card-back-b) 8px)",
        border: "1px solid var(--felt-brass)", boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
      }} />
    );
  }
  const red = SUIT_RED[card.suit];
  return (
    <div style={{
      width: w, height: h, borderRadius: 6, background: "var(--felt-card-face)",
      border: "1px solid rgba(0,0,0,0.15)", boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: red ? "var(--felt-red)" : "var(--felt-ink)", fontFamily: "var(--felt-mono)",
      lineHeight: 1, userSelect: "none",
    }}>
      <span style={{ fontSize: small ? 15 : 19, fontWeight: 700 }}>{rankLabel(card.rank)}</span>
      <span style={{ fontSize: small ? 13 : 17 }}>{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

function Chip({ amount }) {
  if (amount <= 0) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, background: "var(--felt-felt-2)",
      border: "1px solid var(--felt-brass)", borderRadius: 999, padding: "3px 10px",
      fontFamily: "var(--felt-mono)", fontSize: 12, color: "var(--felt-cream)",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--felt-brass)", display: "inline-block" }} />
      {amount}
    </div>
  );
}

export default function App() {
  const [players, setPlayers] = useState(() => [
    { name: SEAT_NAMES[0], isHuman: true, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[1], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[2], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[3], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[4], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[5], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
  ]);
  const [deck, setDeck] = useState([]);
  const [community, setCommunity] = useState([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [minRaise, setMinRaise] = useState(BIG_BLIND);
  const [dealer, setDealer] = useState(-1);
  const [turn, setTurn] = useState(-1);
  const [needsToAct, setNeedsToAct] = useState(new Set());
  const [phase, setPhase] = useState("idle");
  const [log, setLog] = useState(["Welcome to the table. Press \"Deal hand\" to start."]);
  const [showHint, setShowHint] = useState(true);
  const [raiseTo, setRaiseTo] = useState(BIG_BLIND * 2);
  const [showdown, setShowdown] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [history, setHistory] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const logEndRef = useRef(null);
  const actionLock = useRef(false);
  const handActionsRef = useRef({ preflop: [], flop: [], turn: [], river: [] });
  const handStartStackRef = useRef(STARTING_STACK);
  const handNumRef = useRef(0);
  const handMetaRef = useRef({ holeCards: [], recorded: false, evNet: null, allInCaptured: false });
  const handDecisionsRef = useRef([]);
  const handOpponentActionsRef = useRef({});
  const handActionsByIdxRef = useRef([]); // per-player action log this hand, used for range inference
  const lastPreflopRaiserRef = useRef(-1); // used for continuation-bet logic
  const handCommittedRef = useRef([]); // per-player: has this bot decided this hand is worth a big pot yet?

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

  const pushLog = useCallback((msg) => setLog((l) => [...l.slice(-40), msg]), []);

  const activePlayers = (ps) => ps.filter((p) => !p.out && !p.folded);

  function resetForNewHand(ps) {
    return ps.map((p) => ({ ...p, hole: [], folded: p.out, allIn: false, bet: 0, totalInvested: 0, handStartStack: p.stack }));
  }

  function startHand() {
    setShowdown(null);
    setGameOver(null);
    let ps = players.map((p) => ({ ...p, out: p.stack <= 0 }));
    const alive = ps.filter((p) => !p.out).length;
    if (alive < 2) {
      setGameOver(ps[0].out ? "You're out of chips. Restart to play again." : "Every opponent is out of chips. You cleared the table!");
      return;
    }
    ps = resetForNewHand(ps);
    handActionsRef.current = { preflop: [], flop: [], turn: [], river: [] };
    handStartStackRef.current = ps[0].stack;
    handNumRef.current += 1;
    handMetaRef.current = { holeCards: [], recorded: false, evNet: null, allInCaptured: false };
    handDecisionsRef.current = [];
    handOpponentActionsRef.current = {};
    handActionsByIdxRef.current = ps.map(() => ({ preflop: [], flop: [], turn: [], river: [] }));
    lastPreflopRaiserRef.current = -1;
    handCommittedRef.current = ps.map(() => false);
    let d = dealer < 0 ? 0 : nextActiveIndex(ps, dealer);
    const sb = nextActiveIndex(ps, d);
    const bb = nextActiveIndex(ps, sb);
    const utg = nextActiveIndex(ps, bb);

    let newDeck = shuffle(makeDeck());
    for (const p of ps) if (!p.out) { p.hole = [newDeck.pop(), newDeck.pop()]; }
    handMetaRef.current.holeCards = ps[0].out ? [] : [...ps[0].hole];

    const sbAmt = Math.min(SMALL_BLIND, ps[sb].stack);
    ps[sb].stack -= sbAmt; ps[sb].bet = sbAmt; ps[sb].totalInvested = sbAmt; if (ps[sb].stack === 0) ps[sb].allIn = true;
    const bbAmt = Math.min(BIG_BLIND, ps[bb].stack);
    ps[bb].stack -= bbAmt; ps[bb].bet = bbAmt; ps[bb].totalInvested = bbAmt; if (ps[bb].stack === 0) ps[bb].allIn = true;

    const potNow = sbAmt + bbAmt;
    const active = ps.filter((p) => !p.out).map((_, i) => i).filter((i) => !ps[i].out);
    const need = new Set(ps.map((p, i) => i).filter((i) => !ps[i].out && !ps[i].allIn));

    setPlayers(ps);
    setDeck(newDeck);
    setCommunity([]);
    setPot(potNow);
    setCurrentBet(bbAmt);
    setMinRaise(BIG_BLIND);
    setDealer(d);
    setPhase("preflop");
    setNeedsToAct(need);
    setTurn(utg);
    setRaiseTo(bbAmt * 2);
    pushLog(`New hand. ${ps[d].name} deals. ${ps[sb].name} posts ${sbAmt}, ${ps[bb].name} posts ${bbAmt}.`);
  }

  // Standard side-pot algorithm: split the pot into layers by distinct contribution levels.
  // Each layer is only won by players who contributed at least that layer's threshold —
  // this is what stops a short stack's all-in from winning chips it was never matched against.
  function computeSidePots(ps) {
    const contributors = ps.map((p, i) => ({ i, amount: p.totalInvested || 0, allIn: p.allIn })).filter((c) => c.amount > 0);
    // Only players actually capped by running out of chips create a real side-pot boundary.
    // A player who simply folded early with a smaller total isn't "all-in" — their smaller
    // contribution shouldn't split the pot, it just goes into the same pot as everyone else's.
    const allInLevels = [...new Set(contributors.filter((c) => c.allIn).map((c) => c.amount))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of allInLevels) {
      const layerContributors = contributors.filter((c) => c.amount >= level);
      const layerAmount = (level - prev) * layerContributors.length;
      const eligible = layerContributors.map((c) => c.i).filter((i) => !ps[i].folded);
      if (layerAmount > 0 && eligible.length > 0) pots.push({ amount: layerAmount, eligible });
      prev = level;
    }
    // Everything above the highest all-in level (or the entire pot, if nobody's all-in) forms
    // one final pot — this is what collapses back to a single normal pot when there's no all-in.
    const finalLayer = contributors.filter((c) => c.amount > prev);
    if (finalLayer.length > 0) {
      const finalAmount = finalLayer.reduce((s, c) => s + (c.amount - prev), 0);
      const eligible = finalLayer.map((c) => c.i).filter((i) => !ps[i].folded);
      if (finalAmount > 0 && eligible.length > 0) pots.push({ amount: finalAmount, eligible });
    }
    return pots;
  }

  // Awards each pot layer to the best hand among that layer's eligible players. resultsByIdx is
  // null for a fold-out (no showdown needed, single winner per layer since only one player remains).
  function awardSidePots(ps, pots, resultsByIdx) {
    const summaries = [];
    for (const layer of pots) {
      let winners;
      if (layer.eligible.length === 1 || !resultsByIdx) {
        winners = layer.eligible.length === 1 ? layer.eligible : [layer.eligible[0]];
      } else {
        let best = resultsByIdx[layer.eligible[0]].score;
        for (const i of layer.eligible) if (compareScore(resultsByIdx[i].score, best) > 0) best = resultsByIdx[i].score;
        winners = layer.eligible.filter((i) => compareScore(resultsByIdx[i].score, best) === 0);
      }
      const share = Math.floor(layer.amount / winners.length);
      const remainder = layer.amount - share * winners.length;
      winners.forEach((idx, i) => { ps[idx].stack += share + (i === 0 ? remainder : 0); });
      summaries.push({ amount: layer.amount, winners });
    }
    return summaries;
  }

  function logPotSummaries(ps, summaries, resultsByIdx) {
    summaries.forEach((s, idx) => {
      const label = summaries.length > 1 ? (idx === 0 ? "Main pot" : `Side pot ${idx}`) : "Pot";
      const names = s.winners.map((i) => ps[i].name);
      const handDesc = resultsByIdx && resultsByIdx[s.winners[0]] ? ` (${handName(resultsByIdx[s.winners[0]])})` : "";
      if (s.winners.length === 1) pushLog(`${label}: ${names[0]} wins ${s.amount} chips.${handDesc}`);
      else pushLog(`${label} split: ${names.join(" and ")} share ${s.amount} chips.${handDesc}`);
    });
  }

  function recordHand(ps, wentToShowdown, showdownHandName, board) {
    if (handMetaRef.current.recorded) return;
    handMetaRef.current.recorded = true;
    const acts = handActionsRef.current;
    const vpip = acts.preflop.some((a) => a === "call" || a.startsWith("raise"));
    const net = ps[0].stack - handStartStackRef.current;
    const evNet = handMetaRef.current.evNet !== null ? handMetaRef.current.evNet : net;
    const decisions = handDecisionsRef.current;
    const scoredDecisions = decisions.filter((d) => d.counted);
    const goodDecisions = scoredDecisions.filter((d) => d.verdict === "profitable call" || d.verdict === "reasonable fold").length;
    const oppActions = handOpponentActionsRef.current;
    const oppSummary = Object.entries(oppActions)
      .map(([name, streets]) => {
        const parts = ["preflop", "flop", "turn", "river"].flatMap((s) => streets[s]).filter(Boolean);
        return parts.length ? `${name}: ${parts.join(", ")}` : null;
      })
      .filter(Boolean)
      .join(" | ");
    // Post-hand-only reveal, purely for auditing decisions after the fact — bots never see this
    // themselves. Every seat's hole cards, regardless of fold status, so a hand like a big multi-way
    // pot can actually be checked rather than guessed at.
    const botHoleCards = ps
      .map((p, i) => (i === 0 || p.out || !p.hole || p.hole.length < 2 ? null : `${p.name}: ${p.hole.map(cardText).join(" ")}`))
      .filter(Boolean)
      .join(" | ");
    setHistory((h) => [
      ...h,
      {
        hand: handNumRef.current,
        holeCards: handMetaRef.current.holeCards.map(cardText),
        board: (board || []).map(cardText),
        preflop: [...acts.preflop],
        flop: [...acts.flop],
        turn: [...acts.turn],
        river: [...acts.river],
        vpip,
        wentToShowdown,
        showdownHand: showdownHandName || null,
        net,
        evNet,
        wasAllInAdjusted: handMetaRef.current.evNet !== null,
        decisionsScored: scoredDecisions.length,
        decisionsGood: goodDecisions,
        botHoleCards,
        decisionLog: decisions.map((d) => `${d.street}:${d.action}(${Math.round(d.equity * 100)}%)=${d.verdict}`).join(" | "),
        opponentActions: oppSummary,
      },
    ]);
  }

  function endHandSinglePlayer(ps, potAmt, board) {
    const pots = computeSidePots(ps);
    const summaries = awardSidePots(ps, pots, null);
    logPotSummaries(ps, summaries, null);
    recordHand(ps, false, null, board);
    setPlayers(ps);
    setPot(0);
    setPhase("handover");
    setTurn(-1);
    setNeedsToAct(new Set());
  }

  function runShowdown(ps, potAmt, communityCards) {
    const contenders = ps.map((p, i) => ({ i, p })).filter(({ p }) => !p.out && !p.folded);
    const results = contenders.map(({ i, p }) => ({ i, res: best7([...p.hole, ...communityCards]) }));
    const resultsByIdx = {};
    results.forEach((r) => { resultsByIdx[r.i] = r.res; });
    const pots = computeSidePots(ps);
    const summaries = awardSidePots(ps, pots, resultsByIdx);
    logPotSummaries(ps, summaries, resultsByIdx);
    const humanResult = resultsByIdx[0];
    recordHand(ps, humanResult !== undefined, humanResult ? handName(humanResult) : null, communityCards);
    setShowdown(results.map((r) => ({ i: r.i, name: handName(r.res) })));
    setPlayers(ps);
    setPot(0);
    setPhase("handover");
    setTurn(-1);
    setNeedsToAct(new Set());
  }

  function advancePhase(psArg, deckArg, potArg) {
    const ps = psArg.map((p) => ({ ...p, bet: 0 }));
    let nd = [...deckArg];
    let comm = [...community];
    const actionable = ps.filter((p) => !p.out && !p.folded && !p.allIn).length;
    const remaining = ps.filter((p) => !p.out && !p.folded).length;

    const dealNext = (n) => { for (let k = 0; k < n; k++) comm.push(nd.pop()); };

    if (remaining <= 1) { setDeck(nd); setCommunity(comm); endHandSinglePlayer(ps, potArg, comm); return; }

    if (actionable <= 1 && !handMetaRef.current.allInCaptured && ps[0] && !ps[0].out && !ps[0].folded) {
      const liveOpp = ps.filter((pl, i) => i !== 0 && !pl.out && !pl.folded).map((pl) => pl.hole);
      if (liveOpp.length) {
        const equity = computeEquity(ps[0].hole, liveOpp, comm, 600);
        const contributedSoFar = handStartStackRef.current - ps[0].stack;
        handMetaRef.current.evNet = equity * potArg - contributedSoFar;
      }
      handMetaRef.current.allInCaptured = true;
    }

    if (phase === "preflop") { dealNext(3); setPhase("flop"); pushLog(`Flop: ${comm.map((c) => rankLabel(c.rank) + SUIT_SYMBOL[c.suit]).join(" ")}`); }
    else if (phase === "flop") { dealNext(1); setPhase("turn"); pushLog(`Turn: ${rankLabel(comm[3].rank)}${SUIT_SYMBOL[comm[3].suit]}`); }
    else if (phase === "turn") { dealNext(1); setPhase("river"); pushLog(`River: ${rankLabel(comm[4].rank)}${SUIT_SYMBOL[comm[4].suit]}`); }
    else { setDeck(nd); setCommunity(comm); runShowdown(ps, potArg, comm); return; }

    setDeck(nd);
    setCommunity(comm);
    setPlayers(ps);
    setCurrentBet(0);
    setMinRaise(BIG_BLIND);

    if (actionable <= 1) {
      setTimeout(() => advancePhaseRef.current(ps, nd, potArg), 900);
      return;
    }
    const firstToAct = nextActionableIndex(ps, dealer);
    const need = new Set(ps.map((_, i) => i).filter((i) => !ps[i].out && !ps[i].folded && !ps[i].allIn));
    setNeedsToAct(need);
    setTurn(firstToAct);
  }
  const advancePhaseRef = useRef(advancePhase);
  advancePhaseRef.current = advancePhase;

  function applyAction(idx, action, amount) {
    if (actionLock.current) return;
    actionLock.current = true;
    setTimeout(() => { actionLock.current = false; }, 10);

    const ps = players.map((p) => ({ ...p }));
    const p = ps[idx];
    let newPot = pot, newCurrentBet = currentBet, newMinRaise = minRaise;
    const need = new Set(needsToAct);

    // Unified per-player action log (all players, all street), used for range inference.
    if (handActionsByIdxRef.current[idx]) {
      let genericDesc = action;
      if (action === "call") genericDesc = `call ${Math.min(currentBet - p.bet, p.stack)}`;
      else if (action === "raise") genericDesc = `raise to ${Math.min(amount, p.bet + p.stack)}`;
      handActionsByIdxRef.current[idx][phase].push(genericDesc);
    }
    if (action === "raise" && phase === "preflop") lastPreflopRaiserRef.current = idx;

    if (idx === 0 && handActionsRef.current[phase]) {
      let desc = action;
      if (action === "call") desc = `call ${Math.min(currentBet - p.bet, p.stack)}`;
      else if (action === "raise") desc = `raise to ${Math.min(amount, p.bet + p.stack)}`;
      handActionsRef.current[phase].push(desc);

      const toCallNow = currentBet - p.bet;
      const liveOpp = ps.filter((pl, i) => i !== 0 && !pl.out && !pl.folded).map((pl) => pl.hole);
      if (liveOpp.length) {
        const equity = computeEquity(p.hole, liveOpp, community);
        const requiredEquity = toCallNow > 0 ? toCallNow / (pot + toCallNow) : 0;
        let verdict = null;
        let counted = false;
        if (toCallNow === 0 && action === "fold") {
          verdict = "unnecessary fold (checking was free)";
          counted = true;
        } else if (toCallNow > 0 && action === "call") {
          verdict = equity >= requiredEquity ? "profitable call" : "-EV call";
          counted = true;
        } else if (toCallNow > 0 && action === "fold") {
          verdict = equity > requiredEquity + 0.05 ? "gave up equity" : "reasonable fold";
          counted = true;
        } else if (action === "raise") {
          verdict = equity >= 0.55 ? "value raise" : equity >= requiredEquity ? "semi-bluff / pressure raise" : "high-variance bluff";
          counted = false; // bluff correctness depends on unknowable fold equity, not scored strictly
        } else if (action === "check" && toCallNow === 0 && equity >= 0.7) {
          verdict = "possible missed value (checked a strong hand)";
          counted = false;
        }
        if (verdict) handDecisionsRef.current.push({ street: phase, action, equity, requiredEquity, verdict, counted });
      }
    } else if (idx !== 0 && !ps[idx].out) {
      const botName = ps[idx].name;
      if (!handOpponentActionsRef.current[botName]) handOpponentActionsRef.current[botName] = { preflop: [], flop: [], turn: [], river: [] };
      let desc = action;
      if (action === "call") desc = `call ${Math.min(currentBet - p.bet, p.stack)}`;
      else if (action === "raise") desc = `raise to ${Math.min(amount, p.bet + p.stack)}`;
      if (handOpponentActionsRef.current[botName][phase]) handOpponentActionsRef.current[botName][phase].push(desc);
    }

    if (action === "fold") {
      p.folded = true;
      need.delete(idx);
      pushLog(`${p.name} folds.`);
    } else if (action === "check") {
      need.delete(idx);
      pushLog(`${p.name} checks.`);
    } else if (action === "call") {
      const toCall = Math.min(currentBet - p.bet, p.stack);
      p.stack -= toCall; p.bet += toCall; p.totalInvested = (p.totalInvested || 0) + toCall; newPot += toCall;
      if (p.stack === 0) p.allIn = true;
      need.delete(idx);
      pushLog(toCall > 0 ? `${p.name} calls ${toCall}.` : `${p.name} checks.`);
    } else if (action === "raise") {
      const target = Math.min(amount, p.bet + p.stack);
      const contribution = target - p.bet;
      const raiseSize = target - currentBet;
      p.stack -= contribution; p.bet = target; p.totalInvested = (p.totalInvested || 0) + contribution; newPot += contribution;
      if (p.stack === 0) p.allIn = true;
      newCurrentBet = target;
      newMinRaise = Math.max(raiseSize, BIG_BLIND);
      need.clear();
      ps.forEach((pl, i) => { if (i !== idx && !pl.out && !pl.folded && !pl.allIn) need.add(i); });
      pushLog(`${p.name} ${p.allIn ? "raises all in to" : "raises to"} ${target}.`);
    }

    setPot(newPot);
    setCurrentBet(newCurrentBet);
    setMinRaise(newMinRaise);
    setPlayers(ps);
    setNeedsToAct(need);

    const remaining = ps.filter((pl) => !pl.out && !pl.folded).length;
    if (remaining <= 1) { setTimeout(() => advancePhaseRef.current(ps, deck, newPot), 400); return; }

    if (need.size === 0) {
      setTimeout(() => advancePhaseRef.current(ps, deck, newPot), 700);
    } else {
      const nextIdx = nextActionableIndex(ps, idx);
      setTurn(nextIdx);
      setRaiseTo(Math.max(newCurrentBet + newMinRaise, newCurrentBet * 2));
    }
  }
  const applyActionRef = useRef(applyAction);
  applyActionRef.current = applyAction;

  const TIER_CONFIG = {
    veryEasy: { fn: "passive", preflopCallPct: 15, preflopRaisePct: 92, overfoldMargin: 0.22, raiseThreshold: 0.85, sizing: 1.0, riskTolerance: 0.15, cbetFreq: 0.35, perceptionNoise: 20 },
    easy:     { fn: "passive", preflopCallPct: 30, preflopRaisePct: 85, overfoldMargin: 0.15, raiseThreshold: 0.75, sizing: 1.0, riskTolerance: 0.25, cbetFreq: 0.45, perceptionNoise: 15 },
    medium:   { fn: "medium", riskTolerance: 0.45, cbetFreq: 0.5, perceptionNoise: 9 },
    hard:     { fn: "mdf", mdfMultiplier: 0.6, bluffRaiseFreq: 0.18, valueThreshold: 0.62, riskTolerance: 0.65, cbetFreq: 0.6, perceptionNoise: 4 },
    veryHard: { fn: "mdf", mdfMultiplier: 0.85, bluffRaiseFreq: 0.28, valueThreshold: 0.55, riskTolerance: 0.8, cbetFreq: 0.65, perceptionNoise: 2 },
  };
  const BOT_TIER = { 1: "veryEasy", 2: "easy", 3: "medium", 4: "hard", 5: "veryHard" };

  // Real casual players reason off a rough sense of hand strength, not a precise percentage --
  // and that sense is genuinely imprecise, sometimes over- sometimes under-estimating. This is the
  // single point where that imprecision enters: everything downstream (pot odds, MDF, shove
  // threshold, implied odds, the commitment gate) already reads from the same equity/percentile
  // value, so noising it once here means every decision inherits it consistently, rather than
  // needing five separate adjustments that could drift out of sync with each other.
  function perceivedStrength(trueValuePct, noiseMagnitude) {
    const bellish = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // roughly -1..1, most error small
    return Math.max(0, Math.min(100, trueValuePct + bellish * noiseMagnitude));
  }

  // Infers a plausible range for a live opponent from what they've actually done this hand —
  // never their real cards. More/bigger raises implies a narrower, stronger range, the way a
  // human reads betting patterns. No signal yet (checked only, or first to act) means "could be anything."
  function inferOpponentRange(idx) {
    const log = handActionsByIdxRef.current[idx];
    if (!log) return { min: 0, max: 100 };
    const all = [...log.preflop, ...log.flop, ...log.turn, ...log.river];
    const raiseCount = all.filter((a) => a.startsWith("raise")).length;
    const hasCalled = all.some((a) => a.startsWith("call"));
    if (raiseCount >= 2) return { min: 85, max: 100 };
    if (raiseCount === 1) return { min: 70, max: 100 };
    if (hasCalled) return { min: 30, max: 100 };
    return { min: 0, max: 100 };
  }

  function liveOpponentsInfo(idx) {
    const info = [];
    players.forEach((pl, i) => {
      if (i !== idx && !pl.out && !pl.folded) info.push({ i, allIn: pl.allIn, range: inferOpponentRange(i) });
    });
    return info;
  }

  // Modeled on the real shape of push/fold charts: shove wider as the stack (in big blinds) gets
  // shorter. riskTolerance (per tier) shifts the bar — a risk-averse tier needs a stronger hand
  // to justify full commitment than an aggressive one at the same stack depth.
  function shoveThresholdPercentile(bbDepth, riskTolerance) {
    let base;
    if (bbDepth <= 10) base = 62;
    else if (bbDepth <= 20) base = 76;
    else if (bbDepth <= 35) base = 86;
    else base = 93;
    const adjust = (0.5 - riskTolerance) * 20;
    return Math.max(50, Math.min(98, base + adjust));
  }

  // A deliberately looser bar than the shove threshold above — this answers "is this hand worth
  // playing for a real pot at all," not "is this hand strong enough to go all-in." Reusing the
  // shove bar here was a real bug: it's a near-certainty threshold (87th-98th percentile), which
  // meant almost nothing ever cleared it and bots defaulted to cheap-call-or-fold the entire hand.
  function commitmentBarPercentile(riskTolerance) {
    const base = 55;
    const adjust = (0.5 - riskTolerance) * 20;
    return Math.max(35, Math.min(75, base + adjust));
  }

  // Reverse implied odds: a made straight/flush on a board that could easily contain a bigger one
  // needs extra margin before committing big. Implied odds: real equity backed by a low hand
  // category (a live draw, not a made hand yet) gets a little slack, since a future street can pay
  // off large. Deliberately not applied to the passive tiers — real recreational players are
  // characteristically the ones who DON'T reason about this, so leaving it out there is more honest,
  // not a shortcut.
  function impliedOddsAdjustment(bot, requiredEquity, equity) {
    if (community.length < 3) return requiredEquity;
    const myCat = bestHand([...bot.hole, ...community]).category;
    const suitCounts = {};
    community.forEach((c) => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
    const flushy = Math.max(...Object.values(suitCounts)) >= 3;
    const ranks = community.map((c) => c.rank);
    const paired = new Set(ranks).size < ranks.length;
    let adjusted = requiredEquity;
    if ((myCat === 5 || myCat === 6) && (flushy || paired)) adjusted += 0.08; // reverse implied odds
    if (myCat <= 2 && equity > requiredEquity * 0.75) adjusted -= 0.06; // implied odds slack for a live draw
    return adjusted;
  }

  function decidePassive(bot, idx, toCall, cfg) {
    // Documented amateur leaks: loose-passive preflop, overfolds postflop, rarely bluffs, flat sizing.
    // No implied-odds reasoning on purpose — real recreational players characteristically don't do this.
    const oppInfo = liveOpponentsInfo(idx);
    const foldableOpp = oppInfo.filter((o) => !o.allIn);
    const allInOnly = foldableOpp.length === 0 && oppInfo.length > 0;
    const bbDepth = bot.stack / BIG_BLIND;
    const potForSizing = pot || BIG_BLIND;

    if (community.length === 0) {
      const { percentile: truePercentile } = preflopPercentile(bot.hole);
      const percentile = perceivedStrength(truePercentile, cfg.perceptionNoise);
      if (toCall <= 0) return { action: "check" };
      if (allInOnly) {
        const requiredEquity = toCall / (pot + toCall);
        return { action: percentile / 100 >= requiredEquity ? "call" : "fold" };
      }
      // Commit-once gate: the first time this bot faces real pressure, decide once — with the
      // same bar used for shove-eligibility — whether this hand is worth playing for a big pot.
      // Pass: commit for the rest of the hand and use normal logic below, unmodified. Fail: stay
      // cautious — only cheap continuations, never a raise — instead of drifting deeper one
      // individually-reasonable street at a time.
      if (!handCommittedRef.current[idx]) {
        const bar = commitmentBarPercentile(cfg.riskTolerance);
        if (percentile >= bar) handCommittedRef.current[idx] = true;
        else {
          const cheap = toCall <= pot * 0.25;
          const requiredEquity = toCall / (pot + toCall);
          return { action: cheap && percentile / 100 >= requiredEquity ? "call" : "fold" };
        }
      }
      if (percentile >= cfg.preflopRaisePct) {
        const shoveEligible = percentile >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
        const amt = sizedRaiseAmount(bot, currentBet, potForSizing, cfg.sizing, shoveEligible);
        return amt === null ? { action: "call" } : { action: "raise", amount: amt };
      }
      if (percentile >= cfg.preflopCallPct) return { action: "call" }; // calls too wide preflop, a classic leak
      return { action: "fold" };
    }

    const opponentRanges = oppInfo.map((o) => o.range);
    const trueEquity = computeEquityInferred(bot.hole, opponentRanges, community);
    const equity = perceivedStrength(trueEquity * 100, cfg.perceptionNoise) / 100;
    if (allInOnly) {
      if (toCall <= 0) return { action: "check" };
      const requiredEquity = toCall / (pot + toCall);
      return { action: equity >= requiredEquity ? "call" : "fold" };
    }
    const mwFactor = 1 / Math.sqrt(Math.max(1, foldableOpp.length));
    if (toCall <= 0) {
      const isCbetSpot = lastPreflopRaiserRef.current === idx && community.length <= 3;
      const cbet = isCbetSpot && Math.random() < cfg.cbetFreq * mwFactor;
      if (equity > cfg.raiseThreshold || cbet) {
        const shoveEligible = equity * 100 >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
        const amt = sizedRaiseAmount(bot, currentBet, potForSizing, cfg.sizing, shoveEligible); // one-size-fits-all sizing tell
        if (amt !== null) { handCommittedRef.current[idx] = true; return { action: "raise", amount: amt }; }
      }
      return { action: "check" };
    }
    if (!handCommittedRef.current[idx]) {
      const bar = commitmentBarPercentile(cfg.riskTolerance);
      if (equity * 100 >= bar) handCommittedRef.current[idx] = true;
      else {
        const cheap = toCall <= pot * 0.25;
        const requiredEquity = toCall / (pot + toCall);
        return { action: cheap && equity >= requiredEquity ? "call" : "fold" };
      }
    }
    const requiredEquity = toCall / (pot + toCall);
    // Overfolds relative to what's actually required — the "scared of aggression" leak.
    if (equity < requiredEquity + cfg.overfoldMargin) return { action: "fold" };
    if (equity > cfg.raiseThreshold && bot.stack > toCall) {
      const shoveEligible = equity * 100 >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
      const amt = sizedRaiseAmount(bot, currentBet, potForSizing, cfg.sizing, shoveEligible);
      return amt === null ? { action: "call" } : { action: "raise", amount: amt };
    }
    return { action: "call" };
  }

  function decideMedium(bot, idx, toCall) {
    // Sound, standard, unexploitative — but not sophisticated. Real (inferred) equity, conventional
    // sizing. Deliberately skips the fuller shove-theory machinery the harder tiers use — that's
    // what "not sophisticated" means here.
    const cfg = TIER_CONFIG.medium;
    const oppInfo = liveOpponentsInfo(idx);
    const foldableOpp = oppInfo.filter((o) => !o.allIn);
    const allInOnly = foldableOpp.length === 0 && oppInfo.length > 0;
    const opponentRanges = oppInfo.map((o) => o.range);
    let trueEquity;
    if (community.length === 0) trueEquity = preflopPercentile(bot.hole).percentile / 100;
    else trueEquity = computeEquityInferred(bot.hole, opponentRanges, community);
    const equity = perceivedStrength(trueEquity * 100, cfg.perceptionNoise) / 100;
    if (allInOnly) {
      if (toCall <= 0) return { action: "check" };
      const requiredEquity = toCall / (pot + toCall);
      return { action: equity >= requiredEquity ? "call" : "fold" };
    }
    const bluff = Math.random() < 0.07;
    const noise = Math.random() * 0.1 - 0.05;
    const strength = Math.min(1, equity + (bluff ? 0.3 : 0) + noise);
    const potForSizing = pot || BIG_BLIND;
    const bbDepth = bot.stack / BIG_BLIND;
    if (toCall <= 0) {
      if (strength > 0.6) {
        const shoveEligible = strength * 100 >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
        const amt = sizedRaiseAmount(bot, currentBet, potForSizing, 0.6, shoveEligible);
        if (amt !== null) { handCommittedRef.current[idx] = true; return { action: "raise", amount: amt }; }
      }
      return { action: "check" };
    }
    if (!handCommittedRef.current[idx]) {
      const bar = commitmentBarPercentile(cfg.riskTolerance);
      if (strength * 100 >= bar) handCommittedRef.current[idx] = true;
      else {
        const cheap = toCall <= pot * 0.25;
        const requiredEquity = toCall / (pot + toCall);
        return { action: cheap && strength >= requiredEquity ? "call" : "fold" };
      }
    }
    const requiredEquity = toCall / (pot + toCall);
    if (strength < requiredEquity && strength < 0.4) return { action: "fold" };
    if (strength > 0.65 && bot.stack > toCall) {
      const shoveEligible = strength * 100 >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
      const amt = sizedRaiseAmount(bot, currentBet, potForSizing, 0.65, shoveEligible);
      return amt === null ? { action: "call" } : { action: "raise", amount: amt };
    }
    return { action: "call" };
  }

  function decideMDF(bot, idx, toCall, cfg) {
    // Grounded in Minimum Defense Frequency: continues at least as often as MDF requires, scaled
    // down as more live opponents can also share that job. Balances value raises with bluff-raises
    // and continuation bets, all drawn from the same sizing distribution so bet size alone can't be read.
    const oppInfo = liveOpponentsInfo(idx);
    const foldableOpp = oppInfo.filter((o) => !o.allIn);
    const allInOnly = foldableOpp.length === 0 && oppInfo.length > 0;
    const opponentRanges = oppInfo.map((o) => o.range);
    let trueEquity;
    if (community.length === 0) trueEquity = preflopPercentile(bot.hole).percentile / 100;
    else trueEquity = computeEquityInferred(bot.hole, opponentRanges, community);
    const equity = perceivedStrength(trueEquity * 100, cfg.perceptionNoise) / 100;
    const potForSizing = pot || BIG_BLIND;
    const bbDepth = bot.stack / BIG_BLIND;

    // Path B: everyone still live is already all-in. No fold equity exists for that bet — pure
    // equity check, no bluffing, no raising for pressure that can't do anything.
    if (allInOnly) {
      if (toCall <= 0) return { action: "check" };
      const requiredEquity = toCall / (pot + toCall);
      return { action: equity >= requiredEquity ? "call" : "fold" };
    }

    // Path A: at least one live opponent can still fold — fold equity is real.
    const mwFactor = 1 / Math.sqrt(Math.max(1, foldableOpp.length));
    if (toCall <= 0) {
      const isCbetSpot = phase !== "preflop" && lastPreflopRaiserRef.current === idx && community.length <= 3;
      const cbet = isCbetSpot && Math.random() < cfg.cbetFreq * mwFactor;
      const bluffRaise = Math.random() < cfg.bluffRaiseFreq * mwFactor;
      if (equity > cfg.valueThreshold || bluffRaise || cbet) {
        const myPct = equity * 100; // equity already carries the perception noise, preflop or postflop alike
        const shoveEligible = myPct >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
        const sizePct = 0.33 + Math.random() * 0.52; // same distribution for value and bluffs — unreadable by size
        const amt = sizedRaiseAmount(bot, currentBet, potForSizing, sizePct, shoveEligible);
        if (amt !== null) { handCommittedRef.current[idx] = true; return { action: "raise", amount: amt }; }
      }
      return { action: "check" };
    }

    if (!handCommittedRef.current[idx]) {
      const myPct = equity * 100; // equity already carries the perception noise, preflop or postflop alike
      const bar = commitmentBarPercentile(cfg.riskTolerance);
      if (myPct >= bar) handCommittedRef.current[idx] = true;
      else {
        const cheap = toCall <= pot * 0.25;
        const requiredEquity = toCall / (pot + toCall);
        return { action: cheap && equity >= requiredEquity ? "call" : "fold" };
      }
    }

    const requiredEquity = toCall / (pot + toCall);
    const adjustedRequired = impliedOddsAdjustment(bot, requiredEquity, equity);
    if (equity >= adjustedRequired) {
      const valueRaise = equity > cfg.valueThreshold + 0.06 && bot.stack > toCall;
      if (valueRaise) {
        const shoveEligible = equity * 100 >= shoveThresholdPercentile(bbDepth, cfg.riskTolerance);
        const sizePct = 0.33 + Math.random() * 0.52;
        const amt = sizedRaiseAmount(bot, currentBet, potForSizing, sizePct, shoveEligible);
        return amt === null ? { action: "call" } : { action: "raise", amount: amt };
      }
      return { action: "call" };
    }
    // Below breakeven equity, but within bluff-catch range: continue at roughly the (multiway-scaled)
    // MDF-implied rate rather than folding outright, so a human can't profitably bluff this bot into submission.
    const mdf = (pot / (pot + toCall)) * mwFactor;
    const bluffCatchZone = equity > adjustedRequired - 0.18;
    if (bluffCatchZone && Math.random() < mdf * cfg.mdfMultiplier) return { action: "call" };
    return { action: "fold" };
  }

  // Caps total commitment for the WHOLE HAND against the stack the bot started the hand with —
  // not against whatever's left at each individual raise. The earlier per-raise-only cap let
  // several legitimate-looking raises compound to ~98% of a stack without ever "shoving" (a
  // measured, real bug: three 75%-capped raises in sequence reach 98.4% of the original stack).
  // Returns null when there's no room left for a real raise under the cap — callers fall back
  // to calling instead, rather than forcing an invalid or degenerate raise size.
  function sizedRaiseAmount(bot, currentBetNow, potNow, sizePct, shoveEligible) {
    const spr = bot.stack / Math.max(potNow, 1);
    if (spr < 1 && shoveEligible) return bot.bet + bot.stack; // genuine shove — bypasses the hand budget entirely
    const raw = currentBetNow + Math.max(minRaise, Math.round(potNow * sizePct));
    const handStart = bot.handStartStack || bot.stack + (bot.totalInvested || 0);
    const handBudget = Math.round(handStart * 0.75); // total committable this hand, absent a genuine shove
    const budgetRemaining = handBudget - (bot.totalInvested || 0);
    const minLegalTarget = currentBetNow + minRaise;
    if (budgetRemaining <= 0 || bot.bet + budgetRemaining < minLegalTarget) return null;
    const budgetCap = bot.bet + budgetRemaining;
    return Math.min(bot.bet + bot.stack, raw, budgetCap);
  }

  function botDecide(bot, idx) {
    const toCall = currentBet - bot.bet;
    const tierName = BOT_TIER[idx] || "medium";
    const cfg = TIER_CONFIG[tierName];
    if (cfg.fn === "passive") return decidePassive(bot, idx, toCall, cfg);
    if (cfg.fn === "mdf") return decideMDF(bot, idx, toCall, cfg);
    return decideMedium(bot, idx, toCall);
  }

  useEffect(() => {
    if (phase === "idle" || phase === "handover") return;
    if (turn < 0) return;
    const p = players[turn];
    if (!p || p.isHuman || p.folded || p.allIn || p.out) return;
    const t = setTimeout(() => {
      const decision = botDecide(p, turn);
      applyActionRef.current(turn, decision.action, decision.amount);
    }, 750 + Math.random() * 500);
    return () => clearTimeout(t);
  }, [turn, phase]);

  function downloadHistoryCSV() {
    const header = "Hand,HoleCards,Board,Preflop,Flop,Turn,River,OpponentActions,BotHoleCards,WentToShowdown,ShowdownHand,NetResult,EVNetResult,AllInAdjusted,DecisionsScored,DecisionsGood,DecisionLog\n";
    const rows = history.map((h) => [
      h.hand,
      h.holeCards.join(" "),
      h.board.join(" "),
      h.preflop.join("; "),
      h.flop.join("; "),
      h.turn.join("; "),
      h.river.join("; "),
      h.opponentActions || "",
      h.botHoleCards || "",
      h.wentToShowdown ? "yes" : "no",
      h.showdownHand || "",
      h.net,
      Math.round(h.evNet * 100) / 100,
      h.wasAllInAdjusted ? "yes" : "no",
      h.decisionsScored,
      h.decisionsGood,
      h.decisionLog || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poker-hand-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const sessionStats = (() => {
    const n = history.length;
    if (n === 0) return null;
    const netTotal = history.reduce((s, h) => s + h.net, 0);
    const evNetTotal = history.reduce((s, h) => s + h.evNet, 0);
    const vpipCount = history.filter((h) => h.vpip).length;
    const showdownHands = history.filter((h) => h.wentToShowdown);
    const wins = history.filter((h) => h.net > 0).length;
    const showdownWins = showdownHands.filter((h) => h.net > 0).length;
    const preflopRaises = history.filter((h) => h.preflop.some((a) => a.startsWith("raise"))).length;
    const preflopFolds = history.filter((h) => h.preflop[0] === "fold" || h.preflop.every((a) => a === "fold")).length;
    const totalScored = history.reduce((s, h) => s + h.decisionsScored, 0);
    const totalGood = history.reduce((s, h) => s + h.decisionsGood, 0);
    const allInHands = history.filter((h) => h.wasAllInAdjusted).length;
    return {
      n,
      netTotal,
      evNetTotal,
      vpipPct: Math.round((vpipCount / n) * 100),
      winPct: Math.round((wins / n) * 100),
      showdownPct: Math.round((showdownHands.length / n) * 100),
      showdownWinPct: showdownHands.length ? Math.round((showdownWins / showdownHands.length) * 100) : null,
      raisePct: Math.round((preflopRaises / n) * 100),
      foldPct: Math.round((preflopFolds / n) * 100),
      decisionAccuracyPct: totalScored ? Math.round((totalGood / totalScored) * 100) : null,
      totalScored,
      allInHands,
    };
  })();

  const human = players[0];
  const humanTurn = phase !== "idle" && phase !== "handover" && turn === 0 && !human.folded && !human.allIn && !human.out;
  const toCall = currentBet - (human?.bet || 0);
  const minRaiseTotal = currentBet + minRaise;
  const humanHandHint = (() => {
    if (!human || human.hole.length < 2) return null;
    if (community.length === 0) {
      const { score, percentile } = preflopPercentile(human.hole);
      return `Top ${100 - percentile}% starting hand (Chen score ${score})`;
    }
    return handName(bestHand([...human.hole, ...community]));
  })();
  const beatingHandsInfo = useMemo(() => {
    if (!human || human.hole.length < 2 || community.length === 0) return null;
    return simulateBeatingHands(human.hole, community);
  }, [human?.hole, community]);

  const seatOrder = [0, 1, 2, 3, 4, 5];
  const seatStyle = [
    { left: "50%", bottom: "2%", transform: "translateX(-50%)" },
    { left: "2%", bottom: "22%", transform: "translateY(50%)" },
    { left: "8%", top: "4%", transform: "translateX(-50%)" },
    { left: "50%", top: "-2%", transform: "translateX(-50%)" },
    { right: "8%", top: "4%", transform: "translateX(50%)" },
    { right: "2%", bottom: "22%", transform: "translateY(50%)" },
  ];

  return (
    <div className="pk-root" style={{
      fontFamily: "var(--felt-sans)", maxWidth: 720, margin: "0 auto", padding: "1rem 0", color: "var(--felt-cream)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        .pk-root { --felt-felt-1: #0F3D2E; --felt-felt-2: #124A38; --felt-felt-rail: #1C2B22; --felt-brass: #C6A15B; --felt-cream: #F3EFE4;
          --felt-ink: #201D18; --felt-red: #B0453F; --felt-card-face: #FAF7EF; --felt-card-back-a: #1C2B22; --felt-card-back-b: #274235;
          --felt-sans: 'Inter', sans-serif; --felt-display: 'Fraunces', serif; --felt-mono: 'IBM Plex Mono', monospace; }
        .pk-btn { font-family: var(--felt-sans); font-weight: 500; border-radius: 6px; padding: 9px 16px; font-size: 14px;
          border: 1px solid var(--felt-brass); background: transparent; color: var(--felt-cream); cursor: pointer; }
        .pk-btn:hover:not(:disabled) { background: rgba(198,161,91,0.15); }
        .pk-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .pk-btn-primary { background: var(--felt-brass); color: var(--felt-ink); }
        .pk-btn-primary:hover:not(:disabled) { background: #D4B06E; }
        .pk-input { font-family: var(--felt-mono); background: rgba(0,0,0,0.25); border: 1px solid var(--felt-brass);
          color: var(--felt-cream); border-radius: 6px; padding: 6px 8px; width: 90px; font-size: 13px; }
        .pk-plaque { font-family: var(--felt-mono); font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--felt-brass);
          border-radius: 6px; padding: 4px 10px; color: var(--felt-brass); display: inline-block; }
      `}</style>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--felt-display)", fontWeight: 600, fontSize: 20, margin: 0, color: "var(--felt-cream)" }}>
            Hold&rsquo;em practice table
          </h2>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--felt-brass)", cursor: "pointer" }}>
            <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
            Show hand hint
          </label>
        </div>

        <div style={{
          position: "relative", width: "100%", aspectRatio: "16/13", background: "var(--felt-felt-rail)",
          borderRadius: "50% / 40%", padding: 18, boxSizing: "border-box",
        }}>
          <div style={{
            position: "relative", width: "100%", height: "100%", background: "radial-gradient(ellipse at center, var(--felt-felt-2), var(--felt-felt-1))",
            borderRadius: "50% / 40%", border: "2px solid var(--felt-brass)",
          }}>
            <div style={{ position: "absolute", left: "50%", top: "44%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, justifyContent: "center" }}>
                {community.map((c) => <Card key={c.id} card={c} />)}
                {Array.from({ length: 5 - community.length }).map((_, i) => (
                  <div key={i} style={{ width: 46, height: 64, borderRadius: 6, border: "1px dashed rgba(243,239,228,0.25)" }} />
                ))}
              </div>
              <div className="pk-plaque">Pot: {pot}</div>
            </div>

            {seatOrder.map((i) => {
              const p = players[i];
              const isDealer = i === dealer;
              const isTurn = turn === i && phase !== "idle" && phase !== "handover";
              return (
                <div key={i} style={{ position: "absolute", ...seatStyle[i], textAlign: "center", minWidth: 100 }}>
                  <div style={{
                    borderRadius: 10, padding: "6px 10px", background: isTurn ? "rgba(198,161,91,0.18)" : "transparent",
                    border: isTurn ? "1px solid var(--felt-brass)" : "1px solid transparent",
                  }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 4 }}>
                      {p.hole.length === 0 ? (
                        <>
                          <div style={{ width: 34, height: 48, borderRadius: 6, border: "1px dashed rgba(243,239,228,0.2)" }} />
                          <div style={{ width: 34, height: 48, borderRadius: 6, border: "1px dashed rgba(243,239,228,0.2)" }} />
                        </>
                      ) : p.hole.map((c, ci) => (
                        <Card key={ci} card={c} small hidden={!p.isHuman && phase !== "handover" && !p.out} />
                      ))}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: p.out ? "var(--felt-brass)" : "var(--felt-cream)" }}>
                      {p.name}{isDealer ? " (D)" : ""}{p.out ? " — out" : p.folded ? " — folded" : ""}
                    </div>
                    <div style={{ fontFamily: "var(--felt-mono)", fontSize: 12, color: "var(--felt-brass)" }}>{p.stack}</div>
                    {p.bet > 0 && <div style={{ marginTop: 4 }}><Chip amount={p.bet} /></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showHint && humanHandHint && phase !== "idle" && phase !== "handover" && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--felt-brass)", fontFamily: "var(--felt-mono)" }}>
            Your hand: {humanHandHint}
          </div>
        )}

        {showHint && beatingHandsInfo && beatingHandsInfo.categories.length > 0 && phase !== "idle" && phase !== "handover" && (
          <div style={{
            marginTop: 6, fontSize: 12, fontFamily: "var(--felt-mono)", color: "rgba(243,239,228,0.65)",
            display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          }}>
            <span>Could beat you ({beatingHandsInfo.beatPct}% of possible outcomes):</span>
            {beatingHandsInfo.categories.map((h) => (
              <span key={h.cat} style={{
                background: "rgba(0,0,0,0.25)", border: "1px solid var(--felt-felt-2)", borderRadius: 999,
                padding: "2px 8px",
              }}>{h.name} ({h.pct}%)</span>
            ))}
          </div>
        )}
        {showHint && beatingHandsInfo && beatingHandsInfo.categories.length === 0 && phase !== "idle" && phase !== "handover" && (
          <div style={{ marginTop: 6, fontSize: 12, fontFamily: "var(--felt-mono)", color: "rgba(243,239,228,0.65)" }}>
            Nothing beat you in {500} simulated outcomes given the cards left in the deck.
          </div>
        )}

        <div style={{ marginTop: 14, minHeight: 44 }}>
          {phase === "idle" && (
            <button className="pk-btn pk-btn-primary" onClick={startHand}>Deal hand</button>
          )}
          {phase === "handover" && !gameOver && (
            <button className="pk-btn pk-btn-primary" onClick={startHand}>Next hand</button>
          )}
          {gameOver && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14 }}>{gameOver}</span>
              <button className="pk-btn pk-btn-primary" onClick={() => {
                setPlayers(players.map((p) => ({ ...p, stack: STARTING_STACK, out: false, folded: false, allIn: false, hole: [], bet: 0 })));
                setDealer(-1); setPhase("idle"); setGameOver(null); setShowdown(null); setLog(["New game. Press \"Deal hand\" to start."]); setHistory([]); handNumRef.current = 0;
              }}>Restart game</button>
            </div>
          )}
          {humanTurn && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button className="pk-btn" onClick={() => applyAction(0, "fold")}>Fold</button>
              <button className="pk-btn" onClick={() => applyAction(0, toCall > 0 ? "call" : "check")}>
                {toCall > 0 ? `Call ${Math.min(toCall, human.stack)}` : "Check"}
              </button>
              <input
                className="pk-input"
                type="number"
                min={minRaiseTotal}
                max={human.bet + human.stack}
                value={raiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
              />
              <button
                className="pk-btn pk-btn-primary"
                disabled={human.stack <= 0}
                onClick={() => applyAction(0, "raise", Math.max(minRaiseTotal, Math.min(raiseTo, human.bet + human.stack)))}
              >
                {raiseTo >= human.bet + human.stack ? "All in" : "Raise to"}
              </button>
              <button className="pk-btn" onClick={() => applyAction(0, "raise", human.bet + human.stack)}>All in</button>
            </div>
          )}
        </div>

        <div style={{
          marginTop: 14, background: "rgba(0,0,0,0.25)", border: "1px solid var(--felt-felt-2)", borderRadius: 8,
          padding: "8px 12px", maxHeight: 120, overflowY: "auto", fontSize: 13, lineHeight: 1.6,
        }}>
          {log.map((l, i) => <div key={i}>{l}</div>)}
          <div ref={logEndRef} />
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="pk-btn" onClick={() => setShowStats((s) => !s)}>
                {showStats ? "Hide session stats" : "Show session stats"}
              </button>
              <button className="pk-btn" onClick={downloadHistoryCSV}>
                Download hand history ({history.length} hands)
              </button>
            </div>
            {showStats && sessionStats && (
              <div style={{
                marginTop: 10, background: "rgba(0,0,0,0.25)", border: "1px solid var(--felt-felt-2)", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, fontFamily: "var(--felt-mono)", lineHeight: 1.8,
              }}>
                <div>Hands played: {sessionStats.n}</div>
                <div>Net chips (actual): {sessionStats.netTotal >= 0 ? "+" : ""}{sessionStats.netTotal}</div>
                <div>Net chips (EV-adjusted): {Math.round(sessionStats.evNetTotal) >= 0 ? "+" : ""}{Math.round(sessionStats.evNetTotal)}
                  {sessionStats.allInHands > 0 ? ` (${sessionStats.allInHands} hand${sessionStats.allInHands === 1 ? "" : "s"} adjusted)` : ""}</div>
                <div>Win rate: {sessionStats.winPct}%</div>
                {sessionStats.decisionAccuracyPct !== null && (
                  <div>Decision accuracy (fold/call vs. pot odds): {sessionStats.decisionAccuracyPct}% ({sessionStats.totalScored} scored)</div>
                )}
                <div>VPIP (voluntarily played preflop): {sessionStats.vpipPct}%</div>
                <div>Preflop raise rate: {sessionStats.raisePct}%</div>
                <div>Preflop fold rate: {sessionStats.foldPct}%</div>
                <div>Reached showdown: {sessionStats.showdownPct}%</div>
                {sessionStats.showdownWinPct !== null && <div>Win rate at showdown: {sessionStats.showdownWinPct}%</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

