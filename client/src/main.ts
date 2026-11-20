// dronefight: a side-view platform fighter (ADR-0070, ADR-0071, ADR-0072). Up to ten fighters (ADR-0087): you on the keyboard plus CPUs,
// or friends on their own computers in an online room (ADR-0076).

import './styles.css';
import { botInput, createBot, type Bot } from '../../shared/fighter/bot';
import { DT } from '../../shared/fighter/config';
import { decodeInput, describeDrift, deserializeWorld, drawStage, encodeInput, serializeWorld, type MatchStart } from '../../shared/online';
import { FIGHTERS } from '../../shared/fighter/fighters';
import { createWorld, NO_INPUT, step, type GameEvent, type Input, type World } from '../../shared/fighter/sim';
import { Sfx } from './audio';
import { Keyboard } from './input';
import { cheatOn, cheatRules, onCheatsChange, randomFighters, stageIds, TripleTap } from './cheats';
import { stageBans } from './stageBans';
import { CHEAT_LOOKS, ONLINE, setFightColors } from './config';
import { resolveColors } from '../../shared/profile';
import { Renderer, type Prev } from './render';
import { NetClient } from './net';
import { Ui, setupColors, slotTag, type MatchSetup } from './ui';

/** Frames the "GO!" and "GAME!" banners stay up. */
const GO_FRAMES = 50;
const GAME_OVER_FRAMES = 110;
/** Longest catch-up after a slow frame, so a hitch never fast-forwards the fight. */
const MAX_STEPS_PER_FRAME = 4;

/** `online`: an online fight, stepped from the server's frames; it never pauses. */
type Mode = 'menu' | 'game' | 'paused' | 'results' | 'online';

const keyboard = new Keyboard();
const sfx = new Sfx();
const renderer = new Renderer(document.getElementById('stage')!);
const net = new NetClient('brawler');
const ui = new Ui(document.getElementById('menu')!, document.getElementById('hud')!, {
  onFight: (setup) => startMatch(setup),
  onClick: () => { sfx.unlock(); sfx.click(); },
}, net);

let mode: Mode = 'menu';
let world: World = attractWorld();
let bots: (Bot | null)[] = [];
let human: boolean[] = [];
let names: string[] = [];
let prev: Prev[] = [];
let goTimer = 0;
let overTimer = 0;
let matchSetup: MatchSetup | null = null;
let attractBots: Bot[] = world.fighters.map((f) => createBot(f.slot, 2, 3));

/** Online fight state (ADR-0076). */
type QueuedFrame = { kind: 'frame'; frame: number; inputs: number[]; ack?: number[] } | { kind: 'snap'; frame: number; world: string };
let onlineQueue: QueuedFrame[] = [];
/** Your fighter slot online, -1 when watching. */
let onlineYou = -1;
/** Waiting for a few frames to arrive before stepping, so network jitter doesn't stutter the fight. */
let onlineBuffering = true;
/** Fewest frames waiting this drain window, ticks into it, and frames left to step off (ADR-0088). */
let onlineFewest = Infinity;
let onlineWindowTicks = 0;
let onlineDrain = 0;
/** The Esc menu is open over an online fight. */
let onlineMenu = false;
/**
 * Prediction (ADR-0090), when you have a fighter: `confirmed` is the server's fight, stepped as its frames arrive;
 * `world` (what's shown) is rebuilt from it every tick with your keys the server hasn't used yet.
 */
let confirmed: World | null = null;
/** Your keys sent but not yet used by the server, oldest first. */
let unacked: { seq: number; bits: number }[] = [];
let inputSeq = 0;
/** Everyone's keys in the newest confirmed frame (the guess for what they keep pressing). */
let lastBits: number[] = [];
/** Newest predicted frame already shown: its sounds and effects have played. */
let shownFrame = 0;
/** Events played from predicted frames, by frame, so the confirmed ones aren't played twice. */
let playedEvents = new Map<number, Set<string>>();
let desyncs = 0;

