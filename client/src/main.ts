// dronefight: a side-view platform fighter (ADR-0070, ADR-0071, ADR-0072). Up to four fighters: you on the keyboard plus CPUs,
// or friends on their own computers in an online room (ADR-0076).

import './styles.css';
import { botInput, createBot, type Bot } from '../../shared/fighter/bot';
import { DT } from '../../shared/fighter/config';
import { decodeInput, describeDrift, deserializeWorld, encodeInput, serializeWorld, type MatchStart } from '../../shared/online';
import { FIGHTER_IDS, FIGHTERS } from '../../shared/fighter/fighters';
import { createWorld, NO_INPUT, step, type GameEvent, type Input, type World } from '../../shared/fighter/sim';
import { Sfx } from './audio';
import { Keyboard } from './input';
import { ONLINE } from './config';
import { Renderer, type Prev } from './render';
import { NetClient } from './net';
import { Ui, slotTag, type MatchSetup } from './ui';

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
type QueuedFrame = { kind: 'frame'; frame: number; inputs: number[] } | { kind: 'snap'; frame: number; world: string };
let onlineQueue: QueuedFrame[] = [];
/** Your fighter slot online, -1 when watching. */
let onlineYou = -1;
/** Waiting for a few frames to arrive before stepping, so network jitter doesn't stutter the fight. */
let onlineBuffering = true;
/** The Esc menu is open over an online fight. */
let onlineMenu = false;
let desyncs = 0;

