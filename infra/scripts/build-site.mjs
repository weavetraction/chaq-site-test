// 사이트 배포본 만들기: 저장소에서 사이트 파일만 dist-site/ 로 복사 + 환경별 api-config.js 작성
//   SITE_API_BASE=https://chaq.kr CHANNEL_PLUGIN_KEY=... GTM_ID=GTM-XXXX node infra/scripts/build-site.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "dist-site");
const INCLUDE = ["index.html", "manifest.json", "robots.txt", "pages", "assets", "font", "scripts", "stylesheets"];
const SKIP = /(\.bak[^/]*|\.tmp|\.md|\.csv|\.DS_Store)$/i;

fs.rmSync(OUT, { recursive: true, force: true });
let n = 0;
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); return; }
  if (SKIP.test(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++;
}
for (const f of INCLUDE) if (fs.existsSync(path.join(ROOT, f))) copy(path.join(ROOT, f), path.join(OUT, f));

const cfg = {
  base: process.env.SITE_API_BASE || "",
  channelPluginKey: process.env.CHANNEL_PLUGIN_KEY || "",
  channelButton: process.env.CHANNEL_BUTTON === "true",
  gtmId: process.env.GTM_ID || "",
};
const file = path.join(OUT, "pages/data/api-config.js");
const orig = fs.readFileSync(file, "utf8");
const header = orig.slice(0, orig.indexOf("window.CHAQ_API"));
fs.writeFileSync(file, header + "window.CHAQ_API = " + JSON.stringify(cfg, null, 2) + ";\n");
console.log(`[build-site] ${n} files → dist-site/  api-config:`, JSON.stringify({ ...cfg, channelPluginKey: cfg.channelPluginKey ? "(set)" : "" }));
