'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ'];
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

const state = {
  playerStack: 1000,
  cpuStack: 1000,
  playerCards: [],
  cpuCards: [],
  board: [],
  deck: [],
  pot: 0,
  phase: 'idle',
  dealer: 'player',
  turn: null,
  playerStreetBet: 0,
  cpuStreetBet: 0,
  currentBet: 0,
  raisesThisStreet: 0,
  handNo: 0,
  handOver: true,
  cpuThinking: false,
  sound: true
};

const $ = (id) => document.getElementById(id);
const el = {
  cpuStack: $('cpuStack'), playerStack: $('playerStack'), pot: $('potAmount'),
  cpuCards: $('cpuCards'), playerCards: $('playerCards'), board: $('boardCards'),
  cpuStatus: $('cpuStatus'), playerStatus: $('playerStatus'), phase: $('phaseLabel'),
  message: $('message'), fold: $('foldBtn'), checkCall: $('checkCallBtn'), raise: $('raiseBtn'),
  deal: $('dealBtn'), slider: $('raiseSlider'), raiseValue: $('raiseValue'),
  handNo: $('handNo'), bestHand: $('bestHand'),
  cpuDealer: $('cpuDealer'), playerDealer: $('playerDealer'),
  playerSeat: document.querySelector('.player-seat'), cpuSeat: document.querySelector('.cpu-seat')
};

/* ---------- サウンド ---------- */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, duration = .06, type = 'sine', gainVal = .025, delay = 0) {
  if (!state.sound) return;
  try {
    const ctx = getAudioCtx();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + duration);
    osc.stop(t0 + duration + .03);
  } catch (_) {}
}
function sweepTone(fromFreq, toFreq, duration, gainVal = .03) {
  if (!state.sound) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(fromFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toFreq, ctx.currentTime + duration);
    gain.gain.value = gainVal;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration + .02);
    osc.stop(ctx.currentTime + duration + .05);
  } catch (_) {}
}
function dealTicks(count, gap = .06) { for (let i = 0; i < count; i++) playTone(880 + i * 30, .035, 'square', .012, i * gap); }
function chipSound() { playTone(210, .06, 'triangle', .03); playTone(760, .035, 'square', .014, .02); }
function checkSound() { playTone(520, .05, 'sine', .02); playTone(680, .04, 'sine', .014, .05); }
function foldSound() { sweepTone(320, 110, .26, .03); }
function winSound() { [523, 659, 784, 1046].forEach((f, i) => playTone(f, .16, 'triangle', .035, i * .1)); }
function loseSound() { [300, 240, 190].forEach((f, i) => playTone(f, .2, 'sawtooth', .022, i * .12)); }
function splitSound() { playTone(440, .12, 'sine', .03); playTone(440, .12, 'sine', .03, .16); }

function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardLabel(card) { return RANK_LABEL[card.rank] || String(card.rank); }
const SUIT_CLASS = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' };
function cardHTML(card, hidden = false, delay = 0, flip = false) {
  if (hidden) return `<div class="card back" style="animation-delay:${delay}ms" aria-label="裏向きのカード"></div>`;
  const red = card.suit === '♥' || card.suit === '♦';
  const label = cardLabel(card);
  const suitIcon = `<span class="suit-icon ${SUIT_CLASS[card.suit]}"><i></i></span>`;
  return `<div class="card ${red ? 'red' : ''} ${flip ? 'flip-in' : ''}" style="animation-delay:${delay}ms" aria-label="${label}${card.suit}">
    <span class="rank">${label}</span><span class="suit">${suitIcon}</span><span class="mini">${label}</span>
  </div>`;
}
function placeholders(n) { return Array.from({ length:n }, () => '<div class="card placeholder"></div>').join(''); }
function bump(elm) { elm.classList.remove('bump'); void elm.offsetWidth; elm.classList.add('bump'); }

