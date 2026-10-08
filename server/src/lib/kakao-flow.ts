// 견적 문의 → 채널톡 고객 정보(견적 내용) 갱신 → 채널톡 캠페인(이벤트 '견적문의')이 알림톡 발송
//  · 알림톡 문구의 변수 = 아래 profile 키 (채널톡 고객 정보 '프로필'에 같은 이름으로 들어감)
//  · 사이트에서도 같은 회원(memberId)으로 ChannelIO('track', '견적문의') 를 보냄 (inquiry.js)
import { q } from "../db.js";
import { config } from "../config.js";
import { channelUpsertUser } from "./messaging.js";
import { fmtPhone, type InquiryInputT } from "./inquiries.js";

const PLAN: Record<string, string> = { "0": "0%", b: "보증금 30%", s: "선납금 30%" };
export function reportUrl(token: string, pageUrl = "") {
  let origin = config.siteOrigins[0] || "";
  if (!origin) { try { origin = new URL(pageUrl).origin; } catch { origin = ""; } }
  return `${origin}/pages/quote-report.html?t=${token}`;
}
export async function pushQuoteToChannel(row: { id: number; report_token: string; page_url?: string }, m: { id: number; name: string; nickname: string; phone: string | null }, i: InquiryInputT) {
  const s = i.snapshot || {}, c = i.conditions || {};
  const profile: Record<string, unknown> = {
    name: m.name || m.nickname || undefined,
    mobileNumber: m.phone ? "+82" + m.phone.slice(1) : undefined,
    quoteNo: String(row.id),
    quoteCar: [i.carName, i.trimName].filter(Boolean).join(" ").slice(0, 80),
    quoteSpec: (i.spec || "").slice(0, 80),
    quoteProduct: s.product || c.product || "",
    quoteTerm: s.term || (c.term ? (Number(c.term) % 12 === 0 ? Number(c.term) / 12 + "년" : c.term + "개월") : ""),
    quotePlan: s.plan || PLAN[c.plan || ""] || "",
    quoteDist: s.dist || (c.dist && Number(c.dist) ? (Number(c.dist) * 10000).toLocaleString("ko-KR") + "km" : ""),
    quoteMonthly: i.monthly ? i.monthly.toLocaleString("ko-KR") + "원" : "상담 시 안내",
    quoteDelivery: s.delivery || "",
    quoteUrl: reportUrl(row.report_token, i.pageUrl),
    quotePhone: m.phone ? fmtPhone(m.phone) : "",
  };
  for (const k of Object.keys(profile)) if (profile[k] === undefined || profile[k] === "") delete profile[k];
  const r = await channelUpsertUser("m" + m.id, profile);
  if (r.ok) await q(`UPDATE inquiries SET kakao_sent_at = now() WHERE id = $1`, [row.id]);
  await q(`UPDATE inquiries SET conv_log = conv_log || $2::jsonb WHERE id = $1`, [row.id, JSON.stringify([{ to: "channel", event: "profile", ok: r.ok, status: r.status, text: r.ok ? "" : r.text, at: new Date().toISOString() }])]);
  return r;
}