/** Three quick Space taps on a menu open the cheat code box (ADR-0077). */
const spaceTaps = new TripleTap(CHEAT_LOOKS.tapWindowMs);
function applyCheatLooks(): void {
  renderer.setMirror(cheatOn('mirror'));
  keyboard.mirrored = cheatOn('mirror');
}
onCheatsChange(applyCheatLooks);
applyCheatLooks();

net.match = {
  onMatch: (start, you) => startOnline(start, you),
  onFrames: (from, inputs, ack) => {
    if (mode !== 'online') return;
    inputs.forEach((bits, i) => onlineQueue.push({ kind: 'frame', frame: from + i, inputs: bits, ack: i === inputs.length - 1 ? ack : undefined }));
  },
  onSnap: (frame, json) => {
    if (mode === 'online') onlineQueue.push({ kind: 'snap', frame, world: json });
  },
  onCpu: (slot, level) => {
    if (mode !== 'online' && mode !== 'results') return;
    tags[slot] = { text: `CPU ${level}`, cpu: true };
    renderer.setTags(tags);
  },
  onEnd: () => {
    // Everyone else left before the last stock fell: show what there is.
    if (mode === 'online') showResults();
  },
};
net.onDrop = () => {
  if (mode === 'online' || (mode === 'results' && onlineResults)) toMenu('online');
};
let tags: { text: string; cpu: boolean }[] = [];
/** The results on screen are from an online fight. */
let onlineResults = false;

/** Bots fighting behind the menu. */
function attractWorld(): World {
  const w = createWorld('rooftop', [{ id: 'brawler' }, { id: 'blade' }, { id: 'spark' }, { id: 'titan' }], 99, 3);
  w.countdown = 0;
  return w;
}

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function startMatch(setup: MatchSetup): void {
  matchSetup = setup;
  // Random picks are drawn here, on the client, so the sim stays deterministic (Hard rule 2).
  const active = setup.slots
    .filter((s) => s.kind !== 'off')
    .map((s) => ({ ...s, fighter: s.random ? pickRandom(randomFighters()) : s.fighter }));
  const seed = (Math.random() * 1e9) | 0;
  // Team battles (ADR-0081): each fighter brings its team; friendly fire is a rule of the fight.
  const rules = { ...cheatRules(), friendlyFire: setup.teams && setup.friendlyFire };
  // Random, or a stage you banned since (ADR-0086): drawn from the open stages, here on the client too.
  const stage = drawStage(setup.stage, stageIds(), setup.stagePick ? stageBans() : [], Math.random);
  world = createWorld(stage, active.map((s) => ({ id: s.fighter, team: setup.teams ? s.team : -1 })), setup.stocks, seed, rules);
  bots = active.map((s, i) => (s.kind === 'bot' ? createBot(i, s.level, seed) : null));
  human = active.map((s) => s.kind === 'p1');
  // Your own tag and color (ADR-0083); CPUs keep theirs.
  setFightColors(setupColors(setup.slots).filter((_c, i) => setup.slots[i]!.kind !== 'off'));
  names = active.map((s) => `${slotTag(s)} ${FIGHTERS[s.fighter].name}`);
  tags = active.map((s) => ({ text: slotTag(s), cpu: s.kind === 'bot' }));
  renderer.setTags(tags);
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  onlineResults = false;
  goTimer = 0;
  overTimer = 0;
  mode = 'game';
  ui.hideMenu();
  ui.startHud(world, names, active.map((s) => s.kind === 'bot'));
  renderer.reset(world);
  keyboard.reset();
  sfx.unlock();
}

