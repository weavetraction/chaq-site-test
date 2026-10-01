// 관리자 API (/api/admin/*) — 로그인 쿠키 필요 (login 제외)
import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { limiter } from "../lib/limits.js";
import { q } from "../db.js";
import { issue, clear, requireAdmin, adminOf } from "../middleware/auth.js";
import { buildWorkbook, parseWorkbook } from "../lib/excel.js";
import { createBatch, publishBatch, discardBatch, setRowTrim, publishedStatus, getPublished, refreshSummary } from "../lib/quotes-store.js";
import { KINDS, Kind } from "../lib/quotes-format.js";
import { vm } from "../lib/vm.js";
import { listInquiries, updateInquiry, InquiryPatch, STATUS_KO } from "../lib/inquiries.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const loginLimit = limiter("login", { windowMs: 15 * 60_000, limit: 20, message: { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요" } });
const wrap = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => fn(req, res).catch(next);

adminRouter.post("/api/admin/login", loginLimit, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await q(`SELECT id, email, name, password_hash FROM admins WHERE email = $1`, [String(email || "").trim().toLowerCase()]);
  const a = rows[0];
  if (!a || !(await bcrypt.compare(String(password || ""), a.password_hash))) return res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다" });
  await q(`UPDATE admins SET last_login_at = now() WHERE id = $1`, [a.id]);
  issue(res, { id: a.id, email: a.email, name: a.name });
  res.json({ id: a.id, email: a.email, name: a.name });
}));
adminRouter.post("/api/admin/logout", (_req, res) => { clear(res); res.json({ ok: true }); });

adminRouter.use("/api/admin", requireAdmin);
adminRouter.get("/api/admin/me", (req, res) => res.json(adminOf(req)));

// ---------------------------------------------------------------- 견적 데이터
adminRouter.get("/api/admin/quotes/status", wrap(async (_req, res) => res.json({ published: await publishedStatus(), vmTrims: vm.count() })));

