// dronefight: a side-view platform fighter (ADR-0070, ADR-0071, ADR-0072). Up to four fighters: you on the keyboard plus CPUs.

import './styles.css';
import { botInput, createBot, type Bot } from '../../shared/fighter/bot';
import { DT } from '../../shared/fighter/config';
import { FIGHTER_IDS, FIGHTERS } from '../../shared/fighter/fighters';
import { createWorld, NO_INPUT, step, type GameEvent, type Input, type World } from '../../shared/fighter/sim';
import { Sfx } from './audio';
import { Keyboard } from './input';
import { Renderer, type Prev } from './render';
import { NetClient } from './net';
import { Ui, slotTag, type MatchSetup } from './ui';

/** Frames the "GO!" and "GAME!" banners stay up. */
const GO_FRAMES = 50;
const GAME_OVER_FRAMES = 110;
/** Longest catch-up after a slow frame, so a hitch never fast-forwards the fight. */
const MAX_STEPS_PER_FRAME = 4;

type Mode = 'menu' | 'game' | 'paused' | 'results';

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
  renderer.setTags(active.map((s) => ({ text: slotTag(s), cpu: s.kind === 'bot' })));
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  goTimer = 0;
  overTimer = 0;
  mode = 'game';
  ui.hideMenu();
  ui.startHud(world, names, active.map((s) => s.kind === 'bot'));
  renderer.reset(world);
  keyboard.reset();
  sfx.unlock();
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
function toMenu(screen: 'select' | 'main' = 'main'): void {
  mode = 'menu';
  ui.hideHud();
  world = attractWorld();
  attractBots = world.fighters.map((f) => createBot(f.slot, 2, 3));
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  renderer.reset(world);
  renderer.setTags(world.fighters.map(() => ({ text: 'CPU', cpu: true })));
  if (screen === 'select') ui.showSelect();
  else ui.showMain();
}

function showResults(): void {
  mode = 'results';
  ui.setBanner('');
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
  prev = world.fighters.map((f) => ({ x: f.x, y: f.y }));
  const player = keyboard.read();
  const inputs: Input[] = world.fighters.map((_f, i) => {
    const bot = bots[i];
    if (bot) return botInput(bot, world);
    return human[i] ? player : { ...NO_INPUT };
  });
  const before = Math.ceil(world.countdown / 60);
  step(world, inputs);
  const after = Math.ceil(world.countdown / 60);
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
    if (mode === 'paused' && code === 'Escape') { resume(); continue; }
    // Every menu screen (title, main, select, online, pause, results) handles its own keys (ADR-0075).
    ui.menuKey(code);
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
  if (mode === 'game' || mode === 'menu' || mode === 'results') {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      if (mode === 'game') stepGame();
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
