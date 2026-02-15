/**
 * Curated spawn anchors for validation fallback.
 * Scenic dock is index 0 (first load); others used if raycast fails.
 */

export interface SpawnAnchor {
  id: string;
  position: [number, number, number];
  cameraVolumeId: string;
}

export const SPAWN_ANCHORS: SpawnAnchor[] = [
  { id: 'scenic_dock', position: [12, 0.5, 8], cameraVolumeId: 'vol_dock' },
  { id: 'settlement_1', position: [-15, 0.4, 5], cameraVolumeId: 'vol_settlement_1' },
  { id: 'creek_mid', position: [0, 0.3, -10], cameraVolumeId: 'vol_creek' },
  { id: 'pipeline_near', position: [25, 0.5, 0], cameraVolumeId: 'vol_pipeline' },
  { id: 'mangrove_edge', position: [-8, 0.35, 15], cameraVolumeId: 'vol_mangrove' },
];

export const DEFAULT_SPAWN = SPAWN_ANCHORS[0];
