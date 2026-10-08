// 견적 데이터 저장소: 업로드 묶음(batch) 생성·트림 연결·사이트 반영(publish)·공개 데이터 캐시
import type pg from "pg";
import { q, tx } from "../db.js";
import { setState, getState } from "./state.js";
import { vm } from "./vm.js";
import { KINDS, KIND_KO, KIND_PREFIX, Kind, QuoteRecord, ParsedRow, signature, signatureLoose, DISTS, TERMS, PLANS, INCL_KEYS, Incl } from "./quotes-format.js";

type Published = Record<Kind, QuoteRecord[]>;
/** 견적ID 의 번호 부분 (s15 → 15, 형식이 다르면 NULL) */
const REC_NO = `NULLIF(substring(rec_id from '^\\D*(\\d+)$'), '')::bigint`;
// 공개 데이터 캐시: 서버가 여러 대여도 DB 의 quotes_version 이 바뀌면 각 서버가 5초 안에 새로 읽음
let publicCache: { at: number; version: string; data: Published; js: string; json: string; etag: string } | null = null;
let checkedAt = 0;
export async function invalidatePublic() {
  publicCache = null;
  await setState("quotes_version");
}
async function quotesVersion() { return String((await getState("quotes_version")) || "0"); }

/** 사이트에 나가는 현재 견적 (종류별 최근 반영 batch) */
export async function getPublished(): Promise<Published> {
  if (publicCache && Date.now() - checkedAt < 5000) return publicCache.data;
  const version = await quotesVersion(); checkedAt = Date.now();
  if (publicCache && publicCache.version === version) return publicCache.data;
  const out: Published = { stock: [], fast: [], estimate: [] };
  // 차량 데이터 기준 모드(strict_master) batch 는 트림 미연결 행을 내보내지 않음
  const { rows } = await q(`SELECT r.kind, r.data FROM published_sets p JOIN quote_batches b ON b.id = p.batch_id JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind
    WHERE r.trim_id IS NOT NULL OR NOT b.strict_master ORDER BY r.kind, r.sort_order`);
  for (const r of rows) out[r.kind as Kind].push(r.data);
  const json = JSON.stringify(out);
  const head = `/* 차큐 견적 데이터 (API 생성 ${new Date().toISOString()}) — window.CHAQ = { stock, fast, estimate } */\n`;
  publicCache = { at: Date.now(), version, data: out, json, js: head + "window.CHAQ = " + json + ";\n", etag: `"${hash(json)}"` };
  return out;
}
export async function getPublicPayload() { await getPublished(); return publicCache!; }

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); }

/** 기존 데이터에서 '같은 차량 → 트림' 연결표 (최근 것 우선) */
async function linkMaps() {
  const { rows } = await q(`SELECT data, trim_id FROM quote_rows WHERE trim_id IS NOT NULL ORDER BY batch_id ASC`);
  const strict = new Map<string, string>(), loose = new Map<string, string>(), byId = new Map<string, any>();
  for (const r of rows) {
    strict.set(signature(r.data), r.trim_id); loose.set(signatureLoose(r.data), r.trim_id);
    byId.set(r.data.id + "|" + r.trim_id, r.data.vmLink);
  }
  return { strict, loose, byId };
}

const yearOf = (s: string) => { const m = String(s || "").match(/(20\d{2})/); return m ? Number(m[1]) : null; };
function makeVmLink(rec: QuoteRecord, trimId: string, how: string) {
  const t = vm.get(trimId); const qy = yearOf(rec.year), vy = t?.modelYear ?? null;
  return { status: "MATCHED", confidence: how === "MANUAL" ? "HIGH" : "MEDIUM", yearMatch: qy && vy ? qy === vy : null, quoteModelYear: qy, vmModelYear: vy, diffs: [], reason: `admin-${how.toLowerCase()}` };
}

export type LinkResult = { trimId: string | null; status: "LINKED" | "AUTO" | "MANUAL" | "UNLINKED" };