/** An online fight starts (or, joining mid-fight, is going on and we watch). */
function startOnline(start: MatchStart, you: number): void {
  world = createWorld(start.stage, start.fighters.map((f) => ({ id: f.fighter, team: f.team })), start.stocks, start.seed, start.rules);
  bots = [];
  human = [];
  onlineYou = you;
  onlineQueue = [];
  onlineBuffering = true;
  onlineFewest = Infinity;
  onlineWindowTicks = 0;
  onlineDrain = 0;
  onlineMenu = false;
  onlineResults = true;
  confirmed = you >= 0 ? cloneWorld(world) : null;
  unacked = [];
  inputSeq = 0;
  lastBits = start.fighters.map(() => 0);
  shownFrame = world.frame;
  playedEvents = new Map();
  // Each player's own tag and color (ADR-0083), the same on every screen in the room.
  setFightColors(resolveColors(start.fighters.map((f) => (f.member >= 0 ? f.color ?? -1 : -1))));
  const tagOf = (f: MatchStart['fighters'][number], i: number) => (f.member < 0 ? `CPU ${f.level}` : f.tag || (i === you ? 'YOU' : `P${i + 1}`));
  tags = start.fighters.map((f, i) => ({ text: tagOf(f, i), cpu: f.member < 0 }));
  names = start.fighters.map((f, i) => `${f.member < 0 ? `CPU ${f.level}` : f.tag || `P${i + 1}`} ${FIGHTERS[f.fighter].name}${i === you ? ' (you)' : ''}`);
  renderer.setTags(tags);
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  goTimer = 0;
  overTimer = 0;
  mode = 'online';
  ui.hideMenu();
  ui.startHud(world, names, start.fighters.map((f) => f.member < 0));
  renderer.reset(world);
  keyboard.reset();
  sfx.unlock();
}

/** One 60 Hz tick of an online fight: send our keys, then step the frames the server has sent. */
function tickOnline(): void {
  // Read every tick, even with the menu open, so keys pressed in the menu don't reach the fight afterwards.
  const keys = encodeInput(keyboard.read());
  if (confirmed) {
    tickPredicted(onlineMenu ? 0 : keys);
    return;
  }
  net.sendInput(0, ++inputSeq);
  const frames = () => onlineQueue.reduce((n, q) => n + (q.kind === 'frame' ? 1 : 0), 0);
  let waiting = frames();
  if (onlineBuffering) {
    if (waiting < ONLINE.bufferFrames) return;
    onlineBuffering = false;
  }
  if (!waiting) {
    // The frames stopped coming: wait for a few again.
    onlineBuffering = true;
    return;
  }
  // Fell far behind (a hidden tab, a long stall): jump ahead quietly. A bit behind: step two to catch up.
  const quiet = waiting > ONLINE.jumpFrames;
  // Frames that sat unused for a whole window are extra lag: step them off (ADR-0088).
  onlineFewest = Math.min(onlineFewest, waiting);
  if (++onlineWindowTicks >= ONLINE.drainWindowTicks) {
    onlineDrain = Math.max(0, onlineFewest - 1 - ONLINE.spareFrames);
    onlineFewest = Infinity;
    onlineWindowTicks = 0;
  }
  const drain = onlineDrain > 0 && waiting > 1 + ONLINE.spareFrames;
  if (drain) onlineDrain--;
  let steps = quiet ? waiting - ONLINE.bufferFrames : drain || waiting > ONLINE.catchUpFrames ? 2 : 1;
  while (steps > 0 && onlineQueue.length) {
    const q = onlineQueue.shift()!;
    if (q.kind === 'snap') {
      applySnapshot(q.frame, q.world);
      continue;
    }
    if (q.frame !== world.frame) continue; // Already past it (a snapshot moved us on).
    advance(q.inputs.map(decodeInput), !quiet || steps === 1);
    waiting--;
    steps--;
  }
  // A snapshot right behind the frames we stepped: take it now.
  while (onlineQueue[0]?.kind === 'snap') {
    const q = onlineQueue.shift() as Extract<QueuedFrame, { kind: 'snap' }>;
    applySnapshot(q.frame, q.world);
  }
}

