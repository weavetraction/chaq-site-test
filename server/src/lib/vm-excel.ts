// 차량 마스터데이터 엑셀 (일괄 수정용): 시트 = 브랜드·모델·라인업·트림·옵션·트림옵션·색상·트림색상·이미지
//  · 내려받기 → 수정 → 올리기 → 미리보기(추가·수정·삭제 건수, 오류) → 적용(작업본) → '사이트 반영'
//  · ID 를 비우면 새 항목(ID 자동), 새 ID 를 직접 적으면 그 ID 로 생성 (같은 파일 안에서 새 모델 → 새 라인업처럼 연결 가능)
//  · '삭제' 열에 Y → 삭제 · '(참고)' 열은 읽기 전용(무시)
import ExcelJS from "exceljs";
import type pg from "pg";
import { q, tx } from "../db.js";
import { cellValue } from "./excel.js";
import { VmKind, VM, VM_KINDS, idOf, saveItem, deleteItem, loadDraft, VmError, KIND_KO, REQUIRED, replaceDraft, validateVm, countsOf, gz, gunzipVm } from "./vm-store.js";

type Col = { h: string; f: string; t?: "int" | "strArr" | "status"; w?: number; note?: string; ref?: (o: any, X: Lookup) => unknown };
type Lookup = { brand: Map<string, any>; model: Map<string, any>; lineup: Map<string, any>; trim: Map<string, any>; option: Map<string, any>; color: Map<string, any> };
type Sheet = { kind: VmKind; name: string; key: string[]; cols: Col[] };

