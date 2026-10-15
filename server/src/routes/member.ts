// 회원 API: 카카오 로그인 · 휴대폰 인증 · 내 정보 · 내 문의 내역 · 견적서 보기
import { Router } from "express";
import { limiter } from "../lib/limits.js";
import { wrap, HttpError } from "../lib/http.js";
import { config } from "../config.js";
import { q } from "../db.js";
import { integrations, kakaoLoginOn, smsOn, alimtalkOn, loginAvailable } from "../lib/integrations.js";
import { Agree, currentMember, publicMember, setSelfPhone, issueMember, clearMember, sendCode, verifyPhone, kakaoState, readKakaoState, kakaoExchange, kakaoLogin, withdraw, setMarketing } from "../lib/members.js";
import multer from "multer";
import { reportView, customerStop } from "../lib/inquiries.js";
import { saveMedia, MediaError } from "../lib/media.js";
import { createMemberReview, memberReviews, joinEvent, memberEvents, ContentError } from "../lib/content.js";
import { vm } from "../lib/vm.js";

export const memberRouter = Router();
const codeLimit = limiter("smscode", { windowMs: 10 * 60_000, limit: 8, message: { error: "인증번호 요청이 너무 많아요. 잠시 후 다시 시도해 주세요" } });
const verifyLimit = limiter("smsverify", { windowMs: 10 * 60_000, limit: 20, message: { error: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요" } });
const noStore = (_req: any, res: any, next: any) => { res.setHeader("Cache-Control", "no-store"); next(); };
memberRouter.use(["/api/me", "/api/auth"], noStore);

/** 사이트 주소(돌아갈 곳) 검사: 운영은 SITE_ORIGINS 만, 개발은 localhost 도 */
function safeReturn(u: unknown) {
  try {
    const url = new URL(String(u || ""));
    const ok = config.siteOrigins.includes(url.origin) || (!config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.origin));
    return ok ? url.toString().split("#")[0] : null;
  } catch { return null; }
}
function siteHome() { return config.siteOrigins[0] ? config.siteOrigins[0] + "/" : "/"; }
function redirectUri(req: any) {
  if (config.siteOrigins[0] && config.isProd) return config.siteOrigins[0] + "/api/auth/kakao/callback";   // CloudFront 뒤: 사이트 주소 기준
  return `${req.protocol}://${req.get("host")}/api/auth/kakao/callback`;
}
const back = (ret: string, tag: string) => ret + (ret.includes("#") ? "&" : "#") + "chaq_login=" + tag;

// ---------------------------------------------------------------- 내 정보 (+ 로그인 수단·채널톡 연결값)
memberRouter.get("/api/me", wrap(async (req, res) => {
  const m = await currentMember(req), i = await integrations();
  const sms = smsOn(i) || (!config.isProd && process.env.DEV_SMS === "1");
  const chId = (String(i.kakaoChannelId || "").match(/_[A-Za-z0-9]+/) || [""])[0];   // 채널 URL 을 통째로 넣었어도 _xxxx 만
  res.json({
    member: publicMember(m, !sms),
    auth: { kakao: kakaoLoginOn(i), sms, selfPhone: !sms, alimtalk: alimtalkOn(i), required: loginAvailable(i) },   // selfPhone: 인증문자 준비 전 — 카카오 회원 번호 직접 입력
    kakaoChannel: chId ? { chat: `https://pf.kakao.com/${chId}/chat`, home: `https://pf.kakao.com/${chId}` } : null,
  });
}));
memberRouter.get("/api/me/inquiries", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const { rows } = await q(`SELECT id, created_at, status, car_name, trim_name, spec, conditions, monthly, report_token, source, delivered_on FROM inquiries WHERE member_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`, [m.id]);
  res.json({ rows });
}));
// 상담 중지 (신규·상담 중 → 관리자 화면 '고객중지')
memberRouter.post("/api/me/inquiries/:id/stop", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) throw new HttpError("잘못된 요청이에요", 400);
  const r = await customerStop(id, m.id);
  if (r.error) throw new HttpError(r.error, r.status);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- 후기 (계약완료 고객만 · 관리자 확인 후 노출) · 이벤트 참여
