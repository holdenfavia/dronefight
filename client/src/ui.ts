// Menus and HUD (ADR-0070, ADR-0075): title screen, main menu, roster character select, online lobby, pause,
// results. Dark translucent panels, orange accents, bold condensed caps (ADR-0039).

import { BOT_LEVEL_NAMES, type BotLevel } from '../../shared/fighter/bot';
import { MATCH } from '../../shared/fighter/config';
import { ALL_FIGHTER_IDS, FIGHTERS, type FighterId } from '../../shared/fighter/fighters';
import type { MatchRules, World } from '../../shared/fighter/sim';
import { INGREDIENTS, signatureGauge, type SignatureGauge } from '../../shared/fighter/signature';
import { activeCheats, cheatRules, CHEATS, enterCode, onCheatsChange, randomFighters, rosterIds, seasonsNow, stageIds } from './cheats';
import { seasonOfFighter, seasonOfStage, type SeasonDef } from '../../shared/seasons';
import { STAGES, type StageId } from '../../shared/fighter/stages';
import { MENU, SLOT_COLORS, TEAM_COLORS, TEAM_NAMES, fighterColor } from './config';
import { PROFILE_COLOR_NAMES, PROFILE_COLORS, TAG_MAX, cleanTag, resolveColors } from '../../shared/profile';
import { profile, setProfile } from './profile';
import { isStagePick, isTeam, sideCount, startingTeam, TEAM_COUNT, type RoomSettings, type StagePick } from '../../shared/online';
import { stageBans, toggleBan } from './stageBans';
import { stageThumb } from './stageThumbs';
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
  /** Team in a team battle (ADR-0081). */
  team: number;
}

export interface MatchSetup {
  /** Every slot, up to MATCH.maxFighters (ADR-0086); the select screen shows the first few until more are added. */
  slots: SlotSetup[];
  /** A stage or Random (ADR-0085). */
  stage: StagePick;
  /** Stage pick and ban (ADR-0085): Fight! opens the stage screen, your bans count. Off by default. */
  stagePick: boolean;
  stocks: number;
  /** Team battle instead of a free-for-all (ADR-0081). */
  teams: boolean;
  /** In a team battle, teammates can hurt each other. */
  friendlyFire: boolean;
}

const STORAGE_KEY = 'dronefight.brawl.setup.v3';
/** The name last typed in the feedback form, so friends don't retype it. */
const FEEDBACK_NAME_KEY = 'dronefight.feedback.name';
/** Where the Feedback form posts (server/src/feedback.ts). */
const FEEDBACK_URL = '/api/feedback';
/** Longest note the form allows (matches the server's FEEDBACK_MAX_TEXT). */
const FEEDBACK_MAX_TEXT = 1000;

/** Fighters the slots past the first four start on (ADR-0086). */
const EXTRA_SLOT_FIGHTERS: FighterId[] = ['ninja', 'gunslinger', 'chef', 'ghost', 'yoyo', 'bard'];

export function defaultSetup(): MatchSetup {
  return {
    slots: [
      { kind: 'p1', fighter: 'brawler', level: 2, team: 0 },
      { kind: 'bot', fighter: 'blade', level: 2, team: 1 },
      { kind: 'off', fighter: 'spark', level: 2, team: 0 },
      { kind: 'off', fighter: 'titan', level: 2, team: 1 },
      ...EXTRA_SLOT_FIGHTERS.map((fighter, i): SlotSetup => ({ kind: 'off', fighter, level: 2, team: i % 2 })),
    ],
    stage: 'rooftop',
    stagePick: false,
    stocks: MATCH.defaultStocks,
    teams: false,
    friendlyFire: false,
  };
}