const carOfTrim = (o: any, X: Lookup) => { const t = X.trim.get(o.trimId); const l = t && X.lineup.get(t.lineupId); const m = l && X.model.get(l.modelId); return [m?.nameKo, l?.shortLabel, t?.name].filter(Boolean).join(" · "); };
export const SHEETS: Sheet[] = [
  { kind: "brands", name: "브랜드", key: ["id"], cols: [
    { h: "브랜드ID", f: "id", w: 16 }, { h: "브랜드명", f: "nameKo", w: 14 }, { h: "영문명", f: "nameEn", w: 14 },
    { h: "국산/수입", f: "domesticImport", w: 11, note: "DOMESTIC / IMPORT" }, { h: "노출", f: "status", t: "status", w: 6, note: "Y / N" }, { h: "정렬", f: "sortOrder", t: "int", w: 6 }] },
  { kind: "models", name: "모델", key: ["id"], cols: [
    { h: "모델ID", f: "id", w: 26 }, { h: "브랜드ID", f: "brandId", w: 14 }, { h: "모델명", f: "nameKo", w: 18 }, { h: "영문명", f: "nameEn", w: 16 },
    { h: "차급", f: "segment", w: 12 }, { h: "차체", f: "bodyType", w: 10, note: "SEDAN / SUV / HATCHBACK / MPV / TRUCK / VAN ..." },
    { h: "노출", f: "status", t: "status", w: 6 }, { h: "정렬", f: "sortOrder", t: "int", w: 6 }] },
  { kind: "lineups", name: "라인업", key: ["id"], cols: [
    { h: "라인업ID", f: "id", w: 40 }, { h: "모델ID", f: "modelId", w: 24 }, { h: "모델명(참고)", f: "", w: 14, ref: (o, X) => X.model.get(o.modelId)?.nameKo },
    { h: "라인업명", f: "displayName", w: 30 }, { h: "짧은이름", f: "shortLabel", w: 20, note: "목록·상세에 보이는 이름 (예: 가솔린 2.5)" },
    { h: "세대명", f: "generationName", w: 18 }, { h: "연식", f: "modelYear", t: "int", w: 7 }, { h: "연료", f: "fuelType", w: 10, note: "GASOLINE / DIESEL / LPG / HEV / PHEV / EV ..." },
    { h: "엔진", f: "engineSummary", w: 24 }, { h: "판매채널", f: "salesChannel", w: 10, note: "GENERAL / COMMERCIAL ..." },
    { h: "이미지키", f: "imageKey", w: 18 }, { h: "노출", f: "status", t: "status", w: 6 }, { h: "정렬", f: "sortOrder", t: "int", w: 6 }] },
  { kind: "trims", name: "트림", key: ["id"], cols: [
    { h: "트림ID", f: "id", w: 44 }, { h: "라인업ID", f: "lineupId", w: 38 }, { h: "차량(참고)", f: "", w: 26, ref: (o, X) => { const l = X.lineup.get(o.lineupId); const m = l && X.model.get(l.modelId); return [m?.nameKo, l?.shortLabel].filter(Boolean).join(" · "); } },
    { h: "트림명", f: "name", w: 18 }, { h: "영문명", f: "nameEn", w: 14 }, { h: "구동", f: "drivetrain", w: 7 }, { h: "구동표시", f: "driveLabel", w: 8 }, { h: "인승", f: "seatCount", t: "int", w: 6 },
    { h: "트림가격", f: "listPrice", t: "int", w: 12, note: "원 (세제혜택 적용, 옵션 제외)" }, { h: "세제혜택전가격", f: "listPriceBeforeTaxBenefit", t: "int", w: 13 },
    { h: "가격기준", f: "listPriceBasis", w: 18 }, { h: "가격기준일", f: "listPriceDate", w: 11 }, { h: "비고", f: "variantNote", w: 18 },
    { h: "노출", f: "status", t: "status", w: 6 }, { h: "정렬", f: "sortOrder", t: "int", w: 6 }, { h: "기본품목", f: "standardItems", t: "strArr", w: 40, note: "한 줄에 하나씩 (칸 안 줄바꿈: Alt+Enter)" }] },
  { kind: "options", name: "옵션", key: ["id"], cols: [
    { h: "옵션ID", f: "id", w: 40 }, { h: "모델ID", f: "modelId", w: 24 }, { h: "옵션명", f: "name", w: 26 }, { h: "영문명", f: "nameEn", w: 14 },
    { h: "분류", f: "category", w: 10, note: "PACKAGE / ITEM / ACCESSORY / WHEEL / SEAT / DRIVETRAIN" }, { h: "설명", f: "description", w: 30 }, { h: "구성품목", f: "items", t: "strArr", w: 30, note: "한 줄에 하나씩 (칸 안 줄바꿈: Alt+Enter)" }] },
  { kind: "trimOptions", name: "트림옵션", key: ["trimId", "optionId"], cols: [
    { h: "트림ID", f: "trimId", w: 44 }, { h: "옵션ID", f: "optionId", w: 40 }, { h: "차량(참고)", f: "", w: 26, ref: carOfTrim }, { h: "옵션명(참고)", f: "", w: 22, ref: (o, X) => X.option.get(o.optionId)?.name },
    { h: "옵션가격", f: "price", t: "int", w: 11, note: "원" }, { h: "선행조건", f: "dependencyNote", w: 18 }, { h: "중복불가", f: "exclusionNote", w: 18 }] },
  { kind: "colors", name: "색상", key: ["id"], cols: [
    { h: "색상ID", f: "id", w: 36 }, { h: "브랜드ID", f: "brandId", w: 14 }, { h: "색상명", f: "name", w: 22 }, { h: "영문명", f: "nameEn", w: 16 },
    { h: "색상코드", f: "hex", w: 10, note: "#RRGGBB" }, { h: "제조사코드", f: "manufacturerCode", w: 10 }] },
  { kind: "trimColors", name: "트림색상", key: ["trimId", "colorId", "type"], cols: [
    { h: "트림ID", f: "trimId", w: 44 }, { h: "색상ID", f: "colorId", w: 36 }, { h: "구분", f: "type", w: 10, note: "EXTERIOR(외장) / INTERIOR(내장)" },
    { h: "차량(참고)", f: "", w: 26, ref: carOfTrim }, { h: "색상명(참고)", f: "", w: 18, ref: (o, X) => X.color.get(o.colorId)?.name }, { h: "추가금액", f: "extraPrice", t: "int", w: 10 }, { h: "비고", f: "note", w: 16 }] },
  { kind: "vehicleImages", name: "이미지", key: ["id"], cols: [
    { h: "이미지ID", f: "id", w: 40 }, { h: "라인업ID", f: "lineupId", w: 38 }, { h: "트림ID", f: "trimId", w: 30, note: "비우면 라인업 대표" },
    { h: "이미지주소", f: "imageUrl", w: 44, note: "관리자 화면에서 올린 이미지 주소 (/media/...)" }, { h: "색상키", f: "colorKey", w: 12 }, { h: "뷰", f: "view", w: 8 }, { h: "정렬", f: "sortOrder", t: "int", w: 6 }] },
];
const DEL = "삭제";