const contractsOf = async (memberId: number) => (await q(`SELECT i.id, i.car_name, i.trim_name, i.trim_id, to_char(i.delivered_on, 'YYYY-MM-DD') AS delivered_on, i.created_at,
    EXISTS (SELECT 1 FROM content_items c WHERE c.kind = 'review' AND c.data->>'inquiryId' = i.id::text) AS reviewed
  FROM inquiries i WHERE i.member_id = $1 AND i.status = 'CONTRACTED' AND i.deleted_at IS NULL ORDER BY i.created_at DESC`, [memberId])).rows;
memberRouter.get("/api/me/contracts", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  res.json({ rows: (await contractsOf(m.id)).map((r) => ({ id: r.id, car: ((r.car_name || "") + " " + (r.trim_name || "")).trim(), deliveredOn: r.delivered_on, reviewed: r.reviewed })) });
}));
memberRouter.get("/api/me/reviews", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  res.json({ rows: await memberReviews(m.id) });
}));
const reviewLimit = limiter("member-review", { windowMs: 60 * 60_000, limit: 10, message: { error: "잠시 후 다시 시도해 주세요" } });
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 10 } });
memberRouter.post("/api/me/reviews", reviewLimit, photoUpload.array("photos", 5), wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const cid = Number(req.body?.contractId);
  const c = (await contractsOf(m.id)).find((r) => r.id === cid);
  if (!c) throw new HttpError("계약 완료된 차량을 선택해 주세요", 400);
  if (c.reviewed) throw new HttpError("이 계약은 이미 후기를 작성했어요", 400);
  const text = String(req.body?.text || "").trim();
  if (text.length < 10) throw new HttpError("후기 내용을 10자 이상 적어 주세요", 400);
  const files = ((req.files as Express.Multer.File[]) || []);
  const photos: string[] = [];
  try { for (const f of files) photos.push((await saveMedia(f.buffer, Buffer.from(f.originalname, "latin1").toString("utf8"), "review", null, { noSvg: true })).url); }
  catch (e) { throw new HttpError(e instanceof MediaError ? e.message : "사진을 읽을 수 없어요. 다른 사진으로 올려 주세요 (jpg·png·webp)", 400); }
  try {
    const row = await createMemberReview({ memberId: m.id, memberName: m.name || m.nickname || "", inquiry: c, text, photos, modelId: vm.get(c.trim_id)?.modelId || null });
    res.status(201).json({ ok: true, id: row.id });
  } catch (e) { if (e instanceof ContentError) throw new HttpError(e.message, e.status); if ((e as any)?.code === "23505") throw new HttpError("이 계약은 이미 후기를 작성했어요", 400); throw e; }
}));
memberRouter.get("/api/me/events", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  res.json({ rows: await memberEvents(m.id) });
}));
memberRouter.post("/api/me/events/:id/join", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const id = String(req.params.id || ""); if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpError("잘못된 요청이에요", 400);
  try { res.json(await joinEvent(id, m.id)); } catch (e) { if (e instanceof ContentError) throw new HttpError(e.message, e.status); throw e; }
}));
memberRouter.post("/api/me/marketing", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  await setMarketing(m.id, req.body?.on === true); res.json({ ok: true });
}));
memberRouter.post("/api/me/phone", codeLimit, wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const i = await integrations();
  if (smsOn(i) || (!config.isProd && process.env.DEV_SMS === "1")) throw new HttpError("휴대폰 인증으로 확인해 주세요", 400);
  await setSelfPhone(m.id, req.body?.phone, req.body?.name);
  const mm = await currentMember(req);
  res.json({ member: publicMember(mm, true) });
}));
memberRouter.post("/api/me/withdraw", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  await withdraw(m.id); clearMember(res); res.json({ ok: true });
}));
memberRouter.post("/api/auth/logout", (_req, res) => { clearMember(res); res.json({ ok: true }); });