/** 업로드 행들로 DRAFT batch 생성 → 미리보기 요약 반환 */
export async function createBatch(parsed: ParsedRow[], meta: { fileName: string; adminId: number | null; source?: "UPLOAD" | "SEED" }) {
  const strict = (meta.source || "UPLOAD") !== "SEED";
  const maps = await linkMaps();
  const kinds = [...new Set(parsed.map((p) => p.kind))] as Kind[];
  // 견적ID 자동 부여: 종류별 접두어 + (기존 최대 번호 + 1)
  const maxNo: Record<string, number> = { stock: 0, fast: 0, estimate: 0 };
  for (const r of (await q(`SELECT kind, MAX(${REC_NO}) AS n FROM quote_rows GROUP BY kind`)).rows) maxNo[r.kind] = Number(r.n) || 0;
  const seen = new Set<string>(); const rows: { kind: Kind; rec: QuoteRecord; link: LinkResult; order: number }[] = [];
  const problems: { rowNo: number; errors: string[] }[] = [];
  parsed.forEach((p, i) => {
    if (p.errors.length) { problems.push({ rowNo: p.rowNo, errors: p.errors }); return; }
    const rec = p.rec;
    if (!rec.id) rec.id = KIND_PREFIX[p.kind] + (++maxNo[p.kind]);
    const key = p.kind + "|" + rec.id;
    if (seen.has(key)) { problems.push({ rowNo: p.rowNo, errors: [`견적ID ${rec.id} 중복`] }); return; } seen.add(key);
    let link: LinkResult = { trimId: null, status: "UNLINKED" };
    if (p.trimIdGiven) {
      if (vm.get(p.trimIdGiven)) link = { trimId: p.trimIdGiven, status: "MANUAL" };
      else { problems.push({ rowNo: p.rowNo, errors: [`트림ID '${p.trimIdGiven}' 가 차량 데이터에 없음 — 자동 연결 시도`] }); }
    }
    if (!link.trimId) { const t = maps.strict.get(signature(rec)) || maps.loose.get(signatureLoose(rec)); if (t && vm.get(t)) link = { trimId: t, status: "AUTO" }; }
    const ownVmLink = link.trimId && rec.trimId === link.trimId ? rec.vmLink : undefined;   // 기존 데이터(seed)의 연결 정보는 유지
    applyLink(rec, link, maps.byId.get(rec.id + "|" + link.trimId) || ownVmLink, strict);
    rows.push({ kind: p.kind, rec, link, order: i });
  });
  const blocking = problems.filter((x) => !x.errors.every((e) => e.includes("자동 연결 시도")));
  return tx(async (c) => {
    const b = await c.query(`INSERT INTO quote_batches (status, source, file_name, kinds, created_by, strict_master) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ["DRAFT", meta.source || "UPLOAD", meta.fileName, kinds, meta.adminId, strict]);
    const batchId = b.rows[0].id as number;
    for (const r of rows) await insertRow(c, batchId, r.kind, r.rec, r.link, r.order);
    const summary = await computeSummary(c, batchId, kinds, problems, strict);
    summary.blockingErrors = blocking.length;
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, summary]);
    return { batchId, summary };
  });
}

/** 차량 데이터 기준: 브랜드·모델·등급명을 연결된 트림 이름으로 (원래 적힌 이름은 srcName 에 보관) */
export function applyMaster(rec: QuoteRecord) {
  const t = vm.get(rec.trimId); if (!t) return rec;
  const orig = { brand: rec.brand, model: rec.model, trim: rec.trim };
  rec.brand = t.brandName; rec.model = t.modelName; rec.trim = t.trimName;
  if (orig.brand !== rec.brand || orig.model !== rec.model || orig.trim !== rec.trim) (rec as any).srcName = (rec as any).srcName || orig;
  rec.gu = t.domestic ? "국산" : "수입";
  return rec;
}

function applyLink(rec: QuoteRecord, link: LinkResult, prevVmLink?: unknown, strict = false) {
  rec.trimId = link.trimId || undefined as any;
  if (!link.trimId) {   // 미연결: 사이트 레코드 모양 유지 (trimId null + vmLink UNMATCHED)
    rec.trimId = null;
    const prev = (rec as any).vmLink; rec.vmLink = prev && (prev as any).status === "UNMATCHED" ? prev : { status: "UNMATCHED", confidence: "NONE", reason: "차량 데이터 트림 미지정" };
    return;
  }
  rec.vmLink = prevVmLink || makeVmLink(rec, link.trimId, link.status);
  const t = vm.get(link.trimId); if (t && rec.gu === undefined) rec.gu = t.domestic ? "국산" : "수입";
  if (strict) applyMaster(rec);
}

async function insertRow(c: pg.PoolClient, batchId: number, kind: Kind, rec: QuoteRecord, link: LinkResult, order: number) {
  await c.query(`INSERT INTO quote_rows (batch_id, kind, rec_id, sort_order, trim_id, link_status, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [batchId, kind, rec.id, order, link.trimId, link.status, rec]);
}

/** 미리보기 요약: 종류별 행 수·신규/삭제/금액 변경·트림 미연결 */
async function computeSummary(c: pg.PoolClient, batchId: number, kinds: Kind[], problems: { rowNo: number; errors: string[] }[], strict = false) {
  const per: Record<string, any> = {};
  for (const k of kinds) {
    const cur = await c.query(`SELECT rec_id, data FROM quote_rows WHERE batch_id = $1 AND kind = $2`, [batchId, k]);
    const pub = await c.query(`SELECT r.rec_id, r.data FROM published_sets p JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind WHERE p.kind = $1`, [k]);
    const old = new Map(pub.rows.map((r) => [r.rec_id, r.data]));
    let added = 0, changedPrice = 0, unlinked = 0;
    for (const r of cur.rows) {
      const o = old.get(r.rec_id); if (!o) added++; else if (JSON.stringify(o.cost) !== JSON.stringify(r.data.cost) || o.base !== r.data.base) changedPrice++;
      if (!r.data.trimId) unlinked++;
    }
    const now = new Set(cur.rows.map((r) => r.rec_id));
    per[k] = { rows: cur.rows.length, published: pub.rows.length, added, removed: [...old.keys()].filter((x) => !now.has(x)).length, changedPrice, unlinked };
  }
  return { kinds: per, problems: problems.slice(0, 200), problemCount: problems.length, blockingErrors: 0, strict } as any;
}

export async function refreshSummary(batchId: number) {
  return tx(async (c) => {
    const b = await c.query(`SELECT kinds, summary, strict_master FROM quote_batches WHERE id = $1`, [batchId]);
    if (!b.rows[0]) throw new Error("batch 없음");
    const s = await computeSummary(c, batchId, b.rows[0].kinds, b.rows[0].summary.problems || [], b.rows[0].strict_master);
    s.problemCount = b.rows[0].summary.problemCount || 0; s.blockingErrors = b.rows[0].summary.blockingErrors || 0;
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, s]);
    return s;
  });
}

/** 관리자가 행의 트림을 지정 (null 이면 연결 해제) */
export async function setRowTrim(batchId: number, kind: Kind, recId: string, trimId: string | null) {
  if (trimId && !vm.get(trimId)) throw Object.assign(new Error("차량 데이터에 없는 트림ID"), { status: 400 });
  const { rows } = await q(`SELECT data FROM quote_rows WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId]);
  if (!rows[0]) throw Object.assign(new Error("행 없음"), { status: 404 });
  const rec = rows[0].data as QuoteRecord; (rec as any).vmLink = undefined;
  const link: LinkResult = trimId ? { trimId, status: "MANUAL" } : { trimId: null, status: "UNLINKED" };
  const b = await q(`SELECT status, strict_master FROM quote_batches WHERE id = $1`, [batchId]);
  applyLink(rec, link, undefined, !!b.rows[0]?.strict_master);
  await q(`UPDATE quote_rows SET trim_id = $4, link_status = $5, data = $6 WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId, link.trimId, link.status, rec]);
  if (b.rows[0]?.status === "PUBLISHED") await invalidatePublic();
  return rec;
}

