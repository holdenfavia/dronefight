// Menus and HUD (ADR-0070): dark translucent panels, orange accents, bold condensed caps (ADR-0039).

import { BOT_LEVEL_NAMES, type BotLevel } from '../../shared/fighter/bot';
import { MATCH } from '../../shared/fighter/config';
import { FIGHTER_IDS, FIGHTERS, type FighterId } from '../../shared/fighter/fighters';
import type { World } from '../../shared/fighter/sim';
import { STAGE_IDS, STAGES, type StageId } from '../../shared/fighter/stages';
import { SLOT_COLORS } from './config';
import { drawDrone } from './drones';
import { KEY_LABELS } from './input';

export type SlotKind = 'p1' | 'p2' | 'bot' | 'off';

export interface SlotSetup {
  kind: SlotKind;
  fighter: FighterId;
  level: BotLevel;
}

export interface MatchSetup {
  slots: SlotSetup[];
  stage: StageId;
  stocks: number;
}

const STORAGE_KEY = 'dronefight.brawl.setup.v1';

export function defaultSetup(): MatchSetup {
  return {
    slots: [
      { kind: 'p1', fighter: 'freestyle', level: 2 },
      { kind: 'bot', fighter: 'racer', level: 2 },
      { kind: 'off', fighter: 'heavy', level: 2 },
      { kind: 'off', fighter: 'flipper', level: 2 },
    ],
    stage: 'rooftop',
    stocks: MATCH.defaultStocks,
  };
}

export function loadSetup(): MatchSetup {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSetup();
    const s = JSON.parse(raw) as MatchSetup;
    const d = defaultSetup();
    if (!Array.isArray(s.slots) || s.slots.length !== 4 || !STAGE_IDS.includes(s.stage)) return d;
    for (const slot of s.slots) {
      if (!FIGHTER_IDS.includes(slot.fighter) || !['p1', 'p2', 'bot', 'off'].includes(slot.kind) || ![1, 2, 3].includes(slot.level)) return d;
    }
    s.stocks = Math.max(1, Math.min(9, Math.round(s.stocks) || d.stocks));
    return s;
  } catch {
    return defaultSetup();
  }
}

export function saveSetup(setup: MatchSetup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode: settings just don't stick.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function slotLabel(slot: SlotSetup): string {
  if (slot.kind === 'p1') return 'Player 1';
  if (slot.kind === 'p2') return 'Player 2';
  if (slot.kind === 'bot') return `CPU · ${BOT_LEVEL_NAMES[slot.level]}`;
  return 'Off';
}

/** Cycle a slot through Player 1, Player 2, CPU (three levels) and Off. */
function nextKind(slot: SlotSetup): void {
  const order: [SlotKind, BotLevel][] = [['p1', 2], ['p2', 2], ['bot', 1], ['bot', 2], ['bot', 3], ['off', 2]];
  const i = order.findIndex(([k, l]) => k === slot.kind && (k !== 'bot' || l === slot.level));
  const [kind, level] = order[(i + 1) % order.length]!;
  slot.kind = kind;
  if (kind === 'bot') slot.level = level;
}

function previewCanvas(id: FighterId, color: string, size = 120): HTMLCanvasElement {
  const c = el('canvas', 'preview');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = size * 1.6 * dpr;
  c.height = size * dpr;
  c.style.width = `${size * 1.6}px`;
  c.style.height = `${size}px`;
  const ctx = c.getContext('2d')!;
  let t = 0;
  const draw = () => {
    if (!c.isConnected) return;
    t++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = (id === 'heavy' ? 1.6 : id === 'racer' ? 2.8 : 2.4) * dpr * (size / 120);
    ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2 + Math.sin(t / 20) * 3 * dpr);
    drawDrone(ctx, id, { color, phase: t * 1.2, blink: t % 200 < 6 ? 1 : 0, flash: 0, thrust: 0.8 });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return c;
}

export interface MenuHandlers {
  onFight(setup: MatchSetup): void;
  onClick(): void;
}

export class Ui {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private banner: HTMLElement;
  private cards: { percent: HTMLElement; stocks: HTMLElement; card: HTMLElement; lastPercent: number; lastStocks: number }[] = [];
  private setup: MatchSetup;
  private screen: HTMLElement | null = null;

  constructor(menuRoot: HTMLElement, hudRoot: HTMLElement, private handlers: MenuHandlers) {
    this.root = menuRoot;
    this.hud = hudRoot;
    this.banner = el('div', 'banner');
    this.hud.appendChild(this.banner);
    this.setup = loadSetup();
  }

  get currentSetup(): MatchSetup {
    return this.setup;
  }

  private show(screen: HTMLElement): void {
    this.screen?.remove();
    this.screen = screen;
    this.root.appendChild(screen);
  }