// ---------------------------------------------------------------- 휴대폰 인증
memberRouter.post("/api/auth/sms/send", codeLimit, wrap(async (req, res) => {
  res.json(await sendCode(req.body?.phone, req.ip || ""));
}));
memberRouter.post("/api/auth/sms/verify", verifyLimit, wrap(async (req, res) => {
  const cur = await currentMember(req);
  const r = await verifyPhone(req.body?.phone, String(req.body?.code || ""), Agree(req.body?.agree), cur, req.body?.name);
  issueMember(res, r.id);
  const m = (await q(`SELECT * FROM members WHERE id = $1`, [r.id])).rows[0];
  res.json({ member: publicMember(m), created: !!(r as any).created });
}));

// ---------------------------------------------------------------- 카카오 로그인
memberRouter.get("/api/auth/kakao/start", wrap(async (req, res) => {
  const i = await integrations();
  const ret = safeReturn(req.query.return) || siteHome();
  if (!kakaoLoginOn(i)) return res.redirect(back(ret, "error&msg=" + encodeURIComponent("카카오 로그인 준비 중이에요")));
  const agree = Agree({ terms: req.query.terms === "1", privacy: req.query.privacy === "1", marketing: req.query.marketing === "1" });
  const u = new URL("https://kauth.kakao.com/oauth/authorize");
  u.searchParams.set("client_id", i.kakaoRestApiKey); u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("response_type", "code"); u.searchParams.set("state", kakaoState(ret, agree));
  res.redirect(u.toString());
}));
memberRouter.get("/api/auth/kakao/callback", async (req, res) => {
  const st = readKakaoState(String(req.query.state || ""));
  const ret = (st && safeReturn(st.r)) || siteHome();
  try {
    if (!st) throw new HttpError("로그인 시간이 지났어요. 다시 시도해 주세요");
    // 추가 동의(전화번호) 화면에서 취소: 로그인은 첫 번째 단계에서 끝났으므로 번호 직접 입력으로
    if (req.query.error && st.p && (await currentMember(req))) return res.redirect(back(ret, "needphone"));
    if (req.query.error) throw new HttpError(req.query.error === "access_denied" ? "카카오 동의를 취소했어요" : "카카오 로그인에 실패했어요");
    const k = await kakaoExchange(String(req.query.code || ""), redirectUri(req));
    const id = await kakaoLogin(k, st.a);
    issueMember(res, id);
    const m = (await q(`SELECT phone, name FROM members WHERE id = $1`, [id])).rows[0];
    // #50 동의항목 승인(이름 필수·전화번호 선택) 전에 가입한 회원은 카카오가 새 항목을 자동으로 묻지 않음 → 번호가 없으면 1회만 추가 동의 요청
    if (!m?.phone && !k.phone && !st.p) {
      const i = await integrations();
      const u = new URL("https://kauth.kakao.com/oauth/authorize");
      u.searchParams.set("client_id", i.kakaoRestApiKey); u.searchParams.set("redirect_uri", redirectUri(req));
      u.searchParams.set("response_type", "code"); u.searchParams.set("scope", m?.name ? "phone_number" : "phone_number,name");
      u.searchParams.set("state", kakaoState(ret, st.a, true));
      return res.redirect(u.toString());
    }
    res.redirect(back(ret, m?.phone ? "ok" : "needphone"));
  } catch (e: any) {
    res.redirect(back(ret, "error&msg=" + encodeURIComponent(e instanceof HttpError ? e.message : "카카오 로그인에 실패했어요")));
  }
});

// ---------------------------------------------------------------- 견적서 보기 (알림톡 버튼 주소) — 개인정보 없이 견적만
memberRouter.get("/api/pub/report/:token", wrap(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");   // 다른 /api/pub 와 같이 (개인정보 없음)
  const t = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(t)) return res.status(404).json({ error: "견적서를 찾을 수 없어요" });
  const v = await reportView(t);
  if (!v) return res.status(404).json({ error: "견적서를 찾을 수 없어요" });
  res.setHeader("Cache-Control", "public, max-age=300"); res.setHeader("X-Robots-Tag", "noindex");
  res.json(v);
}));