/** 사이트 반영: batch 에 들어 있는 종류를 이 batch 로 교체 (다른 종류는 그대로). 이전 batch 를 다시 반영하면 되돌리기 */
export async function publishBatch(batchId: number, adminId: number | null) {
  await tx(async (c) => {
    const b = await c.query(`SELECT id, status, kinds FROM quote_batches WHERE id = $1 FOR UPDATE`, [batchId]);
    if (!b.rows[0]) throw Object.assign(new Error("batch 없음"), { status: 404 });
    if (b.rows[0].status === "DISCARDED") throw Object.assign(new Error("폐기된 업로드는 반영할 수 없습니다"), { status: 400 });
    for (const k of b.rows[0].kinds as Kind[]) {
      await c.query(`INSERT INTO published_sets (kind, batch_id, published_at, published_by) VALUES ($1,$2,now(),$3)
                     ON CONFLICT (kind) DO UPDATE SET batch_id = EXCLUDED.batch_id, published_at = now(), published_by = EXCLUDED.published_by`, [k, batchId, adminId]);
    }
    await c.query(`UPDATE quote_batches SET status = 'PUBLISHED', published_at = now() WHERE id = $1`, [batchId]);
  });
  await invalidatePublic();
}

export async function discardBatch(batchId: number) {
  // 확인과 변경을 한 문장으로 (그 사이 반영돼도 '반영 중 + 폐기' 상태가 생기지 않게)
  const r = await q(`UPDATE quote_batches SET status = 'DISCARDED' WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM published_sets WHERE batch_id = $1) RETURNING id`, [batchId]);
  if (!r.rowCount) {
    const inUse = await q(`SELECT 1 FROM published_sets WHERE batch_id = $1`, [batchId]);
    if (inUse.rowCount) throw Object.assign(new Error("사이트에 나가고 있는 데이터는 폐기할 수 없습니다"), { status: 400 });
  }
}

