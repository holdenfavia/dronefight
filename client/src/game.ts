import * as THREE from 'three/webgpu';
import { CRASH, SIM } from './config';
import { AudioEngine } from './audio/audioEngine';
import { engineVoice } from './audio/jetVoice';
import { PROPELLERS } from '../../shared/propellers';
import { CannonVoice } from './audio/cannonVoice';
import { RemoteAudio } from './audio/remoteAudio';
import { Sfx } from './audio/sfx';
import { CombatClient } from './combat/combatClient';
import { Grenades, Missiles, SmokeTrails } from './combat/effects';
import { grenadeDamage } from '../../shared/grenade';
import { buildColliders } from '../../shared/raycast';
import { Particles } from './render/particles';
import { TrainingGround } from './training/trainingGround';
import { MovingProps } from './world/movers';
import { interceptTime } from '../../shared/lead';
import type { DroneState } from '../../shared/protocol';
import { InputManager } from './input/inputManager';
import { TouchInput } from './input/touchInput';
import { emitImpact, SurfaceLookup } from './render/impacts';
import { defaultServerUrl, NetClient } from './net/netClient';
import { CameraRig } from './render/cameraRig';
import { applyLook, createClassModel, setDronePropColor } from './render/droneModel';
import { lookKey } from '../../shared/cosmetics';
import { RemoteDrones } from './render/remoteDrones';
import { Tracers } from './render/tracers';
import { LoadoutPreview } from './render/loadoutPreview';
import { Trails } from './render/trails';
import { COMBAT, pilotColor, pilotName } from '../../shared/combat';
import { pilotLabel } from '../../shared/roomOptions';
import { droneClass } from '../../shared/drones';
import { BoundaryGrid } from './world/boundaryGrid';
import { WING } from './sim/wingModel';
import { currentLoadout, loadSettings, saveSettings } from './settings';
import type { Loadout } from '../../shared/loadout';
import { Drone } from './sim/drone';
import { addGround, ArenaColliders, createPhysics } from './sim/physics';
import { Hud, type MarkerInfo, type NetHudInfo } from './ui/hud';
import { Menu } from './ui/menu';
import { Account } from './account/account';
import { levelForXp, type XpReason } from '../../shared/progression';

/** What each XP award says on screen (ADR-0032). */
const XP_LABELS: Record<XpReason, string> = { kill: 'kill', assist: 'assist', prop: 'boom', finish: 'match', win: 'win' };
import { getMap, type MapDef, type MapId } from '../../shared/maps';
import { buildWorld, type World } from './world/scene';
import { PROP_STATS, PropField } from '../../shared/props';
import { splashDamage } from '../../shared/missile';
import type { V3 } from '../../shared/maps/movers';

const STEP = 1 / SIM.hz;
/** Auto-fire (ADR-0044): fires while the lead circle is within this fraction of the screen's short side of center. */
const AUTO_FIRE_RADIUS = 0.04;

