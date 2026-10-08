// 외부 연동 키 (카카오 로그인 · 카카오톡 채널 · 알림톡/인증문자 = NHN Cloud) — 관리자 화면 '외부 연동'에서 입력, DB(app_state)에 암호화 저장
//  · 환경변수가 있으면 환경변수가 우선 (KAKAO_REST_API_KEY 등)
//  · 비밀값은 관리자 화면에도 끝 4자리만 보임
import crypto from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { getState, setState } from "./state.js";

export const IntegrationsInput = z.object({
  kakaoRestApiKey: z.string().trim().max(100),          // 카카오 디벨로퍼스 > 앱 > 앱 키 > REST API 키
  kakaoClientSecret: z.string().trim().max(100),        // 카카오 로그인 > 보안 > Client Secret (사용 시)
  kakaoChannelId: z.string().trim().max(120).transform((v) => (v.match(/_[A-Za-z0-9]+/) || [v])[0]),   // 채널 URL(http://pf.kakao.com/_AbCdE) 통째로 넣어도 _AbCdE 만 저장 — 상담하기 버튼
  alimtalkAppKey: z.string().trim().max(100),           // 알림톡(NHN Cloud KakaoTalk Bizmessage) Appkey — 콘솔 > Notification > KakaoTalk Bizmessage > URL & Appkey
  alimtalkSecretKey: z.string().trim().max(200),        // 같은 화면의 Secret Key
  alimtalkSenderKey: z.string().trim().max(60),         // 발신 프로필 키(Sender Key, 40자) — 카카오톡 채널을 발신 프로필로 등록하면 나옴
  alimtalkTemplateCode: z.string().trim().max(30),      // 검수 승인된 '견적서 도착' 템플릿 코드
  smsAppKey: z.string().trim().max(100),                // 인증문자(NHN Cloud SMS) 앱키 — 콘솔 > Notification > SMS > URL & Appkey
  smsSecretKey: z.string().trim().max(200),             // 같은 화면의 Secret Key
  smsSender: z.string().trim().max(20).transform((v) => v.replace(/\D/g, "")),   // 등록된 발신번호 (예: 15335663)
}).partial();
export type Integrations = { [K in keyof z.infer<typeof IntegrationsInput>]-?: string };

const KEYS: (keyof Integrations)[] = ["kakaoRestApiKey", "kakaoClientSecret", "kakaoChannelId", "alimtalkAppKey", "alimtalkSecretKey", "alimtalkSenderKey", "alimtalkTemplateCode", "smsAppKey", "smsSecretKey", "smsSender"];
const SECRET: (keyof Integrations)[] = ["kakaoClientSecret", "alimtalkSecretKey", "smsSecretKey"];
const ENV: Record<keyof Integrations, string> = {
  kakaoRestApiKey: "KAKAO_REST_API_KEY", kakaoClientSecret: "KAKAO_CLIENT_SECRET", kakaoChannelId: "KAKAO_CHANNEL_ID",
  alimtalkAppKey: "NHN_ALIMTALK_APP_KEY", alimtalkSecretKey: "NHN_ALIMTALK_SECRET_KEY", alimtalkSenderKey: "NHN_ALIMTALK_SENDER_KEY", alimtalkTemplateCode: "NHN_ALIMTALK_TEMPLATE_CODE",
  smsAppKey: "NHN_SMS_APP_KEY", smsSecretKey: "NHN_SMS_SECRET_KEY", smsSender: "SMS_SENDER",
};
const STATE_KEY = "integrations_v1";

const keyBuf = () => crypto.createHash("sha256").update("chaq-integrations:" + config.jwtSecret).digest();
function enc(o: object) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", keyBuf(), iv);
  const d = Buffer.concat([c.update(JSON.stringify(o), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), d: d.toString("base64") });
}
function dec(s: string | undefined): Record<string, string> {
  if (!s) return {};
  try {
    const o = JSON.parse(s), c = crypto.createDecipheriv("aes-256-gcm", keyBuf(), Buffer.from(o.iv, "base64"));
    c.setAuthTag(Buffer.from(o.tag, "base64"));
    return JSON.parse(Buffer.concat([c.update(Buffer.from(o.d, "base64")), c.final()]).toString("utf8")) || {};
  } catch { return {}; }   // 서버 비밀값(JWT_SECRET)이 바뀌면 다시 입력해야 함
}

let cache: { at: number; v: Integrations } | null = null;
/** 현재 연동 값 (15초 캐시 — 서버가 여러 대여도 15초 안에 반영) */
export async function integrations(): Promise<Integrations> {
  if (cache && Date.now() - cache.at < 15_000) return cache.v;
  const db = dec(await getState(STATE_KEY));
  const v = Object.fromEntries(KEYS.map((k) => [k, String(process.env[ENV[k]] || db[k] || "").trim()])) as Integrations;
  cache = { at: Date.now(), v };
  return v;
}
export const kakaoLoginOn = (i: Integrations) => !!i.kakaoRestApiKey;
export const smsOn = (i: Integrations) => !!(i.smsAppKey && i.smsSecretKey && i.smsSender);
export const alimtalkOn = (i: Integrations) => !!(i.alimtalkAppKey && i.alimtalkSecretKey && i.alimtalkSenderKey && i.alimtalkTemplateCode);
/** 로그인 수단이 하나라도 있으면 문의는 회원만 (없으면 기존 상담 신청 양식으로 받음 — 사이트가 막히지 않게) */
export const loginAvailable = (i: Integrations) => kakaoLoginOn(i) || smsOn(i) || (!config.isProd && process.env.DEV_SMS === "1");

/** 관리자 화면용: 비밀값은 끝 4자리만 */
export async function integrationsForAdmin() {
  const db = dec(await getState(STATE_KEY)), cur = await integrations();
  const out: Record<string, { value: string; set: boolean; fromEnv: boolean; secret: boolean }> = {};
  for (const k of KEYS) {
    const val = cur[k], secret = SECRET.includes(k);
    out[k] = { value: secret ? (val ? "••••" + val.slice(-4) : "") : val, set: !!val, fromEnv: !!process.env[ENV[k]], secret };
    if (!db[k] && !val) out[k].value = "";
  }
  return { fields: out, status: { kakaoLogin: kakaoLoginOn(cur), sms: smsOn(cur), alimtalk: alimtalkOn(cur), kakaoChannel: !!cur.kakaoChannelId } };
}
/** 저장: 빈 문자열 = 지움, 보내지 않은 칸·'••••'로 시작하는 값 = 그대로 */
export async function saveIntegrations(patch: z.infer<typeof IntegrationsInput>) {
  const db = dec(await getState(STATE_KEY));
  for (const k of KEYS) {
    const v = (patch as any)[k]; if (v === undefined || (typeof v === "string" && v.startsWith("••••"))) continue;
    if (v === "") delete db[k]; else db[k] = v;
  }
  await setState(STATE_KEY, enc(db));
  cache = null;
  return integrationsForAdmin();
}