export async function publishedStatus() {
  const { rows } = await q(`SELECT p.kind, p.batch_id, p.published_at, b.file_name, COUNT(r.*)::int AS rows, COUNT(r.trim_id)::int AS linked
    FROM published_sets p JOIN quote_batches b ON b.id = p.batch_id LEFT JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind
    GROUP BY p.kind, p.batch_id, p.published_at, b.file_name`);
  const out: Record<string, any> = {}; for (const k of KINDS) out[k] = rows.find((r) => r.kind === k) || null; return out;
}

// ---------------------------------------------------------------- 관리자 화면에서 직접 수정 (페이지별 작업본)
//  · 페이지(재고특가·빠른인도·견적조회)마다 작업본 1개: 현재 사이트 데이터를 복사해 시작 → 행 추가·수정·삭제 → '사이트 반영'
export class QuoteError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

/** 작업본 열기 (없으면 현재 사이트 데이터를 복사해 생성) */
export async function openEditDraft(kind: Kind, adminId: number | null, opts: { reset?: boolean } = {}) {
  return tx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(727100 + $1)`, [KINDS.indexOf(kind)]);
    const cur = await c.query(`SELECT id FROM quote_batches WHERE status = 'DRAFT' AND source = 'EDIT' AND kinds = ARRAY[$1]::text[] ORDER BY id DESC LIMIT 1`, [kind]);
    if (cur.rows[0] && !opts.reset) return { batchId: cur.rows[0].id as number, created: false };
    if (cur.rows[0]) await c.query(`UPDATE quote_batches SET status = 'DISCARDED' WHERE id = $1`, [cur.rows[0].id]);
    const b = await c.query(`INSERT INTO quote_batches (status, source, file_name, kinds, created_by, strict_master) VALUES ('DRAFT','EDIT',$1,ARRAY[$2]::text[],$3,true) RETURNING id`, [`화면 수정 (${KIND_KO[kind]})`, kind, adminId]);
    const batchId = b.rows[0].id as number;
    const pub = await c.query(`SELECT r.* FROM published_sets p JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind WHERE p.kind = $1 ORDER BY r.sort_order`, [kind]);
    for (const r of pub.rows) {
      const rec = r.data as QuoteRecord; if (r.trim_id) { rec.trimId = r.trim_id; applyMaster(rec); }
      await c.query(`INSERT INTO quote_rows (batch_id, kind, rec_id, sort_order, trim_id, link_status, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [batchId, kind, r.rec_id, r.sort_order, r.trim_id, r.link_status, rec]);
    }
    const s = await computeSummary(c, batchId, [kind], [], true);
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, s]);
    return { batchId, created: true };
  });
}

