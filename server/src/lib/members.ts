// 회원: 카카오 로그인 · 휴대폰 인증 가입/로그인 · 로그인 유지 쿠키
import crypto from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import type pg from "pg";
import { q, tx } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "./http.js";
import { sendSms } from "./messaging.js";
import { integrations, smsOn } from "./integrations.js";

export const MEMBER_COOKIE = "chaq_member";
const DAYS = 90;   // 로그인 유지 기간

export type ShipAddress = { receiver: string; phone: string; zip: string; base: string; detail: string };
export type Member = { id: number; kakao_id: string | null; phone: string | null; phone_unverified?: string | null; birth_year?: string | null; ship_address?: ShipAddress | null; name: string; nickname: string; marketing_agreed_at: string | null; created_at: string; status: string };
export const Agree = (o: any) => ({ terms: o?.terms === true, privacy: o?.privacy === true, marketing: o?.marketing === true });
export type AgreeT = ReturnType<typeof Agree>;

const hmac = (s: string) => crypto.createHmac("sha256", config.jwtSecret).update(s).digest("hex");
export const maskPhone = (p: string | null) => (p ? p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-****-$3") : "");
export const phoneDigits = (v: unknown) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2);            // 카카오: +82 10-1234-5678
  return /^01[016789]\d{7,8}$/.test(d) ? d : "";
};

// ---------------------------------------------------------------- 로그인 쿠키
export function issueMember(res: Response, id: number) {
  const token = jwt.sign({ mid: id }, config.jwtSecret, { expiresIn: `${DAYS}d` });
  res.cookie(MEMBER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: DAYS * 86400_000, path: "/" });
}
export function clearMember(res: Response) { res.clearCookie(MEMBER_COOKIE, { path: "/" }); }
export async function currentMember(req: Request): Promise<Member | null> {
  const t = req.cookies?.[MEMBER_COOKIE]; if (!t) return null;
  try {
    const { mid } = jwt.verify(t, config.jwtSecret) as { mid: number };
    const r = await q(`SELECT * FROM members WHERE id = $1 AND status = 'ACTIVE'`, [mid]);
    return (r.rows[0] as Member) || null;
  } catch { return null; }
}
/** 연락처: 인증된 번호 우선. 인증문자가 아직 없을 때(selfPhone)만 직접 입력 번호(미인증)를 씀 — 인증문자가 켜지면 미인증 회원은 다음 문의 때 인증 */
export function contactOf(m: Member | null, selfPhone: boolean) {
  if (!m) return null;
  if (m.phone) return { phone: m.phone, verified: true };
  if (selfPhone && m.phone_unverified) return { phone: m.phone_unverified, verified: false };
  return null;
}
export const publicMember = (m: Member | null, selfPhone = false) => {
  if (!m) return null; const c = contactOf(m, selfPhone);
  return { id: m.id, name: m.name || m.nickname || "", phone: maskPhone(c ? c.phone : null), hasPhone: !!c, phoneVerified: !!c?.verified, kakao: !!m.kakao_id, marketing: !!m.marketing_agreed_at, since: m.created_at,
    birthYear: m.birth_year || null, shipAddress: m.ship_address ? { receiver: m.ship_address.receiver, base: m.ship_address.base, detail: m.ship_address.detail ? "(상세 주소 등록됨)" : "" } : null };
};
/** 인증문자 준비 전: 카카오 회원이 휴대폰 번호를 직접 입력(미인증 — 상담 연락에만 사용, 혜택 소식 발송 안 함) */
export async function setSelfPhone(id: number, phone: string, name = "") {
  const p = phoneDigits(phone); if (!p) throw new HttpError("휴대폰 번호를 정확히 입력해 주세요 (예: 010-1234-5678)");
  await q(`UPDATE members SET phone_unverified = $2, name = CASE WHEN $3 <> '' THEN $3 ELSE name END WHERE id = $1`, [id, p, String(name || "").trim().slice(0, 30)]);
}

async function touch(id: number) { await q(`UPDATE members SET last_login_at = now() WHERE id = $1`, [id]); }
function needAgree(a: AgreeT) { if (!a.terms || !a.privacy) throw new HttpError("이용약관과 개인정보 수집·이용에 동의해 주세요", 400); }

