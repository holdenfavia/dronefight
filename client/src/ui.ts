// Menus and HUD (ADR-0070, ADR-0075): title screen, main menu, roster character select, online lobby, pause,
// results. Dark translucent panels, orange accents, bold condensed caps (ADR-0039).

import { BOT_LEVEL_NAMES, type BotLevel } from '../../shared/fighter/bot';
import { MATCH } from '../../shared/fighter/config';
import { FIGHTER_IDS, FIGHTERS, type FighterId } from '../../shared/fighter/fighters';
import type { World } from '../../shared/fighter/sim';
import { STAGE_IDS, STAGES, type StageId } from '../../shared/fighter/stages';
import { lobbyHost } from '../../shared/lobby';
import { MENU, SLOT_COLORS } from './config';
import { drawFighterFigure } from './figures';
import { KEY_LABELS } from './input';
import type { NetClient } from './net';

/** One player per keyboard (ADR-0071); CPUs fill the other slots. */
export type SlotKind = 'p1' | 'bot' | 'off';

export interface SlotSetup {
  kind: SlotKind;
  fighter: FighterId;
  level: BotLevel;
  /** Picked the Random tile: a fighter is drawn when the match starts. */
  random?: boolean;
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
      slot.random = slot.random === true;
    }
    s.stocks = Math.max(1, Math.min(5, Math.round(s.stocks) || d.stocks));
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