export function loadSetup(): MatchSetup {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSetup();
    const s = JSON.parse(raw) as MatchSetup;
    const d = defaultSetup();
    if (!Array.isArray(s.slots) || s.slots.length < 2 || s.slots.length > MATCH.maxFighters || !isStagePick(s.stage)) return d;
    // Setups saved before bigger fights (ADR-0086) have four slots: the rest start off.
    s.slots = [...s.slots, ...d.slots.slice(s.slots.length)];
    for (const slot of s.slots) {
      if (!ALL_FIGHTER_IDS.includes(slot.fighter) || !['p1', 'bot', 'off'].includes(slot.kind) || ![1, 2, 3].includes(slot.level)) return d;
      slot.random = slot.random === true;
    }
    // Setups saved before team battles (ADR-0081): two teams, alternating.
    s.slots.forEach((slot, i) => { if (!isTeam(slot.team)) slot.team = i % 2; });
    s.teams = s.teams === true;
    s.friendlyFire = s.friendlyFire === true;
    s.stagePick = s.stagePick === true;
    s.stocks = Math.max(1, Math.min(5, Math.round(s.stocks) || d.stocks));
    // A seasonal fighter or stage saved during its event, after the event is over (ADR-0082).
    const roster = rosterIds();
    for (const slot of s.slots) if (!roster.includes(slot.fighter)) slot.fighter = 'brawler';
    if (s.stage !== 'random' && !stageIds().includes(s.stage)) s.stage = 'rooftop';
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

/** The short tag over a fighter's head and on its HUD card: your own tag or "P1", or "CPU 3" for a Hard CPU (ADR-0075, ADR-0083). */
export function slotTag(slot: SlotSetup): string {
  return slot.kind === 'bot' ? `CPU ${slot.level}` : profile().tag || 'P1';
}

/**
 * Free-for-all colors for the four slots of a setup: the fighters that are in take colors in order, with your
 * own color on your fighter (ADR-0083), the same as in the fight. Off slots keep their slot color.
 */
export function setupColors(slots: readonly SlotSetup[]): string[] {
  const on = slots.map((x, i) => [x, i] as const).filter(([x]) => x.kind !== 'off');
  const colors = resolveColors(on.map(([x]) => (x.kind === 'p1' ? profile().color : -1)));
  const out: string[] = slots.map((_x, i) => SLOT_COLORS[i]!);
  on.forEach(([, i], k) => { out[i] = colors[k]!; });
  return out;
}

/** Why this setup can't start yet, or null when it can. */
function setupProblem(s: MatchSetup): string | null {
  const on = s.slots.filter((x) => x.kind !== 'off');
  if (on.length < 2) return 'Add at least two fighters';
  if (s.teams && sideCount(on.map((x) => x.team)) < 2) return 'Everyone is on one team: put someone on another';
  return null;
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

/** The Seasonal tag on a seasonal fighter or stage (ADR-0082). */
function seasonTag(season: SeasonDef, cls = 'season-tag'): HTMLElement {
  const tag = el('span', cls, 'Seasonal');
  tag.title = `${season.name} event`;
  tag.style.setProperty('--season', season.color);
  return tag;
}

/** "Harvest Farm", or "Random". */
function stageName(id: StagePick): string {
  return id === 'random' ? 'Random' : STAGES[id].name;
}

/** "Stage: Harvest Farm · Seasonal". */
function stageLabel(id: StagePick): string {
  return `Stage: ${stageName(id)}${id !== 'random' && seasonOfStage(id) ? ' · Seasonal' : ''}`;
}

/** The next stage on offer here after this one, then Random (ADR-0085). */
function nextStage(id: StagePick): StagePick {
  const list: StagePick[] = [...stageIds(), 'random'];
  return list[(list.indexOf(id) + 1) % list.length]!;
}

/** How many player panels the select screen shows: four, or up to the last one in use (ADR-0086). */
function shownSlots(slots: readonly SlotSetup[]): number {
  let last = -1;
  slots.forEach((x, i) => { if (x.kind !== 'off') last = i; });
  return Math.max(MENU.slotsShown, last + 1);
}

/** The main menu's banner for each seasonal event on now. */
function seasonBanners(): HTMLElement[] {
  return seasonsNow().map((season) => {
    const b = el('div', 'season-banner');
    b.style.setProperty('--season', season.color);
    b.style.setProperty('--season-accent', season.accent);
    b.append(el('strong', '', `${season.name} event`), document.createTextNode(` ${season.blurb}`), seasonTag(season));
    return b;
  });
}

/** A big question mark in place of a fighter (the Random tile). */
function randomArt(cls: string): HTMLElement {
  return el('div', `random-art ${cls}`, '?');
}

export interface MenuHandlers {
  onFight(setup: MatchSetup): void;
  onClick(): void;
}

type ScreenId = 'title' | 'main' | 'select' | 'online' | 'controls' | 'settings' | 'pause' | 'results' | 'stages' | 'match-settings';

/** "Seasonal · Thanksgiving" under a seasonal fighter's name (nothing for the everyday cast). */
function seasonLine(id: FighterId | null): HTMLElement[] {
  const season = id ? seasonOfFighter(id) : null;
  if (!season) return [];
  const line = el('div', 'season-line', `Seasonal · ${season.name}`);
  line.style.setProperty('--season', season.color);
  return [line];
}

function pickOne<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Roster tiles: every fighter (and any unlocked secret ones), then Random. */
function rosterTiles(): (FighterId | 'random')[] {
  return [...rosterIds(), 'random'];
}

/** Two sets of rule cheats are the same (unset counts as off). */
function sameRules(a: MatchRules | undefined, b: MatchRules | undefined): boolean {
  return !!a?.moonJump === !!b?.moonJump && !!a?.oneHit === !!b?.oneHit;
}

/** "Moon jump · One hit", or '' for none. */
function rulesText(rules: MatchRules | undefined): string {
  return CHEATS.filter((c) => c.rule && rules?.[c.rule]).map((c) => c.name).join(' · ');
}

export class Ui {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private banner: HTMLElement;
  private cards: { percent: HTMLElement; stocks: HTMLElement; sig: HTMLElement; card: HTMLElement; lastPercent: number; lastStocks: number; lastSig: string }[] = [];
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
  /** Top-right Feedback button, shown on every menu screen. */
  private feedbackButton: HTMLButtonElement;
  /** The open feedback form, if any. */
  private feedbackForm: HTMLElement | null = null;
  /** The open cheat code box, if any (ADR-0077). */
  private cheatBox: HTMLElement | null = null;
  /** The stage screen is the online room's (ADR-0085), not this keyboard's. */
  private stagesOnline = false;
  /** Made a room and waiting for it: its Match settings screen opens first (ADR-0085). */
  private madeRoom = false;
  /** A line under the stage cards ("Leave at least one stage open"). */
  private stageNote = '';

  constructor(menuRoot: HTMLElement, hudRoot: HTMLElement, private handlers: MenuHandlers, private net: NetClient) {
    this.root = menuRoot;
    this.hud = hudRoot;
    this.banner = el('div', 'banner');
    this.hud.appendChild(this.banner);
    // A small corner badge during play, so screenshots and clips never look final.
    this.hud.appendChild(el('div', 'wip-corner', 'Work in progress · not final'));
    this.primed = this.hud.appendChild(el('div', 'primed', 'Space · next arrow is a special'));
    this.feedbackButton = this.button('feedback-btn', 'Feedback', () => this.openFeedback());
    this.feedbackButton.hidden = true;
    this.root.appendChild(this.feedbackButton);
    this.setup = loadSetup();
    this.net.onChange = () => {
      const room = this.net.room;
      if (this.madeRoom && room) {
        // Making a room opens its Match settings first.
        this.madeRoom = false;
        if (this.net.isHost && (this.screenId === 'online' || this.screenId === null)) return this.showMatchSettings();
      }
      if (this.net.error) this.madeRoom = false;
      if (this.screenId === 'online') this.showOnline();
      else if (this.screenId === 'match-settings' || (this.screenId === 'stages' && this.stagesOnline)) {
        // Left the room, lost the connection, or stopped being host: back to the Online screen.
        if (!room || (this.screenId === 'match-settings' && !this.net.isHost) || (this.screenId === 'stages' && !room.settings.stagePick)) this.showOnline();
        else if (this.screenId === 'stages') this.showStages(true);
        else this.showMatchSettings();
      }
    };
    onCheatsChange(() => this.cheatsChanged());
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
    this.root.insertBefore(screen, this.feedbackButton);
    screen.scrollTop = scroll;
    this.feedbackButton.hidden = false;
    this.focusList = focus;
    this.focusIndex = Math.max(0, Math.min(focus.length - 1, sameScreen ? this.focusIndex : focusIndex));
    this.paintFocus();
  }

  hideMenu(): void {
    this.closeFeedback();
    this.feedbackButton.hidden = true;
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
    if (this.feedbackForm) {
      if (code === 'Escape') this.closeFeedback();
      return true;
    }
    if (this.cheatBox) {
      if (code === 'Escape') this.closeCheats();
      return true;
    }
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
      if (id === 'select' || id === 'online' || id === 'settings') {
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
      if (id === 'stages' || id === 'match-settings') {
        this.handlers.onClick();
        if (id === 'stages' && !this.stagesOnline) this.showSelect();
        else this.showOnline();
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
    if (id === 'stages' && code === 'KeyB') {
      this.focusList[this.focusIndex]?.dispatchEvent(new CustomEvent('ban'));
      return true;
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

  // ------------------------------------------------------------------------------------------- Feedback

  /** The Feedback form: a note (and an optional name) posted to the server. */
  openFeedback(): void {
    if (this.feedbackForm) return;
    const overlay = el('div', 'screen modal feedback-overlay');
    const panel = el('form', 'panel feedback-panel');
    panel.append(el('h2', '', 'Feedback'), el('div', 'feedback-sub', 'Bugs, ideas, what felt off. It goes straight to the developer.'));
    const text = el('textarea', 'feedback-text');
    text.maxLength = FEEDBACK_MAX_TEXT;
    text.rows = 6;
    text.placeholder = 'What happened, or what would make it more fun?';
    text.ariaLabel = 'Feedback';
    const name = el('input', 'feedback-name');
    name.maxLength = 40;
    name.placeholder = 'Your name (optional)';
    name.ariaLabel = 'Your name';
    try {
      name.value = localStorage.getItem(FEEDBACK_NAME_KEY) ?? '';
    } catch {
      // Private mode: no remembered name.
    }
    const status = el('div', 'feedback-status');
    const send = el('button', 'fight', 'Send');
    send.type = 'submit';
    const cancel = el('button', 'back', 'Cancel');
    cancel.type = 'button';
    cancel.onclick = () => {
      this.handlers.onClick();
      this.closeFeedback();
    };
    const row = el('div', 'feedback-actions');
    row.append(cancel, send);
    panel.append(text, name, status, row);
    const screen = this.screenId ?? '';
    panel.onsubmit = (e) => {
      e.preventDefault();
      const note = text.value.trim();
      if (!note) {
        status.textContent = 'Write something first.';
        text.focus();
        return;
      }
      this.handlers.onClick();
      try {
        localStorage.setItem(FEEDBACK_NAME_KEY, name.value.trim());
      } catch {
        // Private mode.
      }
      send.disabled = true;
      status.textContent = 'Sending…';
      void fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: note, name: name.value.trim(), screen }),
      })
        .then((r) => {
          if (r.ok) {
            panel.replaceChildren(el('h2', '', 'Thanks!'), el('div', 'feedback-sub', 'Your feedback was sent.'));
            const done = this.button('fight', 'Done', () => this.closeFeedback());
            panel.appendChild(done);
            done.focus();
          } else {
            send.disabled = false;
            status.textContent = r.status === 429 ? 'That was a lot of feedback. Try again in a minute.' : 'Could not send it. Try again?';
          }
        })
        .catch(() => {
          send.disabled = false;
          status.textContent = 'Could not reach the server. Try again?';
        });
    };
    // Esc closes the form even while typing (the menus skip keys while a text box has focus).
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Stop it here, so the menu behind doesn't also take the Esc and go back.
        e.preventDefault();
        e.stopPropagation();
        this.closeFeedback();
      }
    });
    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeFeedback();
    };
    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.feedbackForm = overlay;
    this.feedbackButton.hidden = true;
    text.focus();
  }

  closeFeedback(): void {
    if (!this.feedbackForm) return;
    this.feedbackForm.remove();
    this.feedbackForm = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.feedbackButton.hidden = !this.screen;
  }

  // ------------------------------------------------------------------------------------------- Cheat codes

  /** The cheat code box (ADR-0077): opened by three quick Space taps on any menu. Type a code, Enter. */
  openCheats(): void {
    if (this.cheatBox || this.feedbackForm) return;
    const overlay = el('div', 'screen modal cheat-overlay');
    const panel = el('form', 'panel cheat-panel');
    const input = el('input', 'cheat-input');
    input.maxLength = 16;
    input.placeholder = 'Enter a code';
    input.ariaLabel = 'Cheat code';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.oninput = () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    const status = el('div', 'cheat-status');
    const list = el('div', 'cheat-list');
    const paintList = () => {
      const on = activeCheats();
      list.textContent = on.length ? `On: ${on.map((c) => c.name).join(' · ')}` : 'No cheats on.';
    };
    paintList();
    const close = el('button', 'back', 'Close');
    close.type = 'button';
    close.onclick = () => {
      this.handlers.onClick();
      this.closeCheats();
    };
    const enter = el('button', 'fight', 'Enter');
    enter.type = 'submit';
    const row = el('div', 'feedback-actions');
    row.append(close, enter);
    panel.append(el('h2', '', 'Cheat codes'), el('div', 'feedback-sub', 'Type a code and press Enter. Type it again to turn it off.'), input, status, list, row);
    panel.onsubmit = (e) => {
      e.preventDefault();
      const result = enterCode(input.value);
      this.handlers.onClick();
      status.classList.toggle('bad', !result);
      status.classList.toggle('on', !!result?.on);
      status.textContent = result ? (result.on ? result.cheat.on : result.cheat.off) : 'Nothing happens.';
      input.value = '';
      paintList();
      input.focus();
    };
    // Esc closes the box even while typing (the menus skip keys while a text box has focus).
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeCheats();
      }
    });
    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeCheats();
    };
    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.cheatBox = overlay;
    this.feedbackButton.hidden = true;
    input.focus();
  }

  closeCheats(): void {
    if (!this.cheatBox) return;
    this.cheatBox.remove();
    this.cheatBox = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.feedbackButton.hidden = !this.screen;
  }

  /** A cheat turned on or off: redraw the roster, and as host, share rule cheats with the room. */
  private cheatsChanged(): void {
    const roster = rosterIds();
    for (const slot of this.setup.slots) if (!roster.includes(slot.fighter)) slot.fighter = 'brawler';
    if (this.setup.stage !== 'random' && !stageIds().includes(this.setup.stage)) this.setup.stage = 'rooftop';
    saveSetup(this.setup);
    if (this.screenId === 'select') this.showSelect();
    if (this.screenId === 'stages') this.showStages(this.stagesOnline);
    if (this.screenId === 'online') this.showOnline();
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
      ['Settings', 'Your tag and color', () => this.showSettings()],
    ];
    const buttons = items.map(([label, sub, go]) => {
      const b = this.button('menu-item', '', go);
      b.append(el('span', 'mi-label', label), el('span', 'mi-sub', sub));
      list.appendChild(b);
      return b;
    });
    page.append(list, ...seasonBanners(), el('div', 'menu-hint', 'W S or ↑ ↓ to choose · Enter to pick · Esc back'), wipNotice());
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

  /** Personal settings (ADR-0083): the tag over your fighter's head and your color, saved in this browser. */
  showSettings(): void {
    const me = profile();
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel settings-panel');
    panel.append(el('h2', '', 'Settings'));

    const color = me.color >= 0 ? PROFILE_COLORS[me.color]! : SLOT_COLORS[0];
    const preview = el('div', 'settings-preview');
    const tagLabel = el('div', 'settings-tag', me.tag || 'P1');
    tagLabel.style.color = color;
    preview.append(tagLabel, previewCanvas(this.setup.slots.find((x) => x.kind === 'p1' && !x.random)?.fighter ?? 'brawler', color, 110));

    const tagRow = el('label', 'settings-row');
    const input = el('input', 'tag-input');
    input.maxLength = TAG_MAX;
    input.placeholder = 'P1';
    input.ariaLabel = 'Your tag';
    input.value = me.tag;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.oninput = () => {
      // Capitals and digits only, as typed; a tag that would pose as a CPU just doesn't stick.
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TAG_MAX);
      const tag = cleanTag(input.value);
      setProfile({ tag });
      tagLabel.textContent = tag || 'P1';
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); input.blur(); }
    };
    tagRow.append(el('span', 'settings-label', 'Your tag'), input);

    const swatches = el('div', 'swatches');
    const pick = (c: number) => {
      setProfile({ color: c });
      this.showSettings();
    };
    const auto = this.button(`swatch auto ${me.color < 0 ? 'on' : ''}`, 'Auto', () => pick(-1));
    auto.title = "Your slot's color";
    const buttons = [auto, ...PROFILE_COLORS.map((c, i) => {
      const b = this.button(`swatch ${me.color === i ? 'on' : ''}`, '', () => pick(i));
      b.style.setProperty('--swatch', c);
      b.title = PROFILE_COLOR_NAMES[i]!;
      b.ariaLabel = PROFILE_COLOR_NAMES[i]!;
      return b;
    })];
    swatches.append(...buttons);
    const colorRow = el('div', 'settings-row');
    colorRow.append(el('span', 'settings-label', 'Your color'), swatches);

    const done = this.button('fight', 'Back', () => this.showMain());
    panel.append(
      preview,
      tagRow,
      el('div', 'tips', `Up to ${TAG_MAX} letters or numbers, shown over your fighter and on your card. Empty: P1.`),
      colorRow,
      el('div', 'tips', 'Online, friends see your tag and color too. If two players pick the same color, whoever joined first keeps it. In team battles everyone wears their team\'s color.'),
      done,
    );
    page.appendChild(panel);
    const focus = [...buttons, done];
    this.show('settings', page, focus, me.color + 1);
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
      (i) => slotTag(s.slots[i]!),
      (i) => this.slotColors()[i]!,
    ));

    const shown = shownSlots(s.slots);
    const panels = el('div', `slots ${shown >= MENU.slotsShown + 1 ? 'many' : ''}`);
    const colors = this.slotColors();
    s.slots.slice(0, shown).forEach((slot, i) => {
      const color = colors[i]!;
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
      if (slot.kind !== 'off' && s.teams) {
        card.appendChild(this.teamButton(slot.team, () => {
          slot.team = (slot.team + 1) % TEAM_COUNT;
          this.commit();
        }));
      }
      if (slot.kind !== 'off') {
        const def = FIGHTERS[slot.fighter];
        card.append(
          slot.random ? randomArt('panel-art') : previewCanvas(slot.fighter, color),
          el('div', 'fighter-name', slot.random ? 'Random' : def.name),
          ...seasonLine(slot.random ? null : slot.fighter),
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
    // Bigger fights (ADR-0086): one more panel at a time, as a Normal CPU.
    if (shown < s.slots.length) {
      const add = this.button('slot add-slot', '', () => {
        // Fill the first empty panel, or open the next one.
        const at = s.slots.findIndex((x) => x.kind === 'off');
        const slot = s.slots[at]!;
        slot.kind = 'bot';
        slot.level = 2;
        this.editSlot = at;
        this.commit();
      });
      add.append(el('span', 'add-plus', '+'), el('span', 'add-label', 'Add a fighter'), el('span', 'add-sub', `Up to ${MATCH.maxFighters}`));
      panels.appendChild(add);
    }
    page.appendChild(panels);

    const options = el('div', 'options');
    const stageBtn = this.button('option', stageLabel(s.stage), () => {
      s.stage = nextStage(s.stage);
      this.commit();
    });
    const stocksBtn = this.button('option', `Stocks: ${s.stocks}`, () => {
      s.stocks = (s.stocks % 5) + 1;
      this.commit();
    });
    const modeBtn = this.button('option', s.teams ? 'Mode: Teams' : 'Mode: Free-for-all', () => {
      s.teams = !s.teams;
      this.commit();
    });
    modeBtn.title = 'Free-for-all, or teams: the last team with fighters left wins';
    const ffBtn = this.button(`option ${s.friendlyFire ? 'on' : ''}`, `Friendly fire: ${s.friendlyFire ? 'On' : 'Off'}`, () => {
      s.friendlyFire = !s.friendlyFire;
      this.commit();
    });
    ffBtn.title = 'Whether your hits land on your own teammates';
    const pickBtn = this.button(`option ${s.stagePick ? 'on' : ''}`, `Stage pick & ban: ${s.stagePick ? 'On' : 'Off'}`, () => {
      s.stagePick = !s.stagePick;
      this.commit();
    });
    pickBtn.title = 'On: pick the stage on a stage screen after this one, and ban the stages you never want';
    const fight = el('button', 'fight', s.stagePick ? 'Pick a stage ›' : 'Fight!');
    const problem = setupProblem(s);
    fight.disabled = !!problem;
    fight.title = problem ?? 'Enter';
    fight.onclick = () => this.fight();
    if (!s.stagePick) options.append(stageBtn, el('div', 'stage-blurb', s.stage === 'random' ? 'Any stage you haven\'t banned' : STAGES[s.stage].blurb));
    options.append(stocksBtn, modeBtn);
    if (s.teams) options.appendChild(ffBtn);
    options.append(pickBtn, fight);
    page.appendChild(options);
    page.appendChild(el('div', 'menu-hint', `${s.stagePick ? 'Enter to pick a stage' : 'Enter to fight'} · Esc back · Controls are in the main menu and the pause screen`));
    this.show('select', page);
  }

  /**
   * The roster grid. Each tile shows tokens for the slots that picked it; the edited slot's cursor is
   * outlined in its color.
   */
  private rosterGrid(
    slotAt: (i: number) => SlotSetup | null,
    pick: (tile: FighterId | 'random') => void,
    cursorSlot: number,
    tagOf: (i: number) => string,
    colorOf: (i: number) => string,
  ): HTMLElement {
    const grid = el('div', 'roster');
    const cursor = slotAt(cursorSlot);
    rosterTiles().forEach((tile) => {
      const t = this.button('tile', '', () => pick(tile));
      t.title = tile === 'random' ? 'Random fighter' : FIGHTERS[tile].blurb;
      t.append(tile === 'random' ? randomArt('tile-art') : previewCanvas(tile, '#eeeeea', MENU.tileSize), el('span', 'tile-name', tile === 'random' ? 'Random' : FIGHTERS[tile].name));
      const season = tile === 'random' ? null : seasonOfFighter(tile);
      if (season) {
        t.classList.add('seasonal');
        t.style.setProperty('--season', season.color);
        t.appendChild(seasonTag(season, 'season-tag corner'));
      }
      const tokens = el('div', 'tokens');
      for (let i = 0; i < MATCH.maxFighters; i++) {
        const slot = slotAt(i);
        if (!slot || slot.kind === 'off') continue;
        if ((tile === 'random') !== !!slot.random || (tile !== 'random' && slot.fighter !== tile)) continue;
        const tok = el('span', `token ${slot.kind === 'bot' ? 'cpu' : ''}`, tagOf(i));
        tok.style.setProperty('--slot', colorOf(i));
        tokens.appendChild(tok);
        if (i === cursorSlot) {
          t.classList.add('cursor');
          t.style.setProperty('--slot', colorOf(i));
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
    const tiles = rosterTiles();
    const at = slot.random ? tiles.length - 1 : tiles.indexOf(slot.fighter);
    let next = at;
    if (dx) next = (at + dx + tiles.length) % tiles.length;
    else {
      next = at + dy * cols;
      if (next < 0 || next >= tiles.length) return;
    }
    this.handlers.onClick();
    this.assign(this.editSlot, tiles[next]!);
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
    const roster = rosterIds();
    const i = roster.indexOf(slot.fighter);
    slot.random = false;
    slot.fighter = roster[(i + dir + roster.length) % roster.length]!;
    this.commit();
  }

  private commit(): void {
    saveSetup(this.setup);
    this.showSelect();
  }

  /** A small pill showing a fighter's team; click to move to the next team (ADR-0081). */
  private teamButton(team: number, next: (() => void) | null): HTMLElement {
    const label = `${TEAM_NAMES[team]} team`;
    const b = next ? this.button('team-pill', label, next) : el('div', 'team-pill static', label);
    b.style.setProperty('--team', TEAM_COLORS[team]!);
    if (next) {
      b.title = 'Click to change team';
      b.addEventListener('click', (e) => e.stopPropagation());
    }
    return b;
  }

  /** Each slot's color on the select screen: its team's in a team battle, otherwise as in the fight (ADR-0083). */
  private slotColors(): string[] {
    const s = this.setup;
    return s.teams ? s.slots.map((x) => TEAM_COLORS[x.team]!) : setupColors(s.slots);
  }

  fight(): void {
    if (setupProblem(this.setup)) return;
    saveSetup(this.setup);
    if (this.setup.stagePick) this.showStages(false);
    else this.handlers.onFight(this.setup);
  }

  // ------------------------------------------------------------------------------------- Stage pick and ban

  /**
   * The stage screen (ADR-0085): a card per stage on offer and Random. Pick one to fight there; ban the ones you
   * never want. Online, everyone bans here and the host picks.
   */
  showStages(online: boolean): void {
    this.stagesOnline = online;
    const room = online ? this.net.room : null;
    if (online && !room) return this.showOnline();
    const isHost = !online || this.net.isHost;
    const offered = stageIds();
    const mine = stageBans();
    const picked: StagePick = online ? room!.settings.stage : this.setup.stage;
    // Online: who banned what (your own bans as you've set them, everyone else's from the room).
    const bannedBy = (id: StageId): string[] => {
      if (!room) return mine.includes(id) ? ['You'] : [];
      return room.members.flatMap((m, i) => {
        const bans = m.id === room.you ? mine : m.bans;
        return bans.includes(id) ? [m.id === room.you ? 'You' : m.tag || `P${i + 1}`] : [];
      });
    };
    const page = el('div', 'screen select stages');
    const top = el('div', 'select-top');
    top.append(this.button('back', '‹ Back', () => (online ? this.showOnline() : this.showSelect())), el('h2', 'select-title', isHost ? 'Pick a stage' : 'Ban stages'));
    page.appendChild(top);

    const grid = el('div', 'stage-grid');
    const focus: HTMLButtonElement[] = [];
    const pick = (id: StagePick) => {
      if (online) {
        this.net.setSettings({ ...room!.settings, stage: id });
        this.showOnline();
        return;
      }
      this.setup.stage = id;
      saveSetup(this.setup);
      this.handlers.onFight(this.setup);
    };
    const ban = (id: StageId) => {
      if (!toggleBan(id, offered)) {
        this.stageNote = 'Leave at least one stage open';
        return this.showStages(online);
      }
      this.stageNote = '';
      if (online) this.net.setPick({ bans: stageBans() });
      else this.showStages(online);
    };
    for (const id of [...offered, 'random' as const]) {
      const banners = id === 'random' ? [] : bannedBy(id);
      const banned = banners.length > 0;
      const card = this.button(`stage-card ${banned ? 'banned' : ''} ${picked === id ? 'picked' : ''}`, '', () => {
        if (!isHost) return id !== 'random' && ban(id);
        if (!banned || online) pick(id);
      });
      const art = el('div', 'stage-art');
      if (id === 'random') art.append(randomArt('stage-random'));
      else {
        const img = el('img');
        img.src = stageThumb(id);
        img.alt = STAGES[id].name;
        art.append(img);
      }
      if (banned) art.append(el('div', 'ban-stamp', 'Banned'));
      card.append(art, el('div', 'stage-name', stageName(id)));
      const season = id === 'random' ? null : seasonOfStage(id);
      if (season) card.appendChild(seasonTag(season, 'season-tag corner'));
      card.append(el('div', 'stage-blurb', id === 'random' ? 'Any stage nobody banned' : STAGES[id].blurb));
      if (online && banned) card.append(el('div', 'banned-by', `Banned by ${banners.join(', ')}`));
      if (picked === id) card.append(el('div', 'picked-tag', online ? 'Host\'s pick' : 'Last pick'));
      if (id !== 'random') {
        const mineBanned = mine.includes(id);
        const banBtn = this.button(`ban-btn ${mineBanned ? 'on' : ''}`, mineBanned ? 'Unban' : 'Ban', () => ban(id));
        banBtn.title = 'B';
        banBtn.addEventListener('click', (e) => e.stopPropagation());
        card.append(banBtn);
        card.addEventListener('ban', () => ban(id));
      }
      if (!online && banned) card.title = 'Banned: unban it to play here';
      grid.appendChild(card);
      focus.push(card);
    }
    page.appendChild(grid);
    if (this.stageNote) page.appendChild(el('div', 'net-error', this.stageNote));
    page.appendChild(el('div', 'menu-hint', online
      ? isHost
        ? 'Click a stage to pick it · B bans · A stage anyone banned is swapped for a random open one · Esc back'
        : 'B or click to ban · The host picks; a stage anyone banned is swapped for a random open one · Esc back'
      : '← → to choose · Enter to fight · B to ban · Random never draws a banned stage · Esc back'));
    const at = Math.max(0, focus.findIndex((_b, i) => [...offered, 'random'][i] === picked));
    this.show('stages', page, focus, at);
  }

  /** The room's Match settings (ADR-0085): opens when you make a room, and from the lobby. Host only. */
  showMatchSettings(): void {
    const room = this.net.room;
    if (!room || !this.net.isHost) return this.showOnline();
    const settings = room.settings;
    const set = (patch: Partial<RoomSettings>) => this.net.setSettings({ ...settings, ...patch });
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel match-settings');
    panel.append(el('h2', '', 'Match settings'), el('div', 'tips', `Room ${room.code}. You can change these from the lobby until the fight starts.`));
    const art = el('div', 'stage-art small');
    if (settings.stage === 'random') art.append(randomArt('stage-random'));
    else {
      const img = el('img');
      img.src = stageThumb(settings.stage);
      img.alt = STAGES[settings.stage].name;
      art.append(img);
    }
    const stage = this.button('option', stageLabel(settings.stage), () => set({ stage: nextStage(settings.stage) }));
    const stocks = this.button('option', `Stocks: ${settings.stocks}`, () => set({ stocks: (settings.stocks % 5) + 1 }));
    const mode = this.button('option', settings.teams ? 'Mode: Teams' : 'Mode: Free-for-all', () => set({ teams: !settings.teams }));
    const ff = this.button(`option ${settings.friendlyFire ? 'on' : ''}`, `Friendly fire: ${settings.friendlyFire ? 'On' : 'Off'}`, () => set({ friendlyFire: !settings.friendlyFire }));
    const pickBan = this.button(`option ${settings.stagePick ? 'on' : ''}`, `Stage pick & ban: ${settings.stagePick ? 'On' : 'Off'}`, () => set({ stagePick: !settings.stagePick }));
    pickBan.title = 'On: everyone can ban stages from the lobby, and a banned stage is never played';
    const done = this.button('fight', 'Open the lobby', () => this.showOnline());
    const buttons = [stage, stocks, mode, ...(settings.teams ? [ff] : []), pickBan, done];
    panel.append(art, ...buttons.slice(0, -1), el('div', 'tips', settings.stagePick
      ? 'Everyone bans stages in the lobby. If anyone bans your stage, or it\'s Random, one nobody banned is drawn.'
      : 'Add CPUs in the lobby\'s open slots.'), done);
    page.appendChild(panel);
    this.show('match-settings', page, buttons, buttons.length - 1);
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
      const create = this.button('fight', 'Make a room', () => { this.madeRoom = true; net.create(); });
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
      panel.appendChild(el('div', 'tips', 'Rooms have a two-digit code. Read it out on a call, or send the invite link. Up to ten players per room.'));
      page.appendChild(panel);
      focus.push(create);
      this.show('online', page, focus);
      if (hadFocus) input.focus();
      return;
    }

    const room = net.room;
    const host = room.host;
    const isHost = net.isHost;
    const settings = room.settings;
    const head = el('div', 'room-head');
    const link = `${location.origin}${location.pathname}?room=${room.code}`;
    const copy = this.button('option', 'Copy invite link', () => {
      void navigator.clipboard?.writeText(link).then(() => { copy.textContent = 'Copied!'; }, () => undefined);
    });
    head.append(el('div', 'room-label', 'Room'), el('div', 'room-code', room.code), copy);
    page.appendChild(head);

    // People take the first slots in join order; the host's CPUs fill the rest (ADR-0076). CPU fighters are
    // drawn by the server when the fight starts.
    const members = room.members;
    const pickOf = (i: number) => {
      const m = members[i]!;
      return m.id === room.you ? net.me : m;
    };
    const asSlot = (i: number): SlotSetup | null => {
      if (i < members.length) return { kind: 'p1', fighter: pickOf(i).fighter, level: 2, team: pickOf(i).team };
      const level = settings.cpus[i - members.length];
      return level ? { kind: 'bot', fighter: 'brawler', level, random: true, team: 0 } : null;
    };
    // Members' own colors (ADR-0083); CPUs fill in around them.
    const ffaColors = resolveColors([...members.map((m) => m.color), ...settings.cpus.map(() => -1)]);
    const memberTag = (i: number) => members[i]!.tag || `P${i + 1}`;
    const teamOn = !!settings.teams;
    const cpuTeams = settings.cpus.map((_c, i) => settings.cpuTeams?.[i] ?? 0);
    const colorAt = (i: number): string => {
      const team = i < members.length ? pickOf(i).team : i - members.length < settings.cpus.length ? cpuTeams[i - members.length]! : -1;
      return teamOn && team >= 0 ? TEAM_COLORS[team]! : ffaColors[i] ?? SLOT_COLORS[i]!;
    };
    page.appendChild(this.rosterGrid(
      asSlot,
      (tile) => net.setPick({ fighter: tile === 'random' ? pickOne(randomFighters()) : tile, ready: false }),
      members.findIndex((m) => m.id === room.you),
      (i) => (i < members.length ? memberTag(i) : `CPU ${settings.cpus[i - members.length] ?? ''}`),
      colorAt,
    ));

    // The host's rule cheats (MOONJUMP, ONEHIT) are the room's rules (ADR-0077).
    if (isHost && !room.playing && !sameRules(settings.rules, cheatRules())) net.setSettings({ ...settings, rules: cheatRules() });
    const setCpus = (cpus: BotLevel[], teams = cpuTeams) => net.setSettings({ ...settings, cpus, cpuTeams: teams.slice(0, cpus.length) });
    // Four panels, or as many as are in use plus one open (ADR-0086).
    const shown = Math.min(MATCH.maxFighters, Math.max(MENU.slotsShown, members.length + settings.cpus.length + 1));
    const panels = el('div', `slots ${shown > MENU.slotsShown ? 'many' : ''}`);
    for (let i = 0; i < shown; i++) {
      const cpuIndex = i - members.length;
      const cpu = cpuIndex >= 0 ? settings.cpus[cpuIndex] : undefined;
      const color = colorAt(i);
      const card = el('div', 'slot');
      card.style.setProperty('--slot', color);
      if (i < members.length) {
        const m = members[i]!;
        const p = pickOf(i);
        const who = m.id === room.you ? (m.tag ? `${m.tag} (you)` : 'You') : m.tag || `Player ${i + 1}`;
        card.appendChild(el('div', 'kind', `${who}${m.id === host ? ' · Host' : ''}`));
        // You pick your own team; nobody else can move you (ADR-0081).
        if (teamOn) card.appendChild(this.teamButton(p.team, m.id === room.you && !room.playing ? () => net.setPick({ team: (p.team + 1) % TEAM_COUNT, ready: false }) : null));
        card.append(previewCanvas(p.fighter, color), el('div', 'fighter-name', FIGHTERS[p.fighter].name), ...seasonLine(p.fighter));
        card.appendChild(el('div', `ready-tag ${p.ready ? 'on' : ''}`, p.ready ? 'Ready' : 'Picking…'));
      } else if (cpu) {
        card.classList.add('cpu');
        const kind = isHost
          ? this.button('kind', `CPU · ${BOT_LEVEL_NAMES[cpu]}`, () => {
            const cpus = [...settings.cpus];
            const teams = [...cpuTeams];
            if (cpu < 3) cpus[cpuIndex] = (cpu + 1) as BotLevel;
            else { cpus.splice(cpuIndex, 1); teams.splice(cpuIndex, 1); }
            setCpus(cpus, teams);
          })
          : el('div', 'kind', `CPU · ${BOT_LEVEL_NAMES[cpu]}`);
        if (isHost) kind.title = 'Click to change the level (after Hard: remove)';
        card.appendChild(kind);
        // The host sets the CPUs' teams.
        if (teamOn) {
          card.appendChild(this.teamButton(cpuTeams[cpuIndex]!, isHost ? () => {
            const teams = [...cpuTeams];
            teams[cpuIndex] = (teams[cpuIndex]! + 1) % TEAM_COUNT;
            setCpus(settings.cpus, teams);
          } : null));
        }
        card.append(randomArt('panel-art'), el('div', 'fighter-name', 'Random'), el('div', 'blurb', 'Picked when the fight starts'));
      } else {
        card.classList.add('off');
        if (isHost && cpuIndex === settings.cpus.length) {
          // A new CPU joins the smaller of the first two teams.
          const add = this.button('kind', 'Add CPU', () => setCpus([...settings.cpus, 2], [...cpuTeams, startingTeam([...members.map((_m, j) => pickOf(j).team), ...cpuTeams])]));
          card.append(add, el('div', 'empty', `Or wait for a friend… code ${room.code}`));
        } else {
          card.append(el('div', 'kind', 'Open'), el('div', 'empty', `Waiting for a friend… code ${room.code}`));
        }
      }
      panels.appendChild(card);
    }
    page.appendChild(panels);

    const options = el('div', 'options');
    const ready = this.button(net.me.ready ? 'option on' : 'fight', net.me.ready ? 'Not ready' : 'Ready', () => net.setPick({ ready: !net.me.ready }));
    const leave = this.button('option', 'Leave room', () => net.leave());
    const everyone = members.every((_m, i) => pickOf(i).ready);
    const fighters = members.length + settings.cpus.length;
    const oneTeam = teamOn && sideCount([...members.map((_m, i) => pickOf(i).team), ...cpuTeams]) < 2;
    const canStart = everyone && fighters >= 2 && !oneTeam && !room.playing;
    const start = this.button('fight', 'Start', () => net.start());
    start.disabled = !canStart;
    start.title = canStart ? 'Start the fight' : fighters < 2 ? 'Add a CPU or wait for a friend' : oneTeam ? 'Everyone is on one team: put someone on another' : 'Waiting for everyone to be ready';
    // The match itself is set on the host's Match settings screen (ADR-0085); everyone sees a summary.
    const summary = [stageLabel(settings.stage), `Stocks: ${settings.stocks}`, teamOn ? 'Teams' : 'Free-for-all'];
    if (teamOn) summary.push(`Friendly fire ${settings.friendlyFire ? 'on' : 'off'}`);
    if (settings.stagePick) summary.push('Stage pick & ban');
    options.appendChild(el('div', 'match-summary', summary.join(' · ')));
    const matchBtn = isHost ? this.button('option', 'Match settings', () => this.showMatchSettings()) : null;
    if (matchBtn) options.appendChild(matchBtn);
    const stagesBtn = settings.stagePick ? this.button('option', isHost ? 'Stages & bans' : 'Ban stages', () => this.showStages(true)) : null;
    if (stagesBtn) options.appendChild(stagesBtn);
    options.append(ready, isHost ? start : el('span', ''), leave);
    page.appendChild(options);
    const rules = rulesText(settings.rules);
    if (rules) page.appendChild(el('div', 'cheat-rules', `Cheats on (host's): ${rules}`));
    page.appendChild(el('div', 'net-status', room.playing
      ? 'A fight is on. You\'re watching; you\'ll be in the next one.'
      : isHost
        ? (canStart ? 'Everyone is ready: press Start.' : 'Pick a fighter and press Ready. Add CPUs in the open slots. You start the fight once everyone is ready.')
        : 'Pick a fighter and press Ready. The host starts the fight.'));
    // Stage pick and ban: the host's stage is banned, so one nobody banned will be drawn.
    if (settings.stagePick && settings.stage !== 'random') {
      const by = members.filter((m) => (m.id === room.you ? net.me.bans : m.bans).includes(settings.stage as StageId));
      if (by.length) page.appendChild(el('div', 'net-status', `${STAGES[settings.stage].name} is banned by ${by.map((m) => (m.id === room.you ? 'you' : m.tag || 'a player')).join(', ')}: a random open stage will be played.`));
    }
    if (net.error) page.appendChild(el('div', 'net-error', net.error));
    focus.push(ready);
    if (isHost) focus.push(start);
    if (matchBtn) focus.push(matchBtn);
    if (stagesBtn) focus.push(stagesBtn);
    focus.push(leave);
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
      row('Smash: hold Shift + arrow, hold the arrow to charge', `${k.smash} + ${k.arrows}`),
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

  showResults(world: World, names: string[], onRematch: () => void, onSelect: () => void, onMenu: () => void, onStage?: () => void): void {
    const stage: [string, string, () => void][] = onStage ? [['option', 'Change stage', onStage]] : [];
    this.results(world, names, [['fight', 'Rematch', onRematch], ...stage, ['option', 'Change fighters', onSelect], ['option', 'Main menu', onMenu]]);
  }

  /** Results of an online fight: back to the room's lobby, or leave it (ADR-0076). */
  showOnlineResults(world: World, names: string[], onLobby: () => void, onLeave: () => void): void {
    this.results(world, names, [['fight', 'Back to the room', onLobby], ['option', 'Leave room', onLeave]]);
  }

  /** In an online fight Esc opens this; the fight keeps going behind it. */
  showOnlineMenu(onBack: () => void, onLeave: () => void): void {
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel');
    const back = el('button', 'fight', 'Back to the fight');
    back.onclick = onBack;
    const leave = el('button', 'option', 'Leave room');
    leave.onclick = onLeave;
    panel.append(el('h2', '', 'Online fight'), el('div', 'tips', 'The fight keeps going while this is open.'), back, leave, this.controlsCard());
    page.appendChild(panel);
    this.show('pause', page, [back, leave]);
  }

  private results(world: World, names: string[], actions: [string, string, () => void][]): void {
    const page = el('div', 'screen modal');
    const panel = el('div', 'panel results');
    const winner = world.winner >= 0 ? world.fighters[world.winner]! : null;
    // A team battle crowns the team, and shows every fighter on it (ADR-0081).
    const team = world.winnerTeam;
    const title = el('h2', '', team >= 0 ? `${TEAM_NAMES[team]} team wins!` : winner ? `${names[winner.slot]} wins!` : 'No contest');
    if (winner) title.style.color = fighterColor(winner);
    panel.appendChild(title);
    if (team >= 0) {
      const row = el('div', 'team-winners');
      for (const f of world.fighters) if (f.team === team) row.appendChild(previewCanvas(f.id, fighterColor(f), 100));
      panel.appendChild(row);
    } else if (winner) panel.appendChild(previewCanvas(winner.id, fighterColor(winner), 140));
    const table = el('table', 'stats');
    const head = el('tr');
    for (const h of ['', 'KOs', 'Falls', 'Damage dealt']) head.appendChild(el('th', '', h));
    table.appendChild(head);
    const order = [...world.fighters].sort((a, b) => (b.team === team ? 1 : 0) - (a.team === team ? 1 : 0) || b.stocks - a.stocks || b.stats.kos - a.stats.kos);
    for (const f of order) {
      const tr = el('tr');
      const name = el('td', 'who', names[f.slot]!);
      name.style.color = fighterColor(f);
      tr.append(name, el('td', '', String(f.stats.kos)), el('td', '', String(f.stats.falls)), el('td', '', `${Math.round(f.stats.damageDealt)}%`));
      table.appendChild(tr);
    }
    panel.appendChild(table);
    const buttons = actions.map(([cls, label, go]) => {
      const b = el('button', cls, label);
      b.onclick = go;
      return b;
    });
    buttons[0]!.title = 'Enter';
    panel.append(...buttons, wipNotice());
    page.appendChild(panel);
    this.show('results', page, buttons);
  }

  // ------------------------------------------------------------------------------------------------------ HUD

  /** Build the damage cards along the bottom for a new match. CPU cards say so (ADR-0075). */
  startHud(world: World, names: string[], cpu: readonly boolean[] = []): void {
    for (const c of this.cards) c.card.remove();
    this.cards = [];
    const bar = this.hud.querySelector('.cards') ?? this.hud.appendChild(el('div', 'cards'));
    bar.replaceChildren();
    // Bigger fights (ADR-0086): smaller cards that wrap.
    bar.classList.toggle('many', world.fighters.length > MENU.slotsShown);
    for (const f of world.fighters) {
      const card = el('div', `card ${cpu[f.slot] ? 'cpu' : ''}`);
      card.style.setProperty('--slot', fighterColor(f));
      const icon = previewCanvas(f.id, fighterColor(f), 44);
      const percent = el('div', 'percent', '0%');
      const stocks = el('div', 'stocks');
      const sig = el('div', 'sig');
      const info = el('div', 'info');
      info.append(percent, el('div', 'name', names[f.slot]!), stocks, sig);
      if (f.team >= 0) {
        card.classList.add('team');
        info.appendChild(el('div', 'team-name', `${TEAM_NAMES[f.team]} team`));
      }
      card.append(icon, info);
      bar.appendChild(card);
      this.cards.push({ percent, stocks, sig, card, lastPercent: -1, lastStocks: -1, lastSig: '' });
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
      // The fighter's signature meter (ADR-0079), redrawn only when it changes.
      const g = signatureGauge(world, f);
      const key = g ? JSON.stringify(g) : '';
      if (key !== c.lastSig) {
        c.lastSig = key;
        renderGauge(c.sig, g);
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

const INGREDIENT_ICONS = ['🍅', '🌶️', '🥩'];

/** One signature meter: name, then pips, pantry slots or a bar, then a short note. */
function renderGauge(box: HTMLElement, g: SignatureGauge | null): void {
  box.classList.toggle('ready', !!g?.ready);
  if (!g) { box.replaceChildren(); return; }
  const parts: HTMLElement[] = [el('span', 'sig-label', g.label)];
  if (g.items) {
    const row = el('span', 'sig-items');
    for (const i of g.items) {
      const slot = el('span', `sig-item ${i < 0 ? 'empty' : ''}`, i < 0 ? '' : INGREDIENT_ICONS[i] ?? '');
      if (i >= 0) slot.title = INGREDIENTS[i] ?? '';
      row.appendChild(slot);
    }
    parts.push(row);
  } else if (g.pips) {
    const row = el('span', 'sig-pips');
    for (let i = 0; i < g.pips; i++) row.appendChild(el('span', `sig-pip ${i < (g.lit ?? 0) ? 'lit' : ''}`));
    parts.push(row);
  } else {
    const barEl = el('span', 'sig-bar');
    const fill = el('span', 'sig-fill');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, g.value)) * 100)}%`;
    barEl.appendChild(fill);
    parts.push(barEl);
  }
  if (g.beat !== undefined) {
    const dot = el('span', 'sig-beat');
    dot.style.opacity = String(0.25 + 0.75 * g.beat);
    dot.style.transform = `scale(${0.7 + 0.5 * g.beat})`;
    parts.push(dot);
  }
  if (g.text) parts.push(el('span', 'sig-text', g.text));
  box.replaceChildren(...parts);
}

/** Plain notice that the game is unfinished (owner's request, 2026-11-10). */
function wipNotice(): HTMLElement {
  const box = el('div', 'wip-notice');
  box.append(
    el('strong', '', 'Work in progress'),
    el('span', '', ' · Placeholder art · Numbers and controls will change · Expect bugs'),
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
