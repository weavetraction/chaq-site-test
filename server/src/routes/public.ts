// 공개 API (사이트에서 호출)
import { Router } from "express";
import { limiter } from "../lib/limits.js";
import { getPublicPayload } from "../lib/quotes-store.js";
import { InquiryInput, createInquiry, channelMessage } from "../lib/inquiries.js";
import { config } from "../config.js";
import { q } from "../db.js";

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

const inquiryLimit = limiter("inq", { windowMs: 60_000, limit: 10, message: { error: "잠시 후 다시 시도해 주세요" } });

/** 상담 문의 접수 → 문의번호와 채널톡 첫 메시지 반환 */
publicRouter.post("/api/inquiries", inquiryLimit, async (req, res, next) => {
  try {
    const parsed = InquiryInput.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "입력 형식 오류", detail: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + ": " + i.message) });
    if (parsed.data.website) return res.status(200).json({ id: 0, message: "" });      // 스팸 봇
    const r = await createInquiry(parsed.data, { ip: req.ip || "", ua: String(req.headers["user-agent"] || "") });
    res.status(201).json({ id: r.id, createdAt: r.created_at, message: channelMessage(parsed.data, r.id) });
  } catch (e) { next(e); }
});
