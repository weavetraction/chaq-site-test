// 차량 데이터(Vehicle Master) 트림 색인 — 견적 업로드 때 트림 자동 연결·연식 비교, 관리자 화면의 트림 검색에 사용
//  · DB 작업본(vm-store)이 읽히면 그것을 사용, 아니면 사이트의 pages/data/vehicle-master.js
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

type IdRow = { id: string; name?: string; hex?: string | null };
type Link = { trimId: string; optionId?: string; colorId?: string };
type VmSrc = { brands: Brand[]; models: Model[]; lineups: Lineup[]; trims: Trim[]; options?: IdRow[]; colors?: IdRow[]; trimOptions?: Link[]; trimColors?: Link[] };
let cache: { mtime: number; trims: Map<string, TrimInfo>; list: TrimInfo[]; options: Map<string, IdRow> | null; colors: Map<string, IdRow> | null; trimOpt: Map<string, Set<string>>; trimCol: Map<string, Set<string>> } | null = null;
let fromDb = false;

/** DB 작업본이 바뀔 때마다 vm-store 가 호출 */
export function setVmSource(M: VmSrc) { cache = build(M, -1); fromDb = true; }

function load() {
  if (fromDb && cache) return cache;
  const file = config.vehicleMasterPath;
  const st = fs.statSync(file);
  if (cache && cache.mtime === st.mtimeMs) return cache;
  const src = fs.readFileSync(file, "utf8");
  const i = src.indexOf("window.CHAQ_VEHICLE_MASTER =");
  if (i < 0) throw new Error("vehicle-master.js 형식을 알 수 없습니다: " + file);
  const json = src.slice(src.indexOf("=", i) + 1).trim().replace(/;\s*$/, "");
  cache = build(JSON.parse(json), st.mtimeMs);
  return cache;
}

function build(M: VmSrc, mtime: number) {
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
  // 옵션ID·색상ID 색인 (견적 양식 '옵션명@옵션ID'·'색상명@색상ID' 검증용, RL-19 #36). 공통본(분할 배포)에 options/colors 가 없으면 null = 검증 생략
  const options = M.options && M.options.length ? new Map(M.options.map((o) => [o.id, o])) : null;
  const colors = M.colors && M.colors.length ? new Map(M.colors.map((c) => [c.id, c])) : null;
  const trimOpt = new Map<string, Set<string>>(), trimCol = new Map<string, Set<string>>();
  for (const r of M.trimOptions || []) if (r.optionId) (trimOpt.get(r.trimId) || trimOpt.set(r.trimId, new Set()).get(r.trimId)!).add(r.optionId);
  for (const r of M.trimColors || []) if (r.colorId) (trimCol.get(r.trimId) || trimCol.set(r.trimId, new Set()).get(r.trimId)!).add(r.colorId);
  return { mtime, trims, list: [...trims.values()], options, colors, trimOpt, trimCol };
}

export const vm = {
  get(trimId: string | null | undefined): TrimInfo | null { if (!trimId) return null; return load().trims.get(trimId) || null; },
  /** 옵션ID 존재 여부: true/false, 색인이 없으면 null(검증 생략) */
  optionKnown(id: string): boolean | null { const c = load(); return c.options ? c.options.has(id) : null; },
  colorKnown(id: string): boolean | null { const c = load(); return c.colors ? c.colors.has(id) : null; },
  /** 그 트림에 연결된 옵션/색상인지 (색인 없으면 null) */
  trimHasOption(trimId: string, id: string): boolean | null { const c = load(); const s = c.trimOpt.get(trimId); return c.options ? !!(s && s.has(id)) : null; },
  trimHasColor(trimId: string, id: string): boolean | null { const c = load(); const s = c.trimCol.get(trimId); return c.colors ? !!(s && s.has(id)) : null; },
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