function lookup(M: VM): Lookup {
  const m = (a: any[]) => new Map(a.map((o) => [o.id, o]));
  return { brand: m(M.brands), model: m(M.models), lineup: m(M.lineups), trim: m(M.trims), option: m(M.options), color: m(M.colors) };
}
const cellOut = (c: Col, o: any) => {
  const v = o[c.f];
  if (c.t === "status") return v === "INACTIVE" ? "N" : "Y";
  if (c.t === "strArr") return Array.isArray(v) ? v.join("\n") : "";   // 한 칸에 한 줄씩 (항목 안에 | 가 있는 경우가 있어 줄바꿈 사용)
  return v ?? "";
};

/** 엑셀 만들기 (?brand=hyundai 처럼 브랜드만) */
export async function buildVmWorkbook(opts: { brandId?: string } = {}) {
  const M = await loadDraft(); const X = lookup(M);
  const inBrand = (modelId: string | undefined) => !opts.brandId || X.model.get(modelId || "")?.brandId === opts.brandId;
  const trimModel = (trimId: string) => { const t = X.trim.get(trimId); return t && X.lineup.get(t.lineupId)?.modelId; };
  const filters: Record<string, (o: any) => boolean> = {
    brands: (o) => !opts.brandId || o.id === opts.brandId, models: (o) => !opts.brandId || o.brandId === opts.brandId,
    lineups: (o) => inBrand(o.modelId), trims: (o) => inBrand(X.lineup.get(o.lineupId)?.modelId), options: (o) => inBrand(o.modelId),
    trimOptions: (o) => inBrand(trimModel(o.trimId)), colors: (o) => !opts.brandId || o.brandId === opts.brandId,
    trimColors: (o) => inBrand(trimModel(o.trimId)), vehicleImages: (o) => inBrand(X.lineup.get(o.lineupId)?.modelId),
  };
  const wb = new ExcelJS.Workbook(); wb.creator = "차큐 관리자";
  const guide = wb.addWorksheet("작성안내");
  guide.columns = [{ width: 20 }, { width: 100 }];
  [["사용법", "필요한 시트만 고쳐서 올리면 됩니다. 고치지 않은 행은 그대로입니다 (지운 행도 삭제되지 않음 — 삭제는 '삭제' 열에 Y)."],
   ["새 항목", "ID 를 비우면 자동 생성. 같은 파일에서 새 모델에 새 라인업을 붙이려면 모델ID 를 직접 정해 적고(영문 소문자·숫자·-), 라인업의 모델ID 에 같은 값을 적으세요."],
   ["노출", "Y = 사이트에 보임, N = 숨김 (견적이 연결된 트림은 삭제 대신 N)"],
   ["가격", "트림가격·옵션가격·추가금액은 원 단위 숫자"],
   ["(참고) 열", "읽기 전용 — 고쳐도 반영되지 않습니다"],
   ["반영", "올리기 → 미리보기 확인 → 적용(작업본) → 관리자 '사이트 반영' 을 눌러야 사이트에 나갑니다"]]
    .forEach((r) => { const row = guide.addRow(r); row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { wrapText: true }; });
  for (const sh of SHEETS) {
    const ws = wb.addWorksheet(sh.name, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    ws.columns = [...sh.cols.map((c) => ({ header: c.h, key: c.h, width: c.w || 14 })), { header: DEL, key: DEL, width: 6 }];
    const head = ws.getRow(1); head.height = 24;
    head.eachCell((cell, i) => {
      const c = sh.cols[i - 1]; const ref = !!c?.ref;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ref ? "FF9CA3AF" : i === sh.cols.length + 1 ? "FFB91C1C" : "FF111827" } };
      if (c?.note) cell.note = c.note;
    });
    for (const o of (M[sh.kind] || []).filter(filters[sh.kind] || (() => true))) {
      const row: Record<string, unknown> = {};
      for (const c of sh.cols) row[c.h] = c.ref ? (c.ref(o, X) ?? "") : cellOut(c, o);
      const r = ws.addRow(row);
      sh.cols.forEach((c, i) => { if (c.t === "strArr") r.getCell(i + 1).alignment = { wrapText: true, vertical: "top" }; });
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.cols.length + 1 } };
  }
  return wb;
}

