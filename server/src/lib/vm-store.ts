// 차량 마스터데이터 저장소 (DB vm_items = 작업본, vm_releases = 사이트 반영본)
//  · 처음 실행 시 DB 가 비어 있으면 사이트의 vehicle-master.js + vm/*.js 를 그대로 가져와 작업본·첫 반영본을 만듦
//  · 관리자가 수정 → 작업본에 바로 저장 → '사이트 반영' 을 눌러야 사이트에 나감 (반영본은 이력으로 남아 되돌리기 가능)
//  · 사이트는 /api/pub/vm/core.js (공통본) + /api/pub/vm/m/<모델id>.js (모델별 상세본) 를 읽음 — 기존 파일과 같은 모양
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type pg from "pg";
import { q, tx, pool } from "../db.js";
import { config } from "../config.js";
import { log } from "./log.js";
import { setVmSource } from "./vm.js";

export const VM_KINDS = ["brands", "models", "lineups", "trims", "options", "trimOptions", "colors", "trimColors", "colorRules", "vehicleImages", "sources", "vehicleSpecs"] as const;
export type VmKind = (typeof VM_KINDS)[number];
export type VM = Record<VmKind, any[]> & { meta: any };

export const KIND_KO: Record<VmKind, string> = {
  brands: "브랜드", models: "모델", lineups: "라인업", trims: "트림", options: "옵션", trimOptions: "트림별 옵션", colors: "색상",
  trimColors: "트림별 색상", colorRules: "색상 조합 규칙", vehicleImages: "이미지", sources: "출처", vehicleSpecs: "제원",
};

/** 항목 id (자체 id 가 없는 연결 항목은 조합) */
export function idOf(kind: VmKind, o: any): string {
  switch (kind) {
    case "trimOptions": return `${o.trimId}|${o.optionId}`;
    case "trimColors": return `${o.trimId}|${o.colorId}|${o.type || ""}`;
    case "colorRules": return `${o.trimId}|${o.interiorColorId}`;
    case "vehicleSpecs": return String(o.id || o.trimId || o.lineupId);
    default: return String(o.id);
  }
}
export function parentOf(kind: VmKind, o: any): string | null {
  switch (kind) {
    case "models": case "colors": return o.brandId ?? null;
    case "lineups": case "options": return o.modelId ?? null;
    case "trims": case "vehicleImages": return o.lineupId ?? null;
    case "trimOptions": case "trimColors": case "colorRules": return o.trimId ?? null;
    case "vehicleSpecs": return o.trimId ?? o.lineupId ?? null;
    default: return null;
  }
}

// ---------------------------------------------------------------- 사이트 파일 읽기 (첫 가져오기)
function readJsAssign(file: string, varName: string): any {
  const src = fs.readFileSync(file, "utf8");
  const i = src.indexOf(varName + " =");
  if (i < 0) throw new Error(`${file}: ${varName} 없음`);
  return JSON.parse(src.slice(src.indexOf("=", i) + 1).trim().replace(/;\s*$/, "").split(";\n")[0]);
}
/** 공통본 + 모델별 상세본 → 전체 데이터 (사이트 Helper addDetail 과 같은 합치기) */
export function loadVmFromSiteFiles(coreFile = config.vehicleMasterPath): VM {
  const M = readJsAssign(coreFile, "window.CHAQ_VEHICLE_MASTER") as VM;
  const dir = path.join(path.dirname(coreFile), "vm");
  for (const k of VM_KINDS) M[k] = M[k] || [];
  if (fs.existsSync(dir)) {
    const seenO = new Set(M.options.map((o) => o.id)), seenC = new Set(M.colors.map((c) => c.id));
    const T = new Map(M.trims.map((t) => [t.id, t]));
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      const j = src.indexOf(".push(");
      const d = JSON.parse(src.slice(j + 6, src.indexOf(");\n", j)));
      for (const o of d.options || []) if (!seenO.has(o.id)) { seenO.add(o.id); M.options.push(o); }
      for (const c of d.colors || []) if (!seenC.has(c.id)) { seenC.add(c.id); M.colors.push(c); }
      M.trimOptions.push(...(d.trimOptions || [])); M.trimColors.push(...(d.trimColors || [])); M.colorRules.push(...(d.colorRules || []));
      for (const [tid, items] of Object.entries(d.standardItems || {})) { const t = T.get(tid); if (t) t.standardItems = items; }
    }
  }
  for (const t of M.trims) { delete t.optCount; delete t.stdCount; }
  if (M.meta) delete M.meta.split;
  return M;
}

