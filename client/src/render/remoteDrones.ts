import * as THREE from 'three/webgpu';
import { NET } from '../../../shared/protocol';
import type { NetClient } from '../net/netClient';
import { createSampledState, type SampleMode } from '../net/snapshotBuffer';
import { pilotColor } from '../../../shared/combat';
import { DRONE_VISUAL } from '../config';
import { createClassModel, setDronePropColor } from './droneModel';
import { droneClass, type DroneClassId } from '../../../shared/drones';
import { defaultLoadout } from '../../../shared/loadout';

export interface RemoteView {
  id: string;
  mode: SampleMode;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  team: number | null;
  /** True end-to-end delay of what's on screen (ms), per ADR-0004. */
  delayMs: number;
  /** Time since the last snapshot arrived (ms). */
  staleMs: number;
  /** Motor output 0..1, for their motor sound. */
  motor: number;
  armed: boolean;
  crashed: boolean;
  droneClass: DroneClassId;
  /** Hidden by smoke from where you're looking (ADR-0016). */
  concealed: boolean;
}

/** Renders other pilots' drones from their snapshot buffers. They are not simulated locally. */
/** Soft round glow texture, drawn once. */
function glowTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Solid core with a soft edge: reads on bright sky and concrete (additive glow washes out in daylight).
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

export class RemoteDrones {
  private readonly bubbleGeo = new THREE.SphereGeometry(1, 24, 16);
  private readonly bubbleMat = new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  private readonly models = new Map<string, THREE.Group>();
  private readonly glows = new Map<string, THREE.Sprite>();
  private readonly glowMap = glowTexture();
  private readonly sample = createSampledState();
  /** Reused per peer so rendering doesn't allocate every frame (Hard rule 2). */
  private readonly viewPool = new Map<string, RemoteView>();
  readonly views: RemoteView[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** `isConcealed` hides a pilot's glow (and flags the view) when smoke is in the way. */
  update(net: NetClient, isConcealed: (id: string) => boolean = () => false): void {
    const serverNow = net.serverNow();
    const renderTime = serverNow - NET.interpDelayMs;
    const now = performance.now();

    for (const [id, model] of this.models) {
      if (!net.peers.has(id)) {
        this.scene.remove(model);
        this.models.delete(id);
        this.viewPool.delete(id);
        const glow = this.glows.get(id);
        if (glow) this.scene.remove(glow);
        this.glows.delete(id);
      }
    }

    this.views.length = 0;
    for (const peer of net.peers.values()) {
      const player = net.match?.players.find((p) => p.id === peer.id);
      const cls = player?.drone ?? 'freestyle';
      const loadout = player?.loadout ?? defaultLoadout(cls);
      const key = `${loadout.body}:${loadout.weapons.join(',')}:${loadout.special ?? ''}`;
      let model = this.models.get(peer.id);
      // Their body or build changed (ADR-0013, ADR-0033): swap the model.
      if (model && model.userData.loadoutKey !== key) {
        this.scene.remove(model);
        this.models.delete(peer.id);
        model = undefined;
      }
      if (!model) {
        // Drawn at the class's readable size; their physics stay real size (ADR-0011, ADR-0013).
        model = createClassModel(cls, '#f4f2ee', loadout);
        // A shield bubble (ADR-0033), shown while their shield is up.
        const bubble = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
        bubble.scale.setScalar(droneClass(cls).hitRadius / droneClass(cls).visualScale);
        bubble.visible = false;
        bubble.name = 'shield';
        model.add(bubble);
        this.models.set(peer.id, model);
        this.scene.add(model);
      }
      const bubble = model.getObjectByName('shield');
      if (bubble) bubble.visible = !!player?.shielded;
      if (!this.glows.has(peer.id)) {
        // Constant on-screen size, so they stay visible far away. Walls still hide it.
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowMap,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: false,
            toneMapped: false,
            fog: false,
          }),
        );
        glow.scale.setScalar(DRONE_VISUAL.glowScreenSize * 2);
        this.glows.set(peer.id, glow);
        this.scene.add(glow);
      }
      const glow = this.glows.get(peer.id);
      const team = player?.team;
      const color = pilotColor(team ?? 1);
      setDronePropColor(model, color);
      const s = peer.buffer.sample(renderTime, this.sample);
      model.visible = s.mode !== 'empty';
      if (glow) {
        glow.visible = s.mode !== 'empty' && !s.crashed;
        glow.position.copy(s.pos);
        (glow.material as THREE.SpriteMaterial).color.set(color);
      }
      if (s.mode === 'empty') continue;
      model.position.copy(s.pos);
      model.quaternion.copy(s.rot);
      let view = this.viewPool.get(peer.id);
      if (!view) {
        view = {
          id: peer.id,
          mode: s.mode,
          position: model.position,
          velocity: new THREE.Vector3(),
          team: null,
          delayMs: 0,
          staleMs: 0,
          motor: 0,
          armed: false,
          crashed: false,
          droneClass: cls,
          concealed: false,
        };
        this.viewPool.set(peer.id, view);
      }
      view.mode = s.mode;
      // Holding still after a stall: don't lead a target that isn't really moving on screen.
      if (s.mode === 'hold') view.velocity.set(0, 0, 0);
      else view.velocity.copy(s.vel);
      view.team = team ?? null;
      view.delayMs = serverNow - s.sourceTs;
      view.staleMs = now - peer.lastRecv;
      view.motor = s.motor;
      view.armed = s.armed;
      view.crashed = s.crashed;
      view.droneClass = cls;
      view.concealed = isConcealed(peer.id);
      if (glow && view.concealed) glow.visible = false;
      this.views.push(view);
    }
  }
}