// ---------------------------------------------------------------- 올리기: 미리보기 → 적용
type Op = { op: "create" | "update" | "delete"; kind: VmKind; id: string | null; createId?: string; patch: Record<string, unknown>; sheet: string; rowNo: number; label: string };
const cv = cellValue;
const norm = (c: Col, v: unknown) => {
  if (v === undefined || v === null || v === "") return c.t === "strArr" ? [] : c.t === "status" ? "ACTIVE" : null;
  if (c.t === "int") { const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s원]/g, "")); return Number.isFinite(n) ? Math.round(n) : String(v); }
  if (c.t === "status") return /^(n|inactive|숨김)$/i.test(String(v).trim()) ? "INACTIVE" : "ACTIVE";
  if (c.t === "strArr") { const t = String(v); return (/\r?\n/.test(t) ? t.split(/\r?\n/) : t.split(/\s+\|\s+/)).map((x) => x.trim()).filter(Boolean); }
  return String(v).trim();
};
const canon = (v: unknown): unknown => typeof v === "string" ? (v.trim() || null) : Array.isArray(v) ? v.map(canon).filter((x) => x !== null) : v ?? null;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));   // 앞뒤 공백·빈 항목 차이는 변경 아님

export async function planVmImport(buf: Buffer) {
  const M = await loadDraft();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const ops: Op[] = []; const errors: string[] = [];
  for (const sh of SHEETS) {
    const ws = wb.getWorksheet(sh.name); if (!ws) continue;
    const H: string[] = []; ws.getRow(1).eachCell((c, i) => { H[i] = String(cv(c.value) ?? "").trim(); });
    const cur = new Map((M[sh.kind] || []).map((o) => [idOf(sh.kind, o), o]));
    const editable = sh.cols.filter((c) => !c.ref && c.f !== "id");
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const raw: Record<string, unknown> = {}; H.forEach((h, i) => { if (h) raw[h] = cv(row.getCell(i).value) ?? null; });   // 비운 칸 = 값 지움
      if (!Object.values(raw).some((v) => v !== null && v !== undefined && String(v).trim() !== "")) return;
      const vals: Record<string, unknown> = {}; for (const c of sh.cols) if (!c.ref && c.h in raw) vals[c.f] = norm(c, raw[c.h]);
      const keyObj: any = {}; sh.key.forEach((k) => { keyObj[k] = vals[k] ?? null; });
      const hasKey = sh.key.every((k) => keyObj[k]);
      const key = hasKey ? (sh.key.length === 1 ? String(keyObj.id) : idOf(sh.kind, keyObj)) : null;
      const existing = key ? cur.get(key) : null;
      const label = `${sh.name} ${n}행`;
      if (/^y/i.test(String(raw[DEL] ?? "").trim())) { if (existing) ops.push({ op: "delete", kind: sh.kind, id: key, patch: {}, sheet: sh.name, rowNo: n, label }); else errors.push(`${label}: 삭제할 항목이 없습니다 (${key || "ID 없음"})`); return; }
      const patch: Record<string, unknown> = {};
      for (const c of editable) if (c.f in vals) {
        if (c.t === "int" && typeof vals[c.f] === "string") { errors.push(`${label}: ${c.h} 숫자 아님 (${vals[c.f]})`); return; }
        if (existing && c.t === "strArr" && Array.isArray(existing[c.f])) { const t = String(raw[c.h] ?? "").trim(); if (t === existing[c.f].join("\n") || t === existing[c.f].join(" | ")) continue; }   // 항목 안에 | 가 있어도 그대로면 변경 아님
        if (!existing || !same(existing[c.f] ?? (c.t === "strArr" ? [] : c.t === "status" ? "ACTIVE" : null), vals[c.f])) patch[c.f] = vals[c.f]; }
      if (existing) { if (Object.keys(patch).length) ops.push({ op: "update", kind: sh.kind, id: key, patch, sheet: sh.name, rowNo: n, label }); }
      else {
        for (const c of editable) if (c.f in vals && !(c.f in patch)) patch[c.f] = vals[c.f];
        if (sh.key.length > 1) sh.key.forEach((k) => { patch[k] = keyObj[k]; });
        ops.push({ op: "create", kind: sh.kind, id: null, createId: sh.key.length === 1 && key ? key : undefined, patch, sheet: sh.name, rowNo: n, label });
      }
    });
  }
  const summary: Record<string, { create: number; update: number; delete: number }> = {};
  for (const o of ops) { const s = (summary[KIND_KO[o.kind]] ||= { create: 0, update: 0, delete: 0 }); s[o.op]++; }
  const r = await q(`INSERT INTO vm_imports (ops, summary, errors) VALUES ($1,$2,$3) RETURNING id`, [JSON.stringify(ops), JSON.stringify(summary), JSON.stringify(errors.slice(0, 200))]);
  return { importId: r.rows[0].id as number, summary, total: ops.length, errors: errors.slice(0, 100), errorCount: errors.length, sample: ops.slice(0, 200).map((o) => ({ op: o.op, label: o.label, kind: KIND_KO[o.kind], id: o.id || o.createId || "(새 ID)", fields: Object.keys(o.patch) })) };
}

