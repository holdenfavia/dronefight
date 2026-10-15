import { DRONE_ORDER, droneClass, type DroneClassId } from '../../../../shared/drones';
import { cleanRoomOptions, defaultRoomOptions, KILL_LIMITS, pilotLabel, TIME_LIMITS, type RoomOptions } from '../../../../shared/roomOptions';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../../../../shared/weapons';
import { SPECIAL_ORDER, SPECIALS, type SpecialId } from '../../../../shared/specials';
import { MAP_NAMES, MAP_ORDER, type MapId } from '../../../../shared/maps';
import { saveSettings } from '../../settings';
import { BODY_ICONS, SPECIAL_ICONS, WEAPON_ICONS } from '../icons';
import { escapeHtml, type MenuContext, type MenuScreen } from './screen';

/**
 * Room settings (ADR-0046): when creating a room, and from the pause menu or room screen in one. The host
 * edits (Apply restarts the match); everyone else sees the rules.
 */
export class RulesScreen implements MenuScreen {
  /** The draft being edited. */
  private draft: RoomOptions | null = null;

  constructor(
    private readonly ctx: MenuContext,
    /** Creating a room sends you to Play to wait for it, with this status line. */
    private readonly creatingStatus: (text: string) => void,
  ) {}

  enter(): void {
    const { net, settings } = this.ctx;
    // Creating: start from the settings you used last time, on the map you picked. In a room: the room's.
    const base = net.online && net.match ? net.match.options : { ...settings.roomOptions, map: settings.map };
    this.draft = cleanRoomOptions(structuredClone(base), settings.map);
  }

  render(): void {
    const { root, net, settings } = this.ctx;
    const d = this.draft ?? defaultRoomOptions(settings.map);
    const creating = !net.online;
    const canEdit = creating || net.isHost;
    const dis = canEdit ? '' : 'disabled';
    const seg = (key: string, items: readonly (readonly [string | number, string])[], current: string | number) =>
      `<div class="seg-choice" data-rseg="${key}">${items.map(([v, l]) => `<button type="button" ${dis} data-value="${v}" class="${String(v) === String(current) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const chips = (key: 'bodies' | 'weapons' | 'specials', ids: readonly string[], on: readonly string[], label: (id: string) => string, icon: (id: string) => string) =>
      `<div class="rule-chips" data-rchips="${key}">${ids.map((id) => `<button type="button" ${dis} class="rule-chip ${on.includes(id) ? 'on' : ''}" data-id="${id}"><span class="rule-chip-icon">${icon(id)}</span>${escapeHtml(label(id))}</button>`).join('')}</div>`;
    const hostName = net.match?.players.find((p) => p.id === net.match?.host);
    root.innerHTML = `
      <div class="panel rules">
        <div class="panel-head"><span class="kicker">${creating ? 'Create room' : `Room ${net.room}`}</span><h2>Room settings</h2></div>
        ${canEdit ? '' : `<p class="hint">Only the room's host${hostName ? ` (${escapeHtml(pilotLabel(hostName))})` : ''} can change these.</p>`}
        <div class="calib-sub">Mode</div>
        ${seg('mode', [['ffa', 'Free-for-all'], ['teams', 'Teams (Orange vs Lime)']], d.mode)}
        <div class="calib-sub">Map</div>
        ${seg('map', MAP_ORDER.filter((m) => m !== 'training').map((m) => [m, MAP_NAMES[m]] as const), d.map)}
        <div class="rules-row">
          <div><div class="calib-sub">Kills to win</div>${seg('killsToWin', KILL_LIMITS.map((k) => [k, String(k)] as const), d.killsToWin)}</div>
          <div><div class="calib-sub">Time limit</div>${seg('timeLimitMin', TIME_LIMITS.map((t) => [t, t ? `${t} min` : 'Off'] as const), d.timeLimitMin)}</div>
        </div>
        <div class="calib-sub">Flight assist</div>
        ${seg('assist', [['any', 'Any'], ['acro', 'Acro only']], d.assist)}
        <div class="calib-sub">Drones</div>
        ${chips('bodies', DRONE_ORDER, d.bodies, (id) => droneClass(id as DroneClassId).name, (id) => BODY_ICONS[id as DroneClassId])}
        <div class="calib-sub">Weapons</div>
        ${chips('weapons', WEAPON_ORDER, d.weapons, (id) => WEAPONS[id as WeaponId].name, (id) => WEAPON_ICONS[id as WeaponId])}
        <div class="calib-sub">Specials</div>
        ${chips('specials', SPECIAL_ORDER, d.specials, (id) => SPECIALS[id as SpecialId].name, (id) => SPECIAL_ICONS[id as SpecialId])}
        <p class="hint">Builds that break the rules are swapped for the nearest allowed one.${creating ? '' : ' Applying restarts the match.'}</p>
        <div class="join-status" data-join-status></div>
        <div class="actions">
          <button class="btn ghost" data-back>Back</button>
          ${canEdit ? `<button class="btn big" data-apply>${creating ? 'Create room' : 'Apply'}</button>` : ''}
        </div>
      </div>`;
    root.querySelectorAll<HTMLElement>('[data-rseg]').forEach((group) =>
      group.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const key = group.dataset.rseg!;
          const v = b.dataset.value ?? '';
          if (key === 'mode') d.mode = v === 'teams' ? 'teams' : 'ffa';
          else if (key === 'map') d.map = v as MapId;
          else if (key === 'killsToWin') d.killsToWin = Number(v);
          else if (key === 'timeLimitMin') d.timeLimitMin = Number(v);
          else if (key === 'assist') d.assist = v === 'acro' ? 'acro' : 'any';
          group.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        }),
      ),
    );
    root.querySelectorAll<HTMLElement>('[data-rchips]').forEach((group) =>
      group.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const key = group.dataset.rchips as 'bodies' | 'weapons' | 'specials';
          const list = d[key] as string[];
          const id = b.dataset.id!;
          const i = list.indexOf(id);
          // Pilots need at least one drone and one weapon.
          if (i >= 0 && key !== 'specials' && list.length === 1) return;
          if (i >= 0) list.splice(i, 1);
          else list.push(id);
          b.classList.toggle('on', i < 0);
        }),
      ),
    );
    root.querySelector('[data-back]')?.addEventListener('click', () => this.ctx.back());
    root.querySelector('[data-apply]')?.addEventListener('click', () => {
      const options = cleanRoomOptions(d, d.map);
      if (creating) {
        settings.roomOptions = options;
        settings.map = options.map;
        saveSettings(settings);
        this.ctx.callbacks.onMapChanged();
        this.ctx.joining = null;
        net.createRoom(options.map, options);
        this.ctx.toPlay();
        this.creatingStatus('Creating a room…');
      } else {
        net.sendOptions(options);
        this.ctx.back();
      }
    });
  }
}