async function draftBatch(batchId: number) {
  const b = (await q(`SELECT id, status, kinds, strict_master FROM quote_batches WHERE id = $1`, [batchId])).rows[0];
  if (!b) throw new QuoteError("작업본 없음", 404);
  if (b.status !== "DRAFT") throw new QuoteError("이미 반영(또는 폐기)된 데이터는 고칠 수 없습니다 — 작업본을 새로 여세요");
  return b;
}

const toInt = (v: unknown, label: string, min = 0): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, ""));
  if (!Number.isFinite(n) || n < min) throw new QuoteError(`${label}: 숫자 오류 (${v})`);
  return Math.round(n);
};
const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/** 화면 입력 → 레코드 (형식 검사) */
export function cleanRecordInput(inp: any, prev: QuoteRecord | null): QuoteRecord {
  const rec: QuoteRecord = prev ? JSON.parse(JSON.stringify(prev)) : ({ id: "", brand: "", model: "", year: "", trim: "", opts: [], base: null, cost: {}, resid: {} } as QuoteRecord);
  for (const k of ["year", "ext", "int", "fuel", "seg", "fin"] as const) if (k in inp) (rec as any)[k] = s(inp[k]);
  if (!prev || "brand" in inp) { if ("brand" in inp) rec.brand = s(inp.brand); if ("model" in inp) rec.model = s(inp.model); if ("trim" in inp) rec.trim = s(inp.trim); }
  if ("base" in inp) { rec.base = toInt(inp.base, "차량가"); rec.vehiclePrice = rec.base; }
  if ("rem" in inp) { const r = toInt(inp.rem, "재고수"); if (r === null) delete rec.rem; else rec.rem = r; }
  if ("opts" in inp) {
    if (!Array.isArray(inp.opts)) throw new QuoteError("옵션 형식 오류");
    rec.opts = inp.opts.map((o: any) => ({ n: s(o?.n, 120), p: toInt(o?.p, "옵션가격") })).filter((o: any) => o.n).map((o: any) => (o.p ? { n: o.n, p: o.p } : { n: o.n }));
  }
  if ("incl" in inp) {
    const incl: Incl = {};
    for (const [k] of INCL_KEYS) { const v = inp.incl?.[k]; if (v === true || v === false) incl[k] = v; }
    if (Object.keys(incl).length) rec.incl = incl; else delete rec.incl;
  }
  if ("cost" in inp) {
    const cost: QuoteRecord["cost"] = {}; let n = 0;
    for (const d of DISTS) for (const t of TERMS) for (const [pk] of PLANS) { const v = toInt(inp.cost?.[d]?.[t]?.[pk], `월 납입금 ${d}만km ${t}개월`, 1); if (v !== null) { ((cost[d] ||= {})[t] ||= {})[pk] = v; n++; } }
    if (!n) throw new QuoteError("월 납입금을 하나 이상 입력하세요");
    rec.cost = cost;
  }
  if ("resid" in inp) {
    const resid: QuoteRecord["resid"] = {};
    for (const d of DISTS) for (const t of TERMS) { const v = toInt(inp.resid?.[d]?.[t], `잔가 ${d}만km ${t}개월`); if (v !== null) (resid[d] ||= {})[t] = v; }
    rec.resid = resid;
  }
  return rec;
}