const ORDER: VmKind[] = ["brands", "models", "lineups", "trims", "options", "colors", "trimOptions", "trimColors", "vehicleImages"];
export async function applyVmImport(importId: number, adminId: number | null) {
  const r = await q(`SELECT applied_at FROM vm_imports WHERE id = $1`, [importId]);
  if (!r.rowCount) throw new VmError("미리보기가 없습니다", 404);
  if (r.rows[0].applied_at) throw new VmError("이미 적용된 파일입니다");
  let done = 0;
  await tx(async (c: pg.PoolClient) => {
    // 두 번 눌러도 한 번만 적용: 적용 표시를 먼저 (트랜잭션 안에서 잠금)
    const claim = await c.query(`UPDATE vm_imports SET applied_at = now(), applied_by = $2 WHERE id = $1 AND applied_at IS NULL RETURNING ops`, [importId, adminId]);
    if (!claim.rowCount) throw new VmError("이미 적용된 파일입니다");
    const ops = claim.rows[0].ops as Op[];
    const run = async (o: Op) => {
      try {
        if (o.op === "delete") await deleteItem(o.kind, o.id!, adminId, c);
        else await saveItem(o.kind, o.op === "update" ? o.id : null, o.patch, adminId, c, { createId: o.createId });
        done++;
      } catch (e: any) { throw new VmError(`${o.label}: ${e.message}`, e.status || 400); }
    };
    for (const k of ORDER) for (const o of ops.filter((x) => x.kind === k && x.op !== "delete")) await run(o);
    for (const k of [...ORDER].reverse()) for (const o of ops.filter((x) => x.kind === k && x.op === "delete")) await run(o);
    await c.query(`INSERT INTO vm_changes (admin_id, action, summary) VALUES ($1,'import',$2)`, [adminId, `엑셀 적용 ${done}건`]);
  });
  await loadDraft(true);
  return { applied: done };
}

// ---------------------------------------------------------------- 엑셀로 전체 교체 (9개 시트 = 작업본 전체)
//  · 파일에 있는 행만 남고, 파일에 없는 항목은 작업본에서 빠짐 ('_' 로 시작하는 시트·작성안내는 무시)
//  · 기존과 같은 ID 면 엑셀에 없는 필드(출처·라이선스 등)는 그대로 유지, 새 ID 는 기본값으로 생성
//  · 색상 조합 규칙·출처·제원(엑셀에 없는 종류)은 유지 — 단 없어진 트림·색상을 가리키는 것만 정리
//  · 오류가 하나라도 있으면 적용 불가 · 적용 직전 작업본은 반영 이력에 '자동 백업'으로 남아 되돌리기 가능
export const REPLACE_CONFIRM = "전체 교체";
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,120}$/;
function defaultsFor(kind: VmKind, o: any) {
  if (["brands", "models", "lineups", "trims"].includes(kind)) { o.status ??= "ACTIVE"; o.sortOrder ??= 999; }
  if (kind === "trimOptions") { o.type ??= "SELECTABLE"; o.dependency ??= []; o.exclusionRule ??= []; o.condition ??= null; }
  if (kind === "vehicleImages") Object.assign(o, { source: o.source || "CHAQ_OWN", verified: o.verified ?? true, trimId: o.trimId || null, thumbnailUrl: o.thumbnailUrl || null, view: o.view || "side", sortOrder: o.sortOrder ?? 0, author: o.author || "차큐", license: o.license || "차큐 자체 제작" });
  if (kind === "trims") o.sourceIds ??= [];
  return o;
}

