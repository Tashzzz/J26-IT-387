// Body-region reliability for the body map, from C1's data.
// - Before filming: the ICC study (c1.reliability()) for the chosen camera setup.
// - After processing: the reliability summary returned by c1.process().
// Both use the same rule as C1's backend (components/c1_pose/src/c1_pose/reliability_lookup.py) so the
// map before filming matches the one after processing.
import type { KeypointIcc, Reliability, ReliabilitySummary, Setup } from '../c1/types';
import type { CameraView, RegionStatus } from '../ui';

const MAX_DISTANCE_GAP_M = 2;

export type StudyMatch = { label: string; setups: Setup[]; regions: Record<string, RegionStatus>; usable: number; total: number };

/** lookup(): same angle, nearest studied distance within 2 m (ties -> shorter distance). */
export function studyForSetup(rel: Reliability, angle: CameraView, distance: number): StudyMatch | null {
  const sameAngle = rel.setups.filter((s) => s.angle === angle && s.distance_m != null);
  const close = [...new Set(sameAngle.map((s) => s.distance_m as number))].filter((d) => Math.abs(d - distance) <= MAX_DISTANCE_GAP_M);
  if (!close.length) return null;
  const best = close.sort((a, b) => Math.abs(a - distance) - Math.abs(b - distance) || a - b)[0];
  const setups = sameAngle.filter((s) => s.distance_m === best);
  return {
    label: `${angle.replace('_', '-')} ${Number.isInteger(best) ? best : best.toFixed(1)} m`,
    setups,
    ...combineSetups(setups),
  };
}

/** One or more studied setups -> region status + usable keypoint count (C1 _combine() + summary()). */
export function combineSetups(setups: Setup[]): { regions: Record<string, RegionStatus>; usable: number; total: number } {
  // _combine(): several bowlers -> lowest ICC per keypoint (a missing ICC counts as lowest).
  const kp = new Map<string, { region: string; tag: KeypointIcc }>();
  for (const s of setups) {
    for (const r of s.regions) {
      for (const t of r.keypoints) {
        const old = kp.get(t.keypoint)?.tag;
        if (!old || t.icc == null || (old.icc != null && t.icc < old.icc)) kp.set(t.keypoint, { region: r.region, tag: t });
      }
    }
  }

  // summary(): a region is reliable when at least half of its studied keypoints pass the gate.
  const byRegion = new Map<string, KeypointIcc[]>();
  for (const { region, tag } of kp.values()) byRegion.set(region, [...(byRegion.get(region) ?? []), tag]);
  const regions: Record<string, RegionStatus> = {};
  for (const [region, tags] of byRegion) {
    const usable = tags.filter((t) => t.usable).length;
    regions[region] = usable * 2 >= tags.length ? 'usable' : 'unreliable';
  }
  const tags = [...kp.values()].map((v) => v.tag);
  return { regions, usable: tags.filter((t) => t.usable).length, total: tags.length };
}

/** Regions from the reliability summary of a processed clip. */
export function regionsFromSummary(r: ReliabilitySummary | null | undefined): Record<string, RegionStatus> {
  const out: Record<string, RegionStatus> = {};
  if (!r?.setup_matched) return out;
  for (const name of r.reliable_regions) out[name] = 'usable';
  for (const name of r.less_reliable_regions) out[name] = 'unreliable';
  return out;
}
