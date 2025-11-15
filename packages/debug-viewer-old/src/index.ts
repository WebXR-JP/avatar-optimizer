// Main viewer class
export { VRMViewer } from './viewer/vrm-viewer'

// Loaders
export { loadVRM, loadVRMFromFile } from './utils/loader'

// Scene utilities
export { setupScene, resizeRenderer, disposeScene } from './viewer/scene-setup'

// Type exports
export type { VRMViewerOptions, VRMViewerState, ViewerError } from './types'