export type ReplaceRows = { rows: Partial<Record<VmKind, { label: string; key: string; vals: Record<string, unknown> }[]>>; errors: string[]; skippedDel: Record<string, number> };
/** 엑셀 9개 시트 → 행 값 (DB 와 무관한 읽기만 — 배포용 초기화 파일도 이 결과를 그대로 저장) */
export async function readReplaceSheets(buf: Buffer): Promise<ReplaceRows> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const missing = SHEETS.filter((sh) => !wb.getWorksheet(sh.name)).map((sh) => sh.name);
  if (missing.length) throw new VmError(`전체 교체는 9개 시트가 모두 있어야 합니다 — 없는 시트: ${missing.join(", ")}`);
  const out: ReplaceRows = { rows: {}, errors: [], skippedDel: {} }; const errors = out.errors;
  for (const sh of SHEETS) {
    const ws = wb.getWorksheet(sh.name)!; const list: { label: string; key: string; vals: Record<string, unknown> }[] = (out.rows[sh.kind] = []);
    const H: string[] = []; ws.getRow(1).eachCell((c, i) => { H[i] = String(cv(c.value) ?? "").trim(); });
    const keyCols = sh.key.map((k) => sh.cols.find((c) => c.f === k)!);
    const noKey = keyCols.filter((c) => !H.includes(c.h)).map((c) => c.h);
    if (noKey.length) { errors.push(`${sh.name} 시트: '${noKey.join(", ")}' 열이 없습니다`); continue; }
    const seen = new Set<string>();
    const editable = sh.cols.filter((c) => !c.ref);
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const raw: Record<string, unknown> = {}; H.forEach((h, i) => { if (h) raw[h] = cv(row.getCell(i).value) ?? null; });
      if (!Object.values(raw).some((v) => v !== null && v !== undefined && String(v).trim() !== "")) return;
      const label = `${sh.name} ${n}행`;
      if (/^y/i.test(String(raw[DEL] ?? "").trim())) { out.skippedDel[sh.name] = (out.skippedDel[sh.name] || 0) + 1; return; }   // 삭제 표시 행 = 빼고 올림
      const vals: Record<string, unknown> = {};
      for (const c of editable) if (c.h in raw) {
        const v = norm(c, raw[c.h]);
        if (c.t === "int" && typeof v === "string") { errors.push(`${label}: ${c.h} 숫자 아님 (${v})`); return; }
        vals[c.f] = v;
      }
      const keyObj: any = {}; sh.key.forEach((k) => { keyObj[k] = vals[k] ?? null; });
      if (!sh.key.every((k) => keyObj[k])) { errors.push(`${label}: ${keyCols.map((c) => c.h).join("·")} 가 비어 있습니다 (전체 교체는 ID 필수)`); return; }
      const key = sh.key.length === 1 ? String(keyObj.id) : idOf(sh.kind, keyObj);
      if (seen.has(key)) { errors.push(`${label}: 같은 항목이 파일에 두 번 있습니다 (${key})`); return; }
      seen.add(key);
      list.push({ label, key, vals });
    });
  }
  return out;
}