  hideMenu(): void {
    this.screen?.remove();
    this.screen = null;
  }

  /** Character, stage and rules select. */
  showSelect(): void {
    const s = this.setup;
    const page = el('div', 'screen select');
    const header = el('div', 'title-row');
    header.append(el('h1', 'logo', 'DRONEFIGHT'), el('div', 'tagline', 'Knock your friends off the roof'));
    page.appendChild(header);

    const slots = el('div', 'slots');
    s.slots.forEach((slot, i) => {
      const color = SLOT_COLORS[i]!;
      const card = el('div', `slot ${slot.kind === 'off' ? 'off' : ''}`);
      card.style.setProperty('--slot', color);
      const kind = el('button', 'kind', slotLabel(slot));
      kind.title = 'Click to change who flies this drone';
      kind.onclick = () => {
        this.handlers.onClick();
        nextKind(slot);
        // Only one Player 1 and one Player 2.
        if (slot.kind === 'p1' || slot.kind === 'p2') {
          for (const other of s.slots) if (other !== slot && other.kind === slot.kind) other.kind = 'bot';
        }
        this.commit();
      };
      card.appendChild(kind);
      if (slot.kind !== 'off') {
        const def = FIGHTERS[slot.fighter];
        const pick = el('div', 'pick');
        const prev = el('button', 'arrow', '‹');
        const next = el('button', 'arrow', '›');
        prev.onclick = () => { this.handlers.onClick(); this.cycleFighter(i, -1); };
        next.onclick = () => { this.handlers.onClick(); this.cycleFighter(i, 1); };
        pick.append(prev, previewCanvas(slot.fighter, color), next);
        card.append(pick, el('div', 'fighter-name', def.name), el('div', 'blurb', def.blurb));
        if (slot.kind === 'p1' || slot.kind === 'p2') {
          const keys = KEY_LABELS[slot.kind];
          card.appendChild(el('div', 'hint', `${keys.left} ${keys.right} to pick`));
        }
      } else {
        card.appendChild(el('div', 'empty', 'Click above to add a player or CPU'));
      }
      slots.appendChild(card);
    });
    page.appendChild(slots);

    const options = el('div', 'options');
    const stageBtn = el('button', 'option', `Stage: ${STAGES[s.stage].name}`);
    stageBtn.onclick = () => {
      this.handlers.onClick();
      s.stage = STAGE_IDS[(STAGE_IDS.indexOf(s.stage) + 1) % STAGE_IDS.length]!;
      this.commit();
    };
    const stocksBtn = el('button', 'option', `Stocks: ${s.stocks}`);
    stocksBtn.onclick = () => {
      this.handlers.onClick();
      s.stocks = (s.stocks % 5) + 1;
      this.commit();
    };
    const fight = el('button', 'fight', 'Fight!');
    const players = s.slots.filter((x) => x.kind !== 'off').length;
    fight.disabled = players < 2;
    fight.title = players < 2 ? 'Add at least two drones' : 'Enter';
    fight.onclick = () => this.fight();
    options.append(stageBtn, el('div', 'stage-blurb', STAGES[s.stage].blurb), stocksBtn, fight);
    page.appendChild(options);

    page.appendChild(this.controlsCard());
    this.show(page);
  }

  private controlsCard(): HTMLElement {
    const card = el('div', 'controls');
    const row = (label: string, p1: string, p2: string) => {
      const r = el('div', 'crow');
      r.append(el('span', 'clabel', label), el('kbd', '', p1), el('kbd', '', p2));
      return r;
    };
    const k1 = KEY_LABELS.p1;
    const k2 = KEY_LABELS.p2;
    const head = el('div', 'crow head');
    head.append(el('span', 'clabel', ''), el('span', 'cp', 'Player 1'), el('span', 'cp', 'Player 2'));
    card.append(
      head,
      row('Move', `${k1.left} ${k1.right}`, `${k2.left} ${k2.right}`),
      row('Jump (again in the air)', k1.up, k2.up),
      row('Drop / fast fall', k1.down, k2.down),
      row('Attack (+ direction)', k1.attack, k2.attack),
      row('Special (+ direction)', k1.special, k2.special),
      row('Shield / dodge', k1.shield, k2.shield),
    );
    card.appendChild(el('div', 'tips', 'Up + Special flies you back to the stage. Side + Special dashes. Down + Special drops a bomb (the Flipper slams down instead). The more damage a drone has, the further it flies. Knock them past the edge of the screen. Esc pauses, M mutes, F fullscreen.'));
    return card;
  }

  cycleFighter(slotIndex: number, dir: number): void {
    const slot = this.setup.slots[slotIndex]!;
    if (slot.kind === 'off') return;
    const i = FIGHTER_IDS.indexOf(slot.fighter);
    slot.fighter = FIGHTER_IDS[(i + dir + FIGHTER_IDS.length) % FIGHTER_IDS.length]!;
    this.commit();
  }

