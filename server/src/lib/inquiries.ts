// 상담 문의 저장·조회
import crypto from "node:crypto";
import { z } from "zod";
import { q } from "../db.js";
import { config } from "../config.js";
import { onLeadCreated, onLeadStatus } from "./conversions.js";

const Touch = z.object({
  source: z.string().max(100), medium: z.string().max(100), campaign: z.string().max(200), term: z.string().max(200), content: z.string().max(200),
  gclid: z.string().max(300), gbraid: z.string().max(300), wbraid: z.string().max(300), fbclid: z.string().max(300), n_media: z.string().max(100), n_query: z.string().max(200), n_ad: z.string().max(100), n_keyword: z.string().max(200),
  kclid: z.string().max(300), landing: z.string().max(500), referrer: z.string().max(500), at: z.string().max(40),
}).partial();
export const InquiryInput = z.object({
  source: z.enum(["DETAIL", "GUIDE", "FORM", "ETC"]).default("DETAIL"),   // FORM = 사이트 상담 신청 양식(차량 무관)
  kind: z.enum(["stock", "fast", "estimate"]).nullable().optional(),
  recId: z.string().max(40).nullable().optional(),
  trimId: z.string().max(200).nullable().optional(),
  carName: z.string().max(100).default(""),
  spec: z.string().max(200).default(""),
  trimName: z.string().max(100).default(""),
  conditions: z.object({ product: z.string().max(20).optional(), term: z.string().max(4).optional(), plan: z.string().max(10).optional(), dist: z.string().max(4).optional() }).partial().default({}),
  monthly: z.number().int().positive().max(100_000_000).nullable().optional(),
  options: z.array(z.string().max(120)).max(40).default([]),
  color: z.string().max(120).default(""),
  pageUrl: z.string().max(500).default("").transform((v) => (/^https?:\/\//i.test(v) ? v : "")),   // http(s) 주소만 저장
  channelMemberId: z.string().max(100).nullable().optional(),
  // 광고 유입 (analytics.js 가 저장해 둔 처음/마지막 유입) + 매체 식별값
  firstTouch: Touch.optional(), lastTouch: Touch.optional(),
  gaClientId: z.string().max(100).nullable().optional(), fbp: z.string().max(200).nullable().optional(), fbc: z.string().max(300).nullable().optional(),
  // 사이트 상담 신청 양식 (채널톡 없을 때): 연락처를 받으면 개인정보 수집·이용 동의 필수
  name: z.string().trim().max(30).default(""),
  phone: z.string().trim().max(20).default("").transform((v) => v.replace(/[^\d]/g, "")).refine((v) => !v || /^0\d{8,10}$/.test(v), "연락처 형식이 맞지 않습니다"),
  contactTime: z.string().trim().max(30).default(""),
  message: z.string().trim().max(1000).default(""),
  privacyAgreed: z.boolean().optional(),
  website: z.string().max(200).optional(),         // 스팸 방지용 숨은 칸 (사람은 비워둠 — 채워져 있으면 저장하지 않고 조용히 200)
  // 문의 당시 견적 그대로 (견적서 보기 화면·알림톡 내용) — 화면에 보이던 값
  snapshot: z.object({
    image: z.string().max(300).refine((v) => /^(assets\/|\.\.\/assets\/|\/api\/pub\/media\/|https:\/\/)/.test(v), "이미지 주소").optional(),
    product: z.string().max(20), term: z.string().max(20), plan: z.string().max(30), dist: z.string().max(20),
    vehiclePrice: z.number().int().nonnegative().max(2_000_000_000).nullable(),
    options: z.array(z.object({ n: z.string().max(120), p: z.number().int().nonnegative().max(500_000_000).nullable().optional() })).max(40),
    ext: z.string().max(80), int: z.string().max(80), delivery: z.string().max(60), finance: z.string().max(40),
  }).partial().optional(),
});
export type InquiryInputT = z.infer<typeof InquiryInput>;
/** 010-1234-5678 형태 */
export const fmtPhone = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? (d.startsWith("02") ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`) : d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : d);

export const STATUS = ["NEW", "IN_PROGRESS", "CONTRACTED", "CLOSED", "SPAM"] as const;
export const STATUS_KO: Record<string, string> = { NEW: "신규", IN_PROGRESS: "상담 중", CONTRACTED: "계약", CLOSED: "종료", SPAM: "스팸" };

const ipHash = (ip: string) => crypto.createHmac("sha256", config.jwtSecret).update(ip || "").digest("hex").slice(0, 16);

type MemberLite = { id: number; name: string; nickname: string; phone: string | null; privacy_agreed_at?: string | null } | null;
export async function createInquiry(i: InquiryInputT, meta: { ip: string; ua: string; member?: MemberLite }) {
  const m = meta.member || null;
  const name = m ? (m.name || m.nickname || i.name) : i.name, phone = m?.phone || i.phone;
  const token = crypto.randomBytes(16).toString("base64url");
  const { rows } = await q(`INSERT INTO inquiries (source, kind, rec_id, trim_id, car_name, spec, trim_name, conditions, monthly, options, color, page_url, channel_member_id, ip_hash, user_agent, first_touch, last_touch, ga_client_id, fbp, fbc,
      customer_name, phone, contact_time, message, privacy_agreed_at, member_id, report_token, snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
    [i.source, i.kind ?? null, i.recId ?? null, i.trimId ?? null, i.carName, i.spec, i.trimName, i.conditions, i.monthly ?? null, JSON.stringify(i.options), i.color, i.pageUrl, m ? "m" + m.id : i.channelMemberId ?? null, ipHash(meta.ip), meta.ua.slice(0, 300),
     i.firstTouch || {}, i.lastTouch || {}, i.gaClientId ?? null, i.fbp ?? null, i.fbc ?? null,
     name, phone ? fmtPhone(phone) : "", i.contactTime, i.message, m ? (m.privacy_agreed_at || new Date()) : i.phone && i.privacyAgreed ? new Date() : null,
     m ? m.id : null, token, JSON.stringify(i.snapshot || {})]);
  onLeadCreated(rows[0], { ip: meta.ip, ua: meta.ua });
  return rows[0] as { id: number; created_at: string; report_token: string };
}

const PLAN_KO: Record<string, string> = { "0": "초기비용 0원", b: "보증금 30%", s: "선납금 30%" };
/** 견적서 보기 (알림톡 버튼 주소): 개인정보 없이 견적 내용만 */
export async function reportView(token: string) {
  const r = await q(`SELECT id, created_at, car_name, spec, trim_name, conditions, monthly, options, color, snapshot, kind, rec_id, trim_id, source FROM inquiries WHERE report_token = $1 AND status <> 'SPAM'`, [token]);
  const x = r.rows[0]; if (!x) return null;
  const s = x.snapshot || {}, c = x.conditions || {};
  return {
    no: x.id, at: x.created_at, kind: x.kind, recId: x.rec_id, trimId: x.trim_id, source: x.source,
    carName: x.car_name, spec: x.spec, trimName: x.trim_name, image: s.image || null,
    product: s.product || c.product || "", term: s.term || (c.term ? c.term + "개월" : ""), plan: s.plan || PLAN_KO[c.plan] || "", dist: s.dist || (c.dist ? "연 " + c.dist + "만 km" : ""),
    monthly: x.monthly, vehiclePrice: s.vehiclePrice ?? null,
    options: Array.isArray(s.options) && s.options.length ? s.options : (x.options || []).map((n: string) => ({ n, p: null })),
    ext: s.ext || x.color || "", int: s.int || "", delivery: s.delivery || "", finance: s.finance || "",
  };
}

export async function listInquiries(f: { status?: string; q?: string; page?: number; size?: number }) {
  const where: string[] = [], params: unknown[] = [];
  if (f.status && STATUS.includes(f.status as any)) { params.push(f.status); where.push(`status = $${params.length}`); }
  if (f.q) {
    params.push(`%${f.q}%`); const like = params.length;
    params.push(String(f.q).replace(/\D/g, "")); const idq = params.length;
    params.push(String(f.q).replace(/\D/g, "").length >= 4 ? `%${String(f.q).replace(/\D/g, "")}%` : null); const ph = params.length;   // 숫자 4자리 이상일 때만 연락처 검색
    where.push(`(car_name ILIKE $${like} OR spec ILIKE $${like} OR memo ILIKE $${like} OR rec_id ILIKE $${like} OR customer_name ILIKE $${like} OR message ILIKE $${like} OR regexp_replace(phone, '\\D', '', 'g') LIKE $${ph} OR CAST(id AS TEXT) = $${idq})`);
  }
  const size = Math.min(100, Math.max(1, f.size || 30)), page = Math.max(1, f.page || 1);
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = (await q(`SELECT COUNT(*)::int AS n FROM inquiries ${w}`, params)).rows[0].n;
  params.push(size, (page - 1) * size);
  const { rows } = await q(`SELECT * FROM inquiries ${w} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const counts = (await q(`SELECT status, COUNT(*)::int AS n FROM inquiries GROUP BY status`)).rows;
  return { total, page, size, rows, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) };
}

export const InquiryPatch = z.object({ status: z.enum(STATUS).optional(), memo: z.string().max(4000).optional(), assignee: z.string().max(50).optional() });
export async function updateInquiry(id: number, p: z.infer<typeof InquiryPatch>) {
  const sets: string[] = [], params: unknown[] = [id];
  for (const [k, v] of Object.entries(p)) { if (v === undefined) continue; params.push(v); sets.push(`${k} = $${params.length}`); }
  if (!sets.length) return null;
  // 이전 상태는 같은 문장에서 행 잠금으로 읽음 → 동시에 같은 상태로 바꿔도 전환 이벤트는 한 번만
  const { rows } = await q(`WITH old AS (SELECT id, status FROM inquiries WHERE id = $1 FOR UPDATE)
    UPDATE inquiries i SET ${sets.join(", ")}, updated_at = now() FROM old WHERE i.id = old.id RETURNING i.*, old.status AS prev_status`, params);
  const row = rows[0]; if (!row) return null;
  const prev = row.prev_status; delete row.prev_status;
  if (p.status && prev) onLeadStatus(row, prev);
  return row;
}

/** 채널톡 첫 메시지 (고객이 보내는 문장으로 미리 채움) */
export function channelMessage(i: InquiryInputT, id: number) {
  const PLAN: Record<string, string> = { "0": "초기비용 0원", b: "보증금 30%", s: "선납금 30%" };
  const c = i.conditions || {};
  const cond = [c.product, c.term ? `${c.term}개월` : "", c.plan ? PLAN[c.plan] || c.plan : "", c.dist ? `연 ${c.dist}만 km` : ""].filter(Boolean).join(" · ");
  return [
    i.source === "DETAIL" ? "이 조건으로 상담 받고 싶어요." : "상담 받고 싶어요.",
    i.carName ? `차량: ${i.carName}${i.trimName ? " " + i.trimName : ""}` : "",
    i.spec ? `사양: ${i.spec}` : "",
    cond ? `조건: ${cond}` : "",
    i.monthly ? `월 납입금: ${i.monthly.toLocaleString("ko-KR")}원` : "",
    i.options.length ? `옵션: ${i.options.join(", ")}` : "",
    i.color ? `색상: ${i.color}` : "",
    `(문의번호 #${id})`,
  ].filter(Boolean).join("\n");
}
