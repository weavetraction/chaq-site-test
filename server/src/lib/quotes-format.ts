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
  opts: { n: string; p?: number; id?: string }[]; base: number | null;   // id = 차량 데이터 옵션ID(마스터 참조, RL-19 #36) — 양식 토큰 '옵션명@옵션ID:가격'
  extId?: string | null; intId?: string | null;   // 외장·내장 색상의 차량 데이터 색상ID (양식 '색상명@색상ID') — 없으면 이름만(미매칭)
  rem?: number; cost: Record<string, Record<string, Record<string, number>>>;
  resid: Record<string, Record<string, number>>; vehiclePrice?: number | null; trimId?: string | null; vmLink?: unknown;
  incl?: Incl;   // 포함 사항 (선팅·블박·탁송) — 없으면 사이트 기본 표시
  optCoef?: Record<string, Record<string, Record<string, number>>> | null;   // 옵션 증분 계수 (원/100만원, cost 와 같은 [거리][기간][초기유형] 모양) — 견적조회 옵션 선택 시 예상 월납 역산용(07-1 v1.7)
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
  { key: "ext", header: "외장색", width: 14, note: "색상명@색상ID (차량 데이터 색상ID, 게이트가 채움) — ID 없으면 이름만 표시·기본 이미지" },
  { key: "int", header: "내장색", width: 14, note: "색상명@색상ID" },
  { key: "fuel", header: "연료", width: 8 },
  { key: "seg", header: "차급", width: 8 },
  { key: "fin", header: "금융사", width: 12 },
  { key: "rem", header: "재고수", width: 7, note: "재고특가·빠른인도: 0 이면 목록에서 숨김" },
  { key: "base", header: "차량가", width: 12, note: "원 단위 숫자" },
  { key: "opts", header: "옵션", width: 40, note: "옵션명@옵션ID:가격 | … (옵션ID = 차량 데이터 옵션ID, 게이트가 채움. ID 없으면 사이트에 '기타(옵션명)'로 표시. 가격 없으면 옵션명만, 할인은 음수 — 예: 대리점 할인 5%:-3031500)" },
  ...INCL_KEYS.map(([k, ko]) => ({ key: "incl." + k, header: ko, width: 6, note: `${ko} 포함 Y / 미포함 N (비우면 사이트 기본: 포함)` })),
  { key: "trimId", header: "차량데이터 트림ID", width: 30, note: "비워두면 같은 차량명으로 자동 연결 — 안 되면 관리자 화면에서 지정" },
];
export const COST_COLUMNS = DISTS.flatMap((d) => TERMS.flatMap((t) => PLANS.map(([pk, pko]) => ({ d, t, pk, header: costCol(d, t, pko) }))));
export const RESID_COLUMNS = DISTS.flatMap((d) => TERMS.map((t) => ({ d, t, header: residCol(d, t) })));
/** 뒤쪽 추가 열 (월납·잔가 열 순서를 바꾸지 않도록 맨 끝) */
export const OPT_COEF_HEADER = "옵션증분계수";
export const EXTRA_COLUMNS: { key: string; header: string; width: number; note?: string }[] = [
  { key: "optCoef", header: OPT_COEF_HEADER, width: 44, note: "옵션 100만원당 월 납입금 증가(원) 27칸을 | 로 연결 — 순서 = 월납 27열 순서(1만·2만·3만 × 36·48·60 × 0원·보증금·선납금). 견적기 금융사는 견적기로 산출, 비우면 금융사 공통 계수 → 그것도 없으면 옵션 선택 시 월납은 기본 사양 기준" },
];
export const ALL_HEADERS = [...BASE_COLUMNS.map((c) => c.header), ...COST_COLUMNS.map((c) => c.header), ...RESID_COLUMNS.map((c) => c.header), ...EXTRA_COLUMNS.map((c) => c.header)];
/** 옵션증분계수 ↔ 텍스트 (27칸, 월납 열 순서) */
export function coefToText(k: QuoteRecord["optCoef"]) {
  if (!k) return "";
  const vals = COST_COLUMNS.map((c) => { const v = k?.[c.d]?.[c.t]?.[c.pk]; return v == null ? "" : String(v); });
  return vals.some(Boolean) ? vals.join("|") : "";
}
export function textToCoef(s: unknown): { coef: QuoteRecord["optCoef"]; error?: string } {
  const raw = String(s ?? "").trim();
  if (!raw) return { coef: null };
  const parts = raw.split("|").map((x) => x.trim());
  if (parts.length !== COST_COLUMNS.length) return { coef: null, error: `${OPT_COEF_HEADER}: 27칸이어야 함 (${parts.length}칸)` };
  const coef: NonNullable<QuoteRecord["optCoef"]> = {}; let n = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    const v = Number(parts[i].replace(/[,\s원]/g, ""));
    if (!Number.isFinite(v) || v < 0 || v > 200000) return { coef: null, error: `${OPT_COEF_HEADER}: ${i + 1}번째 값 오류 (${parts[i]})` };
    const c = COST_COLUMNS[i]; ((coef[c.d] ||= {})[c.t] ||= {})[c.pk] = Math.round(v); n++;
  }
  return { coef: n ? coef : null };
}

