export type { MigrationOptions } from './migrate-vrm0-to-vrm1'
export {
  collectNonBoneChildWorldMatrices,
  compensateNonBoneChildren,
  findRootBone,
  migrateSkeletonVRM0ToVRM1,
  rebuildBoneTransforms,
  recalculateBoneInverses,
  recordBoneWorldPositions,
  rotateBonePositions,
} from './migrate-vrm0-to-vrm1'