// ---------------------------------------------------------------- 작업본 (DB) ↔ 메모리
let draft: { M: VM; version: string; at: number } | null = null;
let draftCheckedAt = 0;
async function stateGet(key: string) { const r = await q(`SELECT value FROM app_state WHERE key = $1`, [key]); return r.rows[0]?.value as string | undefined; }
async function stateSet(key: string, value: string, c?: pg.PoolClient) {
  const sql = `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  if (c) await c.query(sql, [key, value]); else await q(sql, [key, value]);
}

function modelIndex(M: VM) {
  const lineupModel = new Map(M.lineups.map((l) => [l.id, l.modelId]));
  const trimModel = new Map(M.trims.map((t) => [t.id, lineupModel.get(t.lineupId) ?? null]));
  return { lineupModel, trimModel };
}
function modelIdFor(kind: VmKind, o: any, ix: ReturnType<typeof modelIndex>): string | null {
  switch (kind) {
    case "models": return o.id;
    case "lineups": case "options": return o.modelId ?? null;
    case "trims": case "vehicleImages": return ix.lineupModel.get(o.lineupId) ?? null;
    case "trimOptions": case "trimColors": case "colorRules": return ix.trimModel.get(o.trimId) ?? null;
    default: return null;
  }
}

/** 전체 데이터를 작업본으로 통째 교체 (첫 가져오기·되돌리기) */
export async function replaceDraft(M: VM, adminId: number | null, action: string, note: string, c?: pg.PoolClient) {
  const run = async (cl: pg.PoolClient) => {
    await cl.query(`DELETE FROM vm_items`);
    const ix = modelIndex(M);
    for (const kind of VM_KINDS) {
      const arr = M[kind] || []; const seen = new Set<string>();
      for (let i = 0; i < arr.length; i += 500) {
        const chunk = arr.slice(i, i + 500).map((o, j) => ({ o, sort: i + j })).filter(({ o }) => { const id = idOf(kind, o); if (seen.has(id)) return false; seen.add(id); return true; });
        if (!chunk.length) continue;
        const vals: unknown[] = []; const ph: string[] = [];
        chunk.forEach(({ o, sort }, n) => { const b = n * 7; ph.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`); vals.push(kind, idOf(kind, o), parentOf(kind, o), modelIdFor(kind, o, ix), sort, o, adminId); });
        await cl.query(`INSERT INTO vm_items (kind, id, parent_id, model_id, sort, data, updated_by) VALUES ${ph.join(",")}`, vals);
      }
    }
    await stateSet("vm_meta", JSON.stringify(M.meta || {}), cl);
    await cl.query(`INSERT INTO vm_changes (admin_id, action, summary) VALUES ($1,$2,$3)`, [adminId, action, note]);
    await stateSet("vm_draft_version", String(Date.now()), cl);
  };
  if (c) await run(c); else await tx(run);
  draft = null;
}

export async function loadDraft(force = false): Promise<VM> {
  if (!force && draft && Date.now() - draftCheckedAt < 10_000) return draft.M;
  const version = (await stateGet("vm_draft_version")) || "0"; draftCheckedAt = Date.now();
  if (!force && draft && draft.version === version) return draft.M;
  const M = { meta: JSON.parse((await stateGet("vm_meta")) || "{}") } as VM;
  for (const k of VM_KINDS) M[k] = [];
  const { rows } = await q(`SELECT kind, data FROM vm_items ORDER BY kind, sort, id`);
  for (const r of rows) (M[r.kind as VmKind] ||= []).push(r.data);
  draft = { M, version, at: Date.now() };
  setVmSource(M);
  return M;
}
async function touchDraft(c: pg.PoolClient) { await stateSet("vm_draft_version", String(Date.now()), c); draft = null; }

/** 서버 시작 시: 작업본이 비어 있으면 사이트 파일에서 가져오고 첫 반영본 생성 */
export async function ensureVmReady() {
  const lock = await pool.connect();   // 서버 여러 대가 동시에 시작해도 한 대만 가져오기
  try { await lock.query("SELECT pg_advisory_lock(727002)"); await ensureVmReadyLocked(); }
  finally { await lock.query("SELECT pg_advisory_unlock(727002)").catch(() => {}); lock.release(); }
}
async function ensureVmReadyLocked() {
  const n = await q(`SELECT COUNT(*)::int AS n FROM vm_items`);
  if (n.rows[0].n === 0) {
    if (!fs.existsSync(config.vehicleMasterPath)) { log.warn("[vm] 차량 데이터 파일 없음 — 빈 상태로 시작"); return; }
    const M = loadVmFromSiteFiles();
    await replaceDraft(M, null, "import", "사이트 파일에서 첫 가져오기");
    log.info({ trims: M.trims.length }, "[vm] 사이트 파일에서 작업본 생성");
  }
  const cur = await q(`SELECT 1 FROM vm_releases WHERE is_current`);
  if (!cur.rowCount) { await publishDraft(null, "첫 반영 (사이트 파일 기준)"); log.info("[vm] 첫 반영본 생성"); }
  await loadDraft(true);
}

