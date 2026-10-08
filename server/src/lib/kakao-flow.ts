// 견적 문의 → 카카오톡 알림톡(NHN Cloud)으로 견적서 → 고객은 카카오톡 채널 채팅방에서 상담 이어감 (카카오톡 채널 관리자센터 1:1 채팅)
//  · 템플릿 변수(#{…}) = 아래 params 키. 템플릿 버튼 '견적서 보기' 주소: https://chaq.co.kr/pages/quote-report.html?t=#{견적서코드}
//  · 카카오톡이 없거나 받을 수 없으면 같은 내용 문자(LMS)로 대체 발송
import { q } from "../db.js";
import { config } from "../config.js";
import { sendAlimtalk } from "./messaging.js";
import type { InquiryInputT } from "./inquiries.js";

const PLAN: Record<string, string> = { "0": "초기비용 0원", b: "보증금 30%", s: "선납금 30%" };
export function reportUrl(token: string, pageUrl = "") {
  let origin = config.siteOrigins[0] || "";
  if (!origin) { try { origin = new URL(pageUrl).origin; } catch { origin = ""; } }
  return `${origin}/pages/quote-report.html?t=${token}`;
}
/** 알림톡 변수 값 (빈 값이면 카카오가 거절하므로 기본 문구로 채움) */
export function quoteParams(id: number, token: string, m: { name: string; nickname: string }, i: InquiryInputT) {
  const s = i.snapshot || {}, c = i.conditions || {};
  const v = (x: unknown, d = "상담 시 안내") => (String(x ?? "").trim() || d).slice(0, 60);
  return {
    고객명: v(m.name || m.nickname, "고객"),
    차량: v([i.carName, i.trimName].filter(Boolean).join(" "), "상담 차량"),
    상품구분: v(s.product || c.product, "장기렌트"),
    이용기간: v(s.term || (c.term ? (Number(c.term) % 12 === 0 ? Number(c.term) / 12 + "년" : c.term + "개월") : "")),
    초기비용: v(s.plan || PLAN[c.plan || ""]),
    주행거리: v(s.dist || (c.dist && Number(c.dist) ? "연 " + (Number(c.dist) * 10000).toLocaleString("ko-KR") + "km" : "")),
    월납입금: v(i.monthly ? i.monthly.toLocaleString("ko-KR") + "원" : ""),
    출고: v(s.delivery),
    접수번호: String(id),
    견적서코드: token,
  } as Record<string, string>;
}
export async function sendQuoteAlimtalk(row: { id: number; report_token: string }, m: { id: number; name: string; nickname: string; phone: string | null }, i: InquiryInputT) {
  if (!m.phone) return { ok: false, status: 0, text: "휴대폰 번호 없음" };
  const p = quoteParams(row.id, row.report_token, m, i);
  const url = reportUrl(row.report_token, i.pageUrl);
  const lms = `[차큐] 견적서가 도착했어요\n\n- 차량: ${p.차량}\n- 상품구분: ${p.상품구분}\n- 이용기간: ${p.이용기간}\n- 초기비용: ${p.초기비용}\n- 연간주행거리: ${p.주행거리}\n- 월 납입금: ${p.월납입금}\n- 출고: ${p.출고}\n\n견적서 보기: ${url}\n문의 1533-5663 (접수번호 ${row.id})`;
  const r = await sendAlimtalk(m.phone, p, { title: "차큐 견적서", text: lms });
  if (r.ok) await q(`UPDATE inquiries SET kakao_sent_at = now() WHERE id = $1`, [row.id]);
  await q(`UPDATE inquiries SET conv_log = conv_log || $2::jsonb WHERE id = $1`, [row.id, JSON.stringify([{ to: "alimtalk", event: "quote", ok: r.ok, status: r.status, text: r.ok ? "" : r.text, at: new Date().toISOString() }])]);
  return r;
}
