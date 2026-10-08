// 외부 발송: 인증문자(NHN Cloud SMS) · 채널톡 고객 정보(알림톡 캠페인 변수)
import crypto from "node:crypto";
import { integrations, smsOn, channelApiOn } from "./integrations.js";
import { log } from "./log.js";

const TIMEOUT = 6000;
async function call(url: string, init: RequestInit) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT);
  try { const r = await fetch(url, { ...init, signal: ac.signal }); const text = await r.text(); return { ok: r.ok, status: r.status, text: text.slice(0, 500) }; }
  catch (e: any) { return { ok: false, status: 0, text: String(e?.message || e).slice(0, 200) }; }
  finally { clearTimeout(t); }
}

/** 인증문자 (NHN Cloud Notification SMS · 인증용 발송) — 본문에 '인증' 포함 */
export async function sendSms(to: string, text: string) {
  const i = await integrations();
  if (!smsOn(i)) return { ok: false, status: 0, text: "인증문자 연동 전" };
  const r = await call(`https://api-sms.cloud.toast.com/sms/v3.0/appKeys/${encodeURIComponent(i.smsAppKey)}/sender/auth/sms`, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8", "X-Secret-Key": i.smsSecretKey },
    body: JSON.stringify({ body: text, sendNo: i.smsSender, recipientList: [{ recipientNo: to }] }),
  });
  // HTTP 200 이어도 header.isSuccessful · 수신자별 resultCode(0) 로 성공 판단
  let ok = r.ok;
  try { const j = JSON.parse(r.text); const res = j?.body?.data?.sendResultList?.[0]; ok = r.ok && j?.header?.isSuccessful === true && (!res || res.resultCode === 0); } catch { ok = false; }
  if (!ok) log.warn({ status: r.status, text: r.text }, "[sms] 발송 실패");
  return { ...r, ok };
}

/** 채널톡 회원 해시 (사이트 채널톡 버튼을 같은 고객으로 묶을 때) */
export async function channelMemberHash(memberId: string) {
  const i = await integrations();
  return i.channelMemberHashSecret ? crypto.createHmac("sha256", i.channelMemberHashSecret).update(memberId).digest("hex") : null;
}

/** 채널톡 고객 정보 갱신 (memberId 기준, 없으면 생성) — 알림톡 캠페인이 이 값을 변수로 씀 */
export async function channelUpsertUser(memberId: string, profile: Record<string, unknown>) {
  const i = await integrations();
  if (!channelApiOn(i)) return { ok: false, status: 0, text: "채널톡 API 연동 전" };
  const headers = { "content-type": "application/json", "x-access-key": i.channelAccessKey, "x-access-secret": i.channelAccessSecret };
  const body = JSON.stringify({ profile });
  let r = await call(`https://api.channel.io/open/v5/users/@${encodeURIComponent(memberId)}`, { method: "PUT", headers, body });
  if (r.status === 404) r = await call(`https://api.channel.io/open/v4/users/@${encodeURIComponent(memberId)}`, { method: "PUT", headers, body });
  if (!r.ok) log.warn({ status: r.status, text: r.text }, "[channel] 고객 정보 갱신 실패");
  return r;
}
