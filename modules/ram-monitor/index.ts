import { requireNativeModule } from "expo-modules-core";

export interface MemoryInfo {
  /** Resident set size in bytes (includes resident mmap'd pages, e.g. the loaded GGUF model). */
  rssBytes: number;
  /** Proportional set size in bytes, via ActivityManager (cross-check figure). */
  totalPssBytes: number;
}

interface RamMonitorNativeModule {
  getMemoryInfo(): MemoryInfo;
}

const RamMonitor = requireNativeModule<RamMonitorNativeModule>("RamMonitor");

export function getMemoryInfo(): MemoryInfo {
  return RamMonitor.getMemoryInfo();
}
