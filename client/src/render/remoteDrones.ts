import * as THREE from 'three/webgpu';
import { NET } from '../../../shared/protocol';
import type { NetClient } from '../net/netClient';
import { createSampledState, type SampleMode } from '../net/snapshotBuffer';
import { createDroneModel } from './droneModel';

export interface RemoteView {
  id: string;
  mode: SampleMode;
  position: THREE.Vector3;
  /** True end-to-end delay of what's on screen (ms), per ADR-0004. */
  delayMs: number;
  /** Time since the last snapshot arrived (ms). */
  staleMs: number;
}

/** Renders other pilots' drones from their snapshot buffers. They are not simulated locally. */
export class RemoteDrones {
  private readonly models = new Map<string, THREE.Group>();
  private readonly sample = createSampledState();
  /** Reused per peer so rendering doesn't allocate every frame (Hard rule 2). */
  private readonly viewPool = new Map<string, RemoteView>();
  readonly views: RemoteView[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  update(net: NetClient): void {
    const serverNow = net.serverNow();
    const renderTime = serverNow - NET.interpDelayMs;
    const now = performance.now();

    for (const [id, model] of this.models) {
      if (!net.peers.has(id)) {
        this.scene.remove(model);
        this.models.delete(id);
        this.viewPool.delete(id);
      }
    }

    this.views.length = 0;
    for (const peer of net.peers.values()) {
      let model = this.models.get(peer.id);
      if (!model) {
        // Other pilots get white props so they read differently from your own drone in chase view.
        model = createDroneModel('#f4f2ee');
        this.models.set(peer.id, model);
        this.scene.add(model);
      }
      const s = peer.buffer.sample(renderTime, this.sample);
      model.visible = s.mode !== 'empty';
      if (s.mode === 'empty') continue;
      model.position.copy(s.pos);
      model.quaternion.copy(s.rot);
      let view = this.viewPool.get(peer.id);
      if (!view) {
        view = { id: peer.id, mode: s.mode, position: model.position, delayMs: 0, staleMs: 0 };
        this.viewPool.set(peer.id, view);
      }
      view.mode = s.mode;
      view.delayMs = serverNow - s.sourceTs;
      view.staleMs = now - peer.lastRecv;
      this.views.push(view);
    }
  }
}
