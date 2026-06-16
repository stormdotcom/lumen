const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "renderer");
const dst = path.join(__dirname, "..", "dist", "renderer");

fs.mkdirSync(dst, { recursive: true });

for (const file of fs.readdirSync(src)) {
  if (file.endsWith(".html") || file.endsWith(".css")) {
    fs.copyFileSync(path.join(src, file), path.join(dst, file));
    process.stdout.write(`copied ${file}\n`);
  }
}
