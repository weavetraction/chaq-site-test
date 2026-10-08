// 회원 API: 카카오 로그인 · 휴대폰 인증 · 내 정보 · 내 문의 내역 · 견적서 보기
import { Router } from "express";
import { limiter } from "../lib/limits.js";
import { wrap, HttpError } from "../lib/http.js";
import { config } from "../config.js";
import { q } from "../db.js";
import { integrations, kakaoLoginOn, smsOn, loginAvailable } from "../lib/integrations.js";
import { channelMemberHash } from "../lib/messaging.js";
import { Agree, currentMember, publicMember, issueMember, clearMember, sendCode, verifyPhone, kakaoState, readKakaoState, kakaoExchange, kakaoLogin, withdraw, setMarketing } from "../lib/members.js";
import { reportView } from "../lib/inquiries.js";

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
  const memberId = m ? "m" + m.id : null;
  res.json({
    member: publicMember(m),
    auth: { kakao: kakaoLoginOn(i), sms: smsOn(i) || (!config.isProd && process.env.DEV_SMS === "1"), required: loginAvailable(i) },
    channel: { pluginKey: i.channelPluginKey || "", memberId, memberHash: memberId ? await channelMemberHash(memberId) : null, profile: m ? { name: m.name || m.nickname || "", mobileNumber: m.phone ? "+82" + m.phone.slice(1) : undefined } : null },
    kakaoChannel: i.kakaoChannelId ? { chat: `https://pf.kakao.com/${i.kakaoChannelId}/chat`, home: `https://pf.kakao.com/${i.kakaoChannelId}` } : null,
  });
}));
memberRouter.get("/api/me/inquiries", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  const { rows } = await q(`SELECT id, created_at, status, car_name, trim_name, spec, conditions, monthly, report_token, source FROM inquiries WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50`, [m.id]);
  res.json({ rows });
}));
memberRouter.post("/api/me/marketing", wrap(async (req, res) => {
  const m = await currentMember(req); if (!m) throw new HttpError("로그인이 필요합니다", 401);
  await setMarketing(m.id, req.body?.on === true); res.json({ ok: true });
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
    if (req.query.error) throw new HttpError(req.query.error === "access_denied" ? "카카오 동의를 취소했어요" : "카카오 로그인에 실패했어요");
    const k = await kakaoExchange(String(req.query.code || ""), redirectUri(req));
    const id = await kakaoLogin(k, st.a);
    issueMember(res, id);
    const m = (await q(`SELECT phone FROM members WHERE id = $1`, [id])).rows[0];
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
