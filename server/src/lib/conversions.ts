// 서버 전환 전송 (광고 성과를 '문의·계약' 기준으로 매체에 돌려줌) + 담당자 알림
//  · GA4 Measurement Protocol: generate_lead(문의) · qualify_lead(상담 중) · close_convert_lead(계약)  → GA4 를 Google Ads 에 연결하면 Ads 전환으로 가져옴
//  · Meta 전환 API(CAPI): Lead(문의) · 계약 이벤트(기본 Purchase) — 브라우저 픽셀과 event_id 로 중복 제거
//  · 알림 웹훅(Slack 등): 새 문의를 담당자 채널로
//  환경변수가 없으면 해당 전송은 건너뜀. 실패해도 문의 접수에는 영향 없음 (결과는 inquiries.conv_log 에 기록)
import { q } from "../db.js";
import { log } from "./log.js";

const env = (k: string) => (process.env[k] || "").trim();
const TIMEOUT = 4000;

async function post(url: string, body: unknown) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT);
  try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal }); return { ok: r.ok, status: r.status, text: r.ok ? "" : (await r.text()).slice(0, 300) }; }
  catch (e: any) { return { ok: false, status: 0, text: String(e?.message || e).slice(0, 200) }; }
  finally { clearTimeout(t); }
}

export type LeadForConv = {
  id: number; status: string; car_name: string; trim_name: string; monthly: number | null; conditions: any; kind: string | null;
  page_url: string; ga_client_id: string | null; fbp: string | null; fbc: string | null; created_at: string;
};
type Stage = "LEAD" | "QUALIFIED" | "CONTRACT";
const GA4_EVENT: Record<Stage, string> = { LEAD: "generate_lead", QUALIFIED: "qualify_lead", CONTRACT: "close_convert_lead" };

/** 계약 가치(원): 월 납입금 × 계약기간 (없으면 0) */
const valueOf = (l: LeadForConv) => (l.monthly && l.conditions?.term ? l.monthly * Number(l.conditions.term) : 0);

async function ga4(l: LeadForConv, stage: Stage) {
  const id = env("GA4_MEASUREMENT_ID"), secret = env("GA4_API_SECRET");
  if (!id || !secret || !l.ga_client_id) return null;
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`;
  const r = await post(url, { client_id: l.ga_client_id, non_personalized_ads: false, events: [{ name: GA4_EVENT[stage], params: { lead_id: String(l.id), currency: "KRW", value: stage === "CONTRACT" ? valueOf(l) : 0, item_name: l.car_name, item_variant: l.trim_name, lead_source: l.kind || "guide" } }] });
  return { to: "ga4", event: GA4_EVENT[stage], ...r };
}

async function meta(l: LeadForConv, stage: Stage, ctx: { ip?: string; ua?: string }) {
  const pixel = env("META_PIXEL_ID"), token = env("META_CAPI_TOKEN"), ver = env("META_API_VERSION") || "v21.0";
  if (!pixel || !token || stage === "QUALIFIED") return null;
  const name = stage === "LEAD" ? "Lead" : env("META_CONTRACT_EVENT") || "Purchase";
  const user_data: Record<string, unknown> = {};
  if (ctx.ip) user_data.client_ip_address = ctx.ip; if (ctx.ua) user_data.client_user_agent = ctx.ua;
  if (l.fbp) user_data.fbp = l.fbp; if (l.fbc) user_data.fbc = l.fbc;
  if (!Object.keys(user_data).length) return null;
  const body: any = { data: [{ event_name: name, event_time: Math.floor(Date.now() / 1000), event_id: `chaq-${stage.toLowerCase()}-${l.id}`, action_source: "website", event_source_url: l.page_url || undefined, user_data, custom_data: { currency: "KRW", value: stage === "CONTRACT" ? valueOf(l) : 0, content_name: `${l.car_name} ${l.trim_name}`.trim() } }] };
  if (env("META_TEST_EVENT_CODE")) body.test_event_code = env("META_TEST_EVENT_CODE");
  const r = await post(`https://graph.facebook.com/${ver}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, body);
  return { to: "meta", event: name, ...r };
}

async function notify(l: LeadForConv) {
  const url = env("NOTIFY_WEBHOOK_URL"); if (!url) return null;
  const PLAN: Record<string, string> = { "0": "0원", b: "보증금30%", s: "선납금30%" };
  const c = l.conditions || {};
  const text = `🚗 새 상담 문의 #${l.id}\n${l.car_name || "일반 상담"} ${l.trim_name || ""}\n${[c.product, c.term && c.term + "개월", PLAN[c.plan], c.dist && c.dist + "만km"].filter(Boolean).join(" · ")}${l.monthly ? `\n월 ${l.monthly.toLocaleString("ko-KR")}원` : ""}\n${env("ADMIN_URL") ? (/\/admin\/?$/.test(env("ADMIN_URL")!) ? env("ADMIN_URL") : env("ADMIN_URL")!.replace(/\/$/, "") + "/admin/") : ""}`;
  const r = await post(url, { text });
  return { to: "notify", event: "new_lead", ...r };
}

async function record(id: number, results: (object | null)[]) {
  const done = results.filter(Boolean).map((r) => ({ ...r, at: new Date().toISOString() }));
  if (!done.length) return;
  await q(`UPDATE inquiries SET conv_log = conv_log || $2::jsonb WHERE id = $1`, [id, JSON.stringify(done)]);
  for (const d of done as any[]) if (!d.ok) log.warn({ inquiry: id, ...d }, "conversion send failed");
}

/** 문의 접수 직후 (응답을 기다리지 않음) */
export function onLeadCreated(l: LeadForConv, ctx: { ip?: string; ua?: string }) {
  Promise.all([ga4(l, "LEAD"), meta(l, "LEAD", ctx), notify(l)]).then((r) => record(l.id, r)).catch((e) => log.error(e, "onLeadCreated"));
}
/** 관리자가 상태를 바꿨을 때: 상담 중 → qualify_lead, 계약 → close_convert_lead / Purchase */
export function onLeadStatus(l: LeadForConv, prev: string) {
  const stage: Stage | null = l.status === "CONTRACTED" && prev !== "CONTRACTED" ? "CONTRACT" : l.status === "IN_PROGRESS" && prev === "NEW" ? "QUALIFIED" : null;
  if (!stage) return;
  Promise.all([ga4(l, stage), meta(l, stage, {})]).then((r) => record(l.id, r)).catch((e) => log.error(e, "onLeadStatus"));
}
