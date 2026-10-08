// 관리자 API (/api/admin/*) — 로그인 쿠키 필요 (login 제외)
import { Router } from "express";
import bcrypt from "bcryptjs";
import { limiter } from "../lib/limits.js";
import { wrap, intParam, excelUpload as upload } from "../lib/http.js";
import { loadDraft } from "../lib/vm-store.js";
import { q } from "../db.js";
import { issue, clear, requireAdmin, adminOf } from "../middleware/auth.js";
import { buildWorkbook, parseWorkbook } from "../lib/excel.js";
import { createBatch, publishBatch, discardBatch, setRowTrim, publishedStatus, getPublished, refreshSummary, openEditDraft, saveDraftRow, deleteDraftRow, reorderDraftRows, getRow } from "../lib/quotes-store.js";
import { adminVmRouter } from "./admin-vm.js";
import { adminContentRouter } from "./admin-content.js";
import { adminHomeRouter } from "./admin-home.js";
import { KINDS, Kind } from "../lib/quotes-format.js";
import { vm } from "../lib/vm.js";
import { listInquiries, updateInquiry, InquiryPatch, STATUS_KO } from "../lib/inquiries.js";
import { integrationsForAdmin, saveIntegrations, IntegrationsInput } from "../lib/integrations.js";
import { maskPhone } from "../lib/members.js";

export const adminRouter = Router();
const loginLimit = limiter("login", { windowMs: 15 * 60_000, limit: 20, message: { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요" } });

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
// 견적·트림 검색·메인 화면은 차량 데이터 트림 색인을 씀 → 다른 서버에서 바뀐 작업본도 바로 반영 (10초 버전 확인)
adminRouter.use(["/api/admin/quotes", "/api/admin/batches", "/api/admin/trims", "/api/admin/home"], (_req, _res, next) => { loadDraft().then(() => next(), next); });

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
  const { rows } = await q(`SELECT b.id, b.status, b.source, b.file_name, b.kinds, b.summary, b.created_at, b.published_at, b.strict_master, b.updated_at, a.name AS created_by_name,
      ARRAY(SELECT kind FROM published_sets p WHERE p.batch_id = b.id) AS live_kinds
    FROM quote_batches b LEFT JOIN admins a ON a.id = b.created_by ORDER BY b.id DESC LIMIT 50`);
  res.json(rows);
}));

/** batch 상세: 요약 + 행 목록 (?unlinked=1 이면 트림 미연결만) */
adminRouter.get("/api/admin/batches/:id", wrap(async (req, res) => {
  const id = intParam(req.params.id);
  const b = (await q(`SELECT * FROM quote_batches WHERE id = $1`, [id])).rows[0];
  if (!b) return res.status(404).json({ error: "없음" });
  const where = req.query.unlinked ? "AND trim_id IS NULL" : "";
  const kind = KINDS.includes(req.query.kind as Kind) ? req.query.kind : null;
  const { rows } = await q(`SELECT kind, rec_id, trim_id, link_status, data->>'brand' AS brand, data->>'model' AS model, data->>'year' AS year, data->>'trim' AS trim,
      data->>'ext' AS ext, data->>'int' AS int, data->>'fin' AS fin, (data->>'base')::bigint AS base, (data->>'rem')::int AS rem, data->'incl' AS incl, jsonb_array_length(COALESCE(data->'opts','[]'::jsonb)) AS opt_count,
      (SELECT MIN(v::bigint) FROM jsonb_each(COALESCE(data->'cost','{}'::jsonb)) d, jsonb_each(d.value) t, jsonb_each_text(t.value) p(k, v)) AS min_monthly
    FROM quote_rows WHERE batch_id = $1 ${where} ${kind ? "AND kind = $2" : ""} ORDER BY kind, sort_order LIMIT 2000`, kind ? [id, kind] : [id]);
  res.json({ batch: b, rows: rows.map((r) => ({ ...r, trimLabel: vm.get(r.trim_id)?.label || null })) });
}));

