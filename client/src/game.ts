import * as THREE from 'three/webgpu';
import { CRASH, SIM } from './config';
import type { DroneState } from '../../shared/protocol';
import { InputManager } from './input/inputManager';
import { defaultServerUrl, NetClient } from './net/netClient';
import { CameraRig } from './render/cameraRig';
import { createDroneModel } from './render/droneModel';
import { RemoteDrones } from './render/remoteDrones';
import { loadSettings, saveSettings } from './settings';
import { Drone } from './sim/drone';
import { addArenaColliders, createPhysics } from './sim/physics';
import { Hud, type MarkerInfo, type NetHudInfo } from './ui/hud';
import { Menu } from './ui/menu';
import { ARENA, ARENA_BOXES } from './world/arenaLayout';
import { buildWorld, type World } from './world/scene';

const STEP = 1 / SIM.hz;

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
  addArenaColliders(physics, ARENA_BOXES, 1200);
  const drone = new Drone(physics, ARENA.spawn);
  const droneModel = createDroneModel();
  world.scene.add(droneModel);

  const input = new InputManager();
  if (import.meta.env.DEV) {
    // Handy for poking at the game from the browser console while developing.
    Object.assign(window, { dronefight: { renderer, world, drone, settings, physics, get net() { return net; } } });
  }
  const rig = new CameraRig(settings);
  const hud = new Hud(hudRoot);
  const remotes = new RemoteDrones(world.scene);
  const net = new NetClient(defaultServerUrl(), () => menu.onNetChange());

  let paused = true;
  const menu = new Menu(menuRoot, input, settings, net, {
    onFly: () => {
      paused = false;
      menu.hide();
      renderer.domElement.focus();
    },
    onSettingsChanged: applySettings,
  });

  function applySettings(): void {
    world.setShadows(settings.graphics.shadows);
    rig.applyFov();
    droneModel.visible = settings.camera.view === 'chase';
  }
  applySettings();

  // Invite links: ?room=CODE opens the online screen and joins.
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) {
    menu.show('online');
    net.joinRoom(invite);
  }

  function resize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    rig.resize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      menu.back();
      paused = menu.visible;
    } else if (e.code === 'KeyC' && !menu.visible) {
      settings.camera.view = settings.camera.view === 'fpv' ? 'chase' : 'fpv';
      saveSettings(settings);
      applySettings();

  // Invite links: ?room=CODE opens the online screen and joins.
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) {
    menu.show('online');
    net.joinRoom(invite);
  }
    }
  });

  function respawn(): void {
    drone.respawn();
    input.resetKeyboardThrottle();
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
    };
  }

  const projected = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const marker: MarkerInfo = { x: 0, y: 0, onScreen: true, distance: 0 };

  /** Screen marker for the other pilot, pinned to the screen edge when off-screen or behind. */
  function markerFor(target: THREE.Vector3): MarkerInfo {
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

  const netInfo: NetHudInfo = { status: 'offline', room: null, pingMs: 0, peer: null };
  function netHud(): NetHudInfo | null {
    if (net.status === 'offline' || net.status === 'error') return null;
    netInfo.status = net.status;
    netInfo.room = net.room;
    netInfo.pingMs = net.clock.rtt;
    const view = remotes.views[0];
    netInfo.peer = net.peers.size > 0 ? { delayMs: view?.delayMs ?? 0, staleMs: view ? view.staleMs : Infinity } : null;
    return netInfo;
  }

  // Render-interpolated pose.
  const renderPos = new THREE.Vector3();
  const renderRot = new THREE.Quaternion();

  let last = performance.now();
  let accumulator = 0;
  let fps = 60;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    // Long gaps (hidden tab, hitch) are dropped, never caught up in a burst.
    const frameDt = Math.min((now - last) / 1000, SIM.maxFrameSeconds);
    last = now;
    fps += (1 / Math.max(frameDt, 1e-3) - fps) * 0.05;

    const control = input.poll(frameDt);
    menu.tick();
    hudRoot.hidden = menu.visible;

    if (!paused) {
      drone.updateArming(control);
      const autoReset = drone.crashed && drone.crashTime >= CRASH.autoResetSeconds;
      if (control.resetPressed || autoReset) respawn();

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

    // Networking runs even while paused, so your friend still sees where you are.
    net.update(frameDt, localState);
    remotes.update(net);
    const remote = remotes.views[0];

    hud.update({
      drone,
      throttle: control.throttle,
      source: input.source,
      uncalibratedId: input.uncalibratedId,
      fps,
      backend: backendName,
      showDebug: settings.graphics.showDebug,
      autoResetIn: drone.crashed ? Math.max(0, CRASH.autoResetSeconds - drone.crashTime) : null,
      net: netHud(),
      marker: remote ? markerFor(remote.position) : null,
    });

    renderer.render(world.scene, rig.camera);
  });
}
