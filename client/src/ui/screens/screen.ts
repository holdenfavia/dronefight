import type { Account } from '../../account/account';
import type { InputManager } from '../../input/inputManager';
import type { NetClient } from '../../net/netClient';
import type { Settings } from '../../settings';

/** Every menu screen. The menu keeps them on a stack: showing one pushes it, Back/Done/Esc pop it. */
export type ScreenId = 'main' | 'pause' | 'drone' | 'play' | 'room' | 'settings' | 'controller' | 'buttons' | 'account' | 'touch' | 'rules';

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
  /** Open the touch layout editor (ADR-0044); the menu comes back to Touch controls when it's done. */
  onEditTouchLayout(): void;
}

/** What a screen can see and do: shared state and the menu's navigation. */
export interface MenuContext {
  readonly root: HTMLElement;
  readonly input: InputManager;
  readonly settings: Settings;
  readonly net: NetClient;
  readonly account: Account;
  readonly callbacks: MenuCallbacks;
  /** The code being joined from the Play screen, for its status line. */
  joining: string | null;
  /** Push a screen (or go back down the stack to it if it's already there). */
  show(screen: ScreenId): void;
  /** Pop the current screen (Back, Done). */
  back(): void;
  /** Go to Play, on top of the start screen or (still in a game) the pause menu. */
  toPlay(): void;
  /** Start or resume flying. */
  fly(): void;
  hide(): void;
  /** Leave the game (solo or room): to the start screen, or to Play. */
  leaveGame(to: 'main' | 'play'): void;
  /** Save settings and re-apply them. */
  commit(): void;
  /** Solo: the next map (your solo room follows it, ADR-0067). */
  nextMap(): void;
}

/** One menu screen. render() draws it into the menu root whenever it becomes the top of the stack. */
export interface MenuScreen {
  /** Pushed onto the stack (not when uncovered again by a pop). */
  enter?(): void;
  render(): void;
  /** No longer the top of the stack. */
  leave?(): void;
  /** Each frame while showing. */
  tick?(): void;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