function render() {
  el.playerStack.textContent = state.playerStack.toLocaleString();
  el.cpuStack.textContent = state.cpuStack.toLocaleString();
  el.pot.textContent = state.pot.toLocaleString();
  el.handNo.textContent = `HAND ${state.handNo}`;
  el.phase.textContent = phaseName(state.phase);
  el.playerDealer.classList.toggle('active', state.dealer === 'player');
  el.cpuDealer.classList.toggle('active', state.dealer === 'cpu');

  el.playerCards.innerHTML = state.playerCards.length ? state.playerCards.map((c,i)=>cardHTML(c,false,i*70)).join('') : placeholders(2);
  const revealCpu = state.phase === 'showdown' || (state.handOver && state.cpuCards.length && state.phase !== 'idle');
  const flipReveal = state.phase === 'showdown';
  el.cpuCards.innerHTML = state.cpuCards.length ? state.cpuCards.map((c,i)=>cardHTML(c,!revealCpu,i*70, flipReveal && revealCpu)).join('') : placeholders(2);
  el.board.innerHTML = state.board.length ? state.board.map((c,i)=>cardHTML(c,false,i*55)).join('') + placeholders(5-state.board.length) : placeholders(5);

  const playerEval = state.playerCards.length && state.board.length >= 3 ? evaluate([...state.playerCards, ...state.board]) : null;
  el.bestHand.textContent = `BEST HAND: ${playerEval ? playerEval.name : '-'}`;

  const playerTurn = state.turn === 'player' && !state.handOver && !state.cpuThinking;
  const toCall = Math.max(0, state.currentBet - state.playerStreetBet);
  el.fold.disabled = !playerTurn;
  el.checkCall.disabled = !playerTurn;
  el.raise.disabled = !playerTurn || state.playerStack <= toCall || state.raisesThisStreet >= 3;
  el.slider.disabled = el.raise.disabled;

  const gameOver = state.playerStack <= 0 || state.cpuStack <= 0;
  el.deal.classList.toggle('newgame', gameOver);
  if (gameOver) {
    el.deal.disabled = false;
    el.deal.textContent = 'NEW GAME';
  } else {
    el.deal.disabled = !state.handOver;
    el.deal.textContent = 'DEAL';
  }

  el.checkCall.textContent = toCall > 0 ? `CALL ${Math.min(toCall, state.playerStack)}` : 'CHECK';
  updateRaiseBounds();
}

function phaseName(phase) {
  return ({ idle:'READY', preflop:'PRE-FLOP', flop:'FLOP', turn:'TURN', river:'RIVER', showdown:'SHOWDOWN' })[phase] || phase.toUpperCase();
}

function updateRaiseBounds() {
  const toCall = Math.max(0, state.currentBet - state.playerStreetBet);
  const minRaise = Math.max(BIG_BLIND, state.currentBet + BIG_BLIND - state.playerStreetBet);
  const maxCommit = Math.max(0, state.playerStack);
  const min = Math.min(Math.max(minRaise, toCall + BIG_BLIND), maxCommit || 1);
  const max = Math.max(min, maxCommit);
  el.slider.min = String(min);
  el.slider.max = String(max);
  el.slider.step = '10';
  if (+el.slider.value < min || +el.slider.value > max) el.slider.value = String(min);
  el.raiseValue.textContent = (+el.slider.value).toLocaleString();
  el.raise.textContent = `${state.currentBet === 0 ? 'BET' : 'RAISE'} ${( +el.slider.value).toLocaleString()}`;
}

function setMessage(text) { el.message.textContent = text; }
function setStatus(player, text) { (player === 'player' ? el.playerStatus : el.cpuStatus).textContent = text; }

function commit(player, amount) {
  const stackKey = `${player}Stack`;
  const betKey = `${player}StreetBet`;
  const paid = Math.min(amount, state[stackKey]);
  state[stackKey] -= paid;
  state[betKey] += paid;
  state.pot += paid;
  state.currentBet = Math.max(state.playerStreetBet, state.cpuStreetBet);
  return paid;
}

