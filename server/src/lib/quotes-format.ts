// 견적 레코드 ↔ 엑셀 행 변환 (관리자 업로드·다운로드 양식)
//  사이트 레코드 모양(window.CHAQ): id, gu, brand, model, year, trim, ext, int, fuel, seg, fin, opts:[{n,p?}], base, rem,
//    cost[dist][term][plan]=월납입금, resid[dist][term]=잔가, vehiclePrice(=base), trimId, vmLink
export type Kind = "stock" | "fast" | "estimate";
export const KINDS: Kind[] = ["stock", "fast", "estimate"];
export const KIND_KO: Record<Kind, string> = { stock: "재고특가", fast: "빠른인도", estimate: "견적조회" };
export const KIND_PREFIX: Record<Kind, string> = { stock: "s", fast: "f", estimate: "e" };
export const DISTS = ["1", "2", "3"] as const;                 // 1만·2만·3만 km
export const TERMS = ["36", "48", "60"] as const;
export const PLANS = [["0", "0원"], ["b", "보증금"], ["s", "선납금"]] as const;

export type QuoteRecord = {
  id: string; gu?: string; brand: string; model: string; year: string; trim: string; ext?: string; int?: string; fuel?: string; seg?: string; fin?: string;
  opts: { n: string; p?: number }[]; base: number | null; rem?: number; cost: Record<string, Record<string, Record<string, number>>>;
  resid: Record<string, Record<string, number>>; vehiclePrice?: number | null; trimId?: string | null; vmLink?: unknown;
  incl?: Incl;   // 포함 사항 (선팅·블박·탁송) — 없으면 사이트 기본 표시
};
export const INCL_KEYS = [["tint", "선팅"], ["blackbox", "블박"], ["delivery", "탁송"]] as const;
export type Incl = Partial<Record<(typeof INCL_KEYS)[number][0], boolean>>;

const costCol = (d: string, t: string, pk: string) => `월_${d}만_${t}개월_${pk}`;
const residCol = (d: string, t: string) => `잔가_${d}만_${t}개월`;

/** 양식 열 (순서 고정). key = 레코드 필드 */
export const BASE_COLUMNS: { key: string; header: string; width: number; note?: string }[] = [
  { key: "kind", header: "구분", width: 10, note: "재고특가 / 빠른인도 / 견적조회" },
  { key: "id", header: "견적ID", width: 9, note: "비워두면 자동 부여 (기존 행은 그대로 두세요)" },
  { key: "brand", header: "브랜드", width: 10 },
  { key: "model", header: "모델", width: 18 },
  { key: "year", header: "연식/사양", width: 24 },
  { key: "trim", header: "등급", width: 26 },
  { key: "ext", header: "외장색", width: 14 },
  { key: "int", header: "내장색", width: 14 },
  { key: "fuel", header: "연료", width: 8 },
  { key: "seg", header: "차급", width: 8 },
  { key: "fin", header: "금융사", width: 12 },
  { key: "rem", header: "재고수", width: 7, note: "재고특가·빠른인도: 0 이면 목록에서 숨김" },
  { key: "base", header: "차량가", width: 12, note: "원 단위 숫자" },
  { key: "opts", header: "옵션", width: 40, note: "옵션명:가격 | 옵션명:가격 (가격 없으면 옵션명만)" },
  ...INCL_KEYS.map(([k, ko]) => ({ key: "incl." + k, header: ko, width: 6, note: `${ko} 포함 Y / 미포함 N (비우면 사이트 기본: 포함)` })),
  { key: "trimId", header: "차량데이터 트림ID", width: 30, note: "비워두면 같은 차량명으로 자동 연결 — 안 되면 관리자 화면에서 지정" },
];
export const COST_COLUMNS = DISTS.flatMap((d) => TERMS.flatMap((t) => PLANS.map(([pk, pko]) => ({ d, t, pk, header: costCol(d, t, pko) }))));
export const RESID_COLUMNS = DISTS.flatMap((d) => TERMS.map((t) => ({ d, t, header: residCol(d, t) })));
export const ALL_HEADERS = [...BASE_COLUMNS.map((c) => c.header), ...COST_COLUMNS.map((c) => c.header), ...RESID_COLUMNS.map((c) => c.header)];

export function optsToText(opts: QuoteRecord["opts"]) { return (opts || []).map((o) => (o.p ? `${o.n}:${o.p}` : o.n)).join(" | "); }
export function textToOpts(s: unknown): QuoteRecord["opts"] {
  return String(s ?? "").split(/\s*\|\s*|\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(.*?)\s*:\s*([\d,]+)\s*원?$/);
    return m ? { n: m[1].trim(), p: Number(m[2].replace(/,/g, "")) } : { n: x };
  });
}

