// Menus and HUD (ADR-0070): dark translucent panels, orange accents, bold condensed caps (ADR-0039).

import { BOT_LEVEL_NAMES, type BotLevel } from '../../shared/fighter/bot';
import { MATCH } from '../../shared/fighter/config';
import { FIGHTER_IDS, FIGHTERS, type FighterId } from '../../shared/fighter/fighters';
import type { World } from '../../shared/fighter/sim';
import { STAGE_IDS, STAGES, type StageId } from '../../shared/fighter/stages';
import { SLOT_COLORS } from './config';
import { drawFighterFigure } from './figures';
import { KEY_LABELS } from './input';

/** One player per keyboard (ADR-0071); CPUs fill the other slots. */
export type SlotKind = 'p1' | 'bot' | 'off';

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

const STORAGE_KEY = 'dronefight.brawl.setup.v3';

export function defaultSetup(): MatchSetup {
  return {
    slots: [
      { kind: 'p1', fighter: 'brawler', level: 2 },
      { kind: 'bot', fighter: 'blade', level: 2 },
      { kind: 'off', fighter: 'spark', level: 2 },
      { kind: 'off', fighter: 'titan', level: 2 },
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
      if (!FIGHTER_IDS.includes(slot.fighter) || !['p1', 'bot', 'off'].includes(slot.kind) || ![1, 2, 3].includes(slot.level)) return d;
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
  if (slot.kind === 'p1') return 'You';
  if (slot.kind === 'bot') return `CPU · ${BOT_LEVEL_NAMES[slot.level]}`;
  return 'Off';
}

/** Cycle a slot through You, CPU (three levels) and Off. */
function nextKind(slot: SlotSetup): void {
  const order: [SlotKind, BotLevel][] = [['p1', 2], ['bot', 1], ['bot', 2], ['bot', 3], ['off', 2]];
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
    const k = (id === 'titan' ? 1.7 : 2.4) * dpr * (size / 120);
    ctx.setTransform(k, 0, 0, k, c.width / 2, c.height / 2 + Math.sin(t / 20) * 3 * dpr);
    drawFighterFigure(ctx, id, { color, phase: t * 1.2, blink: t % 200 < 6 ? 1 : 0, flash: 0, thrust: 0.8 });
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
  private primed: HTMLElement;

  constructor(menuRoot: HTMLElement, hudRoot: HTMLElement, private handlers: MenuHandlers) {
    this.root = menuRoot;
    this.hud = hudRoot;
    this.banner = el('div', 'banner');
    this.hud.appendChild(this.banner);
    // A small corner badge during play, so screenshots and clips never look final.
    this.hud.appendChild(el('div', 'wip-corner', 'Work in progress · not final'));
    this.primed = this.hud.appendChild(el('div', 'primed', 'Q · next arrow is a special'));
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
    header.append(el('h1', 'logo', 'DRONEFIGHT'), el('div', 'wip-tag', 'Work in progress'));
    page.appendChild(wipNotice());
    page.appendChild(header);

    const slots = el('div', 'slots');
    s.slots.forEach((slot, i) => {
      const color = SLOT_COLORS[i]!;
      const card = el('div', `slot ${slot.kind === 'off' ? 'off' : ''}`);
      card.style.setProperty('--slot', color);
      const kind = el('button', 'kind', slotLabel(slot));
      kind.title = 'Click to change who plays this fighter';
      kind.onclick = () => {
        this.handlers.onClick();
        nextKind(slot);
        // Only one player per keyboard.
        if (slot.kind === 'p1') {
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
        if (slot.kind === 'p1') card.appendChild(el('div', 'hint', 'A D to pick'));
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
    fight.title = players < 2 ? 'Add at least two fighters' : 'Enter';
    fight.onclick = () => this.fight();
    options.append(stageBtn, el('div', 'stage-blurb', STAGES[s.stage].blurb), stocksBtn, fight);
    page.appendChild(options);

    page.appendChild(this.controlsCard());
    this.show(page);
  }

  private controlsCard(): HTMLElement {
    const card = el('div', 'controls');
    const row = (label: string, keys: string) => {
      const r = el('div', 'crow');
      r.append(el('span', 'clabel', label), el('kbd', '', keys));
      return r;
    };
    const k = KEY_LABELS;
    card.append(
      row('Move', k.move),
      row('Jump (again in the air)', k.jump),
      row('Fast fall · hold to drop through', k.down),
      row('Attack that way', k.arrows),
      row('Special: hold Q, or tap Q then an arrow', `${k.special} + ${k.arrows}`),
      row('Smash: move key + same arrow, hold to charge', `${k.move} + ← →`),
      row('Grab, then an arrow throws', k.grab),
      row('Shield · with a direction: dodge', k.shield),
    );
    const you = this.setup.slots.find((x) => x.kind === 'p1');
    if (you) {
      const sp = FIGHTERS[you.fighter].specials;
      card.appendChild(el('div', 'tips', `${FIGHTERS[you.fighter].name} specials: Q + forward arrow ${sp.neutral} · Q + back arrow (or move key + arrow) ${sp.side} · Q + ↑ ${sp.up} · Q + ↓ ${sp.down}.`));
    }
    card.appendChild(el('div', 'tips', 'The forward arrow with no movement key held is the neutral move: a jab (tap again to combo), a neutral aerial or a neutral special. Press E right as a hit lands to parry. Launched hard? Press E just before you hit the floor to tech. Mash any key to break out of a grab. ? while holding someone hits them. Esc pauses, M mutes, F fullscreen.'));
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
    panel.append(el('h2', '', 'Paused'), resume, quit, this.controlsCard(), wipNotice());
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
    const menu = el('button', 'option', 'Change fighters');
    menu.onclick = onMenu;
    panel.append(again, menu, wipNotice());
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

  /** Show that Q is primed (the next arrow is a special). */
  setPrimed(on: boolean): void {
    this.primed.classList.toggle('on', on);
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

/** Plain notice that the game is unfinished (owner's request, 2026-11-10). */
function wipNotice(): HTMLElement {
  const box = el('div', 'wip-notice');
  box.append(
    el('strong', '', 'Work in progress'),
    el('span', '', ' · Placeholder art · Numbers and controls will change · Online play not built yet · Expect bugs'),
  );
  return box;
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