function refundUncalled(role, amount) {
  if (amount <= 0) return;
  const stackKey = `${role}Stack`;
  const betKey = `${role}StreetBet`;
  state[stackKey] += amount;
  state[betKey] -= amount;
  state.pot -= amount;
  state.currentBet = Math.max(state.playerStreetBet, state.cpuStreetBet);
}

function startHand() {
  if (!state.handOver || state.playerStack <= 0 || state.cpuStack <= 0) return;
  state.handNo++;
  state.handOver = false;
  state.phase = 'preflop';
  state.deck = newDeck();
  state.board = [];
  state.playerCards = [state.deck.pop(), state.deck.pop()];
  state.cpuCards = [state.deck.pop(), state.deck.pop()];
  state.pot = 0;
  state.playerStreetBet = 0;
  state.cpuStreetBet = 0;
  state.currentBet = 0;
  state.raisesThisStreet = 0;
  state.cpuThinking = false;
  el.playerSeat.classList.remove('winner', 'loser');
  el.cpuSeat.classList.remove('winner', 'loser');
  el.message.classList.remove('result', 'win', 'lose', 'split');
  setStatus('player', 'IN HAND'); setStatus('cpu', 'IN HAND');

  if (state.dealer === 'player') {
    commit('player', SMALL_BLIND); commit('cpu', BIG_BLIND); state.turn = 'player';
    setMessage('あなたはSB。コール・レイズ・フォールドを選択');
  } else {
    commit('cpu', SMALL_BLIND); commit('player', BIG_BLIND); state.turn = 'cpu';
    setMessage('CPUが考えています…');
  }
  dealTicks(2);
  render();
  if (state.turn === 'cpu') setTimeout(cpuAct, 650);
}

function newGame() {
  state.playerStack = 1000;
  state.cpuStack = 1000;
  state.handNo = 0;
  state.dealer = 'player';
  state.pot = 0;
  state.board = [];
  state.playerCards = [];
  state.cpuCards = [];
  state.phase = 'idle';
  state.handOver = true;
  state.turn = null;
  el.playerSeat.classList.remove('winner', 'loser');
  el.cpuSeat.classList.remove('winner', 'loser');
  el.message.classList.remove('result', 'win', 'lose', 'split');
  setStatus('player', 'READY'); setStatus('cpu', 'WAITING');
  setMessage('ディールを押してゲーム開始');
  render();
}

function playerFold() {
  if (state.turn !== 'player') return;
  setStatus('player', 'FOLD');
  foldSound();
  finishHand('cpu', 'あなたがフォールド。CPUの勝ち');
}

function playerCheckCall() {
  if (state.turn !== 'player') return;
  const toCall = state.currentBet - state.playerStreetBet;
  if (toCall > 0) {
    const paid = commit('player', toCall);
    if (paid < toCall) {
      refundUncalled('cpu', toCall - paid);
      setStatus('player', 'ALL-IN');
      setMessage(`あなたは ${paid} でオールインコール(超過分はCPUへ返却)`);
    } else {
      setStatus('player', 'CALL');
      setMessage(`あなたは ${paid} コール`);
    }
    chipSound();
  } else {
    setStatus('player', 'CHECK');
    setMessage('あなたはチェック');
    checkSound();
  }
  render();
  afterAction('player');
}

function playerRaise() {
  if (state.turn !== 'player') return;
  const amount = Math.min(+el.slider.value, state.playerStack);
  const oldBet = state.currentBet;
  const paid = commit('player', amount);
  if (state.playerStreetBet <= oldBet) return;
  state.raisesThisStreet++;
  setStatus('player', state.playerStack === 0 ? 'ALL-IN' : (oldBet ? 'RAISE' : 'BET'));
  setMessage(`あなたは ${paid} を追加`);
  chipSound();
  render();
  afterAction('player');
}