adminRouter.patch("/api/admin/batches/:id/rows", wrap(async (req, res) => {
  const { kind, recId, trimId, applySame } = req.body || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "kind 오류" });
  const id = intParam(req.params.id);
  const rec = await setRowTrim(id, kind, String(recId), trimId ? String(trimId) : null);
  let applied = 1;
  if (applySame && trimId) {   // 같은 브랜드·모델·연식·등급의 미연결 행에 같이 적용
    const { rows } = await q(`SELECT kind, rec_id FROM quote_rows WHERE batch_id = $1 AND trim_id IS NULL AND data->>'brand' = $2 AND data->>'model' = $3 AND data->>'year' = $4 AND data->>'trim' = $5`, [id, rec.brand, rec.model, rec.year, rec.trim]);
    for (const r of rows) { await setRowTrim(id, r.kind, r.rec_id, String(trimId)); applied++; }
  }
  const summary = await refreshSummary(id);
  res.json({ ok: true, applied, summary, trimLabel: vm.get(trimId)?.label || null });
}));

adminRouter.post("/api/admin/batches/:id/publish", wrap(async (req, res) => { await publishBatch(intParam(req.params.id), adminOf(req).id); res.json({ ok: true, published: await publishedStatus() }); }));
adminRouter.post("/api/admin/batches/:id/discard", wrap(async (req, res) => { await discardBatch(intParam(req.params.id)); res.json({ ok: true }); }));

// 화면 수정: 페이지별 작업본 (현재 사이트 데이터 복사) → 행 추가·수정·삭제 → 반영
const kindParam = (k: unknown): Kind => { if (!KINDS.includes(k as Kind)) throw Object.assign(new Error("페이지 구분 오류"), { status: 400 }); return k as Kind; };
adminRouter.post("/api/admin/quotes/:kind/draft", wrap(async (req, res) => res.json(await openEditDraft(kindParam(req.params.kind), adminOf(req).id, { reset: !!req.body?.reset }))));
adminRouter.get("/api/admin/batches/:id/rows/:kind/:recId", wrap(async (req, res) => {
  const r = await getRow(intParam(req.params.id), kindParam(req.params.kind), String(req.params.recId));
  if (!r) return res.status(404).json({ error: "없음" });
  res.json({ ...r, trimLabel: vm.get(r.trim_id)?.label || null });
}));
adminRouter.post("/api/admin/batches/:id/rows/:kind", wrap(async (req, res) => res.status(201).json(await saveDraftRow(intParam(req.params.id), kindParam(req.params.kind), null, req.body || {}))));
adminRouter.put("/api/admin/batches/:id/rows/:kind/:recId", wrap(async (req, res) => res.json(await saveDraftRow(intParam(req.params.id), kindParam(req.params.kind), String(req.params.recId), req.body || {}))));
adminRouter.delete("/api/admin/batches/:id/rows/:kind/:recId", wrap(async (req, res) => res.json({ ok: true, summary: await deleteDraftRow(intParam(req.params.id), kindParam(req.params.kind), String(req.params.recId)) })));
adminRouter.post("/api/admin/batches/:id/reorder", wrap(async (req, res) => { await reorderDraftRows(intParam(req.params.id), kindParam(req.body?.kind), (req.body?.recIds || []).map(String)); res.json({ ok: true }); }));

adminRouter.get("/api/admin/trims", wrap(async (req, res) => res.json(vm.search(String(req.query.q || ""), 30))));

