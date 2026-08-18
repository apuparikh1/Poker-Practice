import { useState, useEffect, useRef, useCallback } from "react";

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

const SEAT_NAMES = ["You", "Ace", "Deuce", "Trey"];
const STARTING_STACK = 1000;
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
function preflopStrength(hole) {
  const [a, b] = hole;
  const hi = Math.max(a.rank, b.rank), lo = Math.min(a.rank, b.rank);
  let score = hi + lo;
  if (a.rank === b.rank) score += 12 + a.rank;
  if (a.suit === b.suit) score += 4;
  if (hi - lo <= 2 && a.rank !== b.rank) score += 3;
  return Math.min(1, score / 55);
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

export default function PokerPractice() {
  const [players, setPlayers] = useState(() => [
    { name: SEAT_NAMES[0], isHuman: true, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[1], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[2], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
    { name: SEAT_NAMES[3], isHuman: false, stack: STARTING_STACK, hole: [], folded: false, allIn: false, out: false, bet: 0 },
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
  const logEndRef = useRef(null);
  const actionLock = useRef(false);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

  const pushLog = useCallback((msg) => setLog((l) => [...l.slice(-40), msg]), []);

  const activePlayers = (ps) => ps.filter((p) => !p.out && !p.folded);

  function resetForNewHand(ps) {
    return ps.map((p) => ({ ...p, hole: [], folded: p.out, allIn: false, bet: 0 }));
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
    let d = dealer < 0 ? 0 : nextActiveIndex(ps, dealer);
    const sb = nextActiveIndex(ps, d);
    const bb = nextActiveIndex(ps, sb);
    const utg = nextActiveIndex(ps, bb);

    let newDeck = shuffle(makeDeck());
    for (const p of ps) if (!p.out) { p.hole = [newDeck.pop(), newDeck.pop()]; }

    const sbAmt = Math.min(SMALL_BLIND, ps[sb].stack);
    ps[sb].stack -= sbAmt; ps[sb].bet = sbAmt; if (ps[sb].stack === 0) ps[sb].allIn = true;
    const bbAmt = Math.min(BIG_BLIND, ps[bb].stack);
    ps[bb].stack -= bbAmt; ps[bb].bet = bbAmt; if (ps[bb].stack === 0) ps[bb].allIn = true;

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

  function awardPot(ps, potAmt, winners, communityCards, reason) {
    const share = Math.floor(potAmt / winners.length);
    const remainder = potAmt - share * winners.length;
    winners.forEach((idx, i) => {
      ps[idx].stack += share + (i === 0 ? remainder : 0);
    });
    if (winners.length === 1) {
      pushLog(`${ps[winners[0]].name} wins ${potAmt} chips. ${reason}`);
    } else {
      pushLog(`Split pot: ${winners.map((i) => ps[i].name).join(" and ")} share ${potAmt} chips. ${reason}`);
    }
  }

  function endHandSinglePlayer(ps, potAmt) {
    const winnerIdx = ps.findIndex((p) => !p.out && !p.folded);
    awardPot(ps, potAmt, [winnerIdx], [], "Everyone else folded.");
    setPlayers(ps);
    setPot(0);
    setPhase("handover");
    setTurn(-1);
    setNeedsToAct(new Set());
  }

  function runShowdown(ps, potAmt, communityCards) {
    const contenders = ps.map((p, i) => ({ i, p })).filter(({ p }) => !p.out && !p.folded);
    const results = contenders.map(({ i, p }) => ({ i, res: best7([...p.hole, ...communityCards]) }));
    let bestScore = results[0].res.score;
    results.forEach((r) => { if (compareScore(r.res.score, bestScore) > 0) bestScore = r.res.score; });
    const winners = results.filter((r) => compareScore(r.res.score, bestScore) === 0).map((r) => r.i);
    const winRes = results.find((r) => r.i === winners[0]).res;
    awardPot(ps, potAmt, winners, communityCards, handName(winRes));
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

    if (remaining <= 1) { setDeck(nd); setCommunity(comm); endHandSinglePlayer(ps, potArg); return; }

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

    if (action === "fold") {
      p.folded = true;
      need.delete(idx);
      pushLog(`${p.name} folds.`);
    } else if (action === "check") {
      need.delete(idx);
      pushLog(`${p.name} checks.`);
    } else if (action === "call") {
      const toCall = Math.min(currentBet - p.bet, p.stack);
      p.stack -= toCall; p.bet += toCall; newPot += toCall;
      if (p.stack === 0) p.allIn = true;
      need.delete(idx);
      pushLog(toCall > 0 ? `${p.name} calls ${toCall}.` : `${p.name} checks.`);
    } else if (action === "raise") {
      const target = Math.min(amount, p.bet + p.stack);
      const contribution = target - p.bet;
      const raiseSize = target - currentBet;
      p.stack -= contribution; p.bet = target; newPot += contribution;
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

  function botDecide(bot, idx) {
    const toCall = currentBet - bot.bet;
    let strength;
    if (community.length === 0) strength = preflopStrength(bot.hole);
    else strength = best7([...bot.hole, ...community]).category / 9;
    const bluff = Math.random() < 0.07;
    const noise = Math.random() * 0.18 - 0.09;
    const aggression = Math.min(1, strength + (bluff ? 0.35 : 0) + noise);

    if (toCall <= 0) {
      if (aggression > 0.58 && bot.stack > 0) {
        const raiseAmt = Math.min(bot.bet + bot.stack, currentBet + Math.max(minRaise, Math.round((pot || BIG_BLIND) * 0.55)));
        return { action: "raise", amount: raiseAmt };
      }
      return { action: "check" };
    }
    const potOdds = toCall / (pot + toCall);
    if (aggression < 0.16 || (aggression < potOdds * 1.3 && aggression < 0.5)) {
      if (aggression < 0.42) return { action: "fold" };
    }
    if (aggression > 0.68 && bot.stack > toCall) {
      const raiseAmt = Math.min(bot.bet + bot.stack, currentBet + Math.max(minRaise, Math.round((pot || BIG_BLIND) * 0.6)));
      return { action: "raise", amount: raiseAmt };
    }
    return { action: "call" };
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

  const human = players[0];
  const humanTurn = phase !== "idle" && phase !== "handover" && turn === 0 && !human.folded && !human.allIn && !human.out;
  const toCall = currentBet - (human?.bet || 0);
  const minRaiseTotal = currentBet + minRaise;
  const humanHandHint = (() => {
    if (!human || human.hole.length < 2) return null;
    if (community.length === 0) {
      const s = preflopStrength(human.hole);
      const label = s > 0.75 ? "Premium starting hand" : s > 0.5 ? "Playable starting hand" : s > 0.3 ? "Speculative hand" : "Weak starting hand";
      return label;
    }
    return handName(best7([...human.hole, ...community]));
  })();

  const seatOrder = [0, 1, 2, 3];
  const seatStyle = [
    { left: "50%", bottom: "2%", transform: "translateX(-50%)" },
    { left: "4%", top: "38%", transform: "translateY(-50%)" },
    { left: "50%", top: "3%", transform: "translateX(-50%)" },
    { right: "4%", top: "38%", transform: "translateY(-50%)" },
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
          position: "relative", width: "100%", aspectRatio: "16/10", background: "var(--felt-felt-rail)",
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
                setDealer(-1); setPhase("idle"); setGameOver(null); setShowdown(null); setLog(["New game. Press \"Deal hand\" to start."]);
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
      </div>
    </div>
  );
}