function afterAction(actor) {
  const other = actor === 'player' ? 'cpu' : 'player';
  const betsEqual = state.playerStreetBet === state.cpuStreetBet;

  if (betsEqual && streetCanClose(actor)) {
    closeStreet();
  } else {
    state.turn = other;
    render();
    if (other === 'cpu') { setMessage('CPUが考えています…'); state.cpuThinking = true; render(); setTimeout(cpuAct, 650 + Math.random()*500); }
  }
}

function streetCanClose(actor) {
  // Pre-flop: BB may check after SB calls. Post-flop: second check or call closes action.
  const otherStatus = actor === 'player' ? el.cpuStatus.textContent : el.playerStatus.textContent;
  if (state.phase === 'preflop') {
    if (state.dealer === 'player' && actor === 'cpu' && state.playerStreetBet === state.cpuStreetBet) return true;
    if (state.dealer === 'cpu' && actor === 'player' && state.playerStreetBet === state.cpuStreetBet) return true;
  }
  return ['CHECK','CALL','ALL-IN','BET','RAISE'].includes(otherStatus) && state.playerStreetBet === state.cpuStreetBet;
}

function closeStreet() {
  if (state.phase === 'river') { showdown(); return; }
  if (state.playerStack === 0 || state.cpuStack === 0) {
    runoutAndShowdown();
  } else {
    advanceStreet();
  }
}

function advanceStreet() {
  state.playerStreetBet = 0; state.cpuStreetBet = 0; state.currentBet = 0; state.raisesThisStreet = 0;
  setStatus('player', 'IN HAND'); setStatus('cpu', 'IN HAND');
  if (state.phase === 'preflop') {
    state.phase = 'flop'; state.deck.pop(); state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    dealTicks(3);
  } else if (state.phase === 'flop') {
    state.phase = 'turn'; state.deck.pop(); state.board.push(state.deck.pop());
    dealTicks(1);
  } else if (state.phase === 'turn') {
    state.phase = 'river'; state.deck.pop(); state.board.push(state.deck.pop());
    dealTicks(1);
  }
  // Heads-up: non-dealer acts first post-flop.
  state.turn = state.dealer === 'player' ? 'cpu' : 'player';
  setMessage(`${phaseName(state.phase)} → ${state.turn === 'player' ? 'あなたの番' : 'CPUが考えています…'}`);
  render();
  if (state.turn === 'cpu') { state.cpuThinking = true; render(); setTimeout(cpuAct, 700); }
}

function cpuAct() {
  if (state.turn !== 'cpu' || state.handOver) return;
  state.cpuThinking = false;
  const toCall = Math.max(0, state.currentBet - state.cpuStreetBet);
  const strength = estimateStrength(state.cpuCards, state.board);
  const inPosition = state.dealer === 'cpu'; // dealer acts last post-flop = in position
  const streetFactor = { preflop:0, flop:1, turn:2, river:3 }[state.phase] || 0;
  const potOdds = toCall / Math.max(1, state.pot + toCall);
  const noise = Math.random() * .16 - .08;
  let adjusted = strength + noise + (inPosition ? .05 : -.03);

  // ブラフ: 弱いハンドでも街が進むほど・ポジションがあるほど強く見せる頻度を上げる
  const bluffChance = .05 + streetFactor * .045 + (inPosition ? .05 : 0);
  const isBluffing = adjusted < .4 && Math.random() < bluffChance;
  if (isBluffing) adjusted = .74 + Math.random() * .14;

  if (toCall > 0 && !isBluffing && adjusted < potOdds * .82 && Math.random() > .12) {
    setStatus('cpu', 'FOLD');
    foldSound();
    finishHand('player', 'CPUがフォールド。あなたの勝ち');
    return;
  }

  const canRaise = state.cpuStack > toCall + BIG_BLIND && state.raisesThisStreet < 3;
  const aggressive = adjusted > .72 || (adjusted > .56 && Math.random() < .34) || (toCall === 0 && Math.random() < .12);
  if (canRaise && aggressive) {
    const sizeFactor = isBluffing ? (.6 + Math.random() * .5) : (adjusted > .8 ? .75 : .45);
    const base = Math.max(BIG_BLIND, Math.round((state.pot * sizeFactor) / 10) * 10);
    const targetAdditional = Math.min(state.cpuStack, toCall + Math.max(BIG_BLIND, base));
    const oldBet = state.currentBet;
    const paid = commit('cpu', targetAdditional);
    if (state.cpuStreetBet > oldBet) state.raisesThisStreet++;
    setStatus('cpu', state.cpuStack === 0 ? 'ALL-IN' : (oldBet ? 'RAISE' : 'BET'));
    setMessage(`CPUは ${paid} を追加`);
    chipSound();
  } else if (toCall > 0) {
    const paid = commit('cpu', toCall);
    if (paid < toCall) {
      refundUncalled('player', toCall - paid);
      setStatus('cpu', 'ALL-IN');
      setMessage(`CPUは ${paid} でオールインコール`);
    } else {
      setStatus('cpu', 'CALL');
      setMessage(`CPUは ${paid} コール`);
    }
    chipSound();
  } else {
    setStatus('cpu', 'CHECK');
    setMessage('CPUはチェック');
    checkSound();
  }
  render();
  setTimeout(() => afterAction('cpu'), 420);
}

