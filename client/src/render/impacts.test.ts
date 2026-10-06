import { Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../../shared/maps';
import { SurfaceLookup } from './impacts';

describe('bullet impacts by surface', () => {
  const lookup = new SurfaceLookup();

  it('a sidewalk chips like concrete: no dirt on the sidewalk', () => {
    lookup.setMap(MAPS.downtown);
    const walk = MAPS.downtown.boxes.find((b) => b.mat === 'sidewalk' && !b.rot)!;
    const top = new Vector3(walk.pos[0], walk.pos[1] + walk.size[1] / 2, walk.pos[2]);
    const hit = lookup.at(top);
    expect(hit.surface).toBe('concrete');
    expect(hit.normal.y).toBeCloseTo(1);
  });

  it("Downtown's open street is asphalt; the Playground's ground is dirt", () => {
    lookup.setMap(MAPS.downtown);
    const street = MAPS.downtown.boxes.length ? new Vector3(0, 0, 30) : new Vector3();
    expect(['asphalt', 'concrete']).toContain(lookup.at(street).surface);
    lookup.setMap(MAPS.playground);
    expect(lookup.at(new Vector3(0, 0, -140)).surface).toBe('dirt');
  });

  it('a steel beam sparks', () => {
    lookup.setMap(MAPS.yard);
    const beam = MAPS.yard.boxes.find((b) => b.mat === 'orange' && !b.rot)!;
    const side = new Vector3(beam.pos[0] + beam.size[0] / 2, beam.pos[1], beam.pos[2]);
    expect(lookup.at(side).surface).toBe('metal');
  });
});