/** The short tag over a fighter's head and on its HUD card: "P1", or "CPU 3" for a Hard CPU (ADR-0075). */
export function slotTag(slot: SlotSetup): string {
  return slot.kind === 'bot' ? `CPU ${slot.level}` : 'P1';
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

/** A big question mark in place of a fighter (the Random tile). */
function randomArt(cls: string): HTMLElement {
  return el('div', `random-art ${cls}`, '?');
}

export interface MenuHandlers {
  onFight(setup: MatchSetup): void;
  onClick(): void;
}

type ScreenId = 'title' | 'main' | 'select' | 'online' | 'controls' | 'pause' | 'results';

/** Roster tiles: every fighter, then Random. */
const TILES: (FighterId | 'random')[] = [...FIGHTER_IDS, 'random'];

export class Ui {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private banner: HTMLElement;
  private cards: { percent: HTMLElement; stocks: HTMLElement; card: HTMLElement; lastPercent: number; lastStocks: number }[] = [];
  private setup: MatchSetup;
  private screen: HTMLElement | null = null;
  private screenId: ScreenId | null = null;
  private primed: HTMLElement;
  /** Buttons W/S or ↑/↓ move between on list screens, and the one Enter presses. */
  private focusList: HTMLButtonElement[] = [];
  private focusIndex = 0;
  /** The player panel the roster grid edits on the select screen. */
  private editSlot = 0;
  /** Where Esc goes from the Controls screen. */
  private controlsBack: () => void = () => this.showMain();
  /** The room code being typed, kept across lobby redraws. */
  private codeDraft = '';

  constructor(menuRoot: HTMLElement, hudRoot: HTMLElement, private handlers: MenuHandlers, private net: NetClient) {
    this.root = menuRoot;
    this.hud = hudRoot;
    this.banner = el('div', 'banner');
    this.hud.appendChild(this.banner);
    // A small corner badge during play, so screenshots and clips never look final.
    this.hud.appendChild(el('div', 'wip-corner', 'Work in progress · not final'));
    this.primed = this.hud.appendChild(el('div', 'primed', 'Space · next arrow is a special'));
    this.setup = loadSetup();
    this.net.onChange = () => {
      if (this.screenId === 'online') this.showOnline();
    };
  }

  get currentSetup(): MatchSetup {
    return this.setup;
  }

  get current(): ScreenId | null {
    return this.screenId;
  }

  private show(id: ScreenId, screen: HTMLElement, focus: HTMLButtonElement[] = [], focusIndex = 0): void {
    const sameScreen = this.screenId === id;
    const scroll = sameScreen ? this.screen?.scrollTop ?? 0 : 0;
    this.screen?.remove();
    this.screen = screen;
    this.screenId = id;
    this.root.appendChild(screen);
    screen.scrollTop = scroll;
    this.focusList = focus;
    this.focusIndex = Math.max(0, Math.min(focus.length - 1, sameScreen ? this.focusIndex : focusIndex));
    this.paintFocus();
  }

  hideMenu(): void {
    this.screen?.remove();
    this.screen = null;
    this.screenId = null;
    this.focusList = [];
  }

  private paintFocus(): void {
    this.focusList.forEach((b, i) => b.classList.toggle('focus', i === this.focusIndex));
  }

  private button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', cls, text);
    b.onclick = () => {
      this.handlers.onClick();
      onClick();
    };
    return b;
  }

  /**
   * Menu keys (ADR-0075). Returns true when the key was used. Enter, W/S and ↑/↓ work on every list screen;
   * on the select screen the movement keys move your cursor over the roster grid.
   */
  menuKey(code: string): boolean {
    const id = this.screenId;
    if (!id) return false;
    const up = code === 'KeyW' || code === 'ArrowUp';
    const down = code === 'KeyS' || code === 'ArrowDown';
    const left = code === 'KeyA' || code === 'ArrowLeft';
    const right = code === 'KeyD' || code === 'ArrowRight';
    const enter = code === 'Enter' || code === 'NumpadEnter';
    if (id === 'title') {
      if (enter || code === 'Space') {
        this.handlers.onClick();
        this.showMain();
        return true;
      }
      return false;
    }
    if (code === 'Escape') {
      if (id === 'select' || id === 'online') {
        this.handlers.onClick();
        if (id === 'online') this.net.disconnect();
        this.showMain();
        return true;
      }
      if (id === 'controls') {
        this.handlers.onClick();
        this.controlsBack();
        return true;
      }
      if (id === 'main') {
        this.handlers.onClick();
        this.showTitle();
        return true;
      }
      return false;
    }
    if (id === 'select') {
      if (enter) {
        this.fight();
        return true;
      }
      const dx = right ? 1 : left ? -1 : 0;
      const dy = down ? 1 : up ? -1 : 0;
      if (dx || dy) {
        this.moveCursor(dx, dy);
        return true;
      }
      return false;
    }
    if (!this.focusList.length) return false;
    if (up || down || left || right) {
      this.handlers.onClick();
      const n = this.focusList.length;
      this.focusIndex = (this.focusIndex + (up || left ? -1 : 1) + n) % n;
      this.paintFocus();
      this.focusList[this.focusIndex]!.scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (enter) {
      const b = this.focusList[this.focusIndex];
      if (b && !b.disabled) b.click();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------- Title, main

  /** The first thing you see: the logo over CPUs fighting. */
  showTitle(): void {
    const page = el('div', 'screen title-screen');
    const header = el('div', 'title-row');
    header.append(el('h1', 'logo big', 'DRONEFIGHT'), el('div', 'tagline', 'A rooftop brawler for friends'));
    const press = el('button', 'press-start', 'Press Enter');
    press.onclick = () => {
      this.handlers.onClick();
      this.showMain();
    };
    page.append(header, press, el('div', 'wip-tag', 'Work in progress'));
    page.onclick = (e) => {
      if (e.target === page) press.click();
    };
    this.show('title', page);
  }

  showMain(): void {
    const page = el('div', 'screen main-menu');
    page.append(el('h1', 'logo', 'DRONEFIGHT'));
    const list = el('div', 'menu-list');
    const items: [string, string, () => void][] = [
      ['Fight', 'You against CPUs on this keyboard', () => this.showSelect()],
      ['Online', 'Make or join a room with a friend', () => this.showOnline()],
      ['Controls', 'Every key and move', () => this.showControls(() => this.showMain())],
    ];
    const buttons = items.map(([label, sub, go]) => {
      const b = this.button('menu-item', '', go);
      b.append(el('span', 'mi-label', label), el('span', 'mi-sub', sub));
      list.appendChild(b);
      return b;
    });
    page.append(list, el('div', 'menu-hint', 'W S or ↑ ↓ to choose · Enter to pick · Esc back'), wipNotice());
    this.show('main', page, buttons);
  }

  showControls(back: () => void): void {
    this.controlsBack = back;
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel');
    const done = this.button('fight', 'Back', back);
    panel.append(el('h2', '', 'Controls'), this.controlsCard(), done);
    page.appendChild(panel);
    this.show('controls', page, [done]);
  }

  // ------------------------------------------------------------------------------------------ Character select

  /** Roster grid on top, four player panels below, stage and stocks, Fight (ADR-0075). */
  showSelect(): void {
    const s = this.setup;
    if (s.slots[this.editSlot]?.kind === 'off' || (this.screenId !== 'select' && s.slots.some((x) => x.kind === 'p1'))) {
      const p1 = s.slots.findIndex((x) => x.kind === 'p1');
      this.editSlot = p1 >= 0 ? p1 : Math.max(0, s.slots.findIndex((x) => x.kind !== 'off'));
    }
    const page = el('div', 'screen select');

    const top = el('div', 'select-top');
    top.append(this.button('back', '‹ Back', () => this.showMain()), el('h2', 'select-title', 'Choose your fighters'));
    page.appendChild(top);

    page.appendChild(this.rosterGrid(
      (i) => s.slots[i]!,
      (tile) => this.assign(this.editSlot, tile),
      this.editSlot,
    ));

    const panels = el('div', 'slots');
    s.slots.forEach((slot, i) => {
      const color = SLOT_COLORS[i]!;
      const card = el('div', `slot ${slot.kind === 'off' ? 'off' : ''} ${slot.kind === 'bot' ? 'cpu' : ''} ${i === this.editSlot && slot.kind !== 'off' ? 'editing' : ''}`);
      card.style.setProperty('--slot', color);
      const kind = this.button('kind', slotLabel(slot), () => {
        nextKind(slot);
        // Only one player per keyboard.
        if (slot.kind === 'p1') for (const other of s.slots) if (other !== slot && other.kind === 'p1') other.kind = 'bot';
        if (slot.kind !== 'off') this.editSlot = i;
        this.commit();
      });
      kind.title = 'Click to change who plays this fighter';
      card.appendChild(kind);
      if (slot.kind !== 'off') {
        const def = FIGHTERS[slot.fighter];
        card.append(
          slot.random ? randomArt('panel-art') : previewCanvas(slot.fighter, color),
          el('div', 'fighter-name', slot.random ? 'Random' : def.name),
          el('div', 'blurb', slot.random ? 'Picked when the fight starts' : def.blurb),
          el('div', 'hint', slot.kind === 'p1' ? 'WASD or arrows to pick' : i === this.editSlot ? 'Click a fighter above' : 'Click to pick its fighter'),
        );
        card.onclick = (e) => {
          if (e.target === kind || this.editSlot === i) return;
          this.handlers.onClick();
          this.editSlot = i;
          this.showSelect();
        };
      } else {
        card.appendChild(el('div', 'empty', 'Click above to add a CPU or yourself'));
      }
      panels.appendChild(card);
    });
    page.appendChild(panels);

    const options = el('div', 'options');
    const stageBtn = this.button('option', `Stage: ${STAGES[s.stage].name}`, () => {
      s.stage = STAGE_IDS[(STAGE_IDS.indexOf(s.stage) + 1) % STAGE_IDS.length]!;
      this.commit();
    });
    const stocksBtn = this.button('option', `Stocks: ${s.stocks}`, () => {
      s.stocks = (s.stocks % 5) + 1;
      this.commit();
    });
    const fight = el('button', 'fight', 'Fight!');
    const players = s.slots.filter((x) => x.kind !== 'off').length;
    fight.disabled = players < 2;
    fight.title = players < 2 ? 'Add at least two fighters' : 'Enter';
    fight.onclick = () => this.fight();
    options.append(stageBtn, el('div', 'stage-blurb', STAGES[s.stage].blurb), stocksBtn, fight);
    page.appendChild(options);
    page.appendChild(el('div', 'menu-hint', 'Enter to fight · Esc back · Controls are in the main menu and the pause screen'));
    this.show('select', page);
  }

  /**
   * The roster grid. Each tile shows tokens for the slots that picked it; the edited slot's cursor is
   * outlined in its color.
   */
  private rosterGrid(slotAt: (i: number) => SlotSetup | null, pick: (tile: FighterId | 'random') => void, cursorSlot: number, online = false): HTMLElement {
    const grid = el('div', 'roster');
    const cursor = slotAt(cursorSlot);
    TILES.forEach((tile) => {
      const t = this.button('tile', '', () => pick(tile));
      t.title = tile === 'random' ? 'Random fighter' : FIGHTERS[tile].blurb;
      t.append(tile === 'random' ? randomArt('tile-art') : previewCanvas(tile, '#eeeeea', MENU.tileSize), el('span', 'tile-name', tile === 'random' ? 'Random' : FIGHTERS[tile].name));
      const tokens = el('div', 'tokens');
      for (let i = 0; i < MATCH.maxFighters; i++) {
        const slot = slotAt(i);
        if (!slot || slot.kind === 'off') continue;
        if ((tile === 'random') !== !!slot.random || (tile !== 'random' && slot.fighter !== tile)) continue;
        const tok = el('span', `token ${slot.kind === 'bot' ? 'cpu' : ''}`, online ? `P${i + 1}` : slotTag(slot));
        tok.style.setProperty('--slot', SLOT_COLORS[i]!);
        tokens.appendChild(tok);
        if (i === cursorSlot) {
          t.classList.add('cursor');
          t.style.setProperty('--slot', SLOT_COLORS[i]!);
        }
      }
      t.appendChild(tokens);
      grid.appendChild(t);
    });
    if (cursor && cursor.kind === 'off') grid.classList.add('idle');
    return grid;
  }

  private assign(slotIndex: number, tile: FighterId | 'random'): void {
    const slot = this.setup.slots[slotIndex];
    if (!slot || slot.kind === 'off') return;
    slot.random = tile === 'random';
    if (tile !== 'random') slot.fighter = tile;
    this.commit();
  }

  /** Move the edited slot's cursor over the roster grid; it picks as it moves. */
  private moveCursor(dx: number, dy: number): void {
    const slot = this.setup.slots[this.editSlot];
    if (!slot || slot.kind === 'off') return;
    const cols = this.gridColumns();
    const at = slot.random ? TILES.length - 1 : TILES.indexOf(slot.fighter);
    let next = at;
    if (dx) next = (at + dx + TILES.length) % TILES.length;
    else {
      next = at + dy * cols;
      if (next < 0 || next >= TILES.length) return;
    }
    this.handlers.onClick();
    this.assign(this.editSlot, TILES[next]!);
  }

  private gridColumns(): number {
    const grid = this.screen?.querySelector('.roster');
    if (!grid) return MENU.rosterColumns;
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length || MENU.rosterColumns;
  }

  /** Change the player's own fighter with A / D (kept for the results screen flow). */
  cycleFighter(slotIndex: number, dir: number): void {
    const slot = this.setup.slots[slotIndex]!;
    if (slot.kind === 'off') return;
    const i = FIGHTER_IDS.indexOf(slot.fighter);
    slot.random = false;
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

  // ------------------------------------------------------------------------------------------- Online lobby

  /** Create or join a room, then the lobby: members, their picks and Ready (ADR-0075). */
  showOnline(): void {
    const net = this.net;
    const page = el('div', 'screen select online');
    const top = el('div', 'select-top');
    top.append(this.button('back', '‹ Back', () => { net.disconnect(); this.showMain(); }), el('h2', 'select-title', 'Online'));
    page.appendChild(top);
    const focus: HTMLButtonElement[] = [];

    if (!net.room) {
      const panel = el('div', 'panel join-panel');
      const create = this.button('fight', 'Make a room', () => net.create());
      const row = el('div', 'join-row');
      const input = el('input', 'code-input');
      input.inputMode = 'numeric';
      input.maxLength = 2;
      input.placeholder = '00';
      input.ariaLabel = 'Room code';
      input.value = this.codeDraft;
      input.oninput = () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 2);
        this.codeDraft = input.value;
      };
      const hadFocus = document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('code-input');
      const join = this.button('option', 'Join', () => net.join(input.value));
      input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.stopPropagation(); join.click(); }
        if (e.key === 'Escape') input.blur();
      };
      row.append(input, join);
      panel.append(
        create,
        el('div', 'or', 'or join a friend\'s room'),
        row,
      );
      if (net.status === 'connecting') panel.appendChild(el('div', 'net-status', 'Connecting…'));
      if (net.error) panel.appendChild(el('div', 'net-error', net.error));
      panel.appendChild(el('div', 'tips', 'Rooms have a two-digit code. Read it out on a call, or send the invite link. Up to four players per room.'));
      page.appendChild(panel);
      focus.push(create);
      this.show('online', page, focus);
      if (hadFocus) input.focus();
      return;
    }

    const room = net.room;
    const host = lobbyHost(room.members);
    const head = el('div', 'room-head');
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const copy = this.button('option', 'Copy invite link', () => {
      void navigator.clipboard?.writeText(link).then(() => { copy.textContent = 'Copied!'; }, () => undefined);
    });
    head.append(el('div', 'room-label', 'Room'), el('div', 'room-code', room.code), copy);
    page.appendChild(head);

    // Each member's slot is their place in join order.
    const slotOf = (id: number) => room.members.indexOf(id);
    const pickOf = (id: number) => (id === room.you ? net.me : net.picks.get(id) ?? null);
    const asSlot = (i: number): SlotSetup | null => {
      const id = room.members[i];
      if (id === undefined) return null;
      const p = pickOf(id);
      // Everyone in a room is a person: their tokens never say CPU.
      return p ? { kind: 'p1', fighter: p.fighter, level: 2 } : null;
    };
    page.appendChild(this.rosterGrid(
      asSlot,
      (tile) => net.setPick({ fighter: tile === 'random' ? FIGHTER_IDS[Math.floor(Math.random() * FIGHTER_IDS.length)]! : tile, ready: false }),
      slotOf(room.you),
      true,
    ));

    const panels = el('div', 'slots');
    for (let i = 0; i < MATCH.maxFighters; i++) {
      const id = room.members[i];
      const color = SLOT_COLORS[i]!;
      const card = el('div', `slot ${id === undefined ? 'off' : ''}`);
      card.style.setProperty('--slot', color);
      if (id === undefined) {
        card.append(el('div', 'kind', 'Open'), el('div', 'empty', `Waiting for a friend… code ${room.code}`));
      } else {
        const p = pickOf(id);
        const who = id === room.you ? 'You' : `Player ${i + 1}`;
        card.appendChild(el('div', 'kind', `${who}${id === host ? ' · Host' : ''}`));
        if (p) {
          card.append(previewCanvas(p.fighter, color), el('div', 'fighter-name', FIGHTERS[p.fighter].name));
          card.appendChild(el('div', `ready-tag ${p.ready ? 'on' : ''}`, p.ready ? 'Ready' : 'Picking…'));
        } else {
          card.appendChild(el('div', 'empty', 'Joining…'));
        }
      }
      panels.appendChild(card);
    }
    page.appendChild(panels);

    const options = el('div', 'options');
    const ready = this.button(net.me.ready ? 'option on' : 'fight', net.me.ready ? 'Not ready' : 'Ready', () => net.setPick({ ready: !net.me.ready }));
    const leave = this.button('option', 'Leave room', () => net.leave());
    const everyone = room.members.length >= 2 && room.members.every((id) => pickOf(id)?.ready);
    const start = el('button', 'option', 'Start');
    start.disabled = true;
    start.title = 'Online fights come next';
    options.append(ready, net.isHost ? start : el('span', ''), leave);
    page.appendChild(options);
    page.appendChild(el('div', 'net-status', everyone
      ? 'Everyone is ready. Online fights are the next thing being built, so the match can\'t start yet.'
      : 'Pick a fighter and press Ready. Online fights are the next thing being built: for now the lobby only shows everyone\'s picks.'));
    if (net.error) page.appendChild(el('div', 'net-error', net.error));
    focus.push(ready, leave);
    this.show('online', page, focus);
  }

  // --------------------------------------------------------------------------------------------- Pause, results

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
      row('Special: hold Space, or tap Space then an arrow', `${k.special} + ${k.arrows}`),
      row('Smash: move key + same arrow, hold to charge', `${k.move} + ← →`),
      row('Grab, then an arrow throws', k.grab),
      row('Shield · with a direction: dodge', k.shield),
    );
    const you = this.setup.slots.find((x) => x.kind === 'p1');
    if (you && !you.random) {
      const sp = FIGHTERS[you.fighter].specials;
      card.appendChild(el('div', 'tips', `${FIGHTERS[you.fighter].name} specials: Space + forward arrow ${sp.neutral} · Space + back arrow (or move key + arrow) ${sp.side} · Space + ↑ ${sp.up} · Space + ↓ ${sp.down}.`));
    }
    card.appendChild(el('div', 'tips', 'The forward arrow with no movement key held is the neutral move: a jab (tap again to combo), a neutral aerial or a neutral special. Press E right as a hit lands to parry. Launched hard? Press E just before you hit the floor to tech. Mash any key to break out of a grab. ? while holding someone hits them. Esc pauses, M mutes, F fullscreen.'));
    return card;
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
    this.show('pause', page, [resume, quit]);
  }

  showResults(world: World, names: string[], onRematch: () => void, onSelect: () => void, onMenu: () => void): void {
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
    const change = el('button', 'option', 'Change fighters');
    change.onclick = onSelect;
    const menu = el('button', 'option', 'Main menu');
    menu.onclick = onMenu;
    panel.append(again, change, menu, wipNotice());
    page.appendChild(panel);
    this.show('results', page, [again, change, menu]);
  }

  // ------------------------------------------------------------------------------------------------------ HUD

  /** Build the damage cards along the bottom for a new match. CPU cards say so (ADR-0075). */
  startHud(world: World, names: string[], cpu: readonly boolean[] = []): void {
    for (const c of this.cards) c.card.remove();
    this.cards = [];
    const bar = this.hud.querySelector('.cards') ?? this.hud.appendChild(el('div', 'cards'));
    bar.replaceChildren();
    for (const f of world.fighters) {
      const card = el('div', `card ${cpu[f.slot] ? 'cpu' : ''}`);
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

  /** Show that Space is primed (the next arrow is a special). */
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
    el('span', '', ' · Placeholder art · Numbers and controls will change · Online fights not built yet · Expect bugs'),
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
