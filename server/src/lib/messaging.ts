// 외부 발송 (NHN Cloud): 인증문자(SMS) · 카카오톡 알림톡(KakaoTalk Bizmessage)
import { integrations, smsOn, alimtalkOn } from "./integrations.js";
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

/** 알림톡 (NHN Cloud KakaoTalk Bizmessage · 템플릿 치환 발송). 카카오톡이 없거나 실패하면 LMS 로 대체 발송(문자 발신번호 필요) */
// 템플릿에 실제로 있는 변수만 보내기 — 관리자에서 템플릿 코드를 바꿔도(예: 금융사 칸 있는 안 ↔ 없는 안) 그대로 동작 (대표 261016)
//  · NHN 템플릿 조회로 #{…} 목록을 10분간 기억. 조회 실패 시엔 선택 변수(OPTIONAL_VARS)만 빼고 보냄 (기존 템플릿과 같은 변수)
const OPTIONAL_VARS = ["금융사"];
const tplVars = new Map<string, { at: number; vars: Set<string> | null }>();
async function templateVars(i: Awaited<ReturnType<typeof integrations>>) {
  const key = i.alimtalkSenderKey + "|" + i.alimtalkTemplateCode, hit = tplVars.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.vars;
  const base = `https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${encodeURIComponent(i.alimtalkAppKey)}`, code = encodeURIComponent(i.alimtalkTemplateCode);
  let vars: Set<string> | null = null;
  for (const url of [`${base}/senders/${encodeURIComponent(i.alimtalkSenderKey)}/templates?templateCode=${code}`, `${base}/templates?senderKey=${encodeURIComponent(i.alimtalkSenderKey)}&templateCode=${code}`]) {
    const r = await call(url, { method: "GET", headers: { "X-Secret-Key": i.alimtalkSecretKey } });
    try {
      const list: any[] = JSON.parse(r.text)?.templateListResponse?.templates || [];
      const t = list.find((x) => x?.templateCode === i.alimtalkTemplateCode);
      if (t) { const txt = JSON.stringify([t.templateContent, t.templateTitle, t.templateSubtitle, t.templateExtra, t.buttons]); vars = new Set([...txt.matchAll(/#\{([^}]+)\}/g)].map((x) => x[1])); break; }
    } catch { /* 다음 경로 */ }
  }
  tplVars.set(key, { at: vars ? Date.now() : Date.now() - 9 * 60_000, vars });   // 실패는 1분 뒤 다시 조회
  return vars;
}
// 템플릿 조회가 실패해도 발송이 막히지 않게: '변수 확인(-3004)'으로 실패하면 선택 변수(금융사)를 넣고/빼서 1회 재시도하고,
// 성공한 쪽을 템플릿별로 기억해 다음 발송부터 바로 사용 (대표 261016 — CHAQ_QUOTE_04 전환 직후 금융사 누락으로 -3004 발생)
const learned = new Map<string, boolean>();   // 템플릿 키 → 선택 변수 포함해야 하는지
export async function sendAlimtalk(to: string, params: Record<string, string>, fallback?: { title: string; text: string }) {
  const i = await integrations();
  if (!alimtalkOn(i)) return { ok: false, status: 0, text: "알림톡 연동 전" };
  const key = i.alimtalkSenderKey + "|" + i.alimtalkTemplateCode;
  const vars = await templateVars(i);
  // useVars: 조회된 템플릿 변수 목록대로 / 아니면 선택 변수(금융사) 포함 여부만으로
  const pick = (withOptional: boolean, useVars: boolean) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (useVars && vars) { if (vars.has(k)) out[k] = v; }
      else if (withOptional || !OPTIONAL_VARS.includes(k)) out[k] = v;
    }
    return out;
  };
  const send = async (templateParameter: Record<string, string>) => {
    const rcpt: any = { recipientNo: to, templateParameter };
    if (fallback && i.smsSender) rcpt.resendParameter = { isResend: true, resendType: "LMS", resendTitle: fallback.title.slice(0, 20), resendContent: fallback.text.slice(0, 1000), resendSendNo: i.smsSender };
    const r = await call(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${encodeURIComponent(i.alimtalkAppKey)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8", "X-Secret-Key": i.alimtalkSecretKey },
      body: JSON.stringify({ senderKey: i.alimtalkSenderKey, templateCode: i.alimtalkTemplateCode, recipientList: [rcpt] }),
    });
    let ok = r.ok, code: number | null = null;
    try { const j = JSON.parse(r.text); const res = j?.message?.sendResults?.[0]; code = res?.resultCode ?? null; ok = r.ok && j?.header?.isSuccessful === true && (!res || res.resultCode === 0); } catch { ok = false; }
    return { ...r, ok, code };
  };
  const hasOptional = Object.keys(params).some((k) => OPTIONAL_VARS.includes(k));
  let withOpt = learned.has(key) ? learned.get(key)! : (vars ? [...vars].some((k) => OPTIONAL_VARS.includes(k)) : false);
  let r = await send(pick(withOpt, !learned.has(key)));
  if (!r.ok && r.code === -3004 && hasOptional) {   // 템플릿 변수 불일치 → 선택 변수 반대로 1회 재시도
    learned.delete(key); withOpt = !withOpt;
    const r2 = await send(pick(withOpt, false));
    if (r2.ok) { learned.set(key, withOpt); tplVars.delete(key); }
    log.warn({ first: r.text, retryOk: r2.ok, withOptional: withOpt, lookup: vars ? [...vars] : null }, "[alimtalk] 템플릿 변수 불일치 재시도");
    r = r2;
  } else if (r.ok && !learned.has(key)) learned.set(key, withOpt);
  if (!r.ok) log.warn({ status: r.status, text: r.text }, "[alimtalk] 발송 실패");
  const { code: _c, ...rest } = r;
  return rest;
}