// ---------------------------------------------------------------- 휴대폰 인증번호
const CODE_TTL_MIN = 5, MAX_TRIES = 5;
export async function sendCode(phone: string, ip: string) {
  const p = phoneDigits(phone); if (!p) throw new HttpError("휴대폰 번호를 정확히 입력해 주세요 (예: 010-1234-5678)");
  const recent = (await q(`SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM auth_codes WHERE phone = $1 AND created_at > now() - interval '1 hour'`, [p])).rows[0];
  if (recent.n >= 5) throw new HttpError("인증번호 요청이 너무 많아요. 1시간 뒤에 다시 시도해 주세요", 429);
  if (recent.last && Date.now() - new Date(recent.last).getTime() < 30_000) throw new HttpError("인증번호는 30초 뒤에 다시 받을 수 있어요", 429);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q(`INSERT INTO auth_codes (phone, code_hash, expires_at, ip_hash) VALUES ($1, $2, now() + interval '${CODE_TTL_MIN} minutes', $3)`, [p, hmac(p + ":" + code), hmac(ip || "").slice(0, 16)]);
  const i = await integrations();
  if (smsOn(i)) {
    const r = await sendSms(p, `[차큐] 인증번호 ${code}\n${CODE_TTL_MIN}분 안에 입력해 주세요.`);
    if (!r.ok) throw new HttpError("인증문자를 보내지 못했어요. 잠시 후 다시 시도해 주세요", 502);
    return { sent: true };
  }
  if (!config.isProd && process.env.DEV_SMS === "1") return { sent: true, devCode: code };   // 개발용: 문자 대신 응답으로
  throw new HttpError("휴대폰 인증을 준비 중이에요. 카카오로 시작하기를 이용해 주세요", 503);
}
async function checkCode(c: pg.PoolClient, phone: string, code: string) {
  const r = await c.query(`SELECT id, code_hash, attempts FROM auth_codes WHERE phone = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone]);
  const row = r.rows[0];
  if (!row) throw new HttpError("인증번호가 만료됐어요. 다시 받아 주세요");
  if (row.attempts >= MAX_TRIES) throw new HttpError("입력 횟수를 넘었어요. 인증번호를 다시 받아 주세요");
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hmac(phone + ":" + String(code || "").replace(/\D/g, ""))));
  if (!ok) { await c.query(`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]); return false; }
  await c.query(`UPDATE auth_codes SET used_at = now() WHERE id = $1`, [row.id]);
  return true;
}

/** 휴대폰 인증 확인 → 로그인/가입. 카카오로 로그인했는데 번호가 없는 회원이면 그 회원에 번호 연결 */
export async function verifyPhone(phone: string, code: string, agree: AgreeT, current: Member | null, name = "") {
  const p = phoneDigits(phone); if (!p) throw new HttpError("휴대폰 번호를 정확히 입력해 주세요");
  const out = await tx(async (c) => {
    if (!(await checkCode(c, p, code))) return { wrong: true } as const;
    const owner = (await c.query(`SELECT * FROM members WHERE phone = $1 AND status = 'ACTIVE' FOR UPDATE`, [p])).rows[0] as Member | undefined;
    if (current && !current.phone) {
      // 카카오 회원에 번호 연결 — 같은 번호의 휴대폰 회원이 따로 있으면 그 회원으로 합침 (문의 내역 포함)
      if (owner && owner.id !== current.id) {
        if (owner.kakao_id && owner.kakao_id !== current.kakao_id) throw new HttpError("이 번호는 다른 카카오 계정에 연결돼 있어요. 그 계정으로 로그인해 주세요", 409);
        await c.query(`UPDATE inquiries SET member_id = $1 WHERE member_id = $2`, [owner.id, current.id]);
        await c.query(`UPDATE members SET kakao_id = NULL WHERE id = $1`, [current.id]);
        await c.query(`UPDATE members SET kakao_id = $2, nickname = CASE WHEN nickname = '' THEN $3 ELSE nickname END, name = CASE WHEN name = '' THEN $4 ELSE name END WHERE id = $1`, [owner.id, current.kakao_id, current.nickname, current.name]);
        await c.query(`DELETE FROM members WHERE id = $1`, [current.id]);
        return { id: owner.id };
      }
      await c.query(`UPDATE members SET phone = $2, phone_unverified = NULL WHERE id = $1`, [current.id, p]);
      return { id: current.id };
    }
    if (owner) return { id: owner.id };
    needAgree(agree);
    const r = await c.query(`INSERT INTO members (phone, name, terms_agreed_at, privacy_agreed_at, marketing_agreed_at) VALUES ($1, $2, now(), now(), $3) RETURNING id`, [p, String(name || "").trim().slice(0, 30), agree.marketing ? new Date() : null]);
    return { id: r.rows[0].id as number, created: true };
  });
  if ("wrong" in out) throw new HttpError("인증번호가 맞지 않아요", 400);
  await touch(out.id);
  return out;
}

