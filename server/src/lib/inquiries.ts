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
  source: z.enum(["DETAIL", "GUIDE", "ETC"]).default("DETAIL"),
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
  pageUrl: z.string().max(500).default(""),
  channelMemberId: z.string().max(100).nullable().optional(),
  // 광고 유입 (analytics.js 가 저장해 둔 처음/마지막 유입) + 매체 식별값
  firstTouch: Touch.optional(), lastTouch: Touch.optional(),
  gaClientId: z.string().max(100).nullable().optional(), fbp: z.string().max(200).nullable().optional(), fbc: z.string().max(300).nullable().optional(),
  website: z.string().max(0).optional(),           // 스팸 방지용 숨은 칸 (사람은 비워둠)
});
export type InquiryInputT = z.infer<typeof InquiryInput>;

export const STATUS = ["NEW", "IN_PROGRESS", "CONTRACTED", "CLOSED", "SPAM"] as const;
export const STATUS_KO: Record<string, string> = { NEW: "신규", IN_PROGRESS: "상담 중", CONTRACTED: "계약", CLOSED: "종료", SPAM: "스팸" };

const ipHash = (ip: string) => crypto.createHmac("sha256", config.jwtSecret).update(ip || "").digest("hex").slice(0, 16);

export async function createInquiry(i: InquiryInputT, meta: { ip: string; ua: string }) {
  const { rows } = await q(`INSERT INTO inquiries (source, kind, rec_id, trim_id, car_name, spec, trim_name, conditions, monthly, options, color, page_url, channel_member_id, ip_hash, user_agent, first_touch, last_touch, ga_client_id, fbp, fbc)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [i.source, i.kind ?? null, i.recId ?? null, i.trimId ?? null, i.carName, i.spec, i.trimName, i.conditions, i.monthly ?? null, JSON.stringify(i.options), i.color, i.pageUrl, i.channelMemberId ?? null, ipHash(meta.ip), meta.ua.slice(0, 300),
     i.firstTouch || {}, i.lastTouch || {}, i.gaClientId ?? null, i.fbp ?? null, i.fbc ?? null]);
  onLeadCreated(rows[0], { ip: meta.ip, ua: meta.ua });
  return rows[0] as { id: number; created_at: string };
}

export async function listInquiries(f: { status?: string; q?: string; page?: number; size?: number }) {
  const where: string[] = [], params: unknown[] = [];
  if (f.status && STATUS.includes(f.status as any)) { params.push(f.status); where.push(`status = $${params.length}`); }
  if (f.q) {
    params.push(`%${f.q}%`); const like = params.length;
    params.push(String(f.q).replace(/\D/g, "")); const idq = params.length;
    where.push(`(car_name ILIKE $${like} OR spec ILIKE $${like} OR memo ILIKE $${like} OR rec_id ILIKE $${like} OR CAST(id AS TEXT) = $${idq})`);
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
  const prev = (await q(`SELECT status FROM inquiries WHERE id = $1`, [id])).rows[0]?.status;
  const { rows } = await q(`UPDATE inquiries SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`, params);
  if (rows[0] && p.status && prev) onLeadStatus(rows[0], prev);
  return rows[0] || null;
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
