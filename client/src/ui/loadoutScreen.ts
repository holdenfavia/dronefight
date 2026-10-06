import { loadoutAllowed, type RoomOptions } from '../../../shared/roomOptions';
import { droneClass, DRONE_ORDER, type DroneClassId } from '../../../shared/drones';
import { cleanLoadout, gunDps, handling, launchers, missilePods, thrustKg, thrustToWeight, totalKg, type Loadout } from '../../../shared/loadout';
import { SPECIAL_ORDER, SPECIALS, specialFits, type SpecialId } from '../../../shared/specials';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../../../shared/weapons';
import { saveSettings, type Settings } from '../settings';
import { agilityScore, speedScore } from '../sim/drone';
import { PROPELLER_ORDER, PROPELLERS, propellerFits } from '../../../shared/propellers';
import { BODY_ICONS, EMPTY_ICON, finishSwatch, paintSwatch, PROPELLER_ICONS, SPECIAL_ICONS, WEAPON_ICONS } from './icons';
import { PAINTS, PATTERNS, paintColor, type DroneLook } from '../../../shared/cosmetics';

/**
 * Loadout screen (ADR-0033), laid out like a shooter's gunsmith: your drone up top (the 3D preview draws there),
 * the stat sheet on the left, the parts list beside it, and a scrolling bar of options along the bottom.
 * Hover an option to see what it would change (green better, red worse); click to equip.
 */

type Slot = 'body' | 'special' | 'propeller' | `w${number}` | 'paintBody' | 'paintFinish' | 'paintAccent';
/** One option card: the build it makes, or (paint slots) the look it makes. */
interface Option { loadout: Loadout; look?: DroneLook; icon: string; name: string; line: string; kg: number | null; equipped: boolean }

interface Stat {
  label: string;
  /** 0..1 for now and with the hovered option. */
  now: number;
  next: number;
  text: string;
  /** Higher is better (false for weight and target size). */
  higherBetter: boolean;
}

/** Bar scales: the most any build reaches, roughly. */
const MAX = { hp: 180, tw: 8, dps: 1200, size: 5.4 } as const;

export class LoadoutScreen {
  private slot: Slot = 'body';
  /** The option under the pointer, previewed in the stats; null = none. */
  private hover: Loadout | null = null;
  /** A paint option under the pointer, previewed on the 3D model. */
  private hoverLook: DroneLook | null = null;

