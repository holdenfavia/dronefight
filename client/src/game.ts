import * as THREE from 'three/webgpu';
import { CRASH, SIM } from './config';
import { InputManager } from './input/inputManager';
import { CameraRig } from './render/cameraRig';
import { createDroneModel } from './render/droneModel';
import { loadSettings, saveSettings } from './settings';
import { Drone } from './sim/drone';
import { addArenaColliders, createPhysics } from './sim/physics';
import { Hud } from './ui/hud';
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
    Object.assign(window, { dronefight: { renderer, world, drone, settings, physics } });
  }
  const rig = new CameraRig(settings);
  const hud = new Hud(hudRoot);

  let paused = true;
  const menu = new Menu(menuRoot, input, settings, {
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
    }
  });

  function respawn(): void {
    drone.respawn();
    input.resetKeyboardThrottle();
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

    hud.update({
      drone,
      throttle: control.throttle,
      source: input.source,
      uncalibratedId: input.uncalibratedId,
      fps,
      backend: backendName,
      showDebug: settings.graphics.showDebug,
      autoResetIn: drone.crashed ? Math.max(0, CRASH.autoResetSeconds - drone.crashTime) : null,
    });

    renderer.render(world.scene, rig.camera);
  });
}
