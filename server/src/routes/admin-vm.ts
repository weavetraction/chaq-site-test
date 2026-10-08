// 관리자 API — 차량 데이터(마스터) · 이미지 업로드
//  · 수정은 작업본에 바로 저장, '사이트 반영' 을 눌러야 사이트에 나감 (반영 이력에서 되돌리기 가능)
import { Router } from "express";
import multer from "multer";
import { q } from "../db.js";
import { adminOf } from "../middleware/auth.js";
import {
  VM_KINDS, VmKind, KIND_KO, FIELDS, loadDraft, getItem, children, trimBundle, searchTree, saveItem, deleteItem,
  publishDraft, rollbackTo, releases, pendingChanges, validateVm, countsOf, VmError, idOf,
} from "../lib/vm-store.js";
import { buildVmWorkbook, planVmImport, applyVmImport, planVmReplace, applyVmReplace } from "../lib/vm-excel.js";
import { saveMedia, listMedia, MEDIA_PURPOSES } from "../lib/media.js";
import { tx } from "../db.js";

export const adminVmRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 20 } });
const wrap = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => fn(req, res).catch(next);
const kindOf = (k: unknown): VmKind => { if (!VM_KINDS.includes(k as VmKind)) throw new VmError("종류 오류"); return k as VmKind; };
const by = (a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || String(a.nameKo || a.shortLabel || a.name || "").localeCompare(String(b.nameKo || b.shortLabel || b.name || ""), "ko");

// ---------------------------------------------------------------- 현황
adminVmRouter.get("/api/admin/vm/status", wrap(async (_req, res) => {
  const M = await loadDraft();
  const cur = (await q(`SELECT r.id, r.created_at, r.note, a.name AS by FROM vm_releases r LEFT JOIN admins a ON a.id = r.created_by WHERE r.is_current`)).rows[0] || null;
  res.json({ counts: countsOf(M), pending: await pendingChanges(), current: cur, kinds: KIND_KO, fields: FIELDS });
}));
adminVmRouter.get("/api/admin/vm/validate", wrap(async (_req, res) => res.json(validateVm(await loadDraft(true)))));

// ---------------------------------------------------------------- 목록 (브랜드 → 모델 → 라인업 → 트림)
adminVmRouter.get("/api/admin/vm/tree", wrap(async (req, res) => {
  const M = await loadDraft();
  const level = String(req.query.level || "brands"), parent = String(req.query.parent || "");
  if (level === "brands") {
    const n: Record<string, number> = {}; M.models.forEach((m) => { n[m.brandId] = (n[m.brandId] || 0) + 1; });
    return res.json(M.brands.slice().sort(by).map((b) => ({ ...b, childCount: n[b.id] || 0 })));
  }
  if (level === "models") {
    const n: Record<string, number> = {}; M.lineups.forEach((l) => { n[l.modelId] = (n[l.modelId] || 0) + 1; });
    return res.json(M.models.filter((m) => m.brandId === parent).sort(by).map((m) => ({ ...m, childCount: n[m.id] || 0 })));
  }
  if (level === "lineups") {
    const n: Record<string, number> = {}; M.trims.forEach((t) => { n[t.lineupId] = (n[t.lineupId] || 0) + 1; });
    const img: Record<string, number> = {}; M.vehicleImages.forEach((i) => { img[i.lineupId] = (img[i.lineupId] || 0) + 1; });
    return res.json(M.lineups.filter((l) => l.modelId === parent).sort((a, b) => (b.modelYear || 0) - (a.modelYear || 0) || by(a, b)).map((l) => ({ ...l, childCount: n[l.id] || 0, imageCount: img[l.id] || 0 })));
  }
  if (level === "trims") {
    const o: Record<string, number> = {}; M.trimOptions.forEach((x) => { o[x.trimId] = (o[x.trimId] || 0) + 1; });
    const c: Record<string, number> = {}; M.trimColors.forEach((x) => { c[x.trimId] = (c[x.trimId] || 0) + 1; });
    return res.json(M.trims.filter((t) => t.lineupId === parent).sort(by).map((t) => { const x = { ...t, optionCount: o[t.id] || 0, colorCount: c[t.id] || 0, stdCount: (t.standardItems || []).length }; delete x.standardItems; return x; }));
  }
  res.status(400).json({ error: "level 오류" });
}));
adminVmRouter.get("/api/admin/vm/search", wrap(async (req, res) => res.json(await searchTree(String(req.query.q || ""), 60))));
adminVmRouter.get("/api/admin/vm/trim/:id", wrap(async (req, res) => {
  const b = await trimBundle(String(req.params.id)); if (!b) return res.status(404).json({ error: "트림 없음" });
  res.json(b);
}));
adminVmRouter.get("/api/admin/vm/item/:kind/:id", wrap(async (req, res) => {
  const it = await getItem(kindOf(req.params.kind), String(req.params.id)); if (!it) return res.status(404).json({ error: "없음" });
  res.json(it);
}));
/** 하위 목록: ?kind=options&parent=<모델ID> · ?kind=colors&parent=<브랜드ID> · ?kind=vehicleImages&parent=<라인업ID> */
adminVmRouter.get("/api/admin/vm/list", wrap(async (req, res) => res.json(await children(kindOf(req.query.kind), req.query.parent ? String(req.query.parent) : null))));

// ---------------------------------------------------------------- 수정
adminVmRouter.post("/api/admin/vm/item/:kind", wrap(async (req, res) => {
  const { data, id } = req.body || {};
  res.status(201).json(await saveItem(kindOf(req.params.kind), null, data || {}, adminOf(req).id, undefined, { createId: id ? String(id).trim() : undefined }));
}));
adminVmRouter.patch("/api/admin/vm/item/:kind/:id", wrap(async (req, res) => {
  res.json(await saveItem(kindOf(req.params.kind), String(req.params.id), (req.body || {}).data || {}, adminOf(req).id));
}));
adminVmRouter.delete("/api/admin/vm/item/:kind/:id", wrap(async (req, res) => { await deleteItem(kindOf(req.params.kind), String(req.params.id), adminOf(req).id); res.json({ ok: true }); }));

/** 다른 트림에서 옵션·색상·기본품목 복사 (새 트림 만들 때) — 같은 항목이 있으면 건너뜀 */
adminVmRouter.post("/api/admin/vm/trim/:id/copy-from", wrap(async (req, res) => {
  const to = String(req.params.id), from = String(req.body?.sourceTrimId || ""), what: string[] = Array.isArray(req.body?.what) ? req.body.what : ["options", "colors", "standardItems"];
  const src = await trimBundle(from); const dst = await getItem("trims", to);
  if (!src || !dst) throw new VmError("트림 없음", 404);
  const admin = adminOf(req).id; let n = 0;
  await tx(async (c) => {
    const exists = async (kind: VmKind, o: any) => (await c.query(`SELECT 1 FROM vm_items WHERE kind = $1 AND id = $2`, [kind, idOf(kind, o)])).rowCount;
    if (what.includes("options")) for (const x of src.options) { const o = { trimId: to, optionId: x.optionId, price: x.price, type: x.type, dependencyNote: x.dependencyNote, exclusionNote: x.exclusionNote }; if (!(await exists("trimOptions", o))) { await saveItem("trimOptions", null, clean(o), admin, c); n++; } }
    if (what.includes("colors")) for (const x of src.colors) { const o = { trimId: to, colorId: x.colorId, type: x.type, extraPrice: x.extraPrice, note: x.note }; if (!(await exists("trimColors", o))) { await saveItem("trimColors", null, clean(o), admin, c); n++; } }
    if (what.includes("standardItems") && (src.trim.standardItems || []).length && !(dst.standardItems || []).length) { await saveItem("trims", to, { standardItems: src.trim.standardItems }, admin, c); n++; }
  });
  res.json({ ok: true, copied: n });
}));
const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------- 엑셀
adminVmRouter.get("/api/admin/vm/export.xlsx", wrap(async (req, res) => {
  const brandId = req.query.brand ? String(req.query.brand) : undefined;
  const wb = await buildVmWorkbook({ brandId });
  const name = `차큐_차량데이터${brandId ? "_" + brandId : ""}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  await wb.xlsx.write(res); res.end();
}));
adminVmRouter.post("/api/admin/vm/import", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
  try { res.json(await planVmImport(req.file.buffer)); }
  catch (e: any) { if (e instanceof VmError) throw e; throw new VmError("엑셀 파일을 읽을 수 없습니다: " + (e.message || e)); }
}));
adminVmRouter.post("/api/admin/vm/import/:id/apply", wrap(async (req, res) => res.json(await applyVmImport(Number(req.params.id), adminOf(req).id))));
/** 엑셀로 전체 교체: 미리보기(건수·끊길 연결) → 확인 문구 입력 후 적용 (적용 전 작업본은 자동 백업) */
adminVmRouter.post("/api/admin/vm/replace", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
  try { res.json(await planVmReplace(req.file.buffer)); }
  catch (e: any) { if (e instanceof VmError) throw e; throw new VmError("엑셀 파일을 읽을 수 없습니다: " + (e.message || e)); }
}));
adminVmRouter.post("/api/admin/vm/replace/:id/apply", wrap(async (req, res) => res.json(await applyVmReplace(Number(req.params.id), String(req.body?.confirm || ""), adminOf(req).id))));

// ---------------------------------------------------------------- 사이트 반영 · 이력
adminVmRouter.post("/api/admin/vm/publish", wrap(async (req, res) => res.json(await publishDraft(adminOf(req).id, String(req.body?.note || "").slice(0, 200)))));
adminVmRouter.get("/api/admin/vm/releases", wrap(async (_req, res) => res.json(await releases())));
adminVmRouter.post("/api/admin/vm/releases/:id/rollback", wrap(async (req, res) => { await rollbackTo(Number(req.params.id), adminOf(req).id); res.json({ ok: true }); }));
adminVmRouter.get("/api/admin/vm/changes", wrap(async (_req, res) => {
  const { rows } = await q(`SELECT c.id, c.at, c.action, c.kind, c.item_id, c.summary, a.name AS by FROM vm_changes c LEFT JOIN admins a ON a.id = c.admin_id ORDER BY c.id DESC LIMIT 100`);
  res.json(rows.map((r) => ({ ...r, kindKo: r.kind ? KIND_KO[r.kind as VmKind] : "" })));
}));

// ---------------------------------------------------------------- 이미지 (여러 장 한 번에)
adminVmRouter.post("/api/admin/media", imgUpload.array("files", 20), wrap(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (!files.length) return res.status(400).json({ error: "파일이 없습니다" });
  const purpose = String(req.body?.purpose || "etc");
  const out = [];
  for (const f of files) out.push(await saveMedia(f.buffer, Buffer.from(f.originalname, "latin1").toString("utf8"), purpose, adminOf(req).id));
  res.status(201).json(out);
}));
adminVmRouter.get("/api/admin/media", wrap(async (req, res) => res.json(await listMedia(MEDIA_PURPOSES.includes(req.query.purpose as any) ? String(req.query.purpose) : undefined, Number(req.query.page) || 1))));
