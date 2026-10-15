import { getMap, type MapDef, type MapId } from '../../shared/maps/index.js';
import { COMBAT } from '../../shared/combat.js';
import { DEFAULT_DRONE, droneClass, type DroneClassId } from '../../shared/drones.js';
import { count, loadoutKey, type Loadout } from '../../shared/loadout.js';
import { SHIELD, SMOKE } from '../../shared/specials.js';
import { cleanRoomOptions, restrictLoadout, type RoomOptions, type Side } from '../../shared/roomOptions.js';
import type { DroneLook } from '../../shared/cosmetics.js';
import { NET, type DroneState, type MatchPhase, type MatchState, type Shot, type Vec3 } from '../../shared/protocol.js';
import { buildColliders } from '../../shared/raycast.js';
import { blastDamage, PropField, type Blast } from '../../shared/props.js';
import { trainingBots, type Bot } from '../../shared/bots.js';
import type { ProgressEvent } from './progression.js';
import type { Emit, MatchContext } from './match/context.js';
import { pushHistory, sampleHistory } from './match/history.js';
import { applyPending, asLoadout, newPilot, refit, takeRound, type Pilot } from './match/pilot.js';
import { Bullets } from './match/bullets.js';
import { Missiles } from './match/missiles.js';
import { Grenades } from './match/grenades.js';
import { BotPilots, nextBot } from './match/bots.js';
import { backInLobby, canStart, freeSlot, MIN_PILOTS, reassignColors, smallerSide, teammates } from './match/lobby.js';
import { chooseSpawn, placeAtSpawn, respawnBot } from './match/spawns.js';
import { applyDamage, deathProgress, endProgress, recentAttacker, sideScore, timeUpResult } from './match/scoring.js';

export type { Emit } from './match/context.js';
export { sampleHistory } from './match/history.js';
export { takeRound } from './match/pilot.js';

/**
 * One room's combat (ADR-0009). The server is the referee: it decides hits, damage, deaths and score.
 *
 * Hit detection uses limited lag compensation (ADR-0004): a round is tested against where the shooter
 * *saw* the target (100 ms behind the shot's server time, matching the client's interpolation buffer),
 * rewinding at most MAX_REWIND_MS.
 *
 * This class is the room's facade: it owns the match lifecycle (phases, host, settings) and hands the rest
 * to the modules in `./match/`: rounds (bullets), piloted missiles, grenades, practice bots, spawns, the
 * pre-match/teams lobby and scoring.
 */
export class Match {
  phase: MatchPhase = 'waiting';
  winner: string | null = null;
  private resultsUntil = 0;
  private readonly pilots = new Map<string, Pilot>();
  private readonly bullets: Bullets;
  private readonly missiles: Missiles;
  /** Grenades in the air or on the ground (ADR-0034), simulated here. */
  private readonly grenades: Grenades;
  private now = 0;
  private protectedAnnounced = new Set<string>();
  private map: MapDef;
  private colliders: ReturnType<typeof buildColliders>;
  /** Cars, barrels, tanks: shot, blown up and respawned here (ADR-0023). */
  private props: PropField;
  /** Match settings (ADR-0046), and the pilot who may change them. */
  private options: RoomOptions;
  private host: string | null = null;
  /** Server time the running match ends by its time limit (null: no limit). */
  private endsAt: number | null = null;
  /** Teams mode: the team that won the last match (ADR-0047). */
  private winnerSide: Side | null = null;
  /** Practice bots (ADR-0067). */
  private readonly bots = new BotPilots();