/** 'ID 토큰' 분리: '어비스 블랙 펄@hyundai-color-xb9' → { name, id } (08 §3 ID 토큰 형식 — ID 는 @ · : · | 를 포함하지 않음) */
export const ID_RE = /^(.*?)\s*@\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/;
export function splitIdTok(s: unknown): { name: string; id: string | null } {
  const raw = String(s ?? "").trim(); const m = raw.match(ID_RE);
  return m ? { name: m[1].trim(), id: m[2] } : { name: raw, id: null };
}
export const joinIdTok = (name: string | undefined | null, id: string | undefined | null) => (id ? `${name || ""}@${id}` : name || "");
/** 옵션 칸 특수 토큰 종류 (사이트 로직 지시 2호 ①·③, RL-41) — 사이트 site-util.tokKind 와 같은 규칙.
 *  tax = 세제혜택:-N (구 '하이브리드 세제혜택' 호환) / pdisc = 차량가 할인:-N · 할인:-N (구 '대리점 할인 n%' 호환) / mdisc = 월납입료 할인(금액 없음) / opt = 그 외 */
export function tokKind(o: { n?: string; p?: number } | null | undefined): "tax" | "pdisc" | "mdisc" | "opt" {
  if (!o || !o.n) return "opt";
  const n = String(o.n).replace(/\s+/g, " ").trim(), p = Number(o.p);
  if (/^(하이브리드 )?세제혜택$/.test(n)) return "tax";
  if (/^월납입료 할인$/.test(n)) return "mdisc";
  if (/^(차량가 할인|할인)$/.test(n) || /^대리점 할인/.test(n)) return "pdisc";
  if (p < 0) return "pdisc";
  if (/할인/.test(n) && !(p > 0)) return "mdisc";
  return "opt";
}
export function optsToText(opts: QuoteRecord["opts"]) { return (opts || []).map((o) => { const h = joinIdTok(o.n, o.id); return o.p ? `${h}:${o.p}` : h; }).join(" | "); }
export function textToOpts(s: unknown): QuoteRecord["opts"] {
  return String(s ?? "").split(/\s*\|\s*|\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => {
    // 금액이 음수면 할인 항목 (예: '대리점 할인 5%:-3031500') — 사이트에서 옵션이 아니라 '할인' 줄로 표시
    const m = x.match(/^(.*?)\s*:\s*([-−–+]?)\s*([\d,]+)\s*원?$/);   // '+' 접두(게이트의 '기타(차액):+60000') 허용
    const head = splitIdTok(m ? m[1] : x);
    const o: QuoteRecord["opts"][number] = { n: head.name };
    if (head.id) o.id = head.id;
    if (m) o.p = (m[2] && m[2] !== "+" ? -1 : 1) * Number(m[3].replace(/,/g, ""));
    return o;
  });
}

/** 레코드 → 엑셀 한 행 (header → value) */
export function recordToRow(kind: Kind, r: QuoteRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const c of BASE_COLUMNS) {
    if (c.key === "kind") row[c.header] = KIND_KO[kind];
    else if (c.key === "opts") row[c.header] = optsToText(r.opts);
    else if (c.key === "ext") row[c.header] = joinIdTok(r.ext, r.extId);
    else if (c.key === "int") row[c.header] = joinIdTok(r.int, r.intId);
    else if (c.key.startsWith("incl.")) { const v = r.incl?.[c.key.slice(5) as keyof Incl]; row[c.header] = v === true ? "Y" : v === false ? "N" : ""; }
    else row[c.header] = (r as any)[c.key] ?? "";
  }
  for (const c of COST_COLUMNS) { const v = r.cost?.[c.d]?.[c.t]?.[c.pk]; row[c.header] = v ?? ""; }
  for (const c of RESID_COLUMNS) { const v = r.resid?.[c.d]?.[c.t]; row[c.header] = v ?? ""; }
  row[OPT_COEF_HEADER] = coefToText(r.optCoef);
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
    ext: "", int: "", fuel: str(row["연료"]), seg: str(row["차급"]), fin: str(row["금융사"]),
    opts: textToOpts(row["옵션"]), base: null, cost: {}, resid: {},
  };
  const ex = splitIdTok(row["외장색"]), ic = splitIdTok(row["내장색"]);
  rec.ext = ex.name; rec.int = ic.name; if (ex.id) rec.extId = ex.id; if (ic.id) rec.intId = ic.id;
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
  const kc = textToCoef(row[OPT_COEF_HEADER]); if (kc.error) errors.push(kc.error); else if (kc.coef) rec.optCoef = kc.coef;
  const trimIdGiven = str(row["차량데이터 트림ID"]) || null;
  return { kind: (kind || "estimate") as Kind, rec, rowNo, errors, trimIdGiven };
}

/** 같은 차량 판정용 서명 (브랜드·모델·연식·등급, 공백·기호 무시) */
export const nz = (s: unknown) => String(s ?? "").toLowerCase().replace(/[\s·,()\[\]\-_/.]/g, "");
export const signature = (r: Pick<QuoteRecord, "brand" | "model" | "year" | "trim">) => [nz(r.brand), nz(r.model), nz(r.year), nz(r.trim)].join("|");
export const signatureLoose = (r: Pick<QuoteRecord, "brand" | "model" | "trim">) => [nz(r.brand), nz(r.model), nz(r.trim)].join("|");
