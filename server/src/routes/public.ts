// 공개 API (사이트에서 호출)
import { Router } from "express";
import { limiter } from "../lib/limits.js";
import { getPublicPayload } from "../lib/quotes-store.js";
import { InquiryInput, createInquiry, channelMessage } from "../lib/inquiries.js";
import { currentMember } from "../lib/members.js";
import { integrations, loginAvailable } from "../lib/integrations.js";
import { pushQuoteToChannel } from "../lib/kakao-flow.js";
import { config } from "../config.js";
import { q } from "../db.js";
import { getPublicVm } from "../lib/vm-store.js";
import { getMedia } from "../lib/media.js";
import { publicContent } from "../lib/content.js";
import { publicHome } from "../lib/home.js";

export const publicRouter = Router();

publicRouter.get("/api/health", async (_req, res) => {
  try { await q("SELECT 1"); res.json({ ok: true, time: new Date().toISOString() }); }
  catch { res.status(503).json({ ok: false }); }
});

/** 사이트용 견적 데이터 — <script src=".../api/quotes.js"> 로 바로 window.CHAQ 를 채움 (기존 data/quotes.js 와 같은 모양) */
publicRouter.get(["/api/quotes.js", "/api/quotes.json"], async (req, res, next) => {
  try {
    const p = await getPublicPayload();
    res.setHeader("Cache-Control", `public, max-age=${config.publicQuotesMaxAge}`);
    res.setHeader("ETag", p.etag);
    if (req.headers["if-none-match"] === p.etag) return res.status(304).end();
    if (req.path.endsWith(".json")) return res.type("application/json").send(p.json);
    res.type("application/javascript; charset=utf-8").send(p.js);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- 공개 데이터 (/api/pub/* — CloudFront 가 캐시)
/** 차량 데이터 공통본: 기존 pages/data/vehicle-master.js 와 같은 모양 (window.CHAQ_VEHICLE_MASTER) */
publicRouter.get("/api/pub/vm/core.js", async (req, res, next) => {
  try {
    const p = await getPublicVm();
    res.setHeader("Cache-Control", `public, max-age=${config.publicQuotesMaxAge}`);
    res.setHeader("ETag", p.etag); res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.headers["if-none-match"] === p.etag) return res.status(304).end();
    res.type("application/javascript; charset=utf-8").send(p.coreJs);
  } catch (e) { next(e); }
});
/** 모델별 상세본 (옵션·색상·기본품목) — ?r=<반영본번호> 가 현재 반영본이면 오래 캐시 */
publicRouter.get("/api/pub/vm/m/:file", async (req, res, next) => {
  try {
    const mid = String(req.params.file).replace(/\.js$/, "");
    const p = await getPublicVm();
    let js = p.details.get(mid);
    if (!js) {
      if (!p.modelIds.has(mid)) return res.status(404).type("application/javascript").send("/* 없음 */");
      js = `(window.CHAQ_VM_DETAILS = window.CHAQ_VM_DETAILS || []).push(${JSON.stringify({ modelId: mid, options: [], trimOptions: [], colors: [], trimColors: [], colorRules: [], standardItems: {} })});\nif (window.CHAQ_VM && window.CHAQ_VM.addDetail) window.CHAQ_VM.addDetail(window.CHAQ_VM_DETAILS[window.CHAQ_VM_DETAILS.length - 1]);\n`;
    }
    const pinned = String(req.query.r || "") === String(p.releaseId);
    res.setHeader("Cache-Control", pinned ? "public, max-age=31536000, immutable" : `public, max-age=${config.publicQuotesMaxAge}`);
    const etag = p.etag.slice(0, -1) + "-" + mid + '"';
    res.setHeader("ETag", etag); res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.type("application/javascript; charset=utf-8").send(js);
  } catch (e) { next(e); }
});
/** 자주 묻는 질문 · 이용후기 · 아티클/이벤트 — 기존 사이트 파일(faq.js · reviews.js · content.js)과 같은 모양 */
publicRouter.get(["/api/pub/faq.js", "/api/pub/reviews.js", "/api/pub/content.js"], async (req, res, next) => {
  try {
    const p = await publicContent();
    const key = req.path.endsWith("faq.js") ? "faq" : req.path.endsWith("reviews.js") ? "reviews" : "content";
    const etag = p.etag.slice(0, -1) + "-" + key + '"';
    res.setHeader("Cache-Control", `public, max-age=${config.publicQuotesMaxAge}`);
    res.setHeader("ETag", etag); res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.type("application/javascript; charset=utf-8").send(p[key]);
  } catch (e) { next(e); }
});
/** 메인 화면 설정 (섹션별 노출 선택 · 배너) — window.CHAQ_HOME */
publicRouter.get("/api/pub/home.js", async (req, res, next) => {
  try {
    const p = await publicHome();
    res.setHeader("Cache-Control", `public, max-age=${config.publicQuotesMaxAge}`);
    res.setHeader("ETag", p.etag); res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.headers["if-none-match"] === p.etag) return res.status(304).end();
    res.type("application/javascript; charset=utf-8").send(p.js);
  } catch (e) { next(e); }
});
/** 관리자가 올린 이미지: /api/pub/media/<id>.webp · <id>.thumb.webp (주소가 바뀌지 않으므로 1년 캐시) */
publicRouter.get("/api/pub/media/:file", async (req, res, next) => {
  try {
    const m = String(req.params.file).match(/^([a-z0-9]{6,24})(\.thumb)?\.(webp|png|jpg|gif|svg)$/);
    if (!m) return res.status(404).end();
    const f = await getMedia(m[1], !!m[2]); if (!f) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", f.mime); res.setHeader("X-Content-Type-Options", "nosniff");
    if (f.mime === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(f.bytes);
  } catch (e) { next(e); }
});

const inquiryLimit = limiter("inq", { windowMs: 60_000, limit: 10, message: { error: "잠시 후 다시 시도해 주세요" } });

/** 상담 문의 접수 → 문의번호와 채널톡 첫 메시지 반환 */
publicRouter.post("/api/inquiries", inquiryLimit, async (req, res, next) => {
  try {
    const parsed = InquiryInput.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "입력 형식 오류", detail: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + ": " + i.message) });
    if (parsed.data.website) return res.status(200).json({ id: 0, message: "" });      // 스팸 봇
    const member = await currentMember(req);
    // 회원가입(카카오·휴대폰) 수단이 켜져 있으면 문의는 회원만 — 꺼져 있으면 기존 상담 신청 양식(연락처·동의)으로 받음
    if (!member && loginAvailable(await integrations())) return res.status(401).json({ error: "로그인 후 문의할 수 있어요", needLogin: true });
    if (member && !member.phone) return res.status(401).json({ error: "휴대폰 번호 확인이 필요해요", needPhone: true });
    const ph = parsed.data.phone.trim();
    if (!member && parsed.data.source === "FORM" && !ph) return res.status(400).json({ error: "연락처를 입력해 주세요" });
    if (!member && ph && parsed.data.privacyAgreed !== true) return res.status(400).json({ error: "개인정보 수집·이용에 동의해 주세요" });
    const r = await createInquiry(parsed.data, { ip: req.ip || "", ua: String(req.headers["user-agent"] || ""), member });
    const kakao = member ? await pushQuoteToChannel(r as any, member, parsed.data) : null;   // 채널톡 → 알림톡(견적 내용) 발송 계기
    res.status(201).json({ id: r.id, createdAt: r.created_at, message: channelMessage(parsed.data, r.id), report: r.report_token, kakao: kakao ? { sent: kakao.ok } : null });
  } catch (e) { next(e); }
});