  constructor(
    mapOrOptions: MapId | RoomOptions,
    private readonly emit: Emit,
    private readonly random: () => number = Math.random,
    /** Progress events for XP (ADR-0032), only while a match is running. */
    private readonly onProgress: (pilotId: string, event: ProgressEvent) => void = () => {},
    /**
     * Pre-match menu (ADR-0047): matches start when the host says so, and return to the menu after the
     * results. Off (start at two pilots, restart after results) for a bare match, as in the tests.
     */
    private readonly lobby = false,
  ) {
    this.options = typeof mapOrOptions === 'string' ? cleanRoomOptions(null, mapOrOptions) : mapOrOptions;
    this.map = getMap(this.options.map);
    this.colliders = buildColliders(this.map.boxes, this.map.holes, this.map.terrain);
    this.props = new PropField(this.map);
    // What the projectile modules see of this match, read live (the map can change with the settings).
    const self = this;
    const ctx: MatchContext = {
      pilots: this.pilots,
      get phase() {
        return self.phase;
      },
      get colliders() {
        return self.colliders;
      },
      get props() {
        return self.props;
      },
      emit: this.emit,
      hit: (shooterId, damage, target, now) => this.hit(shooterId, damage, target, now),
    };
    this.bullets = new Bullets(ctx);
    this.missiles = new Missiles(ctx);
    this.grenades = new Grenades(ctx);
    this.trainingLineup(0);
  }

  /** The room's map (it can change with the settings). */
  get mapId(): MapId {
    return this.map.id;
  }

  /**
   * The host changes the match settings (ADR-0046). Builds are brought within the new rules, a new map loads,
   * and a running match restarts so everyone plays by the same rules from zero.
   */
  setOptions(id: string, raw: RoomOptions, now: number): void {
    if (id !== this.host) return;
    this.now = now;
    const options = cleanRoomOptions(raw, this.options.map);
    if (options.map !== this.map.id) {
      this.map = getMap(options.map);
      this.colliders = buildColliders(this.map.boxes, this.map.holes, this.map.terrain);
      this.props = new PropField(this.map);
      this.clearProjectiles();
      this.options = options;
      this.trainingLineup(now);
    }
    const modeChanged = options.mode !== this.options.mode;
    this.options = options;
    if (modeChanged) reassignColors(this.pilots, this.teams);
    for (const p of this.pilots.values()) {
      p.pendingLoadout = restrictLoadout(p.pendingLoadout ?? p.loadout, options);
      p.lastSpawn = null;
    }
    // A running match restarts under the new rules; in the pre-match menu they just apply.
    // The Training range is always live (ADR-0067).
    if (this.pilots.size >= MIN_PILOTS && (!this.lobby || this.phase === 'playing' || (this.training && this.humans > 0))) this.startMatch(now);
    else {
      // Leaving the Training range with its bots can leave too few pilots for a match.
      if (this.phase === 'playing') {
        this.phase = 'waiting';
        this.endsAt = null;
      }
      for (const p of this.pilots.values()) refit(p);
      this.broadcastState();
    }
  }

  addPlayer(id: string, now: number, choice: Loadout | DroneClassId = DEFAULT_DRONE, bot: Bot | null = null): void {
    const loadout = restrictLoadout(asLoadout(choice), this.options);
    // The first person in (the room's creator) sets the rules (ADR-0046).
    if (!bot && (this.host === null || !this.pilots.has(this.host))) this.host = id;
    this.now = now;
    // A room holds 10 pilots: a person joining a full Training range bumps a bot (ADR-0067).
    if (!bot && this.pilots.size >= NET.maxPlayersPerRoom) {
      const last = [...this.pilots.values()].reverse().find((p) => p.bot);
      if (last) this.dropPilot(last.id);
    }
    // Each pilot gets the lowest free color slot (ADR-0026); in Teams, the smaller team and its color (ADR-0047).
    const side = smallerSide(this.pilots);
    const team = this.options.mode === 'teams' ? side : freeSlot(this.pilots);
    const pilot = newPilot(id, team, side, loadout, now, bot);
    this.pilots.set(id, pilot);
    // The Training range is always live: shoot the bots from the moment you arrive (ADR-0067).
    if (this.training && !bot && this.phase === 'waiting') this.startMatch(now);
    else if (!this.lobby && this.pilots.size >= MIN_PILOTS && this.phase === 'waiting' && this.humans > 0) this.startMatch(now);
    else if (this.phase !== 'waiting') this.respawn(pilot, now); // joining a running match
    else this.broadcastState();
  }