export async function startGame(container: HTMLElement, hudRoot: HTMLElement, menuRoot: HTMLElement): Promise<void> {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  await renderer.init();
  const backendName = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  const settings = loadSettings();
  const world: World = buildWorld(renderer);
  world.setShadows(settings.graphics.shadows);

  const physics = await createPhysics();
  addGround(physics, 1200);
  const arenaColliders = new ArenaColliders(physics);
  let currentMap: MapDef = getMap(settings.map);
  world.setMap(currentMap);
  arenaColliders.set(currentMap.boxes);
  // Traffic, coaster, tractor (ADR-0020), posed from the shared clock, plus explosives; all destructible (ADR-0023).
  let props = new PropField(currentMap);
  const movingProps = new MovingProps(world.scene, physics);
  movingProps.setMap(currentMap, props);
  const randomSpawn = (map: MapDef) => map.spawns[Math.floor(Math.random() * map.spawns.length)] ?? map.spawns[0]!;
  const drone = new Drone(physics, randomSpawn(currentMap), settings.drone);
  drone.setLoadout(currentLoadout(settings));
  // Your own model (chase view), drawn at the size others see you at (ADR-0011, ADR-0013).
  let droneModel = createClassModel(drone.classId, pilotColor(0), drone.loadout);
  world.scene.add(droneModel);
  const boundaryGrid = new BoundaryGrid(world.scene);
  boundaryGrid.setHalfSize(currentMap.halfSize);

  const input = new InputManager();
  // Touch controls on iPad and iPhone (ADR-0044): an overlay between the HUD and the menu.
  const touchRoot = document.createElement('div');
  touchRoot.id = 'touch';
  menuRoot.before(touchRoot);
  const touch = new TouchInput(touchRoot, () => settings.touch);
  input.touch = touch;
  touch.onPause = () => {
    menu.back();
    paused = menu.visible;
  };
  if (import.meta.env.DEV) {
    // Handy for poking at the game from the browser console while developing.
    Object.assign(window, { dronefight: { renderer, world, drone, settings, physics, get net() { return net; }, get audio() { return audio; }, get remotes() { return remotes; }, get training() { return training; }, get combatEffects() { return combatEffects; }, get props() { return props; }, get combat() { return combat; }, get hud() { return hud; }, get account() { return account; }, input, get touch() { return input.touch; } } });
  }
  const rig = new CameraRig(settings);
  rig.uptiltOverride = drone.classId === 'wing' ? WING.cameraUptiltDeg : null;
  const hud = new Hud(hudRoot);
  const remotes = new RemoteDrones(world.scene);
  const net = new NetClient(defaultServerUrl(), () => menu.onNetChange());
  const tracers = new Tracers(world.scene);
  const loadoutPreview = new LoadoutPreview();
  const particles = new Particles(world.scene);
  // Map geometry for predicting our missile's impacts (rebuilt when the map changes).
  let mapColliders = buildColliders(currentMap.boxes);
  // Smoke screens and rockets (ADR-0016); explosions are positional sounds.
  const combatEffects = {
    smoke: new SmokeTrails(particles),
    missiles: new Missiles(world.scene, particles, () => mapColliders, (at: THREE.Vector3) => {
      sfx.explosion(at);
      training.splash(at);
      // Solo: our missile damages props here; online the server does (ADR-0023).
      if (!net.inRoom) props.splash([at.x, at.y, at.z], propClock(), 'me', splashDamage);
    }),
    // Grenades (ADR-0034): a bigger blast and a heavier boom than a missile.
    grenades: new Grenades(world.scene, particles, () => mapColliders, (at: THREE.Vector3) => {
      combatEffects.missiles.effect(at, 2.2);
      sfx.grenadeBlast(at);
      training.splash(at);
      if (!net.inRoom) props.splash([at.x, at.y, at.z], propClock(), 'me', grenadeDamage);
    }),
  };
  combatEffects.grenades.onBounce = (at) => sfx.grenadeBounce(at);
  // Solo practice bots on the Training map (ADR-0017).
  const training = new TrainingGround(world.scene, {
    onHit: () => {
      hud.flashHit();
      sfx.hitConfirm();
    },
    onKill: (at) => {
      combatEffects.missiles.effect(at);
      sfx.explosion(at);
    },
  });
  // Our missile's predicted proximity fuse: practice bots, or the other pilots in a room (the server
  // decides the real explosion; this just keeps it from visibly flying through them first).
  // Our missile ended (hit, fuse, burnout or detonated): the server makes it official (ADR-0025).
  combatEffects.missiles.onLocalEnd = (rid, at) => net.sendDetonate(rid, at);
  // Props set off the fuse too (ADR-0023).
  const fuseTargets: THREE.Vector3[] = [];
  combatEffects.missiles.fuseTargets = () => {
    fuseTargets.length = 0;
    if (training.active) fuseTargets.push(...training.targets());
    else for (const v of remotes.views) if (!v.crashed && v.mode !== 'hold') fuseTargets.push(v.position);
    for (const c of props.centers(propClock())) fuseTargets.push(new THREE.Vector3(c[0], c[1], c[2]));
    return fuseTargets;
  };
  // Bullet impacts: a little splash where a round lands, matched to the surface (dirt only where there's dirt).
  const surfaces = new SurfaceLookup();
  surfaces.setMap(currentMap);
  tracers.onImpact = (at) => emitImpact(particles, at, surfaces.at(at));

  const trails = new Trails(world.scene);
  const audio = new AudioEngine();
  const sfx = new Sfx(audio);
  let motorSound = engineVoice(audio, audio.motors, drone.classId === 'wing', PROPELLERS[drone.loadout.propeller].jet);
  const remoteAudio = new RemoteAudio(audio);
  const cannon = new CannonVoice(audio, audio.sfx, 0.8);
  // Every menu button clicks.
  menuRoot.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) sfx.click();
  });

  // Rounds leave along the FPV camera's view, even when you're watching in chase view (ADR-0009).
  const uptiltAxis = new THREE.Vector3(1, 0, 0);
  const uptiltQuat = new THREE.Quaternion();
  const aimRot = new THREE.Quaternion();
  const combat = new CombatClient(
    net,
    drone,
    tracers,
    hud,
    (origin, forward, right, up) => {
      uptiltQuat.setFromAxisAngle(uptiltAxis, (uptiltDeg() * Math.PI) / 180);
      aimRot.copy(drone.currRot).multiply(uptiltQuat);
      forward.set(0, 0, -1).applyQuaternion(aimRot);
      right.set(1, 0, 0).applyQuaternion(aimRot);
      up.set(0, 1, 0).applyQuaternion(aimRot);
      origin.set(0, 0.03, -0.05).applyQuaternion(drone.currRot).add(drone.currPos);
    },
    (spawn, loadout) => {
      applyLoadout(loadout);
      drone.respawnAt(spawn);
      input.resetKeyboardThrottle(drone.restingThrottle);
    },
    {
      shot: (style, from) => sfx.shot(style, from),
      cannon: (firing) => cannon.setFiring(firing),
      remoteCannon: (id) => remoteAudio.markCannon(id),
      hitConfirm: () => sfx.hitConfirm(),
      damage: () => sfx.damage(),
      countdown: (n) => sfx.countdown(n),
      stinger: (kind) => sfx.stinger(kind),
      rocketLaunch: (from) => sfx.rocketLaunch(from),
      grenadeLaunch: (from) => sfx.grenadeLaunch(from),
      smoke: (from) => sfx.smoke(from),
      weaponSwitch: () => sfx.weaponSwitch(),
    },
    combatEffects,
  );
  combat.setMap(currentMap);
  combat.onLocalRound = (o, d, speed, damage, maxDist) => training.addRound(o, d, speed, damage, maxDist);

  // Destructible props (ADR-0023): the server decides online; solo runs the same rules here.
  function propClock(): number {
    return net.inRoom ? net.serverNow() : performance.now();
  }
  combat.props = props;
  combat.propClock = propClock;
  const propPoint = new THREE.Vector3();
  function propBlastEffect(i: number, p: V3): void {
    const kind = props.props[i]?.kind;
    if (!kind) return;
    propPoint.set(p[0], p[1], p[2]);
    const rnd = (k: number) => (Math.random() - 0.5) * k;
    if (PROP_STATS[kind].effect === 'water') {
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        particles.emit(p[0], p[1], p[2], { startSize: 0.5, endSize: 1.8, lifeMs: 900 + Math.random() * 700, color: k % 3 ? '#9fd3ff' : '#eef8ff', alpha: 0.85, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 6, vz: Math.sin(a) * sp });
      }
      sfx.splash(propPoint);
      return;
    }
    combatEffects.missiles.effect(propPoint);
    for (let k = 0; k < 18; k++) {
      particles.emit(p[0] + rnd(1.5), p[1] + rnd(1), p[2] + rnd(1.5), { startSize: 1, endSize: 2.6, lifeMs: 500 + Math.random() * 400, color: k % 2 ? '#ff9a2e' : '#ffd25a', alpha: 0.95, vx: rnd(6), vy: 3 + Math.random() * 5, vz: rnd(6) });
    }
    for (let k = 0; k < 8; k++) {
      particles.emit(p[0] + rnd(2), p[1] + 1, p[2] + rnd(2), { startSize: 1.5, endSize: 5, lifeMs: 3500 + Math.random() * 1500, color: '#3a3632', alpha: 0.7, vx: rnd(1), vy: 1.5 + Math.random(), vz: rnd(1) });
    }
    sfx.explosion(propPoint);
  }
  combat.onPropBlast = (i, p) => propBlastEffect(i, p);
  combat.onPropRound = (i, damage, travelMs, at) => {
    const [x, y, z] = [at.x, at.y, at.z];
    window.setTimeout(() => {
      for (let k = 0; k < 3; k++) {
        particles.emit(x, y, z, { startSize: 0.15, endSize: 0.45, lifeMs: 260, color: '#ffd27a', alpha: 1, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6 });
      }
      if (!net.inRoom) props.damage(i, damage, propClock(), 'me');
    }, travelMs);
  };
  let wasInRoom = false;
  const smokeSources: { id: string; position: THREE.Vector3 }[] = [];
  const missileCamPos = new THREE.Vector3();
  /** Where the hovering drone looks: our missile, then where it blew up (ADR-0027). */
  const WATCH_BLAST_MS = 1500;
  const watchPoint = new THREE.Vector3();
  let watchUntil = 0;
  const watchLook = { target: watchPoint, get uptiltDeg() { return uptiltDeg(); } };
  const missileCamRot = new THREE.Quaternion();
  const missileTargets: THREE.Vector3[] = [];

  // Optional sign-in (ADR-0030, ADR-0031): the menu shows it; guests never need it.
  let menuRef: Menu | null = null;
  const account = new Account(() => menuRef?.onAccountChange());

  let paused = true;
  const menu = new Menu(menuRoot, input, settings, net, {
    onFly: () => {
      paused = false;
      menu.hide();
      renderer.domElement.focus();
    },
    onSettingsChanged: applySettings,
    onMapChanged: () => {
      if (!net.inRoom) switchMap(settings.map);
    },
    onDroneChanged: () => {
      // Body or build changed (ADR-0033): solo now; in a match at your next respawn.
      net.setLoadout(currentLoadout(settings));
      if (combat.inMatch) {
        combat.notify(`${droneClass(settings.drone).name} build on next respawn`);
      } else {
        applyLoadout(currentLoadout(settings));
        respawn();
      }
    },
    onEditTouchLayout: () => {
      // The game stays paused while you arrange the controls; Done saves and returns to Touch controls.
      touch.startEditing(() => {
        saveSettings(settings);
        menu.show('touch');
      });
    },
    onLeaveGame: () => {
      // Back to the start screen: out of any room, on your chosen map, drone reset at a spawn.
      paused = true;
      if (net.inRoom) net.leave();
      switchMap(settings.map);
      applyLoadout(currentLoadout(settings));
      respawn();
    },
  }, account);
  menuRef = menu;
  net.setLoadout(currentLoadout(settings));
  // XP (ADR-0032): the server learns who you are from your sign-in token.
  account.onToken = (token) => net.setAuthToken(token);
  net.setAuthToken(account.accessToken);

  /** The camera tilt in use: wings have their own (ADR-0013), quads use the setting. */
  function uptiltDeg(): number {
    return drone.classId === 'wing' ? WING.cameraUptiltDeg : settings.camera.uptiltDeg;
  }

  /** Change what you're flying: flight model, collider, model and motor sound (ADR-0013). */
  /** Fly a loadout (ADR-0033): flight model and weight, collider, model, motor sound. */
  function applyLoadout(loadout: Loadout): void {
    const cls = loadout.body;
    drone.setLoadout(loadout);
    world.scene.remove(droneModel);
    droneModel = createClassModel(cls, combat.myColor, loadout, account.profile.looks[cls]);
    droneModel.visible = settings.camera.view === 'chase';
    world.scene.add(droneModel);
    motorSound.dispose();
    motorSound = engineVoice(audio, audio.motors, cls === 'wing', PROPELLERS[loadout.propeller].jet);
    rig.uptiltOverride = cls === 'wing' ? WING.cameraUptiltDeg : null;
  }

  /** Load a different map: scenery, colliders, bullet walls, and a fresh spawn (ADR-0012). */
  function switchMap(id: MapId): void {
    if (currentMap.id === id) return;
    currentMap = getMap(id);
    world.setMap(currentMap);
    arenaColliders.set(currentMap.boxes);
    props = new PropField(currentMap);
    movingProps.setMap(currentMap, props);
    combat.props = props;
    combat.setMap(currentMap);
  combat.onLocalRound = (o, d, speed, damage, maxDist) => training.addRound(o, d, speed, damage, maxDist);
    mapColliders = buildColliders(currentMap.boxes);
    surfaces.setMap(currentMap);
    boundaryGrid.setHalfSize(currentMap.halfSize);
    drone.respawnAt(randomSpawn(currentMap));
    input.resetKeyboardThrottle(drone.restingThrottle);
  }

  function applySettings(): void {
    world.setShadows(settings.graphics.shadows);
    world.setGridStyle(settings.graphics.gridTextures);
    audio.setVolume(settings.audio.volume);
    audio.setMuted(settings.audio.muted);
    audio.setMix(settings.audio.own, settings.audio.others);
    rig.applyFov();
    droneModel.visible = settings.camera.view === 'chase';
  }
  applySettings();

  // Invite links: ?room=CODE joins that room straight from the Play screen.
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) menu.joinCode(invite);

  function resize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    rig.resize(w, h);
    loadoutPreview.resize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      menu.back();
      paused = menu.visible;
    } else if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
      settings.audio.muted = !settings.audio.muted;
      saveSettings(settings);
      applySettings();
    } else if (e.code === 'KeyF' && !(e.target instanceof HTMLInputElement)) {
      toggleFullscreen();
    } else if (e.code === 'KeyC' && !menu.visible) {
      settings.camera.view = settings.camera.view === 'fpv' ? 'chase' : 'fpv';
      saveSettings(settings);
      applySettings();

    }
  });

  /** Solo reset: a random spawn on the current map. */
  function respawn(): void {
    drone.respawnAt(randomSpawn(currentMap));
    input.resetKeyboardThrottle(drone.restingThrottle);
  }

  /** F toggles fullscreen. The canvas resizes through the window resize event. */
  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }

  /** What the missile HUD measures range to: practice bots, or the other pilots (not while they smoke). */
  function missileTargetList(): readonly THREE.Vector3[] {
    missileTargets.length = 0;
    if (training.active) missileTargets.push(...training.targets());
    else for (const v of remotes.views) if (!v.crashed && !v.concealed) missileTargets.push(v.position);
    return missileTargets;
  }

  function localState(): DroneState {
    const p = drone.currPos;
    const q = drone.currRot;
    const v = drone.state.linvel;
    const r = (x: number) => Math.round(x * 1000) / 1000;
    return {
      ts: Math.round(net.serverNow()),
      p: [r(p.x), r(p.y), r(p.z)],
      q: [r(q.x), r(q.y), r(q.z), r(q.w)],
      v: [r(v.x), r(v.y), r(v.z)],
      m: r(drone.state.motorOutput),
      armed: drone.armed,
      crashed: drone.crashed,
      // The missile we're flying: the server checks its path and decides hits (ADR-0025).
      k: combat.missilePose() ?? undefined,
    };
  }

  const projected = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  /** Screen marker for a pilot, pinned to the screen edge when off-screen or behind (written into `marker`). */
  function markerFor(target: THREE.Vector3, marker: MarkerInfo): MarkerInfo {
    const cam = rig.camera;
    const w = container.clientWidth;
    const h = container.clientHeight;
    toTarget.copy(target).sub(cam.position);
    marker.distance = toTarget.length();
    cam.getWorldDirection(camForward);
    const behind = toTarget.dot(camForward) < 0;
    projected.copy(target).project(cam);
    let nx = projected.x;
    let ny = projected.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const inside = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    if (!inside) {
      // Push to the edge along the direction from screen center.
      const scale = 0.92 / Math.max(Math.abs(nx), Math.abs(ny), 1e-6);
      nx *= scale;
      ny *= scale;
    }
    marker.x = ((nx + 1) / 2) * w;
    marker.y = ((1 - ny) / 2) * h;
    marker.onScreen = inside;
    return marker;
  }

  const leadPoint = new THREE.Vector3();
  const toTargetLead = new THREE.Vector3();
  const lead = { x: 0, y: 0 };

  /** Lead indicator (ADR-0011): where the target will be when a round fired now reaches it. */
  function leadFor(target: THREE.Vector3, velocity: THREE.Vector3): { x: number; y: number } | null {
    toTargetLead.subVectors(target, drone.currPos);
    const d = toTargetLead;
    const speed = combat.projectileSpeed;
    if (speed === null) return null;
    const t = interceptTime(d.x, d.y, d.z, velocity.x, velocity.y, velocity.z, speed);
    if (t === null || t * speed > COMBAT.range) return null;
    leadPoint.copy(target).addScaledVector(velocity, t);
    const cam = rig.camera;
    cam.getWorldDirection(camForward);
    if (toTarget.subVectors(leadPoint, cam.position).dot(camForward) <= 0) return null;
    projected.copy(leadPoint).project(cam);
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return null;
    lead.x = ((projected.x + 1) / 2) * container.clientWidth;
    lead.y = ((1 - projected.y) / 2) * container.clientHeight;
    return lead;
  }

  // Every other pilot gets a marker (ADR-0026, ADR-0043): a name tag while on screen, an edge arrow when not.
  // Smoking pilots get neither (ADR-0024); crashed ones and dead ones have no tag. Training bots get tags too.
  const markerPool: MarkerInfo[] = [];
  const markers: MarkerInfo[] = [];
  function nextMarker(): MarkerInfo {
    return markerPool[markers.length] ?? (markerPool[markers.length] = { x: 0, y: 0, onScreen: true, distance: 0, color: '', name: '', hp: null });
  }
  /** Teams mode (ADR-0047): this pilot is on your team. */
  function isTeammate(id: string): boolean {
    const m = net.match;
    if (!m || m.options.mode !== 'teams') return false;
    const mine = net.me?.side;
    return mine !== undefined && m.players.find((p) => p.id === id)?.side === mine;
  }

  function pilotMarkers(): readonly MarkerInfo[] {
    markers.length = 0;
    for (const v of remotes.views) {
      if (v.concealed || v.crashed) continue;
      const player = net.match?.players.find((p) => p.id === v.id);
      if (player && !player.alive) continue;
      const m = nextMarker();
      markerFor(v.position, m);
      m.color = pilotColor(v.team ?? 1);
      // Callsign or color (ADR-0047); teammates are marked as friendly.
      const label = player ? pilotLabel(player) : pilotName(v.team);
      const friendly = isTeammate(v.id);
      m.name = `${friendly ? '▲ ' : ''}${label}${player?.level ? ` · ${player.level}` : ''}`;
      m.hp = player ? player.hp / droneClass(player.drone).maxHp : null;
      markers.push(m);
    }
    if (training.active) {
      for (const t of training.targets()) {
        const m = nextMarker();
        markerFor(t, m);
        if (!m.onScreen) continue;
        m.color = '#f4f2ee';
        m.name = 'Bot';
        m.hp = null;
        markers.push(m);
      }
    }
    return markers;
  }

  /** Lead indicator on the pilot nearest your crosshair (ADR-0026), skipping smoking, holding or crashed ones. */
  const toPilot = new THREE.Vector3();
  function pilotLead(): { x: number; y: number } | null {
    if (paused) return null;
    rig.camera.getWorldDirection(camForward);
    let best: (typeof remotes.views)[number] | null = null;
    let bestDot = -Infinity;
    for (const v of remotes.views) {
      // Never lead a teammate (ADR-0047): the circle and auto-fire are for enemies.
      if (v.concealed || v.mode === 'hold' || v.crashed || isTeammate(v.id)) continue;
      const dot = toPilot.subVectors(v.position, rig.camera.position).normalize().dot(camForward);
      if (dot > bestDot) {
        bestDot = dot;
        best = v;
      }
    }
    return best ? leadFor(best.position, best.velocity) : null;
  }

  /** Lead indicator on the practice bot nearest the crosshair (ADR-0017). */
  function practiceLead(): { x: number; y: number } | null {
    if (!training.active || paused) return null;
    const t = training.bestTarget(rig.camera);
    return t ? leadFor(t.position, t.velocity) : null;
  }

  const netInfo: NetHudInfo = { status: 'offline', room: null, pingMs: 0, peer: null };
  function netHud(): NetHudInfo | null {
    if (net.status === 'offline' || net.status === 'error') return null;
    netInfo.status = net.status;
    netInfo.room = net.room;
    netInfo.pingMs = net.clock.rtt;
    // Several pilots (ADR-0026): show the worst one, since Hard rule 1 applies to each.
    let delayMs = 0;
    let staleMs = remotes.views.length ? 0 : Infinity;
    for (const v of remotes.views) {
      delayMs = Math.max(delayMs, v.delayMs);
      staleMs = Math.max(staleMs, v.staleMs);
    }
    netInfo.peer = net.peers.size > 0 ? { delayMs, staleMs } : null;
    return netInfo;
  }

  // Render-interpolated pose.
  const renderPos = new THREE.Vector3();
  const renderRot = new THREE.Quaternion();

  let last = performance.now();
  let accumulator = 0;
  let fps = 60;
  let wasArmed = false;
  let wasCrashed = false;
  const camForwardA = new THREE.Vector3();
  const camUpA = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    // Long gaps (hidden tab, hitch) are dropped, never caught up in a burst.
    const frameDt = Math.min((now - last) / 1000, SIM.maxFrameSeconds);
    last = now;
    fps += (1 / Math.max(frameDt, 1e-3) - fps) * 0.05;

    // Touch and flight assist (ADR-0044, ADR-0045): set before reading the sticks.
    input.touchSettings = settings.touch;
    const control = input.poll(frameDt);
    // A room set to Acro only overrides your choice (ADR-0046); the X8 stays Horizon regardless.
    drone.setAssist(net.inRoom && net.match?.options.assist === 'acro' ? 'acro' : settings.flightAssist);
    touch.setVisible(!menu.visible && input.touchActive);
    touch.render();
    // Rooms decide the map; follow it when joining one.
    if (net.map && net.map !== currentMap.id) switchMap(net.map);
    menu.tick();
    hudRoot.hidden = menu.visible;

    // Moving props keep moving while the menu is open. In a room everyone uses server time, so both
    // pilots see them in the same place (ADR-0020).
    // Destroyed props: mirror the server in a room; in solo, run the rules here (ADR-0023).
    if (net.inRoom) {
      props.syncDown(net.match?.props ?? [], propClock());
    } else {
      if (wasInRoom) props.reset();
      for (const b of props.tick(propClock()).blasts) propBlastEffect(b.i, b.p);
    }
    wasInRoom = net.inRoom;
    movingProps.update(propClock() / 1000);

    if (!paused) {
      drone.updateArming(control);
      if (drone.handleSpecial(control)) sfx.maneuver();
      // In a match the server decides deaths and respawns (ADR-0009); solo keeps local reset.
      if (!combat.inMatch) {
        const autoReset = drone.crashed && drone.crashTime >= CRASH.autoResetSeconds;
        if (control.resetPressed || autoReset) respawn();
        if (control.resetPressed && training.active) training.resetStats();
      }

      // While you fly a missile the drone hovers and watches it, then the blast for a moment (ADR-0025, ADR-0027).
      const ridingNow = combat.flying;
      if (ridingNow) {
        watchPoint.set(ridingNow.m.p[0], ridingNow.m.p[1], ridingNow.m.p[2]);
        watchUntil = now + WATCH_BLAST_MS;
      }
      const watching = !!ridingNow || now < watchUntil;
      drone.autoHover = watching;
      drone.hoverLook = watching && drone.classId !== 'wing' ? watchLook : null;
      accumulator += frameDt;
      while (accumulator >= STEP) {
        drone.preStep(control, settings.rates, STEP);
        physics.world.step();
        drone.postStep(STEP);
        accumulator -= STEP;
      }
    }

    const alpha = paused ? 1 : accumulator / STEP;
    renderPos.lerpVectors(drone.prevPos, drone.currPos, alpha);
    renderRot.slerpQuaternions(drone.prevRot, drone.currRot, alpha);
    droneModel.position.copy(renderPos);
    droneModel.quaternion.copy(renderRot);
    rig.update(renderPos, renderRot, frameDt);
    boundaryGrid.update(renderPos);

    // Networking runs even while paused, so your friend still sees where you are.
    net.update(frameDt, localState);
    // Smoking pilots show only their frame (ADR-0024), and leave a thin trail.
    remotes.update(net, (id) => combat.smoking(id));
    smokeSources.length = 0;
    if (!drone.crashed) smokeSources.push({ id: combat.selfId, position: drone.currPos });
    for (const v of remotes.views) if (!v.crashed) smokeSources.push(v);
    combatEffects.smoke.update(smokeSources);
    combat.update(frameDt, control, !paused);
    // XP from the server (ADR-0032): keep the account current, pop "+100 XP", celebrate level-ups.
    for (const p of net.progress.splice(0)) {
      if (p.t === 'xp') {
        const before = levelForXp(account.xp ?? p.xp - p.gained);
        hud.showXp(p.gained, XP_LABELS[p.reason]);
        const after = levelForXp(p.xp);
        if (after > before) {
          combat.notify(`LEVEL ${after}!`);
          sfx.stinger('victory');
        }
      }
      account.setXp(p.xp);
    }
    // Riding our missile: the camera is its nose, and you can see your own drone hovering (ADR-0025).
    const ridden = combat.flying;
    if (ridden) {
      const m = ridden.m;
      missileCamPos.set(m.p[0], m.p[1], m.p[2]);
      missileCamRot.set(m.q[0], m.q[1], m.q[2], m.q[3]);
      rig.updateMissile(missileCamPos, missileCamRot);
    }
    droneModel.visible = settings.camera.view === 'chase' || !!ridden;
    tracers.update();
    combatEffects.grenades.update(paused ? 0 : frameDt);
    particles.update(rig.camera, frameDt);
    training.setActive(!net.inRoom && currentMap.id === 'training');
    training.update(paused ? 0 : frameDt, rig.camera);
    trails.update(remotes.views, rig.camera, (team) => pilotColor(team ?? 1));
    setDronePropColor(droneModel, combat.myColor);
    // Your paint (ADR-0030): repaint when it changes, and keep the room up to date.
    const myLook = account.profile.looks[drone.classId];
    if (droneModel.userData.lookKey !== lookKey(myLook)) applyLook(droneModel, myLook);
    net.setLooks(account.profile.looks, account.profile.name);

    // Audio: ears at the camera, motors follow the quad (ADR-0010).
    const cam = rig.camera;
    camForwardA.set(0, 0, -1).applyQuaternion(cam.quaternion);
    camUpA.set(0, 1, 0).applyQuaternion(cam.quaternion);
    audio.updateListener(cam.position.x, cam.position.y, cam.position.z, camForwardA.x, camForwardA.y, camForwardA.z, camUpA.x, camUpA.y, camUpA.z);
    audio.setDucked(menu.visible);
    // Riding a missile, you hear its motor (by throttle) instead of your hovering quad.
    if (ridden) motorSound.update(0.35 + 0.65 * ridden.m.throttle, Math.hypot(...ridden.m.v), ridden.m.burnout === null);
    else motorSound.update(drone.state.motorOutput, drone.speed, drone.armed && !drone.crashed);
    remoteAudio.update(remotes.views);
    if (drone.crashed && !wasCrashed) sfx.crash();
    else if (drone.armed !== wasArmed && !drone.crashed) sfx.arm(drone.armed);
    wasArmed = drone.armed;
    wasCrashed = drone.crashed;

    const leadNow = training.active ? practiceLead() : pilotLead();
    // Auto-fire (ADR-0044) reads this next frame: the lead circle is on the crosshair.
    input.leadOnTarget = !!leadNow && Math.hypot(leadNow.x - container.clientWidth / 2, leadNow.y - container.clientHeight / 2) < Math.min(container.clientWidth, container.clientHeight) * AUTO_FIRE_RADIUS;
    hud.update({
      drone,
      throttle: control.throttle,
      source: input.source,
      uncalibratedId: input.uncalibratedId,
      fps,
      backend: backendName,
      showDebug: settings.graphics.showDebug,
      autoResetIn: drone.crashed && !combat.inMatch ? Math.max(0, CRASH.autoResetSeconds - drone.crashTime) : null,
      net: netHud(),
      combat: combat.hudState(),
      // Edge arrows only for pilots off screen; on screen, trails and glow show them.
      // Smoking pilots get no arrow and no lead circle (ADR-0024).
      markers: pilotMarkers(),
      lead: leadNow,
      training: training.active ? training.statsText() : null,
      missile: combat.missileHud(missileTargetList()),
      special:
        drone.loadout.special === 'maneuver'
          ? { label: 'MANEUVER', value: drone.stalled ? 'STALL' : drone.maneuverActive ? 'ON' : 'OFF' }
          : combat.specialReadout(),
    });

    renderer.render(world.scene, rig.camera);
    // The Loadout screen's 3D preview, drawn over the paused view (ADR-0033).
    loadoutPreview.update(menu.previewLoadout, combat.myColor, frameDt, menu.previewAnchor(), menu.previewLoadout ? menu.previewLook : undefined);
    loadoutPreview.render(renderer);
  });
}
