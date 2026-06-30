import * as fs from "fs";
import * as path from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  scanRepo,
  findCoverage,
  detectFramework,
  renderReport,
  renderMarkdown,
} from "@ajmal_n/lumen-core";

import { getChangedFiles, isGitRepo } from "./git";
import { loadConfig } from "./config";
import { filterCoverage } from "./util";

const SERVER_NAME = "lumen";
const SERVER_VERSION = "0.11.0";

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "scan_repo",
    description:
      "Scan a repository and return file tree statistics: file counts, sizes, line counts, language breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the repository to scan. Defaults to the current working directory.",
        },
      },
    },
  },
  {
    name: "coverage_summary",
    description:
      "Return aggregated test-coverage metrics (lines/statements/functions/branches) for a repo. Auto-excludes test/spec files. Reads coverage-summary.json or lcov.info from the repo's coverage/ directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path. Defaults to cwd." },
        coverageDir: {
          type: "string",
          description: "Override the coverage directory (defaults to <repo>/coverage).",
        },
        includeTests: {
          type: "boolean",
          description: "Include test/spec files in the aggregation (default: false).",
        },
      },
    },
  },
  {
    name: "diff_coverage",
    description:
      "Return coverage filtered to only the files changed in the current branch vs. a base branch (auto-detected: origin/main → origin/master → main → master). Useful for PR/CI workflows.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path. Defaults to cwd." },
        base: { type: "string", description: "Base branch (e.g. origin/main). Auto-detected if omitted." },
      },
    },
  },
  {
    name: "untested_files",
    description:
      "List source files in the repo that have no coverage data at all (informational sidecar — not part of the headline %).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path. Defaults to cwd." },
      },
    },
  },
  {
    name: "detect_framework",
    description:
      "Detect which test framework the repo uses (jest, vitest, mocha, jasmine, karma, ava, tap, nx, or unknown).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path. Defaults to cwd." },
      },
    },
  },
  {
    name: "render_report",
    description:
      "Generate a self-contained HTML or Markdown report for a repository and write it to disk. Returns the path of the file produced.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository path. Defaults to cwd." },
        format: {
          type: "string",
          enum: ["html", "markdown"],
          description: "Output format. Defaults to html.",
        },
        outDir: {
          type: "string",
          description: "Directory to write the report into. Defaults to <repo>/.lumen/.",
        },
      },
      required: [],
    },
  },
];

function resolveRoot(input: unknown): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return path.resolve(input);
  }
  return process.cwd();
}

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      { type: "text", text: JSON.stringify(data, null, 2) },
    ],
  };
}

function err(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function handleTool(name: string, args: Record<string, unknown> | undefined) {
  const a = args ?? {};
  const root = resolveRoot(a.path);
  if (!fs.existsSync(root)) return err(`Path not found: ${root}`);

  switch (name) {
    case "scan_repo": {
      const stats = scanRepo(root);
      return ok({
        root,
        totalFiles: stats.totalFiles,
        totalBytes: stats.totalBytes,
        totalLines: stats.totalLines,
        languages: stats.byExtension,
      });
    }

    case "coverage_summary": {
      const cfg = loadConfig(root);
      const cov = findCoverage(root, {
        coverageDir: typeof a.coverageDir === "string" ? a.coverageDir : undefined,
        exclude: cfg.coverageExclude,
        includeTests:
          typeof a.includeTests === "boolean" ? a.includeTests : cfg.includeTests,
      });
      if (!cov) return err("No coverage data found. Run your tests with coverage first (e.g. `npm test -- --coverage`).");
      return ok({
        root: cov.root,
        framework: cov.framework,
        total: cov.total,
        files: cov.files.map((f) => ({ path: f.path, lines: f.lines, statements: f.statements, functions: f.functions, branches: f.branches })),
        excluded: cov.excluded ?? [],
        untested: cov.untested ?? null,
      });
    }

    case "diff_coverage": {
      if (!isGitRepo(root)) return err("Not a git repository.");
      const cfg = loadConfig(root);
      const base = typeof a.base === "string" ? a.base : cfg.baseBranch;
      const changed = getChangedFiles(root, base);
      const cov = findCoverage(root, {
        exclude: cfg.coverageExclude,
        includeTests: cfg.includeTests,
      });
      if (!cov) return err("No coverage data found.");
      const filtered = filterCoverage(cov, changed.files);
      return ok({
        root: cov.root,
        base: changed.base,
        current: changed.current,
        changedFiles: changed.files,
        coverage:
          filtered.files.length > 0
            ? { total: filtered.total, files: filtered.files }
            : null,
        note:
          filtered.files.length > 0
            ? null
            : "No coverage data for changed files.",
      });
    }

    case "untested_files": {
      const cfg = loadConfig(root);
      const cov = findCoverage(root, { exclude: cfg.coverageExclude, includeTests: cfg.includeTests });
      if (!cov) return err("No coverage data found.");
      return ok({ root: cov.root, untested: cov.untested ?? { count: 0, totalLines: 0, files: [] } });
    }

    case "detect_framework": {
      const framework = detectFramework(root);
      return ok({ root, framework });
    }

    case "render_report": {
      const fmt = a.format === "markdown" ? "markdown" : "html";
      const outDir =
        typeof a.outDir === "string" ? path.resolve(a.outDir) : path.join(root, ".lumen");
      fs.mkdirSync(outDir, { recursive: true });
      const stats = scanRepo(root);
      const cfg = loadConfig(root);
      const coverage =
        findCoverage(root, { exclude: cfg.coverageExclude, includeTests: cfg.includeTests }) ?? undefined;
      const ext = fmt === "markdown" ? "md" : "html";
      const file = path.join(outDir, `lumen-report.${ext}`);
      const body =
        fmt === "markdown"
          ? renderMarkdown(stats, { coverage })
          : renderReport(stats, { coverage });
      fs.writeFileSync(file, body, "utf8");
      return ok({ path: file, format: fmt });
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await handleTool(req.params.name, req.params.arguments as Record<string, unknown> | undefined);
    } catch (e) {
      return err(`Tool ${req.params.name} failed: ${(e as Error).message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function getMcpInstallSnippet(): string {
  return JSON.stringify(
    {
      mcpServers: {
        lumen: {
          command: "lumen",
          args: ["mcp", "serve"],
        },
      },
    },
    null,
    2,
  );
}

export function getMcpToolList(): Array<{ name: string; description: string }> {
  return TOOLS.map((t) => ({ name: t.name, description: t.description }));
}