  removePlayer(id: string, now: number): void {
    this.now = now;
    this.dropPilot(id);
    // The host left: the next person is in charge of the settings.
    if (this.host === id) this.host = [...this.pilots.values()].find((p) => !p.bot)?.id ?? null;
    if (this.pilots.size < MIN_PILOTS || this.humans === 0) {
      this.phase = 'waiting';
      this.winner = null;
      this.clearProjectiles();
      for (const p of this.pilots.values()) {
        p.score = 0;
        refit(p);
      }
    }
    this.broadcastState();
  }

  /** Take a pilot out, with anything they had in the air. */
  private dropPilot(id: string): void {
    this.pilots.delete(id);
    this.bullets.drop(id);
    this.missiles.drop(id);
    this.grenades.drop(id);
  }

  private clearProjectiles(): void {
    this.bullets.clear();
    this.missiles.clear();
    this.grenades.clear();
  }

  // --- Practice bots (ADR-0067)

  private get training(): boolean {
    return this.map.id === 'training';
  }

  /** People in the room (not bots). */
  private get humans(): number {
    let n = 0;
    for (const p of this.pilots.values()) if (!p.bot) n++;
    return n;
  }

  /** The Training map brings its own bots (as many as fit beside the people); other maps start with none. */
  private trainingLineup(now: number): void {
    for (const p of [...this.pilots.values()]) if (p.bot) this.dropPilot(p.id);
    if (!this.training) return;
    const room = NET.maxPlayersPerRoom - Math.max(1, this.humans);
    for (const bot of trainingBots().slice(0, room)) this.addBotPilot(bot, now);
  }

  private addBotPilot(bot: Bot, now: number): void {
    this.addPlayer(this.bots.nextId(), now, 'freestyle', bot);
  }

  /** The host adds or removes a practice bot from the pre-match menu (ADR-0067), up to the room's 10 pilots. */
  onBot(id: string, add: boolean, now: number): void {
    if (id !== this.host) return;
    this.now = now;
    if (add) {
      if (this.pilots.size >= NET.maxPlayersPerRoom) return;
      const n = [...this.pilots.values()].filter((p) => p.bot).length;
      this.addBotPilot(nextBot(this.map, this.training, n), now);
      return;
    }
    const last = [...this.pilots.values()].reverse().find((p) => p.bot);
    if (last) this.removePlayer(last.id, now);
  }

  /** XP events (ADR-0032), never for bots or for killing one (ADR-0067). */
  private progress(id: string, event: ProgressEvent): void {
    const p = this.pilots.get(id);
    if (p && !p.bot) this.onProgress(id, event);
  }