// ---------------------------------------------------------------- 항목 수정
export class VmError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

/** 종류별 수정 가능한 필드와 형식 */
type FieldType = "str" | "num" | "int" | "bool" | "strArr" | "status" | "id" | "any";
export const FIELDS: Record<VmKind, Record<string, FieldType>> = {
  brands: { nameKo: "str", nameEn: "str", country: "str", domesticImport: "str", officialSite: "str", status: "status", sortOrder: "int" },
  models: { brandId: "id", nameKo: "str", nameEn: "str", bodyType: "str", segment: "str", familyKey: "str", status: "status", sortOrder: "int" },
  lineups: { modelId: "id", displayName: "str", shortLabel: "str", generationName: "str", generationCode: "str", modelYear: "int", fuelType: "str", engineSummary: "str", salesChannel: "str", status: "status", sortOrder: "int", imageKey: "str" },
  trims: { lineupId: "id", name: "str", nameEn: "str", drivetrain: "str", driveLabel: "str", seatCount: "int", variantNote: "str", status: "status", sortOrder: "int", listPrice: "int", listPriceBeforeTaxBenefit: "int", listPriceBasis: "str", listPriceDate: "str", standardItems: "strArr" },
  options: { modelId: "id", name: "str", nameEn: "str", category: "str", description: "str", items: "strArr" },
  trimOptions: { trimId: "id", optionId: "id", price: "int", type: "str", dependencyNote: "str", exclusionNote: "str" },
  colors: { brandId: "id", name: "str", nameEn: "str", hex: "str", manufacturerCode: "str", kind: "str" },
  trimColors: { trimId: "id", colorId: "id", type: "str", extraPrice: "int", note: "str" },
  colorRules: { trimId: "id", interiorColorId: "id", allowedExteriorColorIds: "strArr", excludedExteriorColorIds: "strArr", note: "str" },
  vehicleImages: { lineupId: "id", trimId: "id", imageUrl: "str", thumbnailUrl: "str", colorKey: "str", view: "str", sortOrder: "int", author: "str", license: "str" },
  sources: { type: "str", title: "str", url: "str", publisher: "str", retrievedAt: "str", note: "str" },
  vehicleSpecs: {},
};
/** 반드시 있어야 하는 필드 */
export const REQUIRED: Partial<Record<VmKind, string[]>> = {
  brands: ["nameKo"], models: ["brandId", "nameKo"], lineups: ["modelId", "shortLabel"], trims: ["lineupId", "name"],
  options: ["modelId", "name"], trimOptions: ["trimId", "optionId"], colors: ["brandId", "name"], trimColors: ["trimId", "colorId", "type"],
  colorRules: ["trimId", "interiorColorId"], vehicleImages: ["lineupId", "imageUrl"],
};
/** 참조 검사: 필드 → 참조하는 종류 */
const REFS: Record<string, VmKind> = { brandId: "brands", modelId: "models", lineupId: "lineups", trimId: "trims", optionId: "options", colorId: "colors", interiorColorId: "colors" };

function coerce(kind: VmKind, patch: Record<string, unknown>) {
  const spec = FIELDS[kind]; const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const t = spec[k]; if (!t) throw new VmError(`${KIND_KO[kind]}: '${k}' 는 수정할 수 없는 항목입니다`);
    if (v === null || v === undefined || v === "") { out[k] = t === "strArr" ? [] : null; continue; }
    if (t === "int" || t === "num") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, ""));
      if (!Number.isFinite(n)) throw new VmError(`${k}: 숫자가 아닙니다 (${v})`);
      out[k] = t === "int" ? Math.round(n) : n;
    } else if (t === "bool") out[k] = v === true || v === "true" || v === "Y" || v === "y";
    else if (t === "strArr") out[k] = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : String(v).split(/\s*\|\s*|\r?\n/).map((x) => x.trim()).filter(Boolean);
    else if (t === "status") { const s = String(v).toUpperCase(); out[k] = s === "N" || s === "INACTIVE" || s === "숨김" ? "INACTIVE" : "ACTIVE"; }
    else out[k] = String(v).trim();
  }
  return out;
}