/** 전체 교체 미리보기: 엑셀 파일 또는 미리 읽어 둔 행 값(배포용 초기화) → 지금 작업본과 합쳐 새 전체 데이터 + 영향 */
export async function planVmReplace(input: Buffer | ReplaceRows) {
  const R = Buffer.isBuffer(input) ? await readReplaceSheets(input) : input;
  const M0 = await loadDraft(true);
  const baseVersion = String((await q(`SELECT value FROM app_state WHERE key = 'vm_draft_version'`)).rows[0]?.value || "0");
  const N = { meta: M0.meta || {} } as VM; for (const k of VM_KINDS) N[k] = [];
  const errors: string[] = [...R.errors]; const skippedDel = R.skippedDel;
  for (const sh of SHEETS) {
    const cur = new Map((M0[sh.kind] || []).map((o) => [idOf(sh.kind, o), o]));
    for (const { label, key, vals } of R.rows[sh.kind] || []) {
      const old = cur.get(key);
      if (!old && sh.key.length === 1 && !ID_RE.test(key)) { errors.push(`${label}: ID '${key}' 형식 오류 (영문 소문자·숫자·-·_·. 만)`); continue; }
      const o = defaultsFor(sh.kind, { ...(old ? JSON.parse(JSON.stringify(old)) : {}), ...vals });
      const miss = (REQUIRED[sh.kind] || []).find((f) => o[f] === undefined || o[f] === null || o[f] === "");
      if (miss) { errors.push(`${label}: ${sh.cols.find((c) => c.f === miss)?.h || miss} 필수`); continue; }
      N[sh.kind].push(o);
    }
  }
  // 엑셀에 없는 종류: 유지하되 없어진 트림·색상·라인업을 가리키는 것만 정리
  const T = new Set(N.trims.map((t) => t.id)), C = new Set(N.colors.map((c) => c.id)), L = new Set(N.lineups.map((l) => l.id));
  N.colorRules = (M0.colorRules || []).filter((r) => T.has(r.trimId) && C.has(r.interiorColorId)).map((r) => ({ ...r, allowedExteriorColorIds: (r.allowedExteriorColorIds || []).filter((i: string) => C.has(i)), excludedExteriorColorIds: (r.excludedExteriorColorIds || []).filter((i: string) => C.has(i)) }));
  N.sources = M0.sources || [];
  N.vehicleSpecs = (M0.vehicleSpecs || []).filter((s) => s.trimId ? T.has(s.trimId) : s.lineupId ? L.has(s.lineupId) : true);
  // 참조 검사 (반영 검사 + 엑셀 전용 추가 검사)
  const B = new Set(N.brands.map((b) => b.id)), MO = new Set(N.models.map((m) => m.id));
  N.options.forEach((o) => { if (!MO.has(o.modelId)) errors.push(`옵션 ${o.id}: 모델 '${o.modelId}' 없음`); });
  N.colors.forEach((c) => { if (!B.has(c.brandId)) errors.push(`색상 ${c.id}: 브랜드 '${c.brandId}' 없음`); });
  N.vehicleImages.forEach((x) => { if (x.trimId && !T.has(x.trimId)) errors.push(`이미지 ${x.id}: 트림 '${x.trimId}' 없음`); });
  N.trimColors.forEach((x) => { if (!["EXTERIOR", "INTERIOR"].includes(x.type)) errors.push(`트림색상 ${x.trimId}|${x.colorId}: 구분은 EXTERIOR / INTERIOR`); });
  const v = validateVm(N);
  errors.push(...v.errors); if (v.errorCount > v.errors.length) errors.push(`… 반영 검사 오류 ${v.errorCount - v.errors.length}건 더`);

  // 건수 비교
  const counts: Record<string, { kind: string; cur: number; next: number; added: number; removed: number }> = {};
  for (const k of VM_KINDS) {
    const a = new Set((M0[k] || []).map((o) => idOf(k, o))), b = new Set((N[k] || []).map((o) => idOf(k, o)));
    if (!a.size && !b.size) continue;
    counts[k] = { kind: KIND_KO[k], cur: a.size, next: b.size, added: [...b].filter((x) => !a.has(x)).length, removed: [...a].filter((x) => !b.has(x)).length };
  }
  // 영향: 사이트 견적(재고특가·빠른인도·금융사) · 이용후기 — ID 로만 연결돼 있어 같은 ID 면 그대로 붙음
  const Tm = new Map(N.trims.map((t) => [t.id, t]));
  const qr = (await q(`SELECT r.kind, r.trim_id, COUNT(*)::int AS n FROM quote_rows r JOIN published_sets p ON p.batch_id = r.batch_id AND p.kind = r.kind WHERE r.trim_id IS NOT NULL AND r.trim_id <> '' GROUP BY 1, 2`)).rows;
  const qMissing = qr.filter((r) => !Tm.has(r.trim_id)), qHidden = qr.filter((r) => Tm.get(r.trim_id)?.status === "INACTIVE");
  const rv = (await q(`SELECT id, data FROM content_items WHERE kind = 'review'`).catch(() => ({ rows: [] as any[] }))).rows;
  const rMissing = rv.filter((r) => (r.data?.modelId && !MO.has(r.data.modelId)) || (r.data?.trimId && !T.has(r.data.trimId)));
  const sum = (a: any[]) => a.reduce((s, r) => s + r.n, 0);
  const impact = {
    quotes: { linked: sum(qr), trims: qr.length, missing: sum(qMissing), missingTrims: qMissing.slice(0, 30).map((r) => `${r.kind} · ${r.trim_id} (${r.n}건)`), hidden: sum(qHidden), hiddenTrims: qHidden.slice(0, 30).map((r) => `${r.kind} · ${r.trim_id} (${r.n}건)`) },
    reviews: { total: rv.length, missing: rMissing.length, sample: rMissing.slice(0, 20).map((r) => `#${r.id} ${r.data?.car || ""} (${r.data?.modelId || ""}${r.data?.trimId ? " / " + r.data.trimId : ""})`) },
    keptOther: { colorRules: N.colorRules.length, sources: N.sources.length, vehicleSpecs: N.vehicleSpecs.length },
    deleteMarked: skippedDel,
  };
  const r = await q(`INSERT INTO vm_imports (ops, summary, errors) VALUES ($1,$2,$3) RETURNING id`, [JSON.stringify({ mode: "replace", baseVersion, gz: gz(N).toString("base64") }), JSON.stringify({ mode: "replace", counts, impact }), JSON.stringify(errors.slice(0, 200))]);
  return { importId: r.rows[0].id as number, mode: "replace", counts, impact, warnings: v.warnings, warningCount: v.warningCount, errors: errors.slice(0, 100), errorCount: errors.length, canApply: errors.length === 0, confirmText: REPLACE_CONFIRM };
}