  /** A pilot's paint (ADR-0030), shown to everyone on the body they fly, and their callsign (ADR-0047). */
  setLooks(id: string, looks: Record<DroneClassId, DroneLook>, name = ''): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    pilot.looks = looks;
    pilot.name = name;
    this.broadcastState();
  }

  // --- Teams and the pre-match menu (ADR-0047)

  private get teams(): boolean {
    return this.options.mode === 'teams';
  }

  /** Switch team in the pre-match menu (not mid-match). */
  onSide(id: string, side: Side): void {
    const pilot = this.pilots.get(id);
    if (!pilot || !this.teams || this.phase === 'playing' || pilot.side === side) return;
    pilot.side = side;
    pilot.team = side;
    pilot.ready = false;
    this.broadcastState();
  }

  onReady(id: string, ready: boolean): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.ready === ready) return;
    pilot.ready = ready;
    this.broadcastState();
  }

  /** Whether the host can start now: two pilots, and in Teams someone on each team. */
  get canStart(): boolean {
    return canStart(this.pilots, this.phase, this.teams);
  }

  /** The host starts the match from the pre-match menu. */
  onStart(id: string, now: number): void {
    if (id !== this.host || !this.canStart) return;
    this.startMatch(now);
  }

  /** A signed-in pilot's level (ADR-0032), shown to everyone in the match state. */
  setLevel(id: string, level: number | null): void {
    const pilot = this.pilots.get(id);
    if (!pilot || pilot.level === level) return;
    pilot.level = level;
    this.broadcastState();
  }

  /** Loadout change (ADR-0033): immediate outside a running match; otherwise at the next respawn (ADR-0013). */
  onLoadout(id: string, choice: Loadout | DroneClassId, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    // Only what the room allows (ADR-0046).
    const loadout = restrictLoadout(asLoadout(choice), this.options);
    if (loadoutKey(pilot.loadout) === loadoutKey(loadout)) {
      pilot.pendingLoadout = null;
      return;
    }
    this.now = now;
    pilot.pendingLoadout = loadout;
    if (this.phase !== 'playing') {
      applyPending(pilot);
      pilot.hp = droneClass(pilot.loadout.body).maxHp;
    }
    this.broadcastState();
  }

  onState(id: string, s: DroneState, st: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    this.now = st;
    pushHistory(pilot.history, { st, p: s.p, v: s.v });
    pilot.q = s.q;
    if (s.k) this.missiles.move(id, s.k, st);

    const crashedNow = s.crashed && !pilot.lastCrashed;
    pilot.lastCrashed = s.crashed;
    if (crashedNow && this.phase === 'playing' && pilot.alive) this.kill(pilot, recentAttacker(pilot, this.pilots, st), 'crash', st);
  }

  onShot(id: string, shot: Shot, st: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    this.now = st;
    const last = pilot.history[pilot.history.length - 1];
    const muzzleOk = !!last && Math.hypot(shot.p[0] - last.p[0], shot.p[1] - last.p[1], shot.p[2] - last.p[2]) <= COMBAT.maxMuzzleOffset;

    // Only weapons actually mounted can fire (ADR-0033).
    if (count(pilot.loadout, shot.w) === 0) return;
    if (shot.w === 'grenade') {
      // Launched in every phase (props can be blown up any time); one out per launcher you carry.
      if (!pilot.alive || !muzzleOk || !takeRound(pilot, 'grenade', st)) return;
      this.grenades.launch(pilot, shot, st);
      return;
    }
    if (shot.w === 'missile') {
      // Missiles fly in every phase (they only do damage in a running match), and are relayed to others
      // only once accepted, so nobody sees a ghost launch (ADR-0016).
      if (!pilot.alive || !muzzleOk || !this.missiles.take(pilot, st)) return;
      this.missiles.launch(id, shot, st);
      return;
    }

    // Everyone else sees the tracers, whatever the match phase.
    this.emit({ t: 'shot', id, s: shot }, { except: id });
    // Rounds fly in every phase (props can be shot any time, ADR-0023); they hit pilots only in a match.
    if (!pilot.alive) return;
    // Allow jitter in arrival times, but not a faster gun.
    if (!takeRound(pilot, shot.w, st) || !muzzleOk) return;

    if (this.phase === 'playing' && pilot.protectedUntil > st) {
      // Firing ends your own spawn protection.
      pilot.protectedUntil = 0;
      this.broadcastState();
    }
    this.bullets.fire(id, shot, st);
  }

  /** Specials the server referees (ADR-0033): smoke (ADR-0024) and shield. Needs that module and its cooldown. */
  onAbility(id: string, kind: 'smoke' | 'shield', p: Vec3, now: number): void {
    const pilot = this.pilots.get(id);
    if (!pilot || !pilot.alive || pilot.loadout.special !== kind) return;
    const last = pilot.history[pilot.history.length - 1];
    if (last && Math.hypot(p[0] - last.p[0], p[1] - last.p[1], p[2] - last.p[2]) > COMBAT.maxMuzzleOffset * 2) return;
    if (kind === 'smoke') {
      if (now < pilot.smokeReadyAt) return;
      pilot.smokeReadyAt = now + SMOKE.cooldownMs;
    } else {
      if (now < pilot.shieldReadyAt) return;
      pilot.shieldReadyAt = now + SHIELD.cooldownMs;
      pilot.shieldUntil = now + SHIELD.durationMs;
      pilot.shieldHp = SHIELD.absorb;
      this.broadcastState();
    }
    this.emit({ t: 'ability', id, kind, p }, { except: id });
  }

  /** Set off a grenade where the server has it (the shooter pressed Fire again, ADR-0034). */
  onDetonateGrenade(id: string, rid: number, now: number): void {
    this.grenades.detonate(id, rid, now);
  }

  /** The shooter blew up their missile (or their client saw it hit something). Trust the point if it's plausible. */
  onDetonate(id: string, rid: number, p: Vec3, now: number): void {
    this.missiles.detonate(id, rid, p, now);
  }

  tick(now: number): void {
    this.now = now;
    if (this.phase === 'ended' && now >= this.resultsUntil) {
      if (this.lobby) this.backToLobby(now);
      else this.startMatch(now);
      return;
    }
    if (this.phase === 'playing' && this.endsAt !== null && now >= this.endsAt) {
      this.endByTime(now);
      return;
    }
    for (const pilot of this.pilots.values()) {
      if (!pilot.alive && pilot.respawnAt !== null && now >= pilot.respawnAt) this.respawn(pilot, now);
      if (this.protectedAnnounced.has(pilot.id) && now >= pilot.protectedUntil) {
        this.protectedAnnounced.delete(pilot.id);
        this.broadcastState();
      }
    }
    this.bots.step(this.pilots, this.emit, now);
    this.bullets.step(now);
    this.missiles.step(now);
    this.grenades.step(now);
    this.stepProps(now);
  }

  /** Set off due prop explosions and bring back old ones (ADR-0023). */
  private stepProps(now: number): void {
    const { blasts, respawned } = this.props.tick(now);
    for (const b of blasts) this.propBlast(b, now);
    if (blasts.length > 0 || respawned.length > 0) this.broadcastState();
  }

  /** A prop exploded: everyone draws it; in a match, pilots nearby take blast damage. */
  private propBlast(b: Blast, now: number): void {
    this.emit({ t: 'prop', i: b.i, p: b.p, by: b.by });
    if (this.phase !== 'playing') return;
    if (b.by && this.pilots.has(b.by)) this.progress(b.by, 'prop');
    for (const target of [...this.pilots.values()]) {
      if (!target.alive || target.protectedUntil > now) continue;
      const pos = sampleHistory(target.history, now);
      if (!pos) continue;
      const damage = blastDamage(b.kind, Math.hypot(pos[0] - b.p[0], pos[1] - b.p[1], pos[2] - b.p[2]));
      if (damage > 0 && this.phase === 'playing') this.hit(b.by && this.pilots.has(b.by) ? b.by : null, damage, target, now);
    }
  }

  state(): MatchState {
    return {
      map: this.map.id,
      props: this.props.downList(),
      phase: this.phase,
      winner: this.winner,
      killsToWin: this.options.killsToWin,
      options: this.options,
      host: this.host,
      ...(this.winnerSide !== null ? { winnerSide: this.winnerSide } : {}),
      ...(this.endsAt !== null && this.phase === 'playing' ? { endsAt: this.endsAt } : {}),
      players: [...this.pilots.values()].map((p) => ({
        id: p.id,
        team: p.team,
        drone: p.loadout.body,
        loadout: p.loadout,
        ...(p.shieldUntil > this.now && p.shieldHp > 0 ? { shielded: true } : {}),
        score: p.score,
        hp: p.hp,
        alive: p.alive,
        protected: p.protectedUntil > this.now,
        ...(p.level !== null ? { level: p.level } : {}),
        ...(p.looks ? { look: p.looks[p.loadout.body] } : {}),
        ...(p.name ? { name: p.name } : {}),
        ...(this.teams ? { side: p.side } : {}),
        ...(p.ready ? { ready: true } : {}),
        ...(p.bot ? { bot: p.bot.kind } : {}),
      })),
    };
  }

  /**
   * Damage a pilot. `shooterId` null (or the target themselves, e.g. their own prop blast) gives no
   * credit: a recent attacker keeps theirs (ADR-0023).
   */
  private hit(shooterId: string | null, rawDamage: number, target: Pilot, now: number): void {
    // No friendly fire in Teams (ADR-0047); your own blast still hurts you.
    const shooter = shooterId ? this.pilots.get(shooterId) : undefined;
    if (shooter && teammates(this.teams, shooter, target)) return;
    applyDamage(target, rawDamage, now);
    const credited = shooterId !== null && shooterId !== target.id;
    if (credited) {
      target.lastDamagedBy = shooterId;
      target.lastDamagedAt = now;
      target.damagedBy.set(shooterId, now);
    }
    this.emit({ t: 'hit', shooter: credited ? shooterId : '', target: target.id, hp: target.hp });
    if (target.hp <= 0) this.kill(target, credited ? shooterId : recentAttacker(target, this.pilots, now), 'shot', now);
    else this.broadcastState();
  }

  private kill(pilot: Pilot, killerId: string | null, cause: 'shot' | 'crash', now: number): void {
    pilot.alive = false;
    pilot.hp = 0;
    pilot.respawnAt = now + COMBAT.respawnMs;
    this.emit({ t: 'death', id: pilot.id, killer: killerId, cause });

    // XP (ADR-0032): the kill, and assists for anyone else who hurt them recently.
    if (this.phase === 'playing' && !pilot.bot) deathProgress(this.pilots, pilot, killerId, now, (id, e) => this.progress(id, e));

    const killer = killerId ? this.pilots.get(killerId) : undefined;
    if (killer && !teammates(this.teams, killer, pilot)) {
      killer.score++;
      // The Training range never ends (ADR-0067).
      if (!this.training && (this.teams ? sideScore(this.pilots, killer.side) >= this.options.killsToWin : killer.score >= this.options.killsToWin)) this.endMatch(killer.id, now);
    }
    this.broadcastState();
  }

  /** Match over (kill limit, or time, ADR-0046): everyone still here finished it; the winner (if any) won it. */
  private endMatch(winnerId: string | null, now: number, side: Side | null = null): void {
    // Teams: the whole winning team wins (ADR-0047).
    const winSide = this.teams ? (side ?? (winnerId ? (this.pilots.get(winnerId)?.side ?? null) : null)) : null;
    endProgress(this.pilots, this.humans, this.teams, winnerId, winSide, (id, e) => this.progress(id, e));
    this.winnerSide = winSide;
    this.phase = 'ended';
    this.winner = winnerId;
    this.endsAt = null;
    this.resultsUntil = now + COMBAT.resultsMs;
    this.clearProjectiles();
    for (const p of this.pilots.values()) p.respawnAt = null;
  }

  /** Time's up (ADR-0046): the most kills wins; a tie at the top is a draw. */
  private endByTime(now: number): void {
    const { winnerId, side } = timeUpResult(this.pilots, this.teams);
    this.endMatch(winnerId, now, side);
    this.broadcastState();
  }

  private respawn(pilot: Pilot, now: number): void {
    if (pilot.bot) {
      respawnBot(pilot as Pilot & { bot: Bot }, now);
      this.broadcastState();
      return;
    }
    const pick = chooseSpawn(this.map, this.pilots, pilot, (p) => teammates(this.teams, p, pilot), this.random);
    placeAtSpawn(this.map, pilot, pick, now);
    const { spawn, o } = pick;
    this.protectedAnnounced.add(pilot.id);
    this.emit({ t: 'respawn', id: pilot.id, spawn, loadout: pilot.loadout, ...(o[0] || o[1] ? { o } : {}) });
    this.broadcastState();
  }

  /** After the results, everyone's back in the pre-match menu (ADR-0047): flying free, nobody ready. */
  private backToLobby(now: number): void {
    this.phase = 'waiting';
    this.winner = null;
    this.winnerSide = null;
    this.endsAt = null;
    for (const p of this.pilots.values()) backInLobby(p, now);
    this.broadcastState();
  }

  private startMatch(now: number): void {
    this.phase = 'playing';
    this.winner = null;
    this.winnerSide = null;
    this.endsAt = this.options.timeLimitMin > 0 ? now + this.options.timeLimitMin * 60_000 : null;
    this.clearProjectiles();
    for (const pilot of this.pilots.values()) {
      pilot.score = 0;
      pilot.ammo = new Map();
      this.respawn(pilot, now);
    }
    this.broadcastState();
  }

  private broadcastState(): void {
    this.emit({ t: 'match', m: this.state() });
  }
}
