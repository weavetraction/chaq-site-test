// 차량 데이터(Vehicle Master) 공통본 읽기 — 사이트의 pages/data/vehicle-master.js 를 그대로 사용
//  · 견적 업로드 때 트림 자동 연결·연식 비교, 관리자 화면의 트림 검색에 사용
import fs from "node:fs";
import { config } from "../config.js";

type Brand = { id: string; nameKo: string; domesticImport?: string };
type Model = { id: string; brandId: string; nameKo: string };
type Lineup = { id: string; modelId: string; shortLabel?: string; displayName?: string; modelYear?: number; salesChannel?: string };
type Trim = { id: string; lineupId: string; name: string; drivetrain?: string | null; driveLabel?: string; seatCount?: number | null; status?: string };

export type TrimInfo = {
  trimId: string; brandId: string; brandName: string; modelId: string; modelName: string; lineupLabel: string;
  trimName: string; modelYear: number | null; domestic: boolean; label: string; channel: string;
};

let cache: { mtime: number; trims: Map<string, TrimInfo>; list: TrimInfo[] } | null = null;

function load() {
  const file = config.vehicleMasterPath;
  const st = fs.statSync(file);
  if (cache && cache.mtime === st.mtimeMs) return cache;
  const src = fs.readFileSync(file, "utf8");
  const i = src.indexOf("window.CHAQ_VEHICLE_MASTER =");
  if (i < 0) throw new Error("vehicle-master.js 형식을 알 수 없습니다: " + file);
  const json = src.slice(src.indexOf("=", i) + 1).trim().replace(/;\s*$/, "");
  const M = JSON.parse(json) as { brands: Brand[]; models: Model[]; lineups: Lineup[]; trims: Trim[] };
  const B = new Map(M.brands.map((b) => [b.id, b])), MO = new Map(M.models.map((m) => [m.id, m])), L = new Map(M.lineups.map((l) => [l.id, l]));
  const trims = new Map<string, TrimInfo>();
  for (const t of M.trims) {
    const l = L.get(t.lineupId); const m = l && MO.get(l.modelId); const b = m && B.get(m.brandId);
    if (!l || !m || !b) continue;
    const car = m.nameKo.indexOf(b.nameKo + " ") === 0 ? m.nameKo : `${b.nameKo} ${m.nameKo}`;
    const extra = [t.seatCount && !/인승/.test(l.shortLabel || "") ? `${t.seatCount}인승` : "", t.driveLabel || t.drivetrain || ""].filter(Boolean).join(" · ");
    const info: TrimInfo = {
      trimId: t.id, brandId: b.id, brandName: b.nameKo, modelId: m.id, modelName: m.nameKo, lineupLabel: l.shortLabel || l.displayName || "",
      trimName: t.name, modelYear: l.modelYear ?? null, domestic: b.domesticImport !== "IMPORT", channel: l.salesChannel || "GENERAL",
      label: [car, l.shortLabel, extra, t.name].filter(Boolean).join(" · "),
    };
    trims.set(t.id, info);
  }
  cache = { mtime: st.mtimeMs, trims, list: [...trims.values()] };
  return cache;
}

export const vm = {
  get(trimId: string | null | undefined): TrimInfo | null { if (!trimId) return null; return load().trims.get(trimId) || null; },
  count() { return load().list.length; },
  /** 공백 무시 부분 일치 검색 (모든 단어 포함) */
  search(qs: string, limit = 30): TrimInfo[] {
    const words = String(qs || "").toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/\s/g, ""));
    if (!words.length) return [];
    const out: TrimInfo[] = [];
    for (const t of load().list) {
      const hay = (t.label + " " + t.trimId).toLowerCase().replace(/\s/g, "");
      if (words.every((w) => hay.includes(w))) { out.push(t); if (out.length >= limit) break; }
    }
    return out;
  },
};
