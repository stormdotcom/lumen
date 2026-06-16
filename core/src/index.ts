export { scanRepo } from "./scanner";
export type { RepoStats, FileEntry, ExtStat } from "./scanner";
export { renderReport } from "./report";
export { renderMarkdown } from "./markdown";
export { findCoverage, detectFramework } from "./coverage";
export type {
  CoverageReport,
  FileCoverage,
  CoverageMetric,
  CoverageFramework,
  FindCoverageOptions,
} from "./coverage";