net.match = {
  onMatch: (start, you) => startOnline(start, you),
  onFrames: (from, inputs) => {
    if (mode !== 'online') return;
    inputs.forEach((bits, i) => onlineQueue.push({ kind: 'frame', frame: from + i, inputs: bits }));
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

function startMatch(setup: MatchSetup): void {
  matchSetup = setup;
  // Random picks are drawn here, on the client, so the sim stays deterministic (Hard rule 2).
  const active = setup.slots
    .filter((s) => s.kind !== 'off')
    .map((s) => ({ ...s, fighter: s.random ? FIGHTER_IDS[Math.floor(Math.random() * FIGHTER_IDS.length)]! : s.fighter }));
  const seed = (Math.random() * 1e9) | 0;
  world = createWorld(setup.stage, active.map((s) => ({ id: s.fighter })), setup.stocks, seed);
  bots = active.map((s, i) => (s.kind === 'bot' ? createBot(i, s.level, seed) : null));
  human = active.map((s) => s.kind === 'p1');
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
  world = createWorld(start.stage, start.fighters.map((f) => ({ id: f.fighter })), start.stocks, start.seed);
  bots = [];
  human = [];
  onlineYou = you;
  onlineQueue = [];
  onlineBuffering = true;
  onlineMenu = false;
  onlineResults = true;
  tags = start.fighters.map((f, i) => (f.member < 0 ? { text: `CPU ${f.level}`, cpu: true } : { text: i === you ? 'YOU' : `P${i + 1}`, cpu: false }));
  names = start.fighters.map((f, i) => `${f.member < 0 ? `CPU ${f.level}` : `P${i + 1}`} ${FIGHTERS[f.fighter].name}${i === you ? ' (you)' : ''}`);
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
  net.sendInput(onlineYou >= 0 && !onlineMenu ? encodeInput(keyboard.read()) : 0);
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
  let steps = quiet ? waiting - ONLINE.bufferFrames : waiting > ONLINE.catchUpFrames ? 2 : 1;
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
  if (frame === world.frame && serializeWorld(world) === json) return;
  const w = deserializeWorld(json);
  if (!w) return;
  // Tiny floating-point differences between browsers and the server's Node are expected now and then.
  if (frame === world.frame) console.debug(`dronefight: online fight drifted at frame ${frame}; using the server's (${++desyncs} so far): ${describeDrift(serializeWorld(world), json)}`);
  world = w;
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
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
}

/** Back to the menus with CPUs fighting behind them; `screen` picks which menu. */
function toMenu(screen: 'select' | 'main' | 'online' = 'main'): void {
  mode = 'menu';
  onlineMenu = false;
  onlineQueue = [];
  ui.hideHud();
  world = attractWorld();
  attractBots = world.fighters.map((f) => createBot(f.slot, 2, 3));
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  renderer.reset(world);
  renderer.setTags(world.fighters.map(() => ({ text: 'CPU', cpu: true })));
  if (screen === 'select') ui.showSelect();
  else if (screen === 'online') ui.showOnline();
  else ui.showMain();
}

function showResults(): void {
  const online = mode === 'online';
  mode = 'results';
  onlineMenu = false;
  onlineQueue = [];
  ui.setBanner('');
  if (online) {
    ui.showOnlineResults(world, names, () => toMenu('online'), () => { net.leave(); toMenu('online'); });
    return;
  }
  ui.showResults(world, names, () => matchSetup && startMatch(matchSetup), () => toMenu('select'), () => toMenu('main'));
}

function pan(x: number): number {
  return Math.max(-0.8, Math.min(0.8, x / 900));
}

function playEvents(events: readonly GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'hit':
        if (e.kb > 140) sfx.smash(pan(e.x));
        else sfx.hit(e.dmg, pan(e.x));
        break;
      case 'shieldhit': sfx.shieldHit(pan(e.x)); break;
      case 'parry': sfx.parry(pan(e.x)); break;
      case 'counter': sfx.parry(pan(e.x)); break;
      case 'grab': sfx.grab(pan(world.fighters[e.slot]!.x)); break;
      case 'throw': sfx.swing(pan(world.fighters[e.slot]!.x)); break;
      case 'tech': sfx.land(pan(world.fighters[e.slot]!.x)); break;
      case 'shieldbreak': sfx.shieldBreak(0); break;
      case 'ko': sfx.ko(pan(e.x)); break;
      case 'jump': sfx.jump(e.air, pan(world.fighters[e.slot]!.x)); break;
      case 'land': if (e.hard) sfx.land(pan(world.fighters[e.slot]!.x)); break;
      case 'swing': sfx.swing(pan(world.fighters[e.slot]!.x)); break;
      case 'shot': sfx.shot(e.kind, e.look, pan(world.fighters[e.slot]!.x)); break;
      case 'reflect': sfx.parry(pan(e.x)); break;
      case 'status': sfx.status(e.status, pan(world.fighters[e.slot]!.x)); break;
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
  const after = Math.ceil(world.countdown / 60);
  if (!effects) return;
  if (world.countdown > 0 && after !== before) sfx.beep(false);
  playEvents(world.events);
  renderer.onEvents(world, world.events);
  renderer.tick(world);
  ui.updateHud(world);
  ui.setPrimed(keyboard.primed);
  if (world.countdown > 0) ui.setBanner(String(after));
  else if (goTimer > 0) { goTimer--; ui.setBanner('GO!'); }
  else if (world.over) ui.setBanner('GAME!');
  else ui.setBanner('');
  if (world.over && ++overTimer >= GAME_OVER_FRAMES) showResults();
}

function stepAttract(): void {
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  step(world, attractBots.map((b) => botInput(b, world)));
  renderer.onEvents(world, world.events);
  renderer.tick(world);
}

function handleKeys(): void {
  const typing = document.activeElement instanceof HTMLInputElement;
  for (const code of keyboard.takePressed()) {
    sfx.unlock();
    // Typing a room code: leave the keys to the text box.
    if (typing) continue;
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
    acc += dt;
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
const invite = new URLSearchParams(location.search).get('room');
if (invite && /^\d{2}$/.test(invite)) {
  ui.showOnline();
  net.join(invite);
  history.replaceState(null, '', location.pathname);
} else {
  ui.showTitle();
}
requestAnimationFrame(frame);