/** The server's world after `frame`: ours should match it; if not, take the server's. */
function applySnapshot(frame: number, json: string): void {
  const ours = confirmed ?? world;
  if (frame === ours.frame && serializeWorld(ours) === json) return;
  const w = deserializeWorld(json);
  if (!w) return;
  // Tiny floating-point differences between browsers and the server's Node are expected now and then.
  if (frame === ours.frame) console.debug(`dronefight: online fight drifted at frame ${frame}; using the server's (${++desyncs} so far): ${describeDrift(serializeWorld(ours), json)}`);
  if (confirmed) {
    confirmed = w;
    return;
  }
  world = w;
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
}

/** A copy of a world to step ahead without touching the original (the stage is shared, never changed). */
function cloneWorld(w: World): World {
  const copy = structuredClone({ ...w, stage: null, events: [] }) as unknown as World;
  copy.stage = w.stage;
  return copy;
}

/** Identifies an event within its frame, to tell whether a predicted frame already played it. */
function eventKey(e: GameEvent): string {
  const r = e as Partial<Record<'slot' | 'attacker' | 'target' | 'look', unknown>>;
  return `${e.type}|${r.slot ?? ''}|${r.attacker ?? ''}|${r.target ?? ''}|${r.look ?? ''}`;
}

/**
 * Online with a fighter of your own (ADR-0090): send this tick's keys, step every frame the server has sent into
 * the confirmed fight, then show it stepped ahead with your keys the server hasn't used yet. A wrong guess about
 * anyone else's keys is fixed on the next tick, when the fight is rebuilt from the newer confirmed frames.
 */
function tickPredicted(keys: number): void {
  const seq = ++inputSeq;
  net.sendInput(keys, seq);
  unacked.push({ seq, bits: keys });
  let fight = confirmed!;
  // The server's frames, as soon as they arrive: no jitter buffer, the prediction covers the gaps.
  while (onlineQueue.length) {
    const q = onlineQueue.shift()!;
    if (q.kind === 'snap') {
      applySnapshot(q.frame, q.world);
      fight = confirmed!;
      continue;
    }
    if (q.frame !== fight.frame) continue; // Already past it (a snapshot moved us on).
    step(fight, q.inputs.map(decodeInput));
    lastBits = q.inputs;
    // Sounds and effects the prediction didn't show (someone else's surprise), late rather than never.
    const played = playedEvents.get(fight.frame);
    const missed = fight.events.filter((e) => !played?.has(eventKey(e)) && e.type !== 'go');
    if (fight.frame <= shownFrame && missed.length) {
      playEvents(missed, fight);
      renderer.onEvents(fight, missed);
    }
    playedEvents.delete(fight.frame);
    if (fight.over && ++overTimer >= GAME_OVER_FRAMES) {
      world = fight;
      showResults();
      return;
    }
    const acked = q.ack?.[onlineYou];
    if (acked !== undefined) unacked = unacked.filter((u) => u.seq > acked);
  }
  // Stalled for long (a hidden tab): the oldest keys won't be used as predicted any more.
  if (unacked.length > ONLINE.maxPredictFrames * 3) unacked = unacked.slice(-ONLINE.maxPredictFrames);
  // Rebuild what's shown: the confirmed fight plus your pending keys, everyone else holding theirs.
  const shown = cloneWorld(fight);
  const ahead = unacked.slice(0, ONLINE.maxPredictFrames);
  let before = shown.fighters.map((f) => ({ x: f.x, y: f.y }));
  for (const u of ahead) {
    before = shown.fighters.map((f) => ({ x: f.x, y: f.y }));
    const countdown = Math.ceil(shown.countdown / 60);
    step(shown, lastBits.map((b, i) => decodeInput(i === onlineYou ? u.bits : b)));
    if (shown.frame > shownFrame) {
      shownFrame = shown.frame;
      playedEvents.set(shown.frame, new Set(shown.events.map(eventKey)));
      frameEffects(shown, countdown);
    }
  }
  // Forget what was played for frames long confirmed.
  for (const f of playedEvents.keys()) if (f <= fight.frame) playedEvents.delete(f);
  world = shown;
  prev = before;
}

