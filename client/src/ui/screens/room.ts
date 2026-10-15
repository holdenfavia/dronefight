import { NET } from '../../../../shared/protocol';
import { DRONE_ORDER, droneClass } from '../../../../shared/drones';
import { pilotLabel, TEAM_NAMES, type RoomOptions } from '../../../../shared/roomOptions';
import { WEAPON_ORDER } from '../../../../shared/weapons';
import { pilotColor } from '../../../../shared/combat';
import { MAP_NAMES } from '../../../../shared/maps';
import { BODY_ICONS } from '../icons';
import { escapeHtml, type MenuContext, type MenuScreen } from './screen';

/**
 * The pre-match menu (ADR-0047): the room code, the rules, everyone in the room (by team in Teams) with
 * their drone, level and Ready; pick a team, ready up, change your loadout; the host starts the match.
 * You can fly around (no damage) while you wait.
 */
export class RoomScreen implements MenuScreen {
  constructor(private readonly ctx: MenuContext) {}

  render(): void {
    const { root, net, settings } = this.ctx;
    if (!net.online || !net.room) {
      this.ctx.toPlay();
      return;
    }
    const m = net.match;
    const teams = m?.options.mode === 'teams';
    const me = net.me;
    const playing = m?.phase === 'playing';
    const players = m?.players ?? [];
    const row = (p: (typeof players)[number]) => `
      <li class="pm-row ${p.id === net.you ? 'me' : ''}">
        <span class="pm-dot" style="background:${pilotColor(p.team)}"></span>
        <span class="pm-name">${escapeHtml(pilotLabel(p))}${p.bot ? ' <em>bot</em>' : ''}${p.id === net.you ? ' <em>you</em>' : ''}${p.id === m?.host ? ' <em class="host">host</em>' : ''}</span>
        <span class="pm-drone"><span class="pm-icon">${BODY_ICONS[p.drone]}</span>${escapeHtml(droneClass(p.drone).name)}</span>
        <span class="pm-level">${p.level ? `Lv ${p.level}` : ''}</span>
        <span class="pm-ready ${p.ready || p.bot ? 'on' : ''}">${p.ready || p.bot ? '✓ Ready' : '…'}</span>
      </li>`;
    const list = teams
      ? `<div class="pm-teams">${([0, 1] as const)
          .map((side) => {
            const mine = players.filter((p) => p.side === side);
            return `<div class="pm-team side-${side}">
              <div class="pm-team-head"><span>${TEAM_NAMES[side]} team · ${mine.length}</span>${me?.side !== side && !playing ? `<button class="btn ghost small" data-side="${side}">Join ${TEAM_NAMES[side]}</button>` : ''}</div>
              <ul class="pm-list">${mine.map(row).join('') || '<li class="pm-empty">Nobody yet</li>'}</ul>
            </div>`;
          })
          .join('')}</div>`
      : `<ul class="pm-list">${players.map(row).join('')}</ul>`;
    const sides = new Set(players.map((p) => p.side));
    const canStart = !playing && players.length >= 2 && (!teams || sides.size === 2);
    const why = players.length < 2 ? 'Waiting for another pilot, or add a bot' : teams && sides.size < 2 ? 'Both teams need a pilot' : '';
    const host = players.find((p) => p.id === m?.host);
    const found = this.ctx.joining === net.room;
    root.innerHTML = `
      <div class="panel online prematch">
        <div class="panel-head"><span class="kicker">${playing ? 'Match in progress' : 'Pre-match'}</span><h2>Room ${net.room} · ${net.map ? MAP_NAMES[net.map] : ''}</h2></div>
        <div class="pm-top">
          <div class="room-code">${net.room}</div>
          <div>
            <div class="room-hint">${found ? 'you\'re in' : 'read this code to your friends'} · up to ${NET.maxPlayersPerRoom} pilots</div>
            <div class="room-rules">${teams ? 'Teams' : 'Free-for-all'} · ${rulesSummary(m?.options)}</div>
          </div>
        </div>
        ${list}
        <div class="pm-buttons">
          <button class="btn ghost" data-drone>Loadout: ${droneClass(settings.drone).name} ▸</button>
          <button class="btn ghost" data-rules>Room settings ▸</button>
          ${net.isHost ? `<button class="btn ghost" data-bot="add" ${players.length >= NET.maxPlayersPerRoom ? 'disabled' : ''}>+ Bot</button>${players.some((p) => p.bot) ? '<button class="btn ghost" data-bot="remove">− Bot</button>' : ''}` : ''}
        </div>
        <div class="actions pm-actions">
          <span class="pm-minor">
            <button class="btn ghost small" data-copy>Copy invite</button>
            <button class="btn ghost small" data-leave>Leave room</button>
          </span>
          ${
            playing
              ? '<button class="btn big" data-fly>Join the match</button>'
              : `<button class="btn ghost" data-fly>Fly around</button>${
                  net.isHost
                    ? `<button class="btn big" data-start ${canStart ? '' : 'disabled'} title="${why}">Start match</button>`
                    : `<button class="btn big ${me?.ready ? '' : 'ghost'}" data-ready>${me?.ready ? '✓ Ready' : 'Ready'}</button>`
                }`
          }
        </div>
        ${!playing && !net.isHost ? `<div class="pm-wait">Waiting for ${escapeHtml(host ? pilotLabel(host) : 'the host')} to start</div>` : ''}
        ${!playing && net.isHost && !canStart ? `<div class="join-status">${why}</div>` : ''}
      </div>`;
    root.querySelector('[data-fly]')?.addEventListener('click', () => this.ctx.fly());
    root.querySelector('[data-drone]')?.addEventListener('click', () => this.ctx.show('drone'));
    root.querySelector('[data-rules]')?.addEventListener('click', () => this.ctx.show('rules'));
    root.querySelector('[data-ready]')?.addEventListener('click', () => net.sendReady(!me?.ready));
    root.querySelector('[data-start]')?.addEventListener('click', () => net.sendStart());
    root.querySelectorAll<HTMLButtonElement>('[data-bot]').forEach((b) => b.addEventListener('click', () => net.sendBot(b.dataset.bot === 'add')));
    root.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) => b.addEventListener('click', () => net.sendSide(b.dataset.side === '1' ? 1 : 0)));
    root.querySelector('[data-leave]')?.addEventListener('click', () => this.ctx.leaveGame('play'));
    root.querySelector<HTMLButtonElement>('[data-copy]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const link = `${location.origin}${location.pathname}?room=${net.room}`;
      navigator.clipboard?.writeText(link).then(
        () => (btn.textContent = 'Copied ✓'),
        () => (btn.textContent = link),
      );
    });
  }
}

/** One line about a room's rules, for the room screen. */
function rulesSummary(o: RoomOptions | undefined): string {
  if (!o) return '';
  const parts = [`First to ${o.killsToWin}`, o.timeLimitMin ? `${o.timeLimitMin} min` : 'no time limit'];
  if (o.bodies.length < DRONE_ORDER.length) parts.push(o.bodies.map((b) => droneClass(b).name).join(', ') + ' only');
  if (o.weapons.length < WEAPON_ORDER.length) parts.push(`${o.weapons.length} weapons`);
  if (o.assist === 'acro') parts.push('Acro only');
  return escapeHtml(parts.join(' · '));
}
