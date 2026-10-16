// 사이트 배포본 만들기: 저장소에서 사이트 파일만 dist-site/ 로 복사 + 환경별 api-config.js 작성
//   SITE_API_BASE=https://chaq.co.kr CHANNEL_PLUGIN_KEY=... GTM_ID=GTM-XXXX node infra/scripts/build-site.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "dist-site");
const INCLUDE = ["index.html", "robots.txt", "sitemap.xml", "favicon.ico", "pages", "assets", "font", "scripts", "stylesheets"];
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

// 카드용 작은 차량 이미지(*.w480.webp, #53): 새로 추가된 차량 이미지에 작은 이미지가 아직 없으면 원본을 그 이름으로 복사 (깨진 이미지 방지)
// 작은 이미지 만들기: python3 infra/scripts/vehicle-thumbs.py
let thumbMissing = 0;
(function walkV(d) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { walkV(p); continue; }
    if (!/\.webp$/.test(f) || /\.w480\.webp$/.test(f)) continue;
    const t = p.replace(/\.webp$/, ".w480.webp");
    if (!fs.existsSync(t)) { fs.copyFileSync(p, t); thumbMissing++; }
  }
})(path.join(OUT, "assets/vehicles"));
if (thumbMissing) console.warn(`[build-site] 작은 차량 이미지 없음 ${thumbMissing}개 → 원본으로 대체 (python3 infra/scripts/vehicle-thumbs.py 로 만들어 커밋하세요)`);

// 차량 이미지 버전: assets/vehicles 내용이 바뀌면 값이 바뀜 → 이미지 주소 뒤 ?v= 로 붙여 브라우저 캐시(7일)에 남은 옛 이미지 대신 새 이미지
function dirHash(dir) {
  const h = crypto.createHash("sha1");
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (!SKIP.test(p)) { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); } } };
  if (fs.existsSync(dir)) walk(dir);
  return h.digest("hex").slice(0, 8);
}
const cfg = {
  base: process.env.SITE_API_BASE || "",
  imgVer: dirHash(path.join(ROOT, "assets/vehicles")),
  channelPluginKey: process.env.CHANNEL_PLUGIN_KEY || "",
  channelButton: process.env.CHANNEL_BUTTON === "true",
  gtmId: process.env.GTM_ID || "",
};
const file = path.join(OUT, "pages/data/api-config.js");
const orig = fs.readFileSync(file, "utf8");
const header = orig.slice(0, orig.indexOf("window.CHAQ_API"));
fs.writeFileSync(file, header + "window.CHAQ_API = " + JSON.stringify(cfg, null, 2) + ";\n");
console.log(`[build-site] ${n} files → dist-site/  api-config:`, JSON.stringify({ ...cfg, channelPluginKey: cfg.channelPluginKey ? "(set)" : "" }));
