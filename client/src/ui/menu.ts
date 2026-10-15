import type { Account } from '../account/account';
import type { DroneLook } from '../../../shared/cosmetics';
import { CalibrationScreen } from '../input/calibrationScreen';
import { LoadoutScreen } from './loadoutScreen';
import type { InputManager } from '../input/inputManager';
import type { Loadout } from '../../../shared/loadout';
import { MAP_ORDER } from '../../../shared/maps';
import type { NetClient } from '../net/netClient';
import { saveSettings, type Settings } from '../settings';
import { SettingsScreen } from './settingsScreen';
import type { MenuCallbacks, MenuContext, MenuScreen, ScreenId } from './screens/screen';
import { MainScreen } from './screens/main';
import { PauseScreen } from './screens/pause';
import { PlayScreen } from './screens/play';
import { RoomScreen } from './screens/room';
import { RulesScreen } from './screens/rules';
import { AccountScreen } from './screens/account';
import { TouchScreen } from './screens/touch';

export type { MenuCallbacks, ScreenId } from './screens/screen';

/**
 * The menu: a stack of screens (one file each under screens/). show() pushes a screen, Back/Done/Esc and the
 * radio's Menu button pop it; the bottom is the start screen, or the pause menu during a game.
 */
export class Menu {
  visible = true;
  /** The screens open, bottom first; the last one is showing. */
  private stack: ScreenId[] = [];
  /** You started flying (solo, or Start in a room): Escape then opens the pause menu, not the start screen. */
  private flying = false;
  /** The room's match phase last time we looked (ADR-0047). */
  private lastPhase: string | null = null;
  private readonly ctx: MenuContext;
  private readonly screens: Record<ScreenId, MenuScreen>;
  private readonly main: MainScreen;
  private readonly pause: PauseScreen;
  private readonly play: PlayScreen;
  private readonly room: RoomScreen;
  private readonly accountScreen: AccountScreen;
  private readonly calibration: CalibrationScreen;
  private readonly loadoutScreen: LoadoutScreen;

  constructor(
    private readonly root: HTMLElement,
    input: InputManager,
    private readonly settings: Settings,
    private readonly net: NetClient,
    private readonly callbacks: MenuCallbacks,
    account: Account,
  ) {
    this.ctx = {
      root,
      input,
      settings,
      net,
      account,
      callbacks,
      joining: null,
      show: (screen) => this.show(screen),
      back: () => this.pop(),
      toPlay: () => this.reset(this.home, 'play'),
      fly: () => this.fly(),
      hide: () => this.hide(),
      leaveGame: (to) => this.leaveGame(to),
      commit: () => this.commit(),
      nextMap: () => this.nextMap(),
    };
    this.loadoutScreen = new LoadoutScreen(root, settings, {
      changed: () => this.callbacks.onDroneChanged(),
      done: () => this.pop(),
      inMatch: () => this.net.inRoom && this.net.match?.phase === 'playing',
      rules: () => (this.net.inRoom ? (this.net.match?.options ?? null) : null),
      // Paint lives on your profile (ADR-0030): saved here and, signed in, to your account.
      look: (body) => account.profile.looks[body],
      setLook: (body, look) => account.update({ looks: { ...account.profile.looks, [body]: look } }),
    });
    const settingsScreen = new SettingsScreen(root, settings, input, {
      commit: () => this.commit(),
      open: (screen) => this.show(screen),
      done: () => this.pop(),
    });
    // Controller setup lives under Settings, so its Done pops back there.
    this.calibration = new CalibrationScreen(root, input, () => this.pop());
    this.main = new MainScreen(this.ctx);
    this.pause = new PauseScreen(this.ctx);
    this.play = new PlayScreen(this.ctx);
    this.room = new RoomScreen(this.ctx);
    this.accountScreen = new AccountScreen(this.ctx);
    this.screens = {
      main: this.main,
      pause: this.pause,
      play: this.play,
      room: this.room,
      account: this.accountScreen,
      rules: new RulesScreen(this.ctx, (text) => this.play.status(text)),
      touch: new TouchScreen(this.ctx),
      settings: { render: () => settingsScreen.render() },
      // Loadout (ADR-0033): the gunsmith-style screen in loadoutScreen.ts.
      drone: { render: () => this.loadoutScreen.open(), leave: () => this.loadoutScreen.close() },
      controller: { render: () => this.calibration.openHub(), tick: () => this.calibration.tick() },
      buttons: { render: () => this.calibration.openButtons(), tick: () => this.calibration.tick() },
    };
    this.reset('main');
  }

  /** The screen showing (or last shown, while hidden). */
  private get top(): ScreenId {
    return this.stack[this.stack.length - 1] ?? 'main';
  }

  /** Push a screen, or go back down the stack to it if it's already open (then it redraws). */
  show(screen: ScreenId): void {
    const i = this.stack.indexOf(screen);
    this.setStack(i >= 0 ? this.stack.slice(0, i + 1) : [...this.stack, screen]);
  }

  /** Replace the whole stack (jumps: leaving a game, getting into a room, the match coming back to pre-match). */
  private reset(...screens: ScreenId[]): void {
    this.setStack(screens);
  }

