// ============================================================
//  Profiler — Barrel exports for the profiling & debugging system
// ============================================================

export { ProfilerStore, type ActorSnapshot, type ClassRecord, type NodeExecRecord, type EventRecord, type FrameSnapshot, type ProfilerSessionData, getEventColor, STATUS_COLORS, THRESHOLDS } from './ProfilerStore';
export { ProfilerPanel } from './ProfilerPanel';
export { ProfilerOverlay } from './ProfilerOverlay';
export { installProfilerHooks, uninstallProfilerHooks, isProfilerInstalled } from './ProfilerHooks';
export { injectProfilerStyles } from './ProfilerStyles';