/** 현재 사이트 데이터를 엑셀로 (수정 후 그대로 다시 올리면 됨). ?kinds=stock,fast  ?empty=1 (빈 양식 + 예시 1행) */
adminRouter.get("/api/admin/quotes/export.xlsx", wrap(async (req, res) => {
  const kinds = String(req.query.kinds || "").split(",").filter((k) => KINDS.includes(k as Kind)) as Kind[];
  const pub = await getPublished();
  const data = req.query.empty ? {} : Object.fromEntries((kinds.length ? kinds : KINDS).map((k) => [k, pub[k]]));
  const wb = await buildWorkbook(data, { example: !!req.query.empty });
  const name = req.query.empty ? "차큐_견적데이터_양식.xlsx" : `차큐_견적데이터_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  await wb.xlsx.write(res); res.end();
}));

/** 엑셀 업로드 → 미리보기용 DRAFT 생성 (아직 사이트에 반영 안 됨) */
adminRouter.post("/api/admin/quotes/upload", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일이 없습니다" });
  const { rows, missingHeaders } = await parseWorkbook(req.file.buffer);
  if (missingHeaders.length) return res.status(400).json({ error: "양식이 다릅니다 — 필요한 열: " + missingHeaders.join(", ") });
  if (!rows.length) return res.status(400).json({ error: "데이터 행이 없습니다" });
  const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const r = await createBatch(rows, { fileName, adminId: adminOf(req).id });
  res.status(201).json(r);
}));

adminRouter.get("/api/admin/batches", wrap(async (_req, res) => {
  const { rows } = await q(`SELECT b.id, b.status, b.source, b.file_name, b.kinds, b.summary, b.created_at, b.published_at, a.name AS created_by_name,
      ARRAY(SELECT kind FROM published_sets p WHERE p.batch_id = b.id) AS live_kinds
    FROM quote_batches b LEFT JOIN admins a ON a.id = b.created_by ORDER BY b.id DESC LIMIT 50`);
  res.json(rows);
}));

/** batch 상세: 요약 + 행 목록 (?unlinked=1 이면 트림 미연결만) */
adminRouter.get("/api/admin/batches/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const b = (await q(`SELECT * FROM quote_batches WHERE id = $1`, [id])).rows[0];
  if (!b) return res.status(404).json({ error: "없음" });
  const where = req.query.unlinked ? "AND trim_id IS NULL" : "";
  const kind = KINDS.includes(req.query.kind as Kind) ? req.query.kind : null;
  const { rows } = await q(`SELECT kind, rec_id, trim_id, link_status, data->>'brand' AS brand, data->>'model' AS model, data->>'year' AS year, data->>'trim' AS trim
    FROM quote_rows WHERE batch_id = $1 ${where} ${kind ? "AND kind = $2" : ""} ORDER BY kind, sort_order LIMIT 2000`, kind ? [id, kind] : [id]);
  res.json({ batch: b, rows: rows.map((r) => ({ ...r, trimLabel: vm.get(r.trim_id)?.label || null })) });
}));

adminRouter.patch("/api/admin/batches/:id/rows", wrap(async (req, res) => {
  const { kind, recId, trimId, applySame } = req.body || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "kind 오류" });
  const id = Number(req.params.id);
  const rec = await setRowTrim(id, kind, String(recId), trimId ? String(trimId) : null);
  let applied = 1;
  if (applySame && trimId) {   // 같은 브랜드·모델·연식·등급의 미연결 행에 같이 적용
    const { rows } = await q(`SELECT kind, rec_id FROM quote_rows WHERE batch_id = $1 AND trim_id IS NULL AND data->>'brand' = $2 AND data->>'model' = $3 AND data->>'year' = $4 AND data->>'trim' = $5`, [id, rec.brand, rec.model, rec.year, rec.trim]);
    for (const r of rows) { await setRowTrim(id, r.kind, r.rec_id, String(trimId)); applied++; }
  }
  const summary = await refreshSummary(id);
  res.json({ ok: true, applied, summary, trimLabel: vm.get(trimId)?.label || null });
}));

adminRouter.post("/api/admin/batches/:id/publish", wrap(async (req, res) => { await publishBatch(Number(req.params.id), adminOf(req).id); res.json({ ok: true, published: await publishedStatus() }); }));
adminRouter.post("/api/admin/batches/:id/discard", wrap(async (req, res) => { await discardBatch(Number(req.params.id)); res.json({ ok: true }); }));

adminRouter.get("/api/admin/trims", wrap(async (req, res) => res.json(vm.search(String(req.query.q || ""), 30))));

// ---------------------------------------------------------------- 상담 문의
adminRouter.get("/api/admin/inquiries", wrap(async (req, res) => {
  res.json({ ...(await listInquiries({ status: req.query.status ? String(req.query.status) : undefined, q: req.query.q ? String(req.query.q) : undefined, page: Number(req.query.page) || 1 })), statusLabels: STATUS_KO });
}));
adminRouter.patch("/api/admin/inquiries/:id", wrap(async (req, res) => {
  const p = InquiryPatch.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: "입력 형식 오류" });
  const r = await updateInquiry(Number(req.params.id), p.data);
  if (!r) return res.status(404).json({ error: "없음" });
  res.json(r);
}));
adminRouter.get("/api/admin/inquiries/export.csv", wrap(async (_req, res) => {
  const { rows } = await q(`SELECT id, created_at, status, source, kind, rec_id, car_name, trim_name, spec, conditions, monthly, options, color, memo, assignee, page_url, first_touch, last_touch FROM inquiries ORDER BY id DESC LIMIT 10000`);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["번호", "접수일시", "상태", "유입", "구분", "견적ID", "차량", "등급", "사양", "조건", "월납입금", "옵션", "색상", "메모", "담당", "페이지",
    "유입_source", "유입_medium", "유입_campaign", "유입_term", "유입_content", "처음유입_source", "처음유입_medium", "처음유입_campaign", "광고클릭ID", "랜딩"];
  const clk = (t: any) => t.gclid ? "gclid" : t.fbclid ? "fbclid" : t.n_media || t.n_ad ? "naver" : t.kclid ? "kakao" : "";
  const body = rows.map((r) => { const L = r.last_touch || {}, F = r.first_touch || {}; return [r.id, new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }), STATUS_KO[r.status] || r.status, r.source, r.kind, r.rec_id, r.car_name, r.trim_name, r.spec, JSON.stringify(r.conditions), r.monthly, (r.options || []).join(" / "), r.color, r.memo, r.assignee, r.page_url,
    L.source, L.medium, L.campaign, L.term, L.content, F.source, F.medium, F.campaign, clk(L), L.landing].map(esc).join(","); });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("차큐_상담문의.csv")}`);
  res.send("﻿" + [head.map(esc).join(","), ...body].join("\n"));
}));