  private commit(): void {
    saveSetup(this.setup);
    this.showSelect();
  }

  fight(): void {
    if (this.setup.slots.filter((x) => x.kind !== 'off').length < 2) return;
    saveSetup(this.setup);
    this.handlers.onFight(this.setup);
  }

  showPause(onResume: () => void, onQuit: () => void): void {
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel');
    const resume = el('button', 'fight', 'Resume');
    resume.onclick = onResume;
    const quit = el('button', 'option', 'Quit to menu');
    quit.onclick = onQuit;
    panel.append(el('h2', '', 'Paused'), resume, quit, this.controlsCard());
    page.appendChild(panel);
    this.show(page);
  }

  showResults(world: World, names: string[], onRematch: () => void, onMenu: () => void): void {
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel results');
    const winner = world.winner >= 0 ? world.fighters[world.winner]! : null;
    const title = el('h2', '', winner ? `${names[winner.slot]} wins!` : 'No contest');
    if (winner) title.style.color = SLOT_COLORS[winner.slot]!;
    panel.appendChild(title);
    if (winner) panel.appendChild(previewCanvas(winner.id, SLOT_COLORS[winner.slot]!, 140));
    const table = el('table', 'stats');
    const head = el('tr');
    for (const h of ['', 'KOs', 'Falls', 'Damage dealt']) head.appendChild(el('th', '', h));
    table.appendChild(head);
    const order = [...world.fighters].sort((a, b) => b.stocks - a.stocks || b.stats.kos - a.stats.kos);
    for (const f of order) {
      const tr = el('tr');
      const name = el('td', 'who', names[f.slot]!);
      name.style.color = SLOT_COLORS[f.slot]!;
      tr.append(name, el('td', '', String(f.stats.kos)), el('td', '', String(f.stats.falls)), el('td', '', `${Math.round(f.stats.damageDealt)}%`));
      table.appendChild(tr);
    }
    panel.appendChild(table);
    const again = el('button', 'fight', 'Rematch');
    again.onclick = onRematch;
    again.title = 'Enter';
    const menu = el('button', 'option', 'Change drones');
    menu.onclick = onMenu;
    panel.append(again, menu);
    page.appendChild(panel);
    this.show(page);
  }

  /** Build the damage cards along the bottom for a new match. */
  startHud(world: World, names: string[]): void {
    for (const c of this.cards) c.card.remove();
    this.cards = [];
    const bar = this.hud.querySelector('.cards') ?? this.hud.appendChild(el('div', 'cards'));
    bar.replaceChildren();
    for (const f of world.fighters) {
      const card = el('div', 'card');
      card.style.setProperty('--slot', SLOT_COLORS[f.slot]!);
      const icon = previewCanvas(f.id, SLOT_COLORS[f.slot]!, 44);
      const percent = el('div', 'percent', '0%');
      const stocks = el('div', 'stocks');
      const info = el('div', 'info');
      info.append(percent, el('div', 'name', names[f.slot]!), stocks);
      card.append(icon, info);
      bar.appendChild(card);
      this.cards.push({ percent, stocks, card, lastPercent: -1, lastStocks: -1 });
    }
    this.hud.classList.add('on');
    this.updateHud(world);
  }

  hideHud(): void {
    this.hud.classList.remove('on');
    this.banner.textContent = '';
  }

  updateHud(world: World): void {
    world.fighters.forEach((f, i) => {
      const c = this.cards[i];
      if (!c) return;
      const p = Math.floor(f.percent);
      if (p !== c.lastPercent) {
        if (p > c.lastPercent && c.lastPercent >= 0) {
          c.card.classList.remove('shake');
          void c.card.offsetWidth;
          c.card.classList.add('shake');
        }
        c.lastPercent = p;
        c.percent.textContent = `${p}%`;
        c.percent.style.color = percentColor(p);
      }
      if (f.stocks !== c.lastStocks) {
        c.lastStocks = f.stocks;
        c.stocks.replaceChildren(...Array.from({ length: Math.max(0, f.stocks) }, () => el('span', 'stock')));
        c.card.classList.toggle('out', f.stocks <= 0);
      }
    });
  }

  setBanner(text: string): void {
    if (this.banner.textContent !== text) {
      this.banner.textContent = text;
      this.banner.classList.remove('pop');
      void this.banner.offsetWidth;
      if (text) this.banner.classList.add('pop');
    }
  }
}

/** White at 0%, through yellow and orange, to dark red past 150%. */
export function percentColor(p: number): string {
  const t = Math.min(1, p / 150);
  const stops: [number, number, number][] = [[245, 245, 240], [255, 226, 90], [255, 120, 30], [200, 20, 20]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const k = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const c = a.map((v, j) => Math.round(v + (b[j]! - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
