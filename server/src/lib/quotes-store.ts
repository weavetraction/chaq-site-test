// 견적 데이터 저장소: 업로드 묶음(batch) 생성·트림 연결·사이트 반영(publish)·공개 데이터 캐시
import type pg from "pg";
import { q, tx } from "../db.js";
import { vm } from "./vm.js";
import { KINDS, KIND_PREFIX, Kind, QuoteRecord, ParsedRow, signature, signatureLoose } from "./quotes-format.js";

type Published = Record<Kind, QuoteRecord[]>;
// 공개 데이터 캐시: 서버가 여러 대여도 DB 의 quotes_version 이 바뀌면 각 서버가 5초 안에 새로 읽음
let publicCache: { at: number; version: string; data: Published; js: string; json: string; etag: string } | null = null;
let checkedAt = 0;
export async function invalidatePublic() {
  publicCache = null;
  await q(`INSERT INTO app_state (key, value, updated_at) VALUES ('quotes_version', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [String(Date.now())]);
}
async function quotesVersion() { const r = await q(`SELECT value FROM app_state WHERE key = 'quotes_version'`); return String(r.rows[0]?.value || "0"); }

/** 사이트에 나가는 현재 견적 (종류별 최근 반영 batch) */
export async function getPublished(): Promise<Published> {
  if (publicCache && Date.now() - checkedAt < 5000) return publicCache.data;
  const version = await quotesVersion(); checkedAt = Date.now();
  if (publicCache && publicCache.version === version) return publicCache.data;
  const out: Published = { stock: [], fast: [], estimate: [] };
  const { rows } = await q(`SELECT r.kind, r.data FROM published_sets p JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind ORDER BY r.kind, r.sort_order`);
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
  const maps = await linkMaps();
  const kinds = [...new Set(parsed.map((p) => p.kind))] as Kind[];
  // 견적ID 자동 부여: 종류별 접두어 + (기존 최대 번호 + 1)
  const { rows: maxRows } = await q(`SELECT kind, rec_id FROM quote_rows`);
  const maxNo: Record<string, number> = { stock: 0, fast: 0, estimate: 0 };
  for (const r of maxRows) { const n = Number(String(r.rec_id).replace(/^\D+/, "")); if (n > maxNo[r.kind]) maxNo[r.kind] = n; }
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
    applyLink(rec, link, maps.byId.get(rec.id + "|" + link.trimId) || ownVmLink);
    rows.push({ kind: p.kind, rec, link, order: i });
  });
  const blocking = problems.filter((x) => !x.errors.every((e) => e.includes("자동 연결 시도")));
  return tx(async (c) => {
    const b = await c.query(`INSERT INTO quote_batches (status, source, file_name, kinds, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      ["DRAFT", meta.source || "UPLOAD", meta.fileName, kinds, meta.adminId]);
    const batchId = b.rows[0].id as number;
    for (const r of rows) await insertRow(c, batchId, r.kind, r.rec, r.link, r.order);
    const summary = await computeSummary(c, batchId, kinds, problems);
    summary.blockingErrors = blocking.length;
    await c.query(`UPDATE quote_batches SET summary = $2 WHERE id = $1`, [batchId, summary]);
    return { batchId, summary };
  });
}

function applyLink(rec: QuoteRecord, link: LinkResult, prevVmLink?: unknown) {
  rec.trimId = link.trimId || undefined as any;
  if (!link.trimId) {   // 미연결: 사이트 레코드 모양 유지 (trimId null + vmLink UNMATCHED)
    rec.trimId = null;
    const prev = (rec as any).vmLink; rec.vmLink = prev && (prev as any).status === "UNMATCHED" ? prev : { status: "UNMATCHED", confidence: "NONE", reason: "차량 데이터 트림 미지정" };
    return;
  }
  rec.vmLink = prevVmLink || makeVmLink(rec, link.trimId, link.status);
  const t = vm.get(link.trimId); if (t && rec.gu === undefined) rec.gu = t.domestic ? "국산" : "수입";
}

async function insertRow(c: pg.PoolClient, batchId: number, kind: Kind, rec: QuoteRecord, link: LinkResult, order: number) {
  await c.query(`INSERT INTO quote_rows (batch_id, kind, rec_id, sort_order, trim_id, link_status, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [batchId, kind, rec.id, order, link.trimId, link.status, rec]);
}

/** 미리보기 요약: 종류별 행 수·신규/삭제/금액 변경·트림 미연결 */
async function computeSummary(c: pg.PoolClient, batchId: number, kinds: Kind[], problems: { rowNo: number; errors: string[] }[]) {
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
  return { kinds: per, problems: problems.slice(0, 200), problemCount: problems.length, blockingErrors: 0 } as any;
}

export async function refreshSummary(batchId: number) {
  return tx(async (c) => {
    const b = await c.query(`SELECT kinds, summary FROM quote_batches WHERE id = $1`, [batchId]);
    if (!b.rows[0]) throw new Error("batch 없음");
    const s = await computeSummary(c, batchId, b.rows[0].kinds, b.rows[0].summary.problems || []);
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
  applyLink(rec, link);
  await q(`UPDATE quote_rows SET trim_id = $4, link_status = $5, data = $6 WHERE batch_id = $1 AND kind = $2 AND rec_id = $3`, [batchId, kind, recId, link.trimId, link.status, rec]);
  const b = await q(`SELECT status FROM quote_batches WHERE id = $1`, [batchId]);
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
  const inUse = await q(`SELECT 1 FROM published_sets WHERE batch_id = $1`, [batchId]);
  if (inUse.rowCount) throw Object.assign(new Error("사이트에 나가고 있는 데이터는 폐기할 수 없습니다"), { status: 400 });
  await q(`UPDATE quote_batches SET status = 'DISCARDED' WHERE id = $1`, [batchId]);
}

export async function publishedStatus() {
  const { rows } = await q(`SELECT p.kind, p.batch_id, p.published_at, b.file_name, COUNT(r.*)::int AS rows, COUNT(r.trim_id)::int AS linked
    FROM published_sets p JOIN quote_batches b ON b.id = p.batch_id LEFT JOIN quote_rows r ON r.batch_id = p.batch_id AND r.kind = p.kind
    GROUP BY p.kind, p.batch_id, p.published_at, b.file_name`);
  const out: Record<string, any> = {}; for (const k of KINDS) out[k] = rows.find((r) => r.kind === k) || null; return out;
}
