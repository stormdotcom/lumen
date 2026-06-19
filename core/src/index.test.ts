import { scanRepo } from "./scanner";
import { renderReport, RenderReportOptions, AiSummary } from "./report";
import { renderMarkdown, RenderMarkdownOptions } from "./markdown";
import {
  findCoverage,
  detectFramework,
  CoverageReport,
  FileCoverage,
  CoverageMetric,
  CoverageFramework,
  FindCoverageOptions,
} from "./coverage";

describe("scanRepo", () => {
  it.each([{}, null, undefined])(
    "throws error when input is %p",
    (input) => {
      expect(() => scanRepo(input)).toThrowError();
    }
  );
});

describe("renderReport", () => {
  it.each([
    [{}, {}],
    [null, null],
    [undefined, undefined],
  ])(
    "throws error when input is %p",
    (options: RenderReportOptions) => {
      expect(() => renderReport(options)).toThrowError();
    }
  );
});

describe("renderMarkdown", () => {
  it.each([
    [{}, {}],
    [null, null],
    [undefined, undefined],
  ])(
    "throws error when input is %p",
    (options: RenderMarkdownOptions) => {
      expect(() => renderMarkdown(options)).toThrowError();
    }
  );
});

describe("findCoverage", () => {
  it.each([
    [{}, {}],
    [null, null],
    [undefined, undefined],
  ])(
    "throws error when input is %p",
    (options: FindCoverageOptions) => {
      expect(() => findCoverage(options)).toThrowError();
    }
  );
});

describe("detectFramework", () => {
  it.each([
    [{}, CoverageFramework.Unknown],
    [null, CoverageFramework.Unknown],
    [undefined, CoverageFramework.Unknown],
  ])(
    "returns unknown when input is %p",
    (input) => {
      expect(detectFramework(input)).toBe(CoverageFramework.Unknown);
    }
  );
});