  /** Back/Done: pop the current screen; at the bottom, go to the menu's top screen. */
  private pop(): void {
    if (this.stack.length > 1) this.setStack(this.stack.slice(0, -1));
    else if (this.top !== this.home) this.reset(this.home);
  }

  private setStack(next: ScreenId[]): void {
    const prev = this.stack;
    const from = prev[prev.length - 1];
    const to = next[next.length - 1] ?? 'main';
    this.stack = next.length ? next : ['main'];
    if (from && from !== to) this.screens[from].leave?.();
    if (!prev.includes(to)) this.screens[to].enter?.();
    this.visible = true;
    this.root.hidden = false;
    this.screens[to].render();
  }

  hide(): void {
    this.visible = false;
    this.root.hidden = true;
  }

  /** The build to show in the 3D preview while the Loadout screen is open, else null (ADR-0033). */
  get previewLoadout(): Loadout | null {
    return this.visible && this.top === 'drone' ? this.settings.loadouts[this.settings.drone] : null;
  }

  /** The paint to show on the Loadout preview (the hovered paint option, else yours). */
  get previewLook(): DroneLook {
    return this.loadoutScreen.previewLook;
  }

  /** Where on screen the preview should draw the drone (normalized -1..1), while the Loadout screen is open. */
  previewAnchor(): { x: number; y: number } | null {
    return this.previewLoadout ? this.loadoutScreen.anchor() : null;
  }

  /** In a game (flying solo, or in a room): menus go back to the pause menu instead of the start screen. */
  private get inGame(): boolean {
    return this.flying || this.net.inRoom;
  }

  /** The menu's top screen: pause during a game, start screen otherwise. */
  private get home(): ScreenId {
    return this.inGame ? 'pause' : 'main';
  }

  /** Escape key / radio Menu button: open the pause menu, back out of sub-screens, or resume. */
  back(): void {
    if (!this.visible) this.reset(this.home);
    else if (this.top === 'pause') this.fly();
    else this.pop();
  }

  /** Start or resume flying. */
  private fly(): void {
    this.flying = true;
    this.callbacks.onFly();
  }

  /** Leave the game (solo or room), to the start screen or to Play. */
  private leaveGame(to: 'main' | 'play'): void {
    this.flying = false;
    this.ctx.joining = null;
    this.callbacks.onLeaveGame();
    if (to === 'main') this.reset('main');
    else this.ctx.toPlay();
  }

  /** Solo: the next map (your solo room follows it, ADR-0067). */
  private nextMap(): void {
    const i = MAP_ORDER.indexOf(this.settings.map);
    this.settings.map = MAP_ORDER[(i + 1) % MAP_ORDER.length] ?? MAP_ORDER[0]!;
    saveSettings(this.settings);
    this.callbacks.onMapChanged();
  }

  /** Sign-in state or profile changed (ADR-0031): refresh whatever shows it. */
  onAccountChange(): void {
    if (!this.visible) return;
    if (this.top === 'main') this.main.render();
    else if (this.top === 'pause') this.pause.render();
    else if (this.top === 'account') this.accountScreen.refresh();
  }

  /** Network status changed: refresh whatever shows it. */
  onNetChange(): void {
    // Removed for being away (ADR-0051): back to Play, and say why.
    if (this.net.kicked) {
      const why = this.net.kicked;
      this.net.kicked = null;
      this.leaveGame('play');
      this.play.status(why);
      return;
    }
    // Match phase changes (ADR-0047): the host started, so everyone's menu closes and the match begins; the
    // match ended and the results are over, so everyone comes back to the pre-match menu.
    const phase = this.net.inRoom ? (this.net.match?.phase ?? null) : null;
    const was = this.lastPhase;
    this.lastPhase = phase;
    if (was === 'waiting' && phase === 'playing' && this.net.online && this.visible && this.top !== 'drone') {
      this.fly();
      return;
    }
    if (was === 'ended' && phase === 'waiting') {
      this.reset(this.home, 'room');
      return;
    }
    if (!this.visible) return;
    // Typed a code (or created a room) and got in: show the room, over the pause menu.
    if (this.top === 'play' && this.net.online) this.reset(this.home, 'room');
    else if (this.top === 'play') this.play.status();
    else if (this.top === 'room') this.room.render();
    else if (this.top === 'main') this.main.render();
    else if (this.top === 'pause') this.pause.render();
  }

  /** The radio can move through this screen (ADR-0068); not while mapping buttons or calibrating. */
  get navigable(): boolean {
    return this.visible && this.top !== 'controller' && this.top !== 'buttons';
  }

  tick(): void {
    if (!this.visible) return;
    this.screens[this.top].tick?.();
  }

  /** Join a room by code (invite links): Play screen, then straight in. */
  joinCode(code: string): void {
    this.show('play');
    this.play.join(code.replace(/[^0-9]/g, '').slice(0, 2));
  }

  private commit(): void {
    saveSettings(this.settings);
    this.callbacks.onSettingsChanged();
  }
}