/** 레코드 → 엑셀 한 행 (header → value) */
export function recordToRow(kind: Kind, r: QuoteRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const c of BASE_COLUMNS) {
    if (c.key === "kind") row[c.header] = KIND_KO[kind];
    else if (c.key === "opts") row[c.header] = optsToText(r.opts);
    else if (c.key.startsWith("incl.")) { const v = r.incl?.[c.key.slice(5) as keyof Incl]; row[c.header] = v === true ? "Y" : v === false ? "N" : ""; }
    else row[c.header] = (r as any)[c.key] ?? "";
  }
  for (const c of COST_COLUMNS) { const v = r.cost?.[c.d]?.[c.t]?.[c.pk]; row[c.header] = v ?? ""; }
  for (const c of RESID_COLUMNS) { const v = r.resid?.[c.d]?.[c.t]; row[c.header] = v ?? ""; }
  return row;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v).replace(/[,\s원]/g, ""); if (!s) return null;
  const n = Number(s); return Number.isFinite(n) ? Math.round(n) : NaN;
};
/** Y/N → true/false, 빈칸 → null */
export const yn = (v: unknown): boolean | null | "bad" => {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toUpperCase(); if (!s) return null;
  if (["Y", "O", "포함", "YES", "TRUE", "1"].includes(s)) return true;
  if (["N", "X", "미포함", "NO", "FALSE", "0"].includes(s)) return false;
  return "bad";
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export type ParsedRow = { kind: Kind; rec: QuoteRecord; rowNo: number; errors: string[]; trimIdGiven: string | null };

/** 엑셀 한 행 → 레코드 (형식 검사 포함) */
export function rowToRecord(row: Record<string, unknown>, rowNo: number): ParsedRow | null {
  const errors: string[] = [];
  const kindKo = str(row["구분"]);
  if (!kindKo && !str(row["모델"])) return null;                    // 빈 행
  const kind = (Object.keys(KIND_KO) as Kind[]).find((k) => KIND_KO[k] === kindKo || k === kindKo);
  if (!kind) errors.push(`구분 '${kindKo}' (재고특가·빠른인도·견적조회 중 하나)`);
  const rec: QuoteRecord = {
    id: str(row["견적ID"]), brand: str(row["브랜드"]), model: str(row["모델"]), year: str(row["연식/사양"]), trim: str(row["등급"]),
    ext: str(row["외장색"]), int: str(row["내장색"]), fuel: str(row["연료"]), seg: str(row["차급"]), fin: str(row["금융사"]),
    opts: textToOpts(row["옵션"]), base: null, cost: {}, resid: {},
  };
  if (!rec.brand) errors.push("브랜드 없음");
  if (!rec.model) errors.push("모델 없음");
  const base = num(row["차량가"]); if (Number.isNaN(base)) errors.push("차량가가 숫자가 아님"); else rec.base = base;
  rec.vehiclePrice = rec.base;
  const rem = num(row["재고수"]); if (Number.isNaN(rem)) errors.push("재고수가 숫자가 아님"); else if (rem !== null) rec.rem = rem;
  let costCount = 0;
  for (const c of COST_COLUMNS) {
    const v = num(row[c.header]); if (v === null) continue;
    if (Number.isNaN(v) || v <= 0) { errors.push(`${c.header} 값 오류`); continue; }
    ((rec.cost[c.d] ||= {})[c.t] ||= {})[c.pk] = v; costCount++;
  }
  for (const c of RESID_COLUMNS) {
    const v = num(row[c.header]); if (v === null) continue;
    if (Number.isNaN(v) || v < 0) { errors.push(`${c.header} 값 오류`); continue; }
    (rec.resid[c.d] ||= {})[c.t] = v;
  }
  if (!costCount) errors.push("월 납입금이 하나도 없음");
  const incl: Incl = {};
  for (const [k, ko] of INCL_KEYS) { const v = yn(row[ko]); if (v === "bad") errors.push(`${ko}: Y 또는 N`); else if (v !== null) incl[k] = v; }
  if (Object.keys(incl).length) rec.incl = incl;
  const trimIdGiven = str(row["차량데이터 트림ID"]) || null;
  return { kind: (kind || "estimate") as Kind, rec, rowNo, errors, trimIdGiven };
}

/** 같은 차량 판정용 서명 (브랜드·모델·연식·등급, 공백·기호 무시) */
export const nz = (s: unknown) => String(s ?? "").toLowerCase().replace(/[\s·,()\[\]\-_/.]/g, "");
export const signature = (r: Pick<QuoteRecord, "brand" | "model" | "year" | "trim">) => [nz(r.brand), nz(r.model), nz(r.year), nz(r.trim)].join("|");
export const signatureLoose = (r: Pick<QuoteRecord, "brand" | "model" | "trim">) => [nz(r.brand), nz(r.model), nz(r.trim)].join("|");
