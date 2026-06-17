import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface TmpRepoSpec {
  [pathRelative: string]: string | TmpRepoSpec;
}

export function makeTmpRepo(prefix: string, spec: TmpRepoSpec): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lumen-test-${prefix}-`));
  writeSpec(root, spec);
  return root;
}

function writeSpec(base: string, spec: TmpRepoSpec) {
  for (const [name, val] of Object.entries(spec)) {
    const full = path.join(base, name);
    if (typeof val === "string") {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, val, "utf8");
    } else {
      fs.mkdirSync(full, { recursive: true });
      writeSpec(full, val);
    }
  }
}

export function rmTmpRepo(root: string) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