  /** The paint to show on the preview: the hovered option's, else yours. */
  get previewLook(): DroneLook {
    return this.hoverLook ?? this.hooks.look(this.loadout.body);
  }
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: Settings,
    /** `rules`: the room's match settings (ADR-0046), if you're in a room; parts it doesn't allow can't be equipped. */
    private readonly hooks: { changed(): void; done(): void; inMatch(): boolean; rules(): RoomOptions | null; look(body: DroneClassId): DroneLook; setLook(body: DroneClassId, look: DroneLook): void },
  ) {}

  /** Where the drone should be drawn: the middle of the hero area, in normalized screen coords (-1..1). */
  anchor(): { x: number; y: number } | null {
    const hero = this.root.querySelector<HTMLElement>('.gs-hero');
    if (!hero) return null;
    const r = hero.getBoundingClientRect();
    if (r.width < 10) return null;
    return { x: ((r.left + r.width / 2) / innerWidth) * 2 - 1, y: -(((r.top + r.height / 2) / innerHeight) * 2 - 1) };
  }

  open(): void {
    this.slot = 'body';
    this.hover = null;
    this.hoverLook = null;
    this.render();
    if (!this.keyHandler) {
      this.keyHandler = (e) => this.onKey(e);
      addEventListener('keydown', this.keyHandler);
    }
  }

  close(): void {
    if (this.keyHandler) removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.hover = null;
  }

  private get loadout(): Loadout {
    return this.settings.loadouts[this.settings.drone];
  }

  private render(): void {
    const lo = this.loadout;
    const body = droneClass(lo.body);
    const feel = handling(this.hover ?? lo);
    this.root.innerHTML = `
      <div class="gunsmith">
        <header class="gs-head">
          <div><span class="kicker">Loadout${this.hooks.inMatch() ? ' · arrives at your next respawn' : ''}</span><h2>${body.name}</h2></div>
          <span class="gs-verdict ${feel.level}">${feel.label}</span>
          <button class="btn" data-done>Done</button>
        </header>
        <aside class="gs-stats">${this.stats().map((s) => this.statRow(s)).join('')}${this.numbers()}</aside>
        <nav class="gs-slots">${this.slots().join('')}</nav>
        <div class="gs-hero"></div>
        <footer class="gs-bar ${this.group()}">
          <div class="gs-bar-title">${this.slotTitle()} <span class="gs-hint">hover to compare · click to equip · ← → Enter</span></div>
          <div class="gs-cards">${this.cards().join('')}</div>
        </footer>
      </div>`;
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.hooks.done());
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) =>
      b.addEventListener('click', () => {
        this.slot = b.dataset.slot as Slot;
        this.hover = null;
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((card, i) => {
      card.addEventListener('mouseenter', () => this.preview(i));
      card.addEventListener('focus', () => this.preview(i));
      card.addEventListener('mouseleave', () => this.preview(-1));
      card.addEventListener('click', () => this.equip(i));
    });
  }

  // --- Stats

  private stats(): Stat[] {
    const a = this.loadout;
    const b = this.hover ?? a;
    const tw = (l: Loadout) => thrustToWeight(l);
    const hover = (l: Loadout) => {
      const t = tw(l);
      return droneClass(l.body).flight === 'wing' || t <= 1 ? null : Math.pow(1 / t, 1 / 1.5);
    };
    const hv = hover(b);
    const heavy = (l: Loadout) => {
      const bits = [];
      if (missilePods(l)) bits.push(`${missilePods(l) * 3} missiles`);
      if (launchers(l)) bits.push(`${launchers(l)} grenade launcher${launchers(l) > 1 ? 's' : ''}`);
      return bits.length ? ` + ${bits.join(', ')}` : '';
    };
    return [
      { label: 'Health', now: droneClass(a.body).maxHp / MAX.hp, next: droneClass(b.body).maxHp / MAX.hp, text: `${droneClass(b.body).maxHp} HP`, higherBetter: true },
      { label: 'Lift', now: tw(a) / MAX.tw, next: tw(b) / MAX.tw, text: `T/W ${tw(b).toFixed(1)}${hv !== null ? ` · hovers ${Math.round(hv * 100)}%` : tw(b) <= 1 ? ' · grounded' : ''}`, higherBetter: true },
      { label: 'Agility', now: agilityScore(a) / 100, next: agilityScore(b) / 100, text: `${agilityScore(b)}`, higherBetter: true },
      { label: 'Top speed', now: speedScore(a) / 100, next: speedScore(b) / 100, text: `${speedScore(b)}`, higherBetter: true },
      { label: 'Firepower', now: gunDps(a) / MAX.dps, next: gunDps(b) / MAX.dps, text: `${Math.round(gunDps(b))} dmg/s${heavy(b)}`, higherBetter: true },
      { label: 'Target size', now: droneClass(a.body).hitRadius / MAX.size, next: droneClass(b.body).hitRadius / MAX.size, text: `${droneClass(b.body).hitRadius} m`, higherBetter: false },
    ];
  }

  private statRow(s: Stat): string {
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    const now = clamp(s.now);
    const next = clamp(s.next);
    const changed = Math.abs(next - now) > 0.004;
    const better = changed && (next > now) === s.higherBetter;
    const lo = Math.min(now, next);
    const hi = Math.max(now, next);
    return `<div class="gs-stat">
      <div class="gs-stat-head"><span>${s.label}</span><span class="gs-stat-val ${changed ? (better ? 'up' : 'down') : ''}">${s.text}</span></div>
      <div class="gs-stat-bar"><div class="base" style="width:${(lo * 100).toFixed(1)}%"></div>${
        changed ? `<div class="delta ${better ? 'up' : 'down'}" style="left:${(lo * 100).toFixed(1)}%;width:${((hi - lo) * 100).toFixed(1)}%"></div>` : ''
      }</div>
    </div>`;
  }

  /** The raw numbers under the bars. */
  private numbers(): string {
    const l = this.hover ?? this.loadout;
    const body = droneClass(l.body);
    return `<div class="gs-numbers"><div><b>${totalKg(l).toFixed(2)} kg</b><span>total weight</span></div><div><b>${thrustKg(l).toFixed(1)} kgf</b><span>max thrust</span></div><div><b>${body.hardpoints}</b><span>hardpoints</span></div></div>`;
  }

  // --- Parts list

  /**
   * The parts, grouped so you can find them at a glance: Frame, Weapons (a 2x2 grid laid out like your
   * screen: hardpoint 1 upper left ... 4 lower right; corners this body doesn't have are greyed), Propulsion,
   * and Special. Each group has its own accent color.
   */
  private slots(): string[] {
    const lo = this.loadout;
    const tile = (slot: Slot, icon: string, name: string, small = '') =>
      `<button class="gs-slot ${this.slot === slot ? 'on' : ''}" data-slot="${slot}"><span class="gs-slot-icon">${icon}</span><span class="gs-slot-text">${small ? `<small>${small}</small>` : ''}${name}</span></button>`;
    const corners = ['↖ upper left', '↗ upper right', '↙ lower left', '↘ lower right'];
    const hardpoints = [0, 1, 2, 3]
      .map((i) => {
        if (i >= lo.weapons.length) return `<div class="gs-hp none"><span>${i + 1}</span><small>no mount</small></div>`;
        const w = lo.weapons[i];
        return `<button class="gs-hp ${this.slot === `w${i}` ? 'on' : ''}" data-slot="w${i}" title="Hardpoint ${i + 1} (${corners[i]})">
          <span class="gs-hp-num">${i + 1} <em>${corners[i]!.split(' ')[0]}</em></span>
          <span class="gs-hp-icon">${w ? WEAPON_ICONS[w] : EMPTY_ICON}</span>
          <span class="gs-hp-name">${w ? WEAPONS[w].name : 'Empty'}</span>
        </button>`;
      })
      .join('');
    return [
      `<section class="gs-group frame"><h3>Frame</h3>${tile('body', BODY_ICONS[lo.body], droneClass(lo.body).name)}</section>`,
      `<section class="gs-group weapons"><h3>Weapons <span>${lo.weapons.filter(Boolean).length}/${lo.weapons.length}</span></h3><div class="gs-hardpoints">${hardpoints}</div></section>`,
      `<section class="gs-group propulsion"><h3>Propulsion</h3>${tile('propeller', PROPELLER_ICONS[lo.propeller], PROPELLERS[lo.propeller].name)}</section>`,
      `<section class="gs-group special"><h3>Special</h3>${tile('special', lo.special ? SPECIAL_ICONS[lo.special] : EMPTY_ICON, lo.special ? SPECIALS[lo.special].name : 'None', !lo.special && missilePods(lo) ? 'Special switches guns / missiles' : '')}</section>`,
      this.paintGroup(),
    ];
  }

  /** Paint (ADR-0030): body color, finish and accent, saved per body; others see it. Your match color stays on props, glow and trail. */
  private paintGroup(): string {
    const look = this.hooks.look(this.loadout.body);
    const chip = (slot: Slot, icon: string, small: string, name: string) =>
      `<button class="gs-paint ${this.slot === slot ? 'on' : ''}" data-slot="${slot}"><span class="gs-paint-icon">${icon}</span><small>${small}</small><span>${escapeText(name)}</span></button>`;
    const body = paintColor(look.body);
    const accent = paintColor(look.accent);
    return `<section class="gs-group paint"><h3>Paint</h3><div class="gs-paints">
      ${chip('paintBody', paintSwatch(body), 'Body', PAINTS.find((p) => p.id === look.body)?.name ?? '')}
      ${chip('paintFinish', finishSwatch(look.pattern, body, accent), 'Finish', PATTERNS.find((p) => p.id === look.pattern)?.name ?? '')}
      ${chip('paintAccent', paintSwatch(accent), 'Accent', PAINTS.find((p) => p.id === look.accent)?.name ?? '')}
    </div></section>`;
  }

  /** Which group the selected slot belongs to (the option bar takes its color). */
  private group(): 'frame' | 'weapons' | 'propulsion' | 'special' | 'paint' {
    if (this.slot.startsWith('paint')) return 'paint';
    if (this.slot === 'body') return 'frame';
    if (this.slot === 'propeller') return 'propulsion';
    if (this.slot === 'special') return 'special';
    return 'weapons';
  }

  private slotTitle(): string {
    if (this.slot === 'paintBody') return 'Paint · body color';
    if (this.slot === 'paintFinish') return 'Paint · finish';
    if (this.slot === 'paintAccent') return 'Paint · accent (battery and camera)';
    if (this.slot === 'body') return 'Frame · choose a body';
    if (this.slot === 'special') return 'Special';
    if (this.slot === 'propeller') return this.loadout.body === 'wing' ? 'Propulsion · props or a jet' : 'Propulsion · choose propellers';
    const i = Number(this.slot.slice(1));
    return `Weapons · hardpoint ${i + 1} (${['upper left', 'upper right', 'lower left', 'lower right'][i]})`;
  }

  // --- Option cards

  /** The options for the selected slot, each as the loadout it would make. */
  private options(): Option[] {
    const lo = this.loadout;
    if (this.slot === 'paintBody' || this.slot === 'paintAccent' || this.slot === 'paintFinish') {
      const look = this.hooks.look(lo.body);
      if (this.slot === 'paintFinish') {
        return PATTERNS.map((p) => ({
          loadout: lo,
          look: { ...look, pattern: p.id },
          icon: finishSwatch(p.id, paintColor(look.body), paintColor(look.accent)),
          name: p.name,
          line: 'Cosmetic only',
          kg: null,
          equipped: look.pattern === p.id,
        }));
      }
      const key = this.slot === 'paintBody' ? 'body' : 'accent';
      return PAINTS.map((p) => ({
        loadout: lo,
        look: { ...look, [key]: p.id },
        icon: paintSwatch(p.color),
        name: p.name,
        line: 'Cosmetic only',
        kg: null,
        equipped: look[key] === p.id,
      }));
    }
    if (this.slot === 'body') {
      return DRONE_ORDER.map((id) => {
        const b = droneClass(id);
        return {
          loadout: this.settings.loadouts[id],
          icon: BODY_ICONS[id],
          name: b.name,
          line: `${b.maxHp} HP · ${b.hardpoints} hardpoint${b.hardpoints > 1 ? 's' : ''} · ${b.thrustKg.toFixed(1)} kgf`,
          kg: b.frameKg,
          equipped: id === lo.body,
        };
      });
    }
    if (this.slot === 'propeller') {
      return PROPELLER_ORDER.filter((id) => propellerFits(id, lo.body)).map((id) => {
        const p = PROPELLERS[id];
        const pct = (x: number) => `${x >= 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`;
        return {
          loadout: { ...lo, propeller: id },
          icon: PROPELLER_ICONS[id],
          name: p.name,
          line: id === 'tri' ? `${p.real} · ${p.blurb}` : `${p.real} · lift ${pct(p.thrust)} · ${p.blurb}`,
          kg: p.kg,
          equipped: lo.propeller === id,
        };
      });
    }
    if (this.slot === 'special') {
      const choices: (SpecialId | null)[] = [null, ...SPECIAL_ORDER.filter((id) => specialFits(id, lo.body))];
      return choices.map((id) => ({
        loadout: { ...lo, special: id },
        icon: id ? SPECIAL_ICONS[id] : EMPTY_ICON,
        name: id ? SPECIALS[id].name : 'None',
        line: id ? SPECIALS[id].blurb : missilePods(lo) ? 'Special switches guns / missiles' : 'Nothing in the slot',
        kg: id ? SPECIALS[id].kg : null,
        equipped: lo.special === id,
      }));
    }
    const i = Number(this.slot.slice(1));
    const choices: (WeaponId | null)[] = [null, ...WEAPON_ORDER];
    return choices.map((id) => {
      const weapons = [...lo.weapons];
      weapons[i] = id;
      const w = id ? WEAPONS[id] : null;
      const line = !w
        ? 'Leave it empty: lighter'
        : w.kind === 'gun'
          ? `${w.damage}${w.pellets > 1 ? `×${w.pellets}` : ''} dmg · ${w.fireRate}/s · ${w.range} m`
          : w.blurb;
      return { loadout: { ...lo, weapons }, icon: id ? WEAPON_ICONS[id] : EMPTY_ICON, name: w ? w.name : 'Empty', line, kg: w ? w.kg : null, equipped: lo.weapons[i] === id };
    });
  }

  /** The room doesn't allow this build (ADR-0046). */
  private blocked(l: Loadout, look?: DroneLook): boolean {
    if (look) return false;
    const rules = this.hooks.rules();
    return !!rules && !loadoutAllowed(l, rules);
  }

  private cards(): string[] {
    return this.options().map(
      (o, i) => `<button class="gs-card ${o.equipped ? 'equipped' : ''} ${this.blocked(o.loadout, o.look) ? 'blocked' : ''}" data-option="${i}">
        <span class="gs-card-icon">${o.icon}</span>
        <span class="gs-card-name">${o.name}</span>
        <span class="gs-card-line">${this.blocked(o.loadout, o.look) ? 'Not allowed in this room' : o.line}</span>
        <span class="gs-card-foot">${o.kg !== null ? `${o.kg} kg` : '—'}${o.equipped ? '<b>Equipped</b>' : ''}</span>
      </button>`,
    );
  }

  private preview(i: number): void {
    const o = i >= 0 ? this.options()[i] : undefined;
    this.hoverLook = o?.look ?? null;
    this.hover = o && !o.look ? o.loadout : null;
    // Refresh just the stat sheet and verdict, so the cards (and the pointer over them) stay put.
    const stats = this.root.querySelector('.gs-stats');
    if (stats) stats.innerHTML = this.stats().map((s) => this.statRow(s)).join('') + this.numbers();
    const verdict = this.root.querySelector('.gs-verdict');
    if (verdict) {
      const feel = handling(this.hover ?? this.loadout);
      verdict.className = `gs-verdict ${feel.level}`;
      verdict.textContent = feel.label;
    }
  }

  private equip(i: number): void {
    const o = this.options()[i];
    if (!o || this.blocked(o.loadout, o.look)) return;
    if (o.look) {
      this.hooks.setLook(this.loadout.body, o.look);
      this.hoverLook = null;
      this.render();
      return;
    }
    const s = this.settings;
    if (this.slot === 'body') s.drone = o.loadout.body as DroneClassId;
    else s.loadouts[s.drone] = cleanLoadout(o.loadout, s.drone);
    saveSettings(s);
    this.hover = null;
    this.hooks.changed();
    this.render();
  }

  /** Keyboard: ← → to move along the cards, Enter to equip, ↑ ↓ to change part. */
  private onKey(e: KeyboardEvent): void {
    if (!this.root.querySelector('.gunsmith')) return;
    const cards = [...this.root.querySelectorAll<HTMLButtonElement>('[data-option]')];
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const next = Math.max(0, Math.min(cards.length - 1, (at < 0 ? cards.findIndex((c) => c.classList.contains('equipped')) : at) + (e.code === 'ArrowRight' ? 1 : -1)));
      cards[next]?.focus();
      cards[next]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      e.preventDefault();
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      const slots = [...this.root.querySelectorAll<HTMLButtonElement>('[data-slot]')];
      const cur = slots.findIndex((b) => b.dataset.slot === this.slot);
      const next = slots[Math.max(0, Math.min(slots.length - 1, cur + (e.code === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        this.slot = next.dataset.slot as Slot;
        this.hover = null;
        this.render();
      }
      e.preventDefault();
    }
  }
}

function escapeText(t: string): string {
  return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