export async function applyVmReplace(importId: number, confirm: string, adminId: number | null) {
  if (String(confirm || "").trim() !== REPLACE_CONFIRM) throw new VmError(`확인 문구 '${REPLACE_CONFIRM}' 를 정확히 입력하세요`);
  const r = await q(`SELECT ops, errors, applied_at FROM vm_imports WHERE id = $1`, [importId]);
  if (!r.rowCount) throw new VmError("미리보기가 없습니다", 404);
  const { ops, errors, applied_at } = r.rows[0];
  if (ops?.mode !== "replace") throw new VmError("전체 교체 미리보기가 아닙니다");
  if (applied_at) throw new VmError("이미 적용된 파일입니다");
  if ((errors || []).length) throw new VmError(`오류 ${errors.length}건이 있어 적용할 수 없습니다 — 파일을 고쳐 다시 올려 주세요`);
  const ver = String((await q(`SELECT value FROM app_state WHERE key = 'vm_draft_version'`)).rows[0]?.value || "0");
  if (ver !== ops.baseVersion) throw new VmError("미리보기 이후 작업본이 바뀌었습니다 — 파일을 다시 올려 미리보기부터 해 주세요", 409);
  const N = gunzipVm(Buffer.from(ops.gz, "base64"));
  const M0 = await loadDraft(true);
  const backupId = await tx(async (c: pg.PoolClient) => {
    // 두 번 눌러도 한 번만 · 그 사이 다른 사람이 작업본을 고쳤으면 중단 (버전 행 잠금 후 다시 확인)
    const claim = await c.query(`UPDATE vm_imports SET applied_at = now(), applied_by = $2 WHERE id = $1 AND applied_at IS NULL RETURNING id`, [importId, adminId]);
    if (!claim.rowCount) throw new VmError("이미 적용된 파일입니다");
    const v2 = String((await c.query(`SELECT value FROM app_state WHERE key = 'vm_draft_version' FOR UPDATE`)).rows[0]?.value || "0");
    if (v2 !== ops.baseVersion) throw new VmError("미리보기 이후 작업본이 바뀌었습니다 — 파일을 다시 올려 미리보기부터 해 주세요", 409);
    const b = await c.query(`INSERT INTO vm_releases (created_by, note, counts, payload, is_current) VALUES ($1,$2,$3,$4,false) RETURNING id`, [adminId, `전체 교체 전 작업본 자동 백업 (엑셀 #${importId})`, countsOf(M0), gz(M0)]);
    await replaceDraft(N, adminId, "replace", `엑셀 전체 교체 #${importId} (백업 #${b.rows[0].id})`, c);
    return b.rows[0].id as number;
  });
  await loadDraft(true);
  return { ok: true, backupReleaseId: backupId, counts: countsOf(N) };
}