const slug = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const rand = () => Math.random().toString(36).slice(2, 7);
function newId(kind: VmKind, o: any, exists: (id: string) => boolean): string {
  let base: string;
  switch (kind) {
    case "brands": base = slug(o.nameEn) || "brand-" + rand(); break;
    case "models": base = `${o.brandId}-${slug(o.nameEn) || rand()}`; break;
    case "lineups": base = `${o.modelId}-${o.modelYear || ""}-${slug(o.nameEn || o.fuelType) || rand()}`.replace(/--+/g, "-"); break;
    case "trims": base = `${o.lineupId}--${slug(o.nameEn) || rand()}`; break;
    case "options": base = `${o.modelId}-opt-${slug(o.nameEn) || rand()}`; break;
    case "colors": base = `${o.brandId}-color-${slug(o.nameEn) || rand()}`; break;
    case "vehicleImages": base = `img-${o.lineupId}-${rand()}`; break;
    default: base = `${kind}-${rand()}`;
  }
  let id = base; while (exists(id)) id = base + "-" + rand();
  return id;
}

async function validateRefs(c: pg.PoolClient, kind: VmKind, o: any) {
  for (const f of REQUIRED[kind] || []) if (o[f] === undefined || o[f] === null || o[f] === "") throw new VmError(`${KIND_KO[kind]}: '${f}' 은(는) 필수입니다`);
  for (const [f, refKind] of Object.entries(REFS)) {
    if (!(f in FIELDS[kind]) || !o[f]) continue;
    const r = await c.query(`SELECT 1 FROM vm_items WHERE kind = $1 AND id = $2`, [refKind, o[f]]);
    if (!r.rowCount) throw new VmError(`${KIND_KO[kind]}: ${f} '${o[f]}' 이(가) 없습니다`);
  }
}

async function modelIdOf(c: pg.PoolClient, kind: VmKind, o: any): Promise<string | null> {
  if (kind === "models") return o.id;
  if (kind === "lineups" || kind === "options") return o.modelId ?? null;
  if (kind === "trims" || kind === "vehicleImages") { const r = await c.query(`SELECT data->>'modelId' AS m FROM vm_items WHERE kind = 'lineups' AND id = $1`, [o.lineupId]); return r.rows[0]?.m ?? null; }
  if (kind === "trimOptions" || kind === "trimColors" || kind === "colorRules") { const r = await c.query(`SELECT model_id FROM vm_items WHERE kind = 'trims' AND id = $1`, [o.trimId]); return r.rows[0]?.model_id ?? null; }
  return null;
}