/** 행 저장 (recId 없으면 새 행). trimId 를 주면 그 트림으로 연결 + 이름은 차량 데이터 기준 */
export async function saveDraftRow(batchId: number, kind: Kind, recId: string | null, inp: any) {
  const b = await draftBatch(batchId);
  if (!(b.kinds as string[]).includes(kind)) throw new QuoteError("이 작업본의 페이지가 아닙니다");
  let prev: any = null;
  if (recId) { prev = (await q(`SELECT data, trim_id FROM quote_rows WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId])).rows[0]; if (!prev) throw new QuoteError("행 없음", 404); }
  const rec = cleanRecordInput(inp || {}, prev?.data || null);
  if (!prev && !("cost" in (inp || {}))) throw new QuoteError("월 납입금을 하나 이상 입력하세요");
  const trimId = "trimId" in (inp || {}) ? (inp.trimId ? String(inp.trimId) : null) : (prev?.trim_id ?? null);
  if (trimId && !vm.get(trimId)) throw new QuoteError("차량 데이터에 없는 트림입니다");
  if (b.strict_master && !trimId) throw new QuoteError("차량(트림)을 선택하세요 — 브랜드·모델·등급명은 차량 데이터 기준입니다");
  const link: LinkResult = trimId ? { trimId, status: "MANUAL" } : { trimId: null, status: "UNLINKED" };
  if (!prev || prev.trim_id !== trimId) (rec as any).vmLink = undefined;
  applyLink(rec, link, prev && prev.trim_id === trimId ? prev.data.vmLink : undefined, b.strict_master);
  return tx(async (c) => {
    if (!recId) {
      await c.query(`SELECT pg_advisory_xact_lock(727011, hashtext($1))`, [kind]);   // 동시에 새 행을 만들어도 번호가 겹치지 않게
      const max = Number((await c.query(`SELECT MAX(${REC_NO}) AS n FROM quote_rows WHERE kind = $1`, [kind])).rows[0].n) || 0;
      rec.id = KIND_PREFIX[kind] + (max + 1);
      const so = (await c.query(`SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM quote_rows WHERE batch_id = $1 AND kind = $2`, [batchId, kind])).rows[0].n;
      await insertRow(c, batchId, kind, rec, link, so);
    } else {
      rec.id = recId;
      await c.query(`UPDATE quote_rows SET trim_id = $4, link_status = $5, data = $6 WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId, link.trimId, link.status, rec]);
    }
    await c.query(`UPDATE quote_batches SET updated_at = now() WHERE id = $1`, [batchId]);
    const sm = await computeSummary(c, batchId, b.kinds, [], b.strict_master);
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, sm]);
    return { rec, summary: sm };
  });
}

export async function deleteDraftRow(batchId: number, kind: Kind, recId: string) {
  const b = await draftBatch(batchId);
  return tx(async (c) => {
    const r = await c.query(`DELETE FROM quote_rows WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId]);
    if (!r.rowCount) throw new QuoteError("행 없음", 404);
    await c.query(`UPDATE quote_batches SET updated_at = now() WHERE id = $1`, [batchId]);
    const sm = await computeSummary(c, batchId, b.kinds, [], b.strict_master);
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, sm]);
    return sm;
  });
}

/** 행 순서 바꾸기 (recIds 순서대로) */
export async function reorderDraftRows(batchId: number, kind: Kind, recIds: string[]) {
  await draftBatch(batchId);
  await tx(async (c) => { for (let i = 0; i < recIds.length; i++) await c.query(`UPDATE quote_rows SET sort_order = $4 WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recIds[i], i]); });
}

export async function getRow(batchId: number, kind: Kind, recId: string) {
  const r = await q(`SELECT data, trim_id, link_status FROM quote_rows WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId]);
  return r.rows[0] || null;
}
