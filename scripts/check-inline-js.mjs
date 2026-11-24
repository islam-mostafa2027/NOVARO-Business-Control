import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const html = fs.readFileSync("index.html", "utf8");
const blocks = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script\\s*>/gi)];
let checked = 0;
for (let i = 0; i < blocks.length; i++) {
  const attrs = blocks[i][1] || "";
  const body = blocks[i][2] || "";
  if (/\\bsrc\\s*=/i.test(attrs) || !body.trim()) continue;
  const type = attrs.match(/\\btype\\s*=\\s*["']?([^\\s"'>]+)/i)?.[1]?.toLowerCase();
  if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
  const file = path.join(os.tmpdir(), `novaro-inline-${i + 1}.js`);
  fs.writeFileSync(file, body, "utf8");
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    checked++;
  } catch (error) {
    process.stderr.write(`Inline script #${i + 1} failed syntax validation.\\n`);
    process.stderr.write(error.stderr?.toString() || error.message);
    process.exit(1);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
if (!checked) throw new Error("No inline JavaScript blocks were checked.");
console.log(`Syntax OK: ${checked} inline JavaScript blocks checked.`);