// ---------------------------------------------------------------- 상담 문의
adminRouter.get("/api/admin/inquiries", wrap(async (req, res) => {
  res.json({ ...(await listInquiries({ status: req.query.status ? String(req.query.status) : undefined, q: req.query.q ? String(req.query.q) : undefined, page: Number(req.query.page) || 1 })), statusLabels: STATUS_KO });
}));
adminRouter.patch("/api/admin/inquiries/:id", wrap(async (req, res) => {
  const p = InquiryPatch.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: "입력 형식 오류" });
  const r = await updateInquiry(intParam(req.params.id), p.data);
  if (!r) return res.status(404).json({ error: "없음" });
  res.json(r);
}));
// ---------------------------------------------------------------- 회원 · 외부 연동 키
adminRouter.get("/api/admin/members", wrap(async (req, res) => {
  const qs = String(req.query.q || "").trim(), page = Math.max(1, Number(req.query.page) || 1), size = 50;
  const params: unknown[] = []; let w = "WHERE m.status = 'ACTIVE'";
  if (qs) { params.push(`%${qs}%`, qs.replace(/\D/g, "").length >= 4 ? `%${qs.replace(/\D/g, "")}%` : null, qs); w += ` AND (m.name ILIKE $1 OR m.nickname ILIKE $1 OR m.phone LIKE $2 OR m.phone_unverified LIKE $2 OR CAST(m.id AS TEXT) = $3)`; }
  const total = (await q(`SELECT COUNT(*)::int AS n FROM members m ${w}`, params)).rows[0].n;
  params.push(size, (page - 1) * size);
  const { rows } = await q(`SELECT m.id, m.name, m.nickname, m.phone, m.phone_unverified, m.birth_year, m.ship_address, m.kakao_id IS NOT NULL AS kakao, m.marketing_agreed_at, m.created_at, m.last_login_at,
      (SELECT COUNT(*)::int FROM inquiries i WHERE i.member_id = m.id) AS inquiries FROM members m ${w} ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ total, page, size, rows: rows.map((r) => ({ ...r, phoneVerified: !!r.phone, phone: (r.phone || r.phone_unverified || "").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3"), phoneMasked: maskPhone(r.phone || r.phone_unverified) })) });
}));
adminRouter.get("/api/admin/integrations", wrap(async (_req, res) => res.json(await integrationsForAdmin())));
adminRouter.put("/api/admin/integrations", wrap(async (req, res) => {
  const p = IntegrationsInput.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: "입력 형식 오류: " + p.error.issues.map((i) => i.path.join(".")).join(", ") });
  res.json(await saveIntegrations(p.data));
}));
adminRouter.get("/api/admin/inquiries/export.csv", wrap(async (_req, res) => {
  const { rows } = await q(`SELECT id, created_at, status, source, kind, rec_id, customer_name, phone, contact_time, message, car_name, trim_name, spec, conditions, monthly, options, color, memo, assignee, page_url, first_touch, last_touch FROM inquiries ORDER BY id DESC LIMIT 10000`);
  const esc = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };   // 엑셀 수식 실행 방지(= + - @ 로 시작하면 ' 붙임)
  const head = ["번호", "접수일시", "상태", "유입", "구분", "견적ID", "이름", "연락처", "연락 희망", "문의 내용", "차량", "등급", "사양", "조건", "월납입금", "옵션", "색상", "메모", "담당", "페이지",
    "유입_source", "유입_medium", "유입_campaign", "유입_term", "유입_content", "처음유입_source", "처음유입_medium", "처음유입_campaign", "광고클릭ID", "랜딩"];
  const clk = (t: any) => t.gclid ? "gclid" : t.fbclid ? "fbclid" : t.n_media || t.n_ad ? "naver" : t.kclid ? "kakao" : "";
  const body = rows.map((r) => { const L = r.last_touch || {}, F = r.first_touch || {}; return [r.id, new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }), STATUS_KO[r.status] || r.status, r.source, r.kind, r.rec_id, r.customer_name, r.phone, r.contact_time, r.message, r.car_name, r.trim_name, r.spec, JSON.stringify(r.conditions), r.monthly, (r.options || []).join(" / "), r.color, r.memo, r.assignee, r.page_url,
    L.source, L.medium, L.campaign, L.term, L.content, F.source, F.medium, F.campaign, clk(L), L.landing].map(esc).join(","); });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("차큐_상담문의.csv")}`);
  res.send("﻿" + [head.map(esc).join(","), ...body].join("\n"));
}));

// 차량 데이터·이미지 (로그인 확인 뒤에 연결)
adminRouter.use(adminVmRouter);
adminRouter.use(adminContentRouter);
adminRouter.use(adminHomeRouter);