function runoutAndShowdown() {
  state.turn = null;
  const startLen = state.board.length;
  while (state.board.length < 5) {
    state.deck.pop();
    if (state.board.length === 0) state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    else state.board.push(state.deck.pop());
  }
  dealTicks(state.board.length - startLen, .08);
  setMessage('オールイン → 残りのボードを一気に公開');
  render();
  setTimeout(showdown, 900);
}

function showdown() {
  state.phase = 'showdown'; state.turn = null;
  const p = evaluate([...state.playerCards, ...state.board]);
  const c = evaluate([...state.cpuCards, ...state.board]);
  const cmp = compareEval(p, c);
  render();
  if (cmp > 0) finishHand('player', `あなたの勝ち → ${p.name} / CPU: ${c.name}`);
  else if (cmp < 0) finishHand('cpu', `CPUの勝ち → ${c.name} / あなた: ${p.name}`);
  else finishHand('split', `引き分け → ${p.name}`);
}

function finishHand(winner, text) {
  state.turn = null; state.handOver = true; state.cpuThinking = false;
  if (winner === 'player') state.playerStack += state.pot;
  else if (winner === 'cpu') state.cpuStack += state.pot;
  else {
    const half = Math.floor(state.pot / 2);
    state.playerStack += half; state.cpuStack += state.pot - half;
  }
  state.pot = 0;
  setMessage(text);
  el.message.classList.remove('win', 'lose', 'split');
  el.message.classList.add('result', winner === 'player' ? 'win' : winner === 'cpu' ? 'lose' : 'split');
  setStatus('player', winner === 'player' ? 'WIN' : winner === 'split' ? 'SPLIT' : 'LOSE');
  setStatus('cpu', winner === 'cpu' ? 'WIN' : winner === 'split' ? 'SPLIT' : 'LOSE');

  el.playerSeat.classList.toggle('winner', winner === 'player');
  el.playerSeat.classList.toggle('loser', winner === 'cpu');
  el.cpuSeat.classList.toggle('winner', winner === 'cpu');
  el.cpuSeat.classList.toggle('loser', winner === 'player');

  if (winner === 'player' || winner === 'split') bump(el.playerStack);
  if (winner === 'cpu' || winner === 'split') bump(el.cpuStack);

  if (winner === 'player') winSound();
  else if (winner === 'cpu') loseSound();
  else splitSound();

  state.dealer = state.dealer === 'player' ? 'cpu' : 'player';
  render();
  if (state.playerStack <= 0 || state.cpuStack <= 0) {
    setMessage(state.playerStack <= 0 ? 'GAME OVER → CPUの勝利(NEW GAMEでリスタート)' : 'YOU WIN → CPUのチップをすべて獲得(NEW GAMEでリスタート)');
  }
}

