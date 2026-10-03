import { DEFAULT_RATES, type AxisRates } from '../config';
import type { Account } from '../account/account';
import { cleanPilotName, NAME_MAX } from '../../../shared/cosmetics';
import { levelProgress } from '../../../shared/progression';
import { CalibrationScreen } from '../input/calibrationScreen';
import { NET } from '../../../shared/protocol';
import type { InputManager } from '../input/inputManager';
import { droneClass, DRONE_ORDER } from '../../../shared/drones';
import { cleanLoadout, defaultLoadout, handling, missilePods, thrustToWeight, totalKg, type Loadout } from '../../../shared/loadout';
import { SPECIAL_ORDER, SPECIALS, specialFits, type SpecialId } from '../../../shared/specials';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../../../shared/weapons';
import { getMap, MAP_ORDER } from '../../../shared/maps';
import type { NetClient } from '../net/netClient';
import { maxRate } from '../sim/rates';
import { defaultSettings, saveSettings, type Settings } from '../settings';

type Screen = 'main' | 'pause' | 'drone' | 'play' | 'room' | 'settings' | 'controller' | 'buttons' | 'account';

export interface MenuCallbacks {
  onFly(): void;
  /** Camera or graphics settings changed and need re-applying. */
  onSettingsChanged(): void;
  /** The chosen map changed (solo play switches immediately). */
  onMapChanged(): void;
  /** The chosen drone class changed (solo: now; in a match: next respawn). */
  onDroneChanged(): void;
  /** Leave the current game (solo or room) and go back to the start screen. */
  onLeaveGame(): void;
}