// ---------------------------------------------------------------- 카카오 로그인 (REST API 방식)
/** 로그인 시작: 동의 내용·돌아갈 주소를 서명해서 state 로 */
export function kakaoState(ret: string, agree: AgreeT) {
  return jwt.sign({ r: ret, a: agree, n: crypto.randomBytes(8).toString("hex") }, config.jwtSecret, { expiresIn: "15m" });
}
export function readKakaoState(s: string) {
  try { return jwt.verify(s, config.jwtSecret) as { r: string; a: AgreeT; n: string }; } catch { return null; }
}
export async function kakaoExchange(code: string, redirectUri: string) {
  const i = await integrations();
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: i.kakaoRestApiKey, redirect_uri: redirectUri, code });
  if (i.kakaoClientSecret) form.set("client_secret", i.kakaoClientSecret);
  const t = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form });
  const tj: any = await t.json().catch(() => ({}));
  if (!t.ok || !tj.access_token) throw new HttpError("카카오 로그인에 실패했어요 (" + (tj.error_description || tj.error || t.status) + ")", 502);
  const u = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { authorization: `Bearer ${tj.access_token}` } });
  const uj: any = await u.json().catch(() => ({}));
  if (!u.ok || !uj.id) throw new HttpError("카카오 회원 정보를 읽지 못했어요", 502);
  const ka = uj.kakao_account || {};
  const by = String(ka.birthyear || "").replace(/\D/g, "");
  return { kakaoId: String(uj.id), phone: phoneDigits(ka.phone_number), name: String(ka.name || "").slice(0, 30), nickname: String(ka.profile?.nickname || uj.properties?.nickname || "").slice(0, 30),
    birthYear: /^(19|20)\d{2}$/.test(by) ? by : "", ship: await kakaoShipAddress(tj.access_token) };
}
/** 카카오 배송지(선택 동의) — 기본 배송지 1개. 동의 안 했거나 없으면 null (가입은 그대로 진행) */
async function kakaoShipAddress(token: string): Promise<ShipAddress | null> {
  try {
    const r = await fetch("https://kapi.kakao.com/v1/user/shipping_address", { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j: any = await r.json().catch(() => ({}));
    const list: any[] = Array.isArray(j.shipping_addresses) ? j.shipping_addresses : [];
    const a = list.find((x) => x && x.is_default) || list[0];
    if (!a || !a.base_address) return null;
    const cut = (v: unknown, n: number) => String(v || "").trim().slice(0, n);
    return { receiver: cut(a.receiver_name, 30), phone: phoneDigits(a.receiver_phone_number1) || cut(a.receiver_phone_number1, 20), zip: cut(a.zone_number || a.zip_code, 10), base: cut(a.base_address, 200), detail: cut(a.detail_address, 200) };
  } catch { return null; }
}
/** 카카오 회원 → 우리 회원 (없으면 가입: 동의 필요) */
export async function kakaoLogin(k: { kakaoId: string; phone: string; name: string; nickname: string; birthYear?: string; ship?: ShipAddress | null }, agree: AgreeT) {
  const id = await tx(async (c) => {
    const byKakao = (await c.query(`SELECT * FROM members WHERE kakao_id = $1 FOR UPDATE`, [k.kakaoId])).rows[0] as Member | undefined;
    if (byKakao) {
      if (byKakao.status !== "ACTIVE") throw new HttpError("탈퇴한 계정이에요. 고객센터로 문의해 주세요", 403);
      await c.query(`UPDATE members SET nickname = $2, name = CASE WHEN name = '' THEN $3 ELSE name END, phone = COALESCE(phone, (SELECT $4::text WHERE NOT EXISTS (SELECT 1 FROM members WHERE phone = $4))) WHERE id = $1`, [byKakao.id, k.nickname, k.name, k.phone || null]);
      return byKakao.id;
    }
    const byPhone = k.phone ? (await c.query(`SELECT * FROM members WHERE phone = $1 AND status = 'ACTIVE' FOR UPDATE`, [k.phone])).rows[0] as Member | undefined : undefined;
    if (byPhone && !byPhone.kakao_id) { await c.query(`UPDATE members SET kakao_id = $2, nickname = $3, name = CASE WHEN name = '' THEN $4 ELSE name END WHERE id = $1`, [byPhone.id, k.kakaoId, k.nickname, k.name]); return byPhone.id; }
    needAgree(agree);
    const r = await c.query(`INSERT INTO members (kakao_id, phone, name, nickname, terms_agreed_at, privacy_agreed_at, marketing_agreed_at) VALUES ($1,$2,$3,$4, now(), now(), $5) RETURNING id`,
      [k.kakaoId, byPhone ? null : k.phone || null, k.name, k.nickname, agree.marketing ? new Date() : null]);
    return r.rows[0].id as number;
  });
  // 선택 동의항목(출생 연도·배송지): 받은 경우에만 최신값으로 (안 받으면 기존 값 유지)
  if (k.birthYear || k.ship) await q(`UPDATE members SET birth_year = COALESCE($2, birth_year), ship_address = COALESCE($3::jsonb, ship_address) WHERE id = $1`, [id, k.birthYear || null, k.ship ? JSON.stringify(k.ship) : null]);
  await touch(id);
  return id;
}

/** 회원 탈퇴: 개인정보 지우고 문의 기록은 상담 이력으로만 남김 (회원 연결 해제) */
export async function withdraw(id: number) {
  await tx(async (c) => {
    await c.query(`UPDATE inquiries SET member_id = NULL WHERE member_id = $1`, [id]);
    await c.query(`UPDATE members SET status = 'WITHDRAWN', withdrawn_at = now(), kakao_id = NULL, phone = NULL, phone_unverified = NULL, birth_year = NULL, ship_address = NULL, name = '', nickname = '', marketing_agreed_at = NULL WHERE id = $1`, [id]);
  });
}
export async function setMarketing(id: number, on: boolean) {
  await q(`UPDATE members SET marketing_agreed_at = ${on ? "COALESCE(marketing_agreed_at, now())" : "NULL"} WHERE id = $1`, [id]);
}
