// Stage thumbnails for the stage screen and match settings (ADR-0086): each stage drawn once by the real renderer,
// empty, at a small fixed size, and kept as an image.

import { createWorld } from '../../shared/fighter/sim';
import type { StageId } from '../../shared/fighter/stages';
import { MENU } from './config';
import { Renderer } from './render';

const cache = new Map<StageId, string>();
let renderer: Renderer | null = null;

/** A data URL of the stage with nobody on it. */
export function stageThumb(id: StageId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  renderer ??= new Renderer(document.createElement('div'), { w: MENU.stageThumbWidth, h: MENU.stageThumbHeight });
  const world = createWorld(id, []);
  renderer.reset(world);
  renderer.draw(world, [], 1);
  const url = renderer.canvas.toDataURL('image/jpeg', 0.85);
  cache.set(id, url);
  return url;
}