function pause(): void {
  if (mode !== 'game') return;
  mode = 'paused';
  ui.showPause(resume, () => toMenu('main'));
}

function resume(): void {
  if (mode !== 'paused') return;
  ui.hideMenu();
  mode = 'game';
  keyboard.takePressed();
  keyboard.clearTaps();
}

/** Back to the menus with CPUs fighting behind them; `screen` picks which menu. */
function toMenu(screen: 'select' | 'main' | 'online' | 'stages' = 'main'): void {
  mode = 'menu';
  confirmed = null;
  onlineMenu = false;
  onlineQueue = [];
  ui.hideHud();
  world = attractWorld();
  setFightColors();
  attractBots = world.fighters.map((f) => createBot(f.slot, 2, 3));
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  renderer.reset(world);
  renderer.setTags(world.fighters.map(() => ({ text: 'CPU', cpu: true })));
  if (screen === 'select') ui.showSelect();
  else if (screen === 'stages') ui.showStages(false);
  else if (screen === 'online') ui.showOnline();
  else ui.showMain();
}

function showResults(): void {
  const online = mode === 'online';
  // The results are the server's, not a guess.
  if (confirmed) world = confirmed;
  confirmed = null;
  mode = 'results';
  onlineMenu = false;
  onlineQueue = [];
  ui.setBanner('');
  if (online) {
    ui.showOnlineResults(world, names, () => toMenu('online'), () => { net.leave(); toMenu('online'); });
    return;
  }
  ui.showResults(world, names, () => matchSetup && startMatch(matchSetup), () => toMenu('select'), () => toMenu('main'), matchSetup?.stagePick ? () => toMenu('stages') : undefined);
}

function pan(x: number): number {
  return Math.max(-0.8, Math.min(0.8, x / 900));
}

function playEvents(events: readonly GameEvent[], w: World = world): void {
  for (const e of events) {
    switch (e.type) {
      case 'hit':
        if (e.kb > 140) sfx.smash(pan(e.x));
        else sfx.hit(e.dmg, pan(e.x));
        break;
      case 'shieldhit': sfx.shieldHit(pan(e.x)); break;
      case 'parry': sfx.parry(pan(e.x)); break;
      case 'counter': sfx.parry(pan(e.x)); break;
      case 'grab': sfx.grab(pan(w.fighters[e.slot]!.x)); break;
      case 'throw': sfx.swing(pan(w.fighters[e.slot]!.x)); break;
      case 'tech': sfx.land(pan(w.fighters[e.slot]!.x)); break;
      case 'shieldbreak': sfx.shieldBreak(0); break;
      case 'ko': sfx.ko(pan(e.x)); break;
      case 'jump': sfx.jump(e.air, pan(w.fighters[e.slot]!.x)); break;
      case 'land': if (e.hard) sfx.land(pan(w.fighters[e.slot]!.x)); break;
      case 'swing': sfx.swing(pan(w.fighters[e.slot]!.x)); break;
      case 'shot': sfx.shot(e.kind, e.look, pan(w.fighters[e.slot]!.x)); break;
      case 'reflect': sfx.parry(pan(e.x)); break;
      case 'status': sfx.status(e.status, pan(w.fighters[e.slot]!.x)); break;
      case 'explode': if (e.look === 'smoke' || e.look === 'tomato' || e.look === 'pie') sfx.land(pan(e.x)); else sfx.explode(pan(e.x)); break;
      case 'go': sfx.beep(true); goTimer = GO_FRAMES; break;
      default: break;
    }
  }
}

function stepGame(): void {
  const player = keyboard.read();
  const inputs: Input[] = world.fighters.map((_f, i) => {
    const bot = bots[i];
    if (bot) return botInput(bot, world);
    return human[i] ? player : { ...NO_INPUT };
  });
  advance(inputs);
}

