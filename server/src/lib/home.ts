// 3단계: 메인 화면 설정 — 섹션별 노출(자동/직접 선택) · 상단 배너 · 중간 띠배너(메뉴 페이지 배너와 공통)
//  · 관리자 저장 → 바로 반영 (사이트는 /api/pub/home.js 의 window.CHAQ_HOME 을 읽음, 캐시 1분)
//  · 설정이 없거나 API 를 못 읽으면 사이트는 지금 모습(자동 규칙·기본 배너) 그대로
import { q } from "../db.js";
import { setState, getState } from "./state.js";

export class HomeError extends Error { constructor(msg: string, public status = 400) { super(msg); } }
export const SECTIONS = ["stock", "fast", "review", "faq"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_KO: Record<Section, string> = { stock: "장기렌트 재고특가", fast: "장기렌트 빠른인도", review: "차큐 이용후기", faq: "자주 묻는 질문" };
const MAX_COUNT: Record<Section, number> = { stock: 30, fast: 30, review: 10, faq: 10 };

export type Banner = { id: string; img: string; alt: string; href: string; start: string | null; end: string | null; visible: boolean };
export type HomeConfig = {
  sections: Record<Section, { mode: "auto" | "pick"; ids: string[]; count: number | null }>;
  heroBanners: Banner[];
  midBanners: Banner[];
};
const empty = (): HomeConfig => ({ sections: Object.fromEntries(SECTIONS.map((s) => [s, { mode: "auto", ids: [], count: null }])) as any, heroBanners: [], midBanners: [] });

const SAFE_URL = /^(https?:\/\/|\/|\.\.\/|#|pages\/|[a-z0-9_\-]+\.html)/i;   // 사이트 페이지(pages/…) 링크 허용
const S = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const ymd = (v: unknown, label: string) => { const s = S(v, 20).replace(/\./g, "-"); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HomeError(`${label} 형식 오류 (예: 2026-10-01)`); return s; };

function cleanBanners(list: unknown, label: string): Banner[] {
  if (!Array.isArray(list)) return [];
  if (list.length > 10) throw new HomeError(`${label}는 최대 10개입니다`);
  return list.map((b: any, i: number) => {
    const img = S(b?.img, 500); if (!img || !SAFE_URL.test(img)) throw new HomeError(`${label} ${i + 1}번: 이미지를 올려 주세요`);
    const href = S(b?.href, 300); if (href && !SAFE_URL.test(href)) throw new HomeError(`${label} ${i + 1}번: 링크 형식 오류 (https://… 또는 사이트 페이지)`);
    const start = ymd(b?.start, `${label} ${i + 1}번 시작일`), end = ymd(b?.end, `${label} ${i + 1}번 종료일`);
    if (start && end && end < start) throw new HomeError(`${label} ${i + 1}번: 종료일이 시작일보다 빠릅니다`);
    return { id: S(b?.id, 40) || Math.random().toString(36).slice(2, 10), img, alt: S(b?.alt, 80), href, start, end, visible: b?.visible !== false };
  });
}
export function cleanConfig(inp: any): HomeConfig {
  const out = empty();
  for (const s of SECTIONS) {
    const v = inp?.sections?.[s] || {};
    const ids = (Array.isArray(v.ids) ? v.ids : []).map((x: unknown) => S(x, 60)).filter(Boolean);
    const mode = v.mode === "pick" ? "pick" : "auto";
    if (mode === "pick" && !ids.length) throw new HomeError(`${SECTION_KO[s]}: 직접 선택이면 항목을 하나 이상 고르세요`);
    const count = v.count == null || v.count === "" ? null : Math.round(Number(v.count));
    if (count !== null && !(count >= 1 && count <= MAX_COUNT[s])) throw new HomeError(`${SECTION_KO[s]}: 노출 개수는 1~${MAX_COUNT[s]}`);
    out.sections[s] = { mode, ids: [...new Set(ids)].slice(0, 60) as string[], count };
  }
  out.heroBanners = cleanBanners(inp?.heroBanners, "상단 배너");
  out.midBanners = cleanBanners(inp?.midBanners, "중간 띠배너");
  return out;
}

export async function getConfig(): Promise<HomeConfig & { updatedAt?: string }> {
  const r = await q(`SELECT value, updated_at FROM site_settings WHERE key = 'home'`);
  if (!r.rowCount) return empty();
  return { ...empty(), ...r.rows[0].value, updatedAt: r.rows[0].updated_at };
}
export async function saveConfig(inp: any, adminId: number | null) {
  const cfg = cleanConfig(inp);
  await q(`INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('home', $1, now(), $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`, [cfg, adminId]);
  await setState("home_version");
  pub = null;
  return cfg;
}

// ---------------------------------------------------------------- 공개 (오늘 날짜에 맞는 노출 배너만)
let pub: { version: string; js: string; etag: string; day: string } | null = null;
let checkedAt = 0;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
export async function publicHome() {
  const day = today();
  if (pub && pub.day === day && Date.now() - checkedAt < 10_000) return pub;
  const version = String((await getState("home_version")) || "0"); checkedAt = Date.now();
  if (pub && pub.version === version && pub.day === day) return pub;
  const cfg = await getConfig();
  const live = (b: Banner) => b.visible && (!b.start || b.start <= day) && (!b.end || b.end >= day);
  const out = {
    sections: cfg.sections,
    heroBanners: cfg.heroBanners.filter(live).map(({ img, alt, href }) => ({ img, alt, href })),
    midBanners: cfg.midBanners.filter(live).map(({ img, alt, href }) => ({ img, alt, href })),
    configured: version !== "0",
  };
  const fix = String.raw`(function(w){var s=document.currentScript&&document.currentScript.src,o=s?s.replace(/\/api\/pub\/.*$/,""):"";if(!o||!w.CHAQ_HOME)return;[w.CHAQ_HOME.heroBanners,w.CHAQ_HOME.midBanners].forEach(function(a){(a||[]).forEach(function(b){if(/^\/api\//.test(b.img))b.img=o+b.img;});});})(window);` + "\n";
  pub = { version, day, etag: `"home${version}-${day}"`, js: `/* 차큐 메인 화면 설정 (API 생성 ${new Date().toISOString()}) */\nwindow.CHAQ_HOME = ${JSON.stringify(out)};\n` + fix };
  return pub;
}