/** Pause menu with main, settings and controller-setup screens. */
export class Menu {
  visible = true;
  private screen: Screen = 'main';
  /** You started flying (solo, or Start in a room): Escape then opens the pause menu, not the start screen. */
  private flying = false;
  /** Where the Loadout screen's Done goes back to (Play, the room screen, or the pause menu). */
  private droneReturn: Screen = 'main';
  private readonly calibration: CalibrationScreen;

  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputManager,
    private readonly settings: Settings,
    private readonly net: NetClient,
    private readonly callbacks: MenuCallbacks,
    private readonly account: Account,
  ) {
    // Controller setup lives under Settings, so it returns there.
    this.calibration = new CalibrationScreen(root, input, () => this.show('settings'));
    this.show('main');
  }

  /** The screen shown before the current one (for the Loadout screen's Done). */
  private lastScreen: Screen = 'main';

  show(screen: Screen): void {
    if (screen !== this.screen) this.lastScreen = this.screen;
    this.screen = screen;
    this.visible = true;
    this.root.hidden = false;
    if (screen === 'main') this.renderMain();
    else if (screen === 'pause') this.renderPause();
    else if (screen === 'drone') {
      // Done goes back where you came from (Play, the room, or the pause menu).
      if (this.lastScreen !== 'drone') this.droneReturn = this.lastScreen;
      this.renderDrone();
    }
    else if (screen === 'settings') this.renderSettings();
    else if (screen === 'play') this.renderPlay();
    else if (screen === 'room') this.renderRoom();
    else if (screen === 'account') this.renderAccount();
    else if (screen === 'buttons') this.calibration.openButtons();
    else this.calibration.openHub();
  }

  hide(): void {
    this.visible = false;
    this.root.hidden = true;
  }

  /** In a game (flying solo, or in a room): menus go back to the pause menu instead of the start screen. */
  private get inGame(): boolean {
    return this.flying || this.net.inRoom;
  }

  /** The menu's top screen: pause during a game, start screen otherwise. */
  private get home(): Screen {
    return this.inGame ? 'pause' : 'main';
  }

  /** Escape key: open the pause menu, back out of sub-screens, or resume. */
  back(): void {
    if (!this.visible) this.show(this.home);
    else if (this.screen === 'controller' || this.screen === 'buttons') this.show('settings');
    else if (this.screen === 'pause') this.fly();
    else if (this.screen !== this.home) this.show(this.home);
  }

  /** Start or resume flying. */
  private fly(): void {
    this.flying = true;
    this.callbacks.onFly();
  }

  /** Sign-in state or profile changed (ADR-0031): refresh whatever shows it. */
  onAccountChange(): void {
    if (!this.visible) return;
    if (this.screen === 'main') this.renderMain();
    else if (this.screen === 'pause') this.renderPause();
    else if (this.screen === 'account' && !this.root.querySelector('[data-pilot-name]:focus')) this.renderAccount();
  }

  /** Network status changed: refresh whatever shows it. */
  onNetChange(): void {
    if (!this.visible) return;
    // Typed a code (or created a room) and got in: show the room.
    if (this.screen === 'play' && this.net.inRoom) this.show('room');
    else if (this.screen === 'play') this.updateJoinStatus();
    else if (this.screen === 'room') this.renderRoom();
    else if (this.screen === 'main') this.renderMain();
    else if (this.screen === 'pause') this.renderPause();
  }

  tick(): void {
    if (!this.visible) return;
    if (this.screen === 'controller' || this.screen === 'buttons') this.calibration.tick();
    if (this.screen === 'main') this.updateControllerStatus();
  }

  /** Start screen: Play, Settings and sign-in. */
  private renderMain(): void {
    this.root.innerHTML = `
      <div class="title-block">
        <div class="logo">DRONE<span>FIGHT</span></div>
        <div class="scribble">fpv dogfights with friends</div>
      </div>
      <div class="panel main-menu">
        <button class="btn big" data-play>Play</button>
        <button class="btn ghost" data-settings>Settings</button>
        ${this.accountButton()}
        <div class="controller-status" data-status></div>
      </div>
      <div class="keys">ESC menu · F fullscreen · R reset · C camera · M mute · keyboard: W/S throttle, A/D yaw, arrows pitch/roll, Space fire, E special</div>`;
    this.root.querySelector('[data-play]')?.addEventListener('click', () => this.show('play'));
    this.root.querySelector('[data-settings]')?.addEventListener('click', () => this.show('settings'));
    this.root.querySelector('[data-account]')?.addEventListener('click', () => this.show('account'));
    this.updateControllerStatus();
  }

  /** Pause menu (Escape during a game): resume, change drone, the room, settings, or leave. */
  private renderPause(): void {
    const inRoom = this.net.inRoom;
    const where = inRoom ? `Room ${this.net.room} · ${this.net.map ? getMap(this.net.map).name : ''}` : `Solo · ${getMap(this.settings.map).name}`;
    this.root.innerHTML = `
      <div class="panel pause-menu">
        <div class="panel-head"><span class="kicker">Paused</span><h2>${escapeHtml(where)}</h2></div>
        <button class="btn big" data-resume>Resume</button>
        <button class="btn ghost" data-drone>Loadout: ${droneClass(this.settings.drone).name} ▸</button>
        ${inRoom ? `<button class="btn ghost" data-room>Room ${this.net.room}: invite ▸</button>` : ''}
        <button class="btn ghost" data-settings>Settings</button>
        <button class="btn ghost leave" data-leave>Leave game</button>
        ${this.accountButton()}
      </div>
      <div class="keys">ESC resume</div>`;
    this.root.querySelector('[data-resume]')?.addEventListener('click', () => this.fly());
    this.root.querySelector('[data-drone]')?.addEventListener('click', () => this.show('drone'));
    this.root.querySelector('[data-room]')?.addEventListener('click', () => this.show('room'));
    this.root.querySelector('[data-settings]')?.addEventListener('click', () => this.show('settings'));
    this.root.querySelector('[data-account]')?.addEventListener('click', () => this.show('account'));
    this.root.querySelector('[data-leave]')?.addEventListener('click', () => {
      this.flying = false;
      this.joining = null;
      this.callbacks.onLeaveGame();
      this.show('main');
    });
  }

  /**
   * Loadout (ADR-0033): pick a body, put a weapon on each hardpoint and a special in the slot. Weight against
   * thrust is shown as you build, with plain warnings, but nothing is blocked: bad builds are allowed.
   */
  private renderDrone(): void {
    const s = this.settings;
    const inMatch = this.net.inRoom && this.net.match?.phase === 'playing';
    const body = droneClass(s.drone);
    const lo = s.loadouts[s.drone];
    const kg = totalKg(lo);
    const tw = thrustToWeight(lo);
    const feel = handling(tw);
    // Quads hover where thrust equals weight: throttle^1.5 = 1 / (T/W) (config throttleExponent).
    const hover = body.flight === 'wing' ? null : tw > 1 ? Math.pow(1 / tw, 1 / 1.5) : null;
    const weaponOptions = (current: WeaponId | null) =>
      [`<option value="" ${current === null ? 'selected' : ''}>Empty</option>`]
        .concat(WEAPON_ORDER.map((id) => `<option value="${id}" ${current === id ? 'selected' : ''}>${WEAPONS[id].name} · ${WEAPONS[id].kg} kg</option>`))
        .join('');
    const specialOptions = [`<option value="" ${lo.special === null ? 'selected' : ''}>None${missilePods(lo) > 0 ? ' (Special switches guns/missiles)' : ''}</option>`]
      .concat(
        SPECIAL_ORDER.filter((id) => specialFits(id, s.drone)).map(
          (id) => `<option value="${id}" ${lo.special === id ? 'selected' : ''}>${SPECIALS[id].name} · ${SPECIALS[id].kg} kg</option>`,
        ),
      )
      .join('');
    const twPct = Math.min(100, (tw / 8) * 100);
    this.root.innerHTML = `
      <div class="panel loadout">
        <div class="panel-head"><span class="kicker">Loadout</span><h2>Build your drone</h2></div>
        <div class="body-tabs">
          ${DRONE_ORDER.map((id) => `<button class="body-tab ${id === s.drone ? 'on' : ''}" data-body="${id}">${droneClass(id).name}</button>`).join('')}
        </div>
        <p class="body-blurb">${body.blurb}</p>
        <div class="body-stats">${body.maxHp} HP · frame ${body.frameKg} kg · thrust ${body.thrustKg.toFixed(1)} kgf · ${body.hardpoints} hardpoint${body.hardpoints > 1 ? 's' : ''}</div>
        <div class="slots">
          ${lo.weapons
            .map(
              (w, i) => `<label class="slot"><span>Hardpoint ${i + 1}</span><select data-slot="${i}">${weaponOptions(w)}</select></label>
              ${w ? `<div class="slot-blurb">${WEAPONS[w].blurb}</div>` : ''}`,
            )
            .join('')}
          <label class="slot"><span>Special</span><select data-special>${specialOptions}</select></label>
          ${lo.special ? `<div class="slot-blurb">${SPECIALS[lo.special].blurb}</div>` : ''}
        </div>
        <div class="tw ${feel.level}">
          <div class="tw-row"><b>${kg.toFixed(2)} kg</b> total · thrust ${body.thrustKg.toFixed(1)} kgf · <b>T/W ${tw.toFixed(1)}</b>${hover !== null ? ` · hovers at ${Math.round(hover * 100)}% throttle` : ''}</div>
          <div class="tw-bar"><div style="width:${twPct.toFixed(0)}%"></div></div>
          <div class="tw-label">${feel.label}${body.flight === 'wing' && tw < 1.4 ? ' · stalls fast when this heavy' : ''}</div>
        </div>
        <p class="hint">${inMatch ? 'In a match, your new build arrives at your next respawn.' : 'Takes effect right away.'}</p>
        <div class="actions">
          <button class="btn ghost" data-default>Default build</button>
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    const save = (l: Loadout) => {
      s.loadouts[s.drone] = cleanLoadout(l, s.drone);
      saveSettings(s);
      this.callbacks.onDroneChanged();
      this.renderDrone();
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.body as (typeof DRONE_ORDER)[number];
        if (id === s.drone) return;
        s.drone = id;
        saveSettings(s);
        this.callbacks.onDroneChanged();
        this.renderDrone();
      }),
    );
    this.root.querySelectorAll<HTMLSelectElement>('[data-slot]').forEach((sel) =>
      sel.addEventListener('change', () => {
        const weapons = [...lo.weapons];
        weapons[Number(sel.dataset.slot)] = (sel.value || null) as WeaponId | null;
        save({ ...lo, weapons });
      }),
    );
    this.root.querySelector<HTMLSelectElement>('[data-special]')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      save({ ...lo, special: (v || null) as SpecialId | null });
    });
    this.root.querySelector('[data-default]')?.addEventListener('click', () => save(defaultLoadout(s.drone)));
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.show(this.droneReturn));
  }

  /**
   * Start-screen entry to the account: plainly "✓ Signed in" (green, with your name and level) once you
   * are, "Sign in (optional)" for guests. Hidden if sign-in isn't set up.
   */
  private accountButton(): string {
    const a = this.account;
    if (!a.available) return '';
    if (a.status === 'signed-in') {
      const name = escapeHtml(a.profile.name || a.user?.label || '');
      const level = a.xp !== null ? ` · Lv ${levelProgress(a.xp).level}` : '';
      return `<button class="btn ghost account-btn signed-in" data-account><span class="signed-in-mark">✓ Signed in</span>${name ? ` · ${name}` : ''}${level}</button>`;
    }
    const label = a.status === 'loading' ? (a.returning ? 'Finishing sign-in…' : 'Checking sign-in…') : 'Sign in (optional) ▸';
    // A failed sign-in says why, right on the start screen.
    const err = a.error ? `<div class="join-status warn">${escapeHtml(a.error)}</div>` : '';
    return `<button class="btn ghost account-btn" data-account>${label}</button>${err}`;
  }

  /** Your level and progress to the next (ADR-0032). */
  private levelBlock(xp: number): string {
    const { level, into, span } = levelProgress(xp);
    return `<div class="level-row"><span class="level-num">Level ${level}</span><span>${into.toLocaleString()} / ${span.toLocaleString()} XP to level ${level + 1}</span></div>
        <div class="level-bar"><div style="width:${((into / span) * 100).toFixed(1)}%"></div></div>
        <div class="level-hint">Earn XP in online matches: kills, assists, finishing and winning.</div>`;
  }

  /** Account: sign in with Discord or Google, your pilot name, sign out (ADR-0030, ADR-0031). */
  private renderAccount(): void {
    const a = this.account;
    const signedIn = a.status === 'signed-in';
    const via = a.user?.provider === 'google' ? 'Google' : a.user?.provider === 'discord' ? 'Discord' : 'your account';
    this.root.innerHTML = `
      <div class="panel account">
        <div class="panel-head"><span class="kicker">Account</span><h2>${signedIn ? 'Signed in' : 'Sign in'}</h2></div>
        <p class="calib-body">${
          signedIn
            ? `Signed in with <b>${via}</b> as <b>${escapeHtml(a.user?.label ?? '')}</b>. Your pilot name and drones follow you to any device.`
            : 'Optional. Playing never needs an account; signing in keeps your pilot name and drones on every device, and later your progress.'
        }</p>
        ${
          signedIn
            ? ''
            : `<div class="signin-buttons">
          ${a.providers.includes('discord') ? `<button class="btn signin discord" data-signin="discord" ${a.status === 'loading' ? 'disabled' : ''}>Sign in with Discord</button>` : ''}
          ${a.providers.includes('google') ? `<button class="btn signin google" data-signin="google" ${a.status === 'loading' ? 'disabled' : ''}>${GOOGLE_G}<span>Sign in with Google</span></button>` : ''}
        </div>`
        }
        ${signedIn && a.xp !== null ? this.levelBlock(a.xp) : ''}
        <label class="field">Pilot name <input type="text" maxlength="${NAME_MAX}" placeholder="your callsign" value="${escapeHtml(a.profile.name)}" data-pilot-name autocomplete="off" spellcheck="false"></label>
        <div class="join-status warn">${a.error ? escapeHtml(a.error) : ''}</div>
        <div class="actions">
          ${signedIn ? '<button class="btn ghost" data-signout>Sign out</button>' : ''}
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-signin]').forEach((b) =>
      b.addEventListener('click', () => {
        b.disabled = true;
        b.textContent = 'Opening…';
        void a.signIn(b.dataset.signin === 'google' ? 'google' : 'discord');
      }),
    );
    this.root.querySelector('[data-signout]')?.addEventListener('click', () => void a.signOut());
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.show(this.home));
    const name = this.root.querySelector<HTMLInputElement>('[data-pilot-name]');
    name?.addEventListener('input', () => {
      const clean = cleanPilotName(name.value);
      if (clean !== name.value.trim()) name.value = clean;
      a.update({ name: clean });
    });
  }

  /** Play: pick drone and map, then fly solo, create a room, or type a friend's two-digit code. */
  private renderPlay(): void {
    const busy = this.net.status === 'connecting' || this.net.status === 'reconnecting';
    this.root.innerHTML = `
      <div class="panel play">
        <div class="panel-head"><span class="kicker">Play</span><h2>Pick and go</h2></div>
        <button class="btn ghost" data-drone>Loadout: ${droneClass(this.settings.drone).name} ▸</button>
        <button class="btn ghost" data-map>Map: ${getMap(this.settings.map).name} ▸</button>
        <div class="play-modes">
          <button class="btn big" data-solo>Solo</button>
          <button class="btn big ghost" data-create ${busy ? 'disabled' : ''}>Create room</button>
        </div>
        <div class="divider">or join a friend</div>
        <div class="code-boxes">
          <input maxlength="1" inputmode="numeric" autocomplete="off" aria-label="First digit" data-digit="0">
          <input maxlength="1" inputmode="numeric" autocomplete="off" aria-label="Second digit" data-digit="1">
        </div>
        <div class="join-status" data-join-status></div>
        <div class="actions"><button class="btn ghost" data-back>Back</button></div>
      </div>`;
    this.root.querySelector('[data-drone]')?.addEventListener('click', () => this.show('drone'));
    this.root.querySelector('[data-map]')?.addEventListener('click', () => {
      const i = MAP_ORDER.indexOf(this.settings.map);
      this.settings.map = MAP_ORDER[(i + 1) % MAP_ORDER.length] ?? MAP_ORDER[0]!;
      saveSettings(this.settings);
      this.callbacks.onMapChanged();
      this.renderPlay();
    });
    this.root.querySelector('[data-solo]')?.addEventListener('click', () => this.fly());
    this.root.querySelector('[data-create]')?.addEventListener('click', () => {
      this.joining = null;
      this.net.createRoom(this.settings.map);
      this.updateJoinStatus('Creating a room…');
    });
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.show('main'));

    // Two digit boxes: typing moves along, the second digit joins straight away.
    const boxes = [...this.root.querySelectorAll<HTMLInputElement>('[data-digit]')];
    const [first, second] = boxes;
    if (!first || !second) return;
    const tryJoin = () => {
      const code = boxes.map((b) => b.value).join('');
      if (code.length !== 2) return;
      this.joining = code;
      this.net.joinRoom(code);
      this.updateJoinStatus(`Looking for room ${code}…`);
    };
    boxes.forEach((box, i) => {
      box.addEventListener('input', () => {
        const digits = box.value.replace(/[^0-9]/g, '');
        // Pasting "17" into a box fills both.
        if (digits.length > 1 && i === 0) {
          first.value = digits[0]!;
          second.value = digits[1]!;
        } else {
          box.value = digits.slice(-1);
        }
        if (box.value && i === 0) second.focus();
        tryJoin();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i === 1) first.focus();
      });
    });
    first.focus();
    this.updateJoinStatus();
  }

  /** Join a room by code (invite links): Play screen, then straight in. */
  joinCode(code: string): void {
    this.show('play');
    this.joining = code.replace(/[^0-9]/g, '').slice(0, 2);
    this.net.joinRoom(this.joining);
    this.updateJoinStatus(`Looking for room ${this.joining}…`);
  }

  /** The code being joined from the Play screen, for its status line. */
  private joining: string | null = null;

  private updateJoinStatus(text?: string): void {
    const el = this.root.querySelector('[data-join-status]');
    if (!el) return;
    const net = this.net;
    let msg = text ?? '';
    let warn = false;
    if (!text && net.status === 'error' && net.error) {
      msg = this.joining ? `No room ${this.joining}. Check the code with your friend.` : net.error;
      warn = true;
      // Clear the boxes for another try.
      this.root.querySelectorAll<HTMLInputElement>('[data-digit]').forEach((b) => (b.value = ''));
      this.root.querySelector<HTMLInputElement>('[data-digit="0"]')?.focus();
    } else if (!text && (net.status === 'connecting' || net.status === 'reconnecting')) {
      msg = this.joining ? `Looking for room ${this.joining}…` : 'Connecting…';
    }
    el.textContent = msg;
    el.classList.toggle('warn', warn);
  }

  private updateControllerStatus(): void {
    const el = this.root.querySelector('[data-status]');
    if (!el) return;
    const pads = this.input.listGamepads();
    const ready = pads.find((p) => p.kind === 'saved') ?? pads.find((p) => p.kind !== 'none');
    const text = ready
      ? `✓ ${ready.id}${ready.kind === 'guessed' ? ' (guessed layout: check it in Controller setup)' : ''}`
      : pads[0]
        ? `New controller found: set it up in Settings → Controller setup (${pads[0].id})`
        : 'No controller: keyboard mode. Plug in your radio and move a stick.';
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.toggle('warn', !ready);
    }
  }

  /** The room you're in: its code to share, map and pilots, and Start. */
  private renderRoom(): void {
    const net = this.net;
    if (!net.inRoom || !net.room) {
      this.show('play');
      return;
    }
    const pilots = net.peers.size + 1;
    const found = this.joining === net.room;
    this.root.innerHTML = `
      <div class="panel online">
        <div class="panel-head"><span class="kicker">${found ? 'Room found' : 'Your room'}</span><h2>Room ${net.room}</h2></div>
        <div class="room-code">${net.room}</div>
        <div class="room-map">${net.map ? getMap(net.map).name : ''}</div>
        <div class="room-hint">${found ? 'you\'re in' : 'read this code to your friends'} · up to ${NET.maxPlayersPerRoom} pilots</div>
        <div class="peer-status ${pilots > 1 ? 'ok' : ''}">${pilots > 1 ? `✓ ${pilots} pilots in the room` : 'Waiting for pilots…'}</div>
        <button class="btn ghost" data-drone>Drone: ${droneClass(this.settings.drone).name} ▸</button>
        <div class="actions">
          <button class="btn ghost" data-copy>Copy invite link</button>
          <button class="btn ghost" data-leave>Leave room</button>
          <button class="btn big" data-fly>${this.flying ? 'Resume' : 'Start'}</button>
        </div>
      </div>`;
    this.root.querySelector('[data-fly]')?.addEventListener('click', () => this.fly());
    this.root.querySelector('[data-drone]')?.addEventListener('click', () => this.show('drone'));
    this.root.querySelector('[data-leave]')?.addEventListener('click', () => {
      this.flying = false;
      this.joining = null;
      this.callbacks.onLeaveGame();
      this.show('play');
    });
    this.root.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const link = `${location.origin}${location.pathname}?room=${net.room}`;
      navigator.clipboard?.writeText(link).then(
        () => (btn.textContent = 'Copied ✓'),
        () => (btn.textContent = link),
      );
    });
  }

  private renderSettings(): void {
    const s = this.settings;
    const rateRow = (axis: 'roll' | 'pitch' | 'yaw') => {
      const r = s.rates[axis];
      return `<tr data-axis="${axis}">
        <th>${axis}</th>
        <td><input type="number" step="0.01" min="0.01" max="3" value="${r.rcRate}" data-rate="rcRate"></td>
        <td><input type="number" step="0.01" min="0" max="0.99" value="${r.superRate}" data-rate="superRate"></td>
        <td><input type="number" step="0.01" min="0" max="1" value="${r.expo}" data-rate="expo"></td>
        <td class="maxvel" data-max>${Math.round(maxRate(r))}</td>
      </tr>`;
    };
    this.root.innerHTML = `
      <div class="panel settings">
        <div class="panel-head"><span class="kicker">Settings</span><h2>Settings</h2></div>
        <div class="settings-controller">
          <button class="btn" data-controller>Controller setup</button>
          <button class="btn ghost" data-buttons>Map buttons</button>
        </div>
        <div class="calib-sub">Rates &amp; camera</div>
        <table class="rates">
          <thead><tr><th></th><th>RC rate</th><th>Super</th><th>Expo</th><th>Max °/s</th></tr></thead>
          <tbody>${rateRow('roll')}${rateRow('pitch')}${rateRow('yaw')}</tbody>
        </table>
        <p class="hint">Betaflight classic rates. Copy yours from the Betaflight Configurator.</p>
        <label class="field">Camera uptilt <input type="range" min="0" max="60" step="1" value="${s.camera.uptiltDeg}" data-cam="uptiltDeg"><span>${s.camera.uptiltDeg}°</span></label>
        <label class="field">Field of view <input type="range" min="80" max="150" step="1" value="${s.camera.fovHorizontalDeg}" data-cam="fovHorizontalDeg"><span>${s.camera.fovHorizontalDeg}°</span></label>
        <label class="field">View
          <select data-view><option value="fpv" ${s.camera.view === 'fpv' ? 'selected' : ''}>FPV</option><option value="chase" ${s.camera.view === 'chase' ? 'selected' : ''}>Chase</option></select>
        </label>
        <label class="field">Volume <input type="range" min="0" max="1" step="0.05" value="${s.audio.volume}" data-audio="volume"><span>${Math.round(s.audio.volume * 100)}%</span></label>
        <label class="field">My drone <input type="range" min="0" max="1" step="0.05" value="${s.audio.own}" data-audio="own"><span>${Math.round(s.audio.own * 100)}%</span></label>
        <label class="field">Other pilots <input type="range" min="0" max="1" step="0.05" value="${s.audio.others}" data-audio="others"><span>${Math.round(s.audio.others * 100)}%</span></label>
        <label class="field check"><input type="checkbox" data-mute ${s.audio.muted ? 'checked' : ''}> Mute (M)</label>
        <label class="field check"><input type="checkbox" data-gfx="shadows" ${s.graphics.shadows ? 'checked' : ''}> Shadows</label>
        <label class="field check"><input type="checkbox" data-gfx="gridTextures" ${s.graphics.gridTextures ? 'checked' : ''}> Simplified grid textures</label>
        <label class="field check"><input type="checkbox" data-gfx="showDebug" ${s.graphics.showDebug ? 'checked' : ''}> Debug readout (FPS, renderer)</label>
        <div class="actions">
          <button class="btn ghost" data-defaults>Reset to defaults</button>
          <button class="btn" data-done>Done</button>
        </div>
      </div>`;

    this.root.querySelectorAll<HTMLInputElement>('[data-rate]').forEach((el) =>
      el.addEventListener('change', () => {
        const row = el.closest<HTMLElement>('tr');
        const axis = row?.dataset.axis as 'roll' | 'pitch' | 'yaw' | undefined;
        const key = el.dataset.rate as keyof AxisRates;
        const value = Number(el.value);
        if (!axis || !Number.isFinite(value)) return;
        const limits: Record<keyof AxisRates, [number, number]> = { rcRate: [0.01, 3], superRate: [0, 0.99], expo: [0, 1] };
        const [lo, hi] = limits[key];
        s.rates[axis][key] = Math.max(lo, Math.min(hi, value));
        el.value = String(s.rates[axis][key]);
        const max = row?.querySelector('[data-max]');
        if (max) max.textContent = String(Math.round(maxRate(s.rates[axis])));
        this.commit();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('[data-cam]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.cam as 'uptiltDeg' | 'fovHorizontalDeg';
        s.camera[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${el.value}°`;
        this.commit();
      }),
    );
    this.root.querySelector<HTMLSelectElement>('[data-view]')?.addEventListener('change', (e) => {
      s.camera.view = (e.target as HTMLSelectElement).value === 'chase' ? 'chase' : 'fpv';
      this.commit();
    });
    this.root.querySelectorAll<HTMLInputElement>('[data-gfx]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = el.dataset.gfx as 'shadows' | 'showDebug' | 'gridTextures';
        s.graphics[key] = el.checked;
        this.commit();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('[data-audio]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = el.dataset.audio as 'volume' | 'own' | 'others';
        s.audio[key] = Number(el.value);
        const label = el.nextElementSibling;
        if (label) label.textContent = `${Math.round(s.audio[key] * 100)}%`;
        this.commit();
      }),
    );
    this.root.querySelector<HTMLInputElement>('[data-mute]')?.addEventListener('change', (e) => {
      s.audio.muted = (e.target as HTMLInputElement).checked;
      this.commit();
    });
    this.root.querySelector('[data-defaults]')?.addEventListener('click', () => {
      Object.assign(s, defaultSettings(), { rates: structuredClone(DEFAULT_RATES), map: s.map, drone: s.drone });
      this.commit();
      this.renderSettings();
    });
    this.root.querySelector('[data-done]')?.addEventListener('click', () => this.show(this.home));
    this.root.querySelector('[data-controller]')?.addEventListener('click', () => this.show('controller'));
    this.root.querySelector('[data-buttons]')?.addEventListener('click', () => this.show('buttons'));
  }

  private commit(): void {
    saveSettings(this.settings);
    this.callbacks.onSettingsChanged();
  }
}

/** Google's "G" mark, as their sign-in branding guidelines specify for a "Sign in with Google" button. */
const GOOGLE_G = `<svg class="signin-logo" viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