function evaluate(cards) {
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const e = evaluate5(combo);
    if (!best || compareEval(e, best) > 0) best = e;
  }
  return best;
}

function evaluate5(cards) {
  const ranks = cards.map(c=>c.rank).sort((a,b)=>b-a);
  const counts = {};
  ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
  const groups = Object.entries(counts).map(([r,c])=>({ rank:+r, count:c })).sort((a,b)=>b.count-a.count || b.rank-a.rank);
  const flush = cards.every(c=>c.suit===cards[0].suit);
  const unique = [...new Set(ranks)];
  if (unique[0]===14) unique.push(1);
  let straightHigh = 0;
  for (let i=0;i<=unique.length-5;i++) if (unique[i]-unique[i+4]===4) { straightHigh=unique[i]; break; }
  let category, tiebreak;
  if (flush && straightHigh) { category=8; tiebreak=[straightHigh]; }
  else if (groups[0].count===4) { category=7; tiebreak=[groups[0].rank, groups[1].rank]; }
  else if (groups[0].count===3 && groups[1].count===2) { category=6; tiebreak=[groups[0].rank, groups[1].rank]; }
  else if (flush) { category=5; tiebreak=ranks; }
  else if (straightHigh) { category=4; tiebreak=[straightHigh]; }
  else if (groups[0].count===3) { category=3; tiebreak=[groups[0].rank, ...groups.filter(g=>g.count===1).map(g=>g.rank).sort((a,b)=>b-a)]; }
  else if (groups[0].count===2 && groups[1].count===2) {
    const pairs=[groups[0].rank,groups[1].rank].sort((a,b)=>b-a); const kicker=groups.find(g=>g.count===1).rank;
    category=2; tiebreak=[...pairs,kicker];
  } else if (groups[0].count===2) { category=1; tiebreak=[groups[0].rank, ...groups.filter(g=>g.count===1).map(g=>g.rank).sort((a,b)=>b-a)]; }
  else { category=0; tiebreak=ranks; }
  return { category, tiebreak, name: HAND_NAMES[category] };
}

function compareEval(a,b) {
  if (a.category!==b.category) return a.category-b.category;
  const n=Math.max(a.tiebreak.length,b.tiebreak.length);
  for(let i=0;i<n;i++){ const d=(a.tiebreak[i]||0)-(b.tiebreak[i]||0); if(d) return d; }
  return 0;
}

function combinations(arr,k) {
  const out=[];
  function rec(start, picked){
    if(picked.length===k){ out.push([...picked]); return; }
    for(let i=start;i<=arr.length-(k-picked.length);i++){ picked.push(arr[i]); rec(i+1,picked); picked.pop(); }
  }
  rec(0,[]); return out;
}

function estimateStrength(hole, board) {
  if (board.length >= 3) {
    const e = evaluate([...hole,...board]);
    const base = [0.18,0.36,0.50,0.61,0.68,0.74,0.82,0.91,0.97][e.category];
    const kicker = (e.tiebreak[0] || 2) / 14 * .05;
    return Math.min(.99, base + kicker);
  }
  const [a,b]=hole.map(c=>c.rank).sort((x,y)=>y-x);
  const pair=a===b, suited=hole[0].suit===hole[1].suit, gap=a-b;
  let s=(a+b)/28*.42;
  if(pair) s+=.28 + a/14*.14;
  if(suited) s+=.07;
  if(gap<=2) s+=.05;
  if(a>=13) s+=.08;
  return Math.min(.95,s);
}

el.fold.addEventListener('click', playerFold);
el.checkCall.addEventListener('click', playerCheckCall);
el.raise.addEventListener('click', playerRaise);
el.deal.addEventListener('click', () => {
  const gameOver = state.playerStack <= 0 || state.cpuStack <= 0;
  if (gameOver) newGame(); else startHand();
});
el.slider.addEventListener('input', render);

render();