/** Step the fight one frame with these inputs, then play its sounds and effects (`effects` false: just step). */
function advance(inputs: Input[], effects = true): void {
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  const before = Math.ceil(world.countdown / 60);
  step(world, inputs);
  if (!effects) return;
  frameEffects(world, before);
  if (world.over && ++overTimer >= GAME_OVER_FRAMES) showResults();
}

/** Sounds, effects, HUD and banners for a frame just stepped (`countdownBefore`: whole seconds left before it). */
function frameEffects(w: World, countdownBefore: number): void {
  const after = Math.ceil(w.countdown / 60);
  if (w.countdown > 0 && after !== countdownBefore) sfx.beep(false);
  playEvents(w.events, w);
  renderer.onEvents(w, w.events);
  renderer.tick(w);
  ui.updateHud(w);
  ui.setPrimed(keyboard.primed);
  if (w.countdown > 0) ui.setBanner(String(after));
  else if (goTimer > 0) { goTimer--; ui.setBanner('GO!'); }
  else if (w.over) ui.setBanner('GAME!');
  else ui.setBanner('');
}

function stepAttract(): void {
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  step(world, attractBots.map((b) => botInput(b, world)));
  renderer.onEvents(world, world.events);
  renderer.tick(world);
}

function handleKeys(): void {
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  for (const code of keyboard.takePressed()) {
    sfx.unlock();
    // Typing a room code or feedback: leave the keys to the text box.
    if (typing) continue;
    if (code === 'Space' && ui.current && spaceTaps.tap(performance.now())) { ui.openCheats(); continue; }
    if (code === 'KeyM') { sfx.setMuted(!sfx.muted); continue; }
    if (code === 'KeyF' && mode !== 'game') { toggleFullscreen(); continue; }
    if (mode === 'game') {
      if (code === 'Escape') pause();
      continue;
    }
    if (mode === 'online') {
      if (code === 'Escape') toggleOnlineMenu();
      else if (onlineMenu) ui.menuKey(code);
      continue;
    }
    if (mode === 'paused' && code === 'Escape') { resume(); continue; }
    // Every menu screen (title, main, select, online, pause, results) handles its own keys (ADR-0075).
    ui.menuKey(code);
  }
}

function toggleOnlineMenu(): void {
  onlineMenu = !onlineMenu;
  if (onlineMenu) ui.showOnlineMenu(toggleOnlineMenu, () => { net.leave(); toMenu('online'); });
  else {
    ui.hideMenu();
    keyboard.takePressed();
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  handleKeys();
  if (mode === 'game' || mode === 'menu' || mode === 'results' || mode === 'online') {
    // TURBO runs offline fights faster; online fights keep the server's clock.
    acc += dt * (mode === 'game' && cheatOn('turbo') ? CHEAT_LOOKS.turbo : 1);
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      if (mode === 'game') stepGame();
      else if (mode === 'online') tickOnline();
      else if (mode === 'menu') stepAttract();
      else renderer.tick(world);
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }
  renderer.draw(world, prev, mode === 'paused' ? 1 : Math.min(1, acc / DT));
  requestAnimationFrame(frame);
}

// Leaving the tab mid-fight pauses it.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

renderer.reset(world);
renderer.setTags(world.fighters.map(() => ({ text: 'CPU', cpu: true })));
// An invite link (?room=42) opens the lobby and joins; otherwise boot to the title screen (ADR-0075).
const params = new URLSearchParams(location.search);
// `?debug`: the fight and the connection on `window.dronefight`, for timing tests (docs/RUNBOOK.md).
if (params.has('debug')) Object.assign(window, { dronefight: { net, get world() { return world; }, get confirmed() { return confirmed; }, get you() { return onlineYou; } } });
const invite = params.get('room');
if (invite && /^\d{2}$/.test(invite)) {
  ui.showOnline();
  net.join(invite);
  history.replaceState(null, '', location.pathname);
} else {
  ui.showTitle();
}
requestAnimationFrame(frame);