/** 저장 (id 가 있으면 수정, 없으면 새로 만들기). 반환: 저장된 항목 */
export async function saveItem(kind: VmKind, id: string | null, patch: Record<string, unknown>, adminId: number | null, c?: pg.PoolClient, opts: { createId?: string } = {}): Promise<any> {
  if (!VM_KINDS.includes(kind)) throw new VmError("종류 오류");
  const run = async (cl: pg.PoolClient) => {
    const clean = coerce(kind, patch);
    let cur: any = null;
    if (id) { const r = await cl.query(`SELECT data FROM vm_items WHERE kind = $1 AND id = $2 FOR UPDATE`, [kind, id]); cur = r.rows[0]?.data || null; if (!cur) throw new VmError(`${KIND_KO[kind]} '${id}' 없음`, 404); }
    const next = { ...(cur || {}), ...clean };
    if (!cur) {
      if (["brands", "models", "lineups", "trims", "options", "colors", "vehicleImages", "sources"].includes(kind)) {
        if (opts.createId) {
          if (!/^[a-z0-9][a-z0-9._-]{1,120}$/.test(opts.createId)) throw new VmError(`${KIND_KO[kind]} ID '${opts.createId}' 형식 오류 (영문 소문자·숫자·-·_·. 만)`);
          next.id = opts.createId;
        } else {
          const taken = new Set((await cl.query(`SELECT id FROM vm_items WHERE kind = $1`, [kind])).rows.map((r) => r.id));
          next.id = newId(kind, next, (x) => taken.has(x));
        }
      }
      if (["brands", "models", "lineups", "trims"].includes(kind)) { next.status ??= "ACTIVE"; next.sortOrder ??= 999; }
      if (kind === "trimOptions") { next.type ??= "SELECTABLE"; next.dependency ??= []; next.exclusionRule ??= []; next.condition ??= null; }
      if (kind === "vehicleImages") { Object.assign(next, { source: next.source || "CHAQ_OWN", verified: true, trimId: next.trimId || null, thumbnailUrl: next.thumbnailUrl || null, view: next.view || "side", sortOrder: next.sortOrder ?? 0, author: next.author || "차큐", license: next.license || "차큐 자체 제작" }); }
      if (kind === "trims") next.sourceIds ??= [];
    }
    await validateRefs(cl, kind, next);
    const newKey = idOf(kind, next);
    if (cur && newKey !== id) {   // 연결 항목의 조합 id 가 바뀌면 (예: 다른 옵션으로) 기존 것 삭제 후 새로
      const dup = await cl.query(`SELECT 1 FROM vm_items WHERE kind = $1 AND id = $2`, [kind, newKey]);
      if (dup.rowCount) throw new VmError(`이미 같은 ${KIND_KO[kind]} 이(가) 있습니다`);
      await cl.query(`DELETE FROM vm_items WHERE kind = $1 AND id = $2`, [kind, id]);
    }
    if (!cur) { const dup = await cl.query(`SELECT 1 FROM vm_items WHERE kind = $1 AND id = $2`, [kind, newKey]); if (dup.rowCount) throw new VmError(`이미 같은 ${KIND_KO[kind]} 이(가) 있습니다`); }
    const mid = await modelIdOf(cl, kind, next);
    const sort = cur ? undefined : ((await cl.query(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM vm_items WHERE kind = $1`, [kind])).rows[0].s as number);
    await cl.query(`INSERT INTO vm_items (kind, id, parent_id, model_id, sort, data, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (kind, id) DO UPDATE SET parent_id = EXCLUDED.parent_id, model_id = EXCLUDED.model_id, data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [kind, newKey, parentOf(kind, next), mid, sort ?? 0, next, adminId]);
    if (kind === "lineups" && cur && cur.modelId !== next.modelId) {   // 라인업을 다른 모델로 옮기면 하위 모델 표시도 갱신
      await cl.query(`UPDATE vm_items SET model_id = $2 WHERE kind IN ('trims','vehicleImages') AND parent_id = $1`, [newKey, next.modelId]);
      await cl.query(`UPDATE vm_items SET model_id = $2 WHERE kind IN ('trimOptions','trimColors','colorRules') AND parent_id IN (SELECT id FROM vm_items WHERE kind = 'trims' AND parent_id = $1)`, [newKey, next.modelId]);
    }
    await cl.query(`INSERT INTO vm_changes (admin_id, action, kind, item_id, summary) VALUES ($1,$2,$3,$4,$5)`, [adminId, cur ? "update" : "create", kind, newKey, Object.keys(clean).join(", ")]);
    await touchDraft(cl);
    return next;
  };
  return c ? run(c) : tx(run);
}

/** 삭제: 하위 항목이 있으면 막음 (트림은 트림별 옵션·색상·이미지까지 함께). 견적에 연결된 트림은 삭제 대신 숨김 안내 */
export async function deleteItem(kind: VmKind, id: string, adminId: number | null, c?: pg.PoolClient) {
  const run = async (cl: pg.PoolClient) => {
    const cur = await cl.query(`SELECT data FROM vm_items WHERE kind = $1 AND id = $2`, [kind, id]);
    if (!cur.rowCount) throw new VmError("없음", 404);
    const childOf: Partial<Record<VmKind, VmKind[]>> = { brands: ["models", "colors"], models: ["lineups", "options"], lineups: ["trims"], options: [], colors: [] };
    for (const ck of childOf[kind] || []) {
      const n = await cl.query(`SELECT COUNT(*)::int AS n FROM vm_items WHERE kind = $1 AND parent_id = $2`, [ck, id]);
      if (n.rows[0].n) throw new VmError(`하위 ${KIND_KO[ck]} ${n.rows[0].n}개가 있어 삭제할 수 없습니다 — 숨김(노출 N)으로 바꾸거나 하위 항목부터 정리하세요`);
    }
    if (kind === "options") { const n = await cl.query(`SELECT COUNT(*)::int AS n FROM vm_items WHERE kind = 'trimOptions' AND data->>'optionId' = $1`, [id]); if (n.rows[0].n) throw new VmError(`이 옵션을 쓰는 트림이 ${n.rows[0].n}개 있습니다 — 트림별 옵션부터 정리하세요`); }
    if (kind === "colors") { const n = await cl.query(`SELECT COUNT(*)::int AS n FROM vm_items WHERE kind = 'trimColors' AND data->>'colorId' = $1`, [id]); if (n.rows[0].n) throw new VmError(`이 색상을 쓰는 트림이 ${n.rows[0].n}개 있습니다 — 트림별 색상부터 정리하세요`); }
    if (kind === "trims") {
      const used = await cl.query(`SELECT COUNT(*)::int AS n FROM quote_rows r JOIN published_sets p ON p.batch_id = r.batch_id AND p.kind = r.kind WHERE r.trim_id = $1`, [id]);
      if (used.rows[0].n) throw new VmError(`사이트 견적 ${used.rows[0].n}건이 이 트림에 연결돼 있어 삭제할 수 없습니다 — 숨김(노출 N)으로 바꾸세요`);
      await cl.query(`DELETE FROM vm_items WHERE kind IN ('trimOptions','trimColors','colorRules','vehicleSpecs') AND parent_id = $1`, [id]);
      await cl.query(`DELETE FROM vm_items WHERE kind = 'vehicleImages' AND data->>'trimId' = $1`, [id]);
    }
    if (kind === "lineups") await cl.query(`DELETE FROM vm_items WHERE kind = 'vehicleImages' AND parent_id = $1`, [id]);
    await cl.query(`DELETE FROM vm_items WHERE kind = $1 AND id = $2`, [kind, id]);
    await cl.query(`INSERT INTO vm_changes (admin_id, action, kind, item_id) VALUES ($1,'delete',$2,$3)`, [adminId, kind, id]);
    await touchDraft(cl);
  };
  return c ? run(c) : tx(run);
}

// ---------------------------------------------------------------- 조회 (관리자 화면)
export async function getItem(kind: VmKind, id: string) { const r = await q(`SELECT data FROM vm_items WHERE kind = $1 AND id = $2`, [kind, id]); return r.rows[0]?.data || null; }
export async function children(kind: VmKind, parentId: string | null) {
  const r = parentId === null ? await q(`SELECT data FROM vm_items WHERE kind = $1 ORDER BY sort, id`, [kind]) : await q(`SELECT data FROM vm_items WHERE kind = $1 AND parent_id = $2 ORDER BY sort, id`, [kind, parentId]);
  return r.rows.map((x) => x.data);
}
/** 트림 상세 편집 화면용: 트림 + 라인업·모델·브랜드 + 옵션(가격)·색상·이미지 */
export async function trimBundle(trimId: string) {
  const t = await getItem("trims", trimId); if (!t) return null;
  const l = await getItem("lineups", t.lineupId); const m = l && (await getItem("models", l.modelId)); const b = m && (await getItem("brands", m.brandId));
  const tos = await children("trimOptions", trimId);
  const opts = tos.length ? (await q(`SELECT data FROM vm_items WHERE kind = 'options' AND id = ANY($1)`, [tos.map((x) => x.optionId)])).rows.map((r) => r.data) : [];
  const O = new Map(opts.map((o) => [o.id, o]));
  const tcs = await children("trimColors", trimId);
  const cols = tcs.length ? (await q(`SELECT data FROM vm_items WHERE kind = 'colors' AND id = ANY($1)`, [tcs.map((x) => x.colorId)])).rows.map((r) => r.data) : [];
  const C = new Map(cols.map((c) => [c.id, c]));
  const images = (await q(`SELECT data FROM vm_items WHERE kind = 'vehicleImages' AND parent_id = $1 AND (data->>'trimId' IS NULL OR data->>'trimId' = $2) ORDER BY sort`, [t.lineupId, trimId])).rows.map((r) => r.data);
  return {
    trim: t, lineup: l, model: m, brand: b,
    options: tos.map((x) => ({ ...x, option: O.get(x.optionId) || null })),
    colors: tcs.map((x) => ({ ...x, color: C.get(x.colorId) || null })),
    images,
    modelOptions: m ? await children("options", m.id) : [],
    brandColors: b ? await children("colors", b.id) : [],
  };
}
/** 검색 (브랜드·모델·라인업·트림 이름) */
export async function searchTree(qs: string, limit = 50) {
  const words = qs.toLowerCase().split(/\s+/).filter(Boolean);
  const M = await loadDraft();
  const B = new Map(M.brands.map((b) => [b.id, b])), MO = new Map(M.models.map((m) => [m.id, m])), L = new Map(M.lineups.map((l) => [l.id, l]));
  const out: any[] = [];
  for (const t of M.trims) {
    const l = L.get(t.lineupId), m = l && MO.get(l.modelId), b = m && B.get(m.brandId); if (!l || !m || !b) continue;
    const hay = [b.nameKo, b.nameEn, m.nameKo, m.nameEn, l.shortLabel, l.displayName, l.modelYear, t.name, t.nameEn, t.id].join(" ").toLowerCase();
    if (words.every((w) => hay.includes(w))) { out.push({ trimId: t.id, brand: b.nameKo, model: m.nameKo, lineup: l.shortLabel || l.displayName, modelYear: l.modelYear, trim: t.name, listPrice: t.listPrice ?? null, status: t.status }); if (out.length >= limit) break; }
  }
  return out;
}

// ---------------------------------------------------------------- 사이트 반영본 (공통본 + 모델별 상세본)
export function buildSplit(M: VM, releaseId: number | null = null) {
  const L = new Map(M.lineups.map((l) => [l.id, l]));
  const modelOfTrim = new Map(M.trims.map((t) => [t.id, L.get(t.lineupId)?.modelId]));
  const optCount: Record<string, number> = {}; M.trimOptions.forEach((x) => { optCount[x.trimId] = (optCount[x.trimId] || 0) + 1; });
  const core: any = { ...M, trims: M.trims.map((t) => { const c = { ...t }; delete c.standardItems; c.optCount = optCount[t.id] || 0; c.stdCount = (t.standardItems || []).length; return c; }), options: [], trimOptions: [], colors: [], trimColors: [], colorRules: [], vehicleSpecs: [] };
  core.meta = { ...(M.meta || {}), releaseId, generatedAt: new Date().toISOString().slice(0, 10), split: { at: new Date().toISOString().slice(0, 10), detailDir: "vm/", note: "상세(옵션·색상·기본품목)는 모델별 상세본 — CHAQ_VM.addDetail" } };
  const per = new Map<string, any>();
  const get = (mid: string | undefined) => { const k = mid || "_"; if (!per.has(k)) per.set(k, { modelId: k, options: [], trimOptions: [], colors: [], trimColors: [], colorRules: [], standardItems: {} }); return per.get(k); };
  M.trims.forEach((t) => { if ((t.standardItems || []).length) get(modelOfTrim.get(t.id)).standardItems[t.id] = t.standardItems; });
  const O = new Map(M.options.map((o) => [o.id, o]));
  M.options.forEach((o) => { if (o.modelId) get(o.modelId).options.push(o); });
  M.trimOptions.forEach((x) => { const mid = modelOfTrim.get(x.trimId); const d = get(mid); d.trimOptions.push(x); const o = O.get(x.optionId); if (o && o.modelId !== mid && !d.options.includes(o)) d.options.push(o); });
  const C = new Map(M.colors.map((c) => [c.id, c]));
  M.trimColors.forEach((x) => get(modelOfTrim.get(x.trimId)).trimColors.push(x));
  M.colorRules.forEach((x) => get(modelOfTrim.get(x.trimId)).colorRules.push(x));
  for (const d of per.values()) {
    const ids = new Set<string>(d.trimColors.map((x: any) => x.colorId));
    d.colorRules.forEach((r: any) => { ids.add(r.interiorColorId); (r.allowedExteriorColorIds || []).concat(r.excludedExteriorColorIds || []).forEach((i: string) => ids.add(i)); });
    d.colors = [...ids].map((i) => C.get(i)).filter(Boolean);
  }
  per.delete("_");
  const coreJs = `/* 차큐 Vehicle Master — 공통본 (API 생성 ${new Date().toISOString()}) · 옵션·색상·기본품목은 모델별 상세본 */\nwindow.CHAQ_VEHICLE_MASTER = ${JSON.stringify(core)};\n`;
  const details = new Map<string, string>();
  for (const [mid, d] of per) details.set(mid, `/* 차큐 차량 데이터 상세 — ${mid} */\n(window.CHAQ_VM_DETAILS = window.CHAQ_VM_DETAILS || []).push(${JSON.stringify(d)});\nif (window.CHAQ_VM && window.CHAQ_VM.addDetail) window.CHAQ_VM.addDetail(window.CHAQ_VM_DETAILS[window.CHAQ_VM_DETAILS.length - 1]);\n`);
  return { coreJs, details };
}

export function countsOf(M: VM) { return Object.fromEntries(VM_KINDS.map((k) => [k, (M[k] || []).length])); }

/** 검사: 반영 전에 깨진 참조·필수값 확인 */
export function validateVm(M: VM) {
  const errors: string[] = [], warnings: string[] = [];
  const has = (k: VmKind) => new Set(M[k].map((o) => idOf(k, o)));
  const B = has("brands"), MO = has("models"), L = has("lineups"), T = has("trims"), O = has("options"), C = has("colors");
  M.models.forEach((m) => { if (!B.has(m.brandId)) errors.push(`모델 ${m.nameKo}(${m.id}): 브랜드 없음`); });
  M.lineups.forEach((l) => { if (!MO.has(l.modelId)) errors.push(`라인업 ${l.id}: 모델 없음`); });
  M.trims.forEach((t) => { if (!L.has(t.lineupId)) errors.push(`트림 ${t.id}: 라인업 없음`); if (!t.name) errors.push(`트림 ${t.id}: 이름 없음`); if (t.status !== "INACTIVE" && !t.listPrice) warnings.push(`트림 가격 없음: ${t.id}`); });
  M.trimOptions.forEach((x) => { if (!T.has(x.trimId) || !O.has(x.optionId)) errors.push(`트림별 옵션 ${x.trimId}|${x.optionId}: 트림 또는 옵션 없음`); });
  M.trimColors.forEach((x) => { if (!T.has(x.trimId) || !C.has(x.colorId)) errors.push(`트림별 색상 ${x.trimId}|${x.colorId}: 트림 또는 색상 없음`); });
  M.vehicleImages.forEach((x) => { if (!L.has(x.lineupId)) errors.push(`이미지 ${x.id}: 라인업 없음`); });
  return { errors: errors.slice(0, 100), errorCount: errors.length, warnings: warnings.slice(0, 30), warningCount: warnings.length };
}

let pub: { version: string; coreJs: string; details: Map<string, string>; modelIds: Set<string>; etag: string; releaseId: number } | null = null;
let pubCheckedAt = 0;
export const gz = (M: VM) => zlib.gzipSync(Buffer.from(JSON.stringify(M)), { level: 6 });
export const gunzipVm = (b: Buffer): VM => JSON.parse(zlib.gunzipSync(b).toString("utf8"));

/** 작업본 → 사이트 반영 */
export async function publishDraft(adminId: number | null, note: string) {
  const M = await loadDraft(true);
  const v = validateVm(M);
  if (v.errorCount) throw new VmError(`반영할 수 없습니다 — 오류 ${v.errorCount}건: ` + v.errors.slice(0, 3).join(" / "));
  const id = await tx(async (c) => {
    await c.query(`UPDATE vm_releases SET is_current = false WHERE is_current`);
    const r = await c.query(`INSERT INTO vm_releases (created_by, note, counts, payload, is_current) VALUES ($1,$2,$3,$4,true) RETURNING id`, [adminId, note || "", countsOf(M), gz(M)]);
    await c.query(`INSERT INTO vm_changes (admin_id, action, summary) VALUES ($1,'publish',$2)`, [adminId, `반영본 #${r.rows[0].id} ${note || ""}`.trim()]);
    await stateSet("vm_pub_version", String(Date.now()), c);
    return r.rows[0].id as number;
  });
  pub = null;
  return { releaseId: id, warnings: v.warnings, warningCount: v.warningCount };
}

/** 이전 반영본으로 되돌리기: 사이트와 작업본 모두 그 시점으로 */
export async function rollbackTo(releaseId: number, adminId: number | null) {
  const r = await q(`SELECT payload FROM vm_releases WHERE id = $1`, [releaseId]);
  if (!r.rowCount) throw new VmError("반영본 없음", 404);
  const M = gunzipVm(r.rows[0].payload);
  await tx(async (c) => {
    await replaceDraft(M, adminId, "rollback", `반영본 #${releaseId} 로 되돌림`, c);
    await c.query(`UPDATE vm_releases SET is_current = false WHERE is_current`);
    await c.query(`UPDATE vm_releases SET is_current = true WHERE id = $1`, [releaseId]);
    await stateSet("vm_pub_version", String(Date.now()), c);
  });
  pub = null; await loadDraft(true);
}

export async function releases() {
  const { rows } = await q(`SELECT r.id, r.created_at, r.note, r.counts, r.is_current, a.name AS by FROM vm_releases r LEFT JOIN admins a ON a.id = r.created_by ORDER BY r.id DESC LIMIT 30`);
  return rows;
}
/** 작업본이 반영본과 다른지 (반영 안 된 변경 수) */
export async function pendingChanges() {
  const v = Number((await stateGet("vm_pub_version")) || 0);
  const r = await q(`SELECT COUNT(*)::int AS n FROM vm_changes WHERE action IN ('create','update','delete','replace') AND at > to_timestamp($1 / 1000.0)`, [v]);
  return r.rows[0].n as number;
}

/** 사이트용 공개 데이터 (현재 반영본) — 서버가 여러 대여도 vm_pub_version 으로 10초 안에 맞춤 */
export async function getPublicVm() {
  if (pub && Date.now() - pubCheckedAt < 10_000) return pub;
  const version = (await stateGet("vm_pub_version")) || "0"; pubCheckedAt = Date.now();
  if (pub && pub.version === version) return pub;
  const r = await q(`SELECT id, payload FROM vm_releases WHERE is_current`);
  if (!r.rowCount) throw new VmError("반영된 차량 데이터가 없습니다", 503);
  const M = gunzipVm(r.rows[0].payload);
  const { coreJs, details } = buildSplit(M, r.rows[0].id);
  pub = { version, coreJs, details, modelIds: new Set(M.models.map((m) => m.id)), etag: `"vm${r.rows[0].id}-${version}"`, releaseId: r.rows[0].id };
  return pub;
}
/** 현재 반영본 전체 (견적 반영 시 트림 확인용) */
export async function publishedTrimIds(): Promise<Set<string>> {
  const r = await q(`SELECT payload FROM vm_releases WHERE is_current`);
  if (!r.rowCount) return new Set();
  return new Set(gunzipVm(r.rows[0].payload).trims.map((t) => t.id));
}
