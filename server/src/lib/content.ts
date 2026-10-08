// 2단계 콘텐츠: 자주 묻는 질문 · 이용후기 · 이벤트 · 아티클
//  · 관리자 저장 → 바로 반영 (사이트는 /api/pub/faq.js · reviews.js · content.js 를 읽음, 캐시 1분)
//  · 사이트 파일(faq.js · reviews.js · content.js)과 같은 모양으로 내보냄 — 사이트는 API 를 못 읽으면 파일을 씀
//  · 본문(FAQ 답변 · 이벤트 · 아티클)은 편집기 HTML → 허용 태그만 남기고 저장
import fs from "node:fs";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import type pg from "pg";
import { q, tx, pool } from "../db.js";
import { setState, getState } from "./state.js";
import { config } from "../config.js";
import { log } from "./log.js";

export const CONTENT_KINDS = ["faq", "review", "article", "event"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CAT_KINDS = ["faq", "article"] as const;
export type CatKind = (typeof CAT_KINDS)[number];
export class ContentError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

// ---------------------------------------------------------------- 본문 HTML 정리 (편집기 → 사이트)
const SAFE_URL = /^(https?:\/\/|\/|\.\.\/|#|mailto:|tel:)/i;
export function cleanHtml(html: unknown): string {
  return sanitizeHtml(String(html ?? ""), {
    allowedTags: ["p", "br", "h3", "h4", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "img", "blockquote", "hr", "figure", "figcaption", "span", "dl", "dt", "dd", "div"],
    allowedAttributes: { a: ["href", "target", "rel"], img: ["src", "alt"], span: ["class"], p: ["class"], ul: ["class"], dl: ["class"], div: ["class"] },
    allowedClasses: { span: ["hl"], p: ["note", "faq-note"], ul: ["faq-bullets"], dl: ["faq-terms"], div: ["faq-sub"] },   // 사이트 스타일이 있는 class 만
    allowedSchemes: ["http", "https", "mailto", "tel"], allowedSchemesAppliedToAttributes: ["href", "src"], allowProtocolRelative: false,
    exclusiveFilter: (f) => (f.tag === "img" && !SAFE_URL.test(f.attribs.src || "")) || (f.tag === "p" && !f.text.trim() && !/img|br/.test(f.mediaChildren?.join(",") || "")),
    transformTags: {
      a: (_tag, attribs) => ({ tagName: "a", attribs: { href: SAFE_URL.test(attribs.href || "") ? attribs.href : "#", ...(/^https?:/.test(attribs.href || "") ? { target: "_blank", rel: "noopener" } : {}) } }),
      h1: "h3", h2: "h3",
    },
  }).trim();
}
const textOf = (html: string) => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
const firstPara = (html: string) => { const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i); return textOf(m ? m[1] : html).slice(0, 300); };

// ---------------------------------------------------------------- 입력 정리 (종류별)
const S = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const SAFE_IMG = (v: unknown) => { const s = S(v, 500); if (s && !SAFE_URL.test(s)) throw new ContentError("이미지 주소 형식 오류"); return s; };
const ymd = (v: unknown, label: string, required = false) => {
  const s = S(v, 20).replace(/\./g, "-"); if (!s) { if (required) throw new ContentError(`${label}을(를) 입력하세요`); return ""; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new ContentError(`${label} 형식 오류 (예: 2026-10-01)`);
  return s;
};
const dot = (s: string) => s.replace(/-/g, ".");
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);   // 한국 날짜

export function cleanInput(kind: ContentKind, inp: any): any {
  inp = inp || {};
  switch (kind) {
    case "faq": {
      const q2 = S(inp.q, 300); if (!q2) throw new ContentError("질문을 입력하세요");
      const a = cleanHtml(inp.a); if (!textOf(a)) throw new ContentError("답변을 입력하세요");
      const cat = S(inp.cat, 60); if (!cat) throw new ContentError("카테고리를 고르세요");
      return { cat, q: q2, a };
    }
    case "review": {
      const stars = Math.round(Number(inp.stars || 5)); if (!(stars >= 1 && stars <= 5)) throw new ContentError("별점은 1~5");
      const text = S(inp.text, 3000); if (!text) throw new ContentError("후기 내용을 입력하세요");
      const name = S(inp.name, 30); if (!name) throw new ContentError("고객 표시 이름을 입력하세요 (예: 홍**님)");
      const photos = (Array.isArray(inp.photos) ? inp.photos : []).map(SAFE_IMG).filter(Boolean).slice(0, 10);
      return { name, stars, car: S(inp.car, 60), trim: S(inp.trim, 60), modelId: S(inp.modelId, 120) || null, trimId: S(inp.trimId, 160) || null, text, photos, date: ymd(inp.date, "작성일") || today() };
    }
    case "article": {
      const title = S(inp.title, 120); if (!title) throw new ContentError("제목을 입력하세요");
      const html = cleanHtml(inp.html); if (!textOf(html) && !/<img/.test(html)) throw new ContentError("본문을 입력하세요");
      return { cat: S(inp.cat, 30), title, date: ymd(inp.date, "게시일") || today(), img: SAFE_IMG(inp.img), lead: S(inp.lead, 400), html };
    }
    case "event": {
      const title = S(inp.title, 120); if (!title) throw new ContentError("제목을 입력하세요");
      const html = cleanHtml(inp.html); if (!textOf(html) && !/<img/.test(html)) throw new ContentError("본문을 입력하세요");
      const periodText = S(inp.periodText, 40);   // 예: 상시 진행 (적으면 날짜 대신 이 문구 표시)
      const start = ymd(inp.start, "시작일", !periodText), end = ymd(inp.end, "종료일");
      if (end && end < start) throw new ContentError("종료일이 시작일보다 빠릅니다");
      const ctaHref = S(inp.ctaHref, 300); if (ctaHref && !SAFE_URL.test(ctaHref) && !/^[a-z0-9_\-]+\.html/i.test(ctaHref)) throw new ContentError("버튼 링크 형식 오류");
      return { title, start: start || null, end: end || null, periodText, img: SAFE_IMG(inp.img), lead: S(inp.lead, 400), html, cta: S(inp.cta, 40), ctaHref, forceEnd: !!inp.forceEnd };
    }
  }
}

// ---------------------------------------------------------------- 사이트 모양으로 변환
function eventStatus(d: any) { const t = today(); if (d.forceEnd) return "end"; if (d.end && d.end < t) return "end"; return "ing"; }
function toSite(kind: ContentKind, row: { id: string; data: any }, catIndex?: Map<string, number>) {
  const d = row.data;
  switch (kind) {
    case "faq": return { id: row.id, c: catIndex?.get(d.cat) ?? 0, q: d.q, a: d.a, p: d.p || firstPara(d.a) };
    case "review": return { id: Number(row.id) || row.id, modelId: d.modelId || null, trimId: d.trimId || null, name: d.name, stars: d.stars, car: d.car, trim: d.trim, text: d.text, photos: d.photos || [], date: d.date ? dot(d.date) : undefined };
    case "article": return { id: row.id, cat: d.cat, title: d.title, date: dot(d.date || ""), img: d.img, lead: d.lead, ...(d.html ? { html: d.html, body: [] } : { body: d.body || [] }) };
    case "event": {
      const st = eventStatus(d);
      return { id: row.id, status: st, badge: st === "end" ? "종료" : "진행중", title: d.title, period: d.periodText || (d.start ? dot(d.start) + " ~ " + (d.end ? dot(d.end) : "") : d.period || ""), img: d.img, lead: d.lead,
        ...(d.html ? { html: d.html, body: [] } : { body: d.body || [] }), cta: d.cta || (st === "end" ? "진행 중인 이벤트 보기" : "차량 보러가기"), ...(d.ctaHref ? { ctaHref: d.ctaHref } : {}) };
    }
  }
}

// ---------------------------------------------------------------- 저장소
async function bump(c?: pg.PoolClient) {
  await setState("content_version", undefined, c);
  pub = null;
}
export async function cats(kind: CatKind) { return (await q(`SELECT id, name, sort FROM content_cats WHERE kind = $1 ORDER BY sort, name`, [kind])).rows; }
export async function list(kind: ContentKind) {
  const { rows } = await q(`SELECT id, visible, sort, data, updated_at FROM content_items WHERE kind = $1 ORDER BY sort, created_at`, [kind]);
  return rows;
}
export async function getOne(kind: ContentKind, id: string) { return (await q(`SELECT id, visible, sort, data, updated_at FROM content_items WHERE kind = $1 AND id = $2`, [kind, id])).rows[0] || null; }

async function nextId(c: pg.PoolClient, kind: ContentKind) {
  await c.query(`SELECT pg_advisory_xact_lock(727012, hashtext($1))`, [kind]);   // 동시에 만들어도 번호가 겹치지 않게
  const { rows } = await c.query(`SELECT id FROM content_items WHERE kind = $1`, [kind]);
  let max = 0; for (const r of rows) { const n = Number(String(r.id).replace(/^\D+/, "")); if (n > max) max = n; }
  return (kind === "review" ? "" : kind[0]) + (max + 1);
}
export async function save(kind: ContentKind, id: string | null, inp: any, adminId: number | null) {
  const data = cleanInput(kind, inp);
  if (kind === "faq") { const ok = await q(`SELECT 1 FROM content_cats WHERE kind = 'faq' AND id = $1`, [data.cat]); if (!ok.rowCount) throw new ContentError("없는 카테고리입니다"); }
  return tx(async (c) => {
    let row;
    if (id) {
      const prev = (await c.query(`SELECT data FROM content_items WHERE kind = $1 AND id = $2 FOR UPDATE`, [kind, id])).rows[0];
      if (!prev) throw new ContentError("없음", 404);
      if (kind === "faq") delete prev.data.p;
      const merged = { ...prev.data, ...data }; if ((kind === "article" || kind === "event") && data.html) delete merged.body;   // 편집기로 고치면 예전 구조 본문 대신 HTML
      row = (await c.query(`UPDATE content_items SET data = $3, visible = COALESCE($4, visible), updated_at = now(), updated_by = $5 WHERE kind = $1 AND id = $2 RETURNING id, visible, sort, data`, [kind, id, merged, typeof inp.visible === "boolean" ? inp.visible : null, adminId])).rows[0];
    } else {
      const nid = await nextId(c, kind);
      const so = (await c.query(`SELECT COALESCE(MIN(sort), 1) - 1 AS s FROM content_items WHERE kind = $1`, [kind])).rows[0].s;   // 새 글은 맨 위
      row = (await c.query(`INSERT INTO content_items (kind, id, visible, sort, data, updated_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, visible, sort, data`, [kind, nid, inp.visible !== false, so, data, adminId])).rows[0];
    }
    await bump(c);
    return row;
  });
}
export async function setVisible(kind: ContentKind, id: string, visible: boolean, adminId: number | null) {
  const r = await q(`UPDATE content_items SET visible = $3, updated_at = now(), updated_by = $4 WHERE kind = $1 AND id = $2`, [kind, id, visible, adminId]);
  if (!r.rowCount) throw new ContentError("없음", 404); await bump();
}
export async function remove(kind: ContentKind, id: string) {
  const r = await q(`DELETE FROM content_items WHERE kind = $1 AND id = $2`, [kind, id]); if (!r.rowCount) throw new ContentError("없음", 404); await bump();
}
export async function reorder(kind: ContentKind, ids: string[]) {
  await tx(async (c) => { for (let i = 0; i < ids.length; i++) await c.query(`UPDATE content_items SET sort = $3 WHERE kind = $1 AND id = $2`, [kind, ids[i], i]); await bump(c); });
}
// 분류
export async function saveCat(kind: CatKind, id: string | null, name: string) {
  name = S(name, 30); if (!name) throw new ContentError("이름을 입력하세요");
  if (id) {
    const old = (await q(`SELECT name FROM content_cats WHERE kind = $1 AND id = $2`, [kind, id])).rows[0]; if (!old) throw new ContentError("없음", 404);
    await q(`UPDATE content_cats SET name = $3 WHERE kind = $1 AND id = $2`, [kind, id, name]);
    if (kind === "article") await q(`UPDATE content_items SET data = jsonb_set(data, '{cat}', to_jsonb($2::text)) WHERE kind = 'article' AND data->>'cat' = $1`, [old.name, name]);   // 아티클은 분류 이름을 글에 저장
  }
  else { const n = (await q(`SELECT COALESCE(MAX(sort),0)+1 AS s, COUNT(*) AS c FROM content_cats WHERE kind = $1`, [kind])).rows[0]; id = "c" + Date.now().toString(36); await q(`INSERT INTO content_cats (kind, id, name, sort) VALUES ($1,$2,$3,$4)`, [kind, id, name, n.s]); }
  await bump(); return { id, name };
}
export async function removeCat(kind: CatKind, id: string) {
  if (kind === "faq") { const n = await q(`SELECT COUNT(*)::int AS n FROM content_items WHERE kind = 'faq' AND data->>'cat' = $1`, [id]); if (n.rows[0].n) throw new ContentError(`이 카테고리의 질문 ${n.rows[0].n}개를 먼저 옮기거나 지우세요`); }
  await q(`DELETE FROM content_cats WHERE kind = $1 AND id = $2`, [kind, id]); await bump();
}
export async function reorderCats(kind: CatKind, ids: string[]) { await tx(async (c) => { for (let i = 0; i < ids.length; i++) await c.query(`UPDATE content_cats SET sort = $3 WHERE kind = $1 AND id = $2`, [kind, ids[i], i]); await bump(c); }); }

// ---------------------------------------------------------------- 공개 데이터 (캐시: content_version 10초마다 확인)
let pub: { version: string; day: string; faq: string; reviews: string; content: string; etag: string } | null = null;
let pubCheckedAt = 0;
export async function publicContent() {
  const day = today();   // 이벤트 진행중/종료는 날짜로 정해지므로 날짜가 바뀌면 새로 만듦
  if (pub && pub.day === day && Date.now() - pubCheckedAt < 10_000) return pub;
  const version = String((await getState("content_version")) || "0"); pubCheckedAt = Date.now();
  if (pub && pub.version === version && pub.day === day) return pub;
  const vis = async (k: ContentKind) => (await q(`SELECT id, data FROM content_items WHERE kind = $1 AND visible ORDER BY sort, created_at`, [k])).rows;
  const fc = await cats("faq"); const ci = new Map(fc.map((c: any, i: number) => [c.id, i]));
  const faqs = (await vis("faq")).filter((r) => ci.has(r.data.cat)).map((r) => toSite("faq", r, ci));
  const reviews = (await vis("review")).map((r) => toSite("review", r));
  const events = (await vis("event")).map((r) => toSite("event", r));
  events.sort((a: any, b: any) => (a.status === b.status ? 0 : a.status === "ing" ? -1 : 1));   // 진행중 먼저 (각 안에서는 관리자 순서)
  const content = { articles: (await vis("article")).map((r) => toSite("article", r)), events };
  const head = (what: string) => `/* 차큐 ${what} (API 생성 ${new Date().toISOString()}) */\n`;
  // 관리자가 올린 이미지(/api/pub/media/...)는 이 파일을 내려준 API 주소 기준으로 (사이트와 API 주소가 달라도 이미지가 보이게)
  const fix = (k: string) => String.raw`(function(w,k){var s=document.currentScript&&document.currentScript.src,o=s?s.replace(/\/api\/pub\/.*$/,""):"";if(!o||!w[k])return;var f=function(v){if(typeof v==="string")return v.replace(/(^|[\s"'(=])\/api\/pub\/media\//g,"$1"+o+"/api/pub/media/");if(v&&typeof v==="object")for(var x in v)v[x]=f(v[x]);return v;};f(w[k]);})(window,"` + k + `");
`;
  pub = {
    version, day, etag: `"ct${version}-${day}"`,
    faq: head("자주 묻는 질문") + "window.CHAQ_FAQ = " + JSON.stringify({ cats: fc.map((c: any) => c.name), items: faqs }) + ";\n" + fix("CHAQ_FAQ"),
    reviews: head("이용후기") + "window.CHAQ_REVIEWS = " + JSON.stringify(reviews) + ";\n" + fix("CHAQ_REVIEWS"),
    content: head("아티클·이벤트") + "window.CHAQ_CONTENT = " + JSON.stringify(content) + ";\n" + fix("CHAQ_CONTENT"),
  };
  return pub;
}

// ---------------------------------------------------------------- 처음 실행: 사이트 파일 가져오기
function readAssign(file: string, name: string): any {
  if (!fs.existsSync(file)) return null;
  const sandbox: any = {}; new Function("window", fs.readFileSync(file, "utf8"))(sandbox);   // 우리 저장소의 데이터 파일 (window.X = {...})
  return sandbox[name] ?? null;
}
export async function ensureContentReady(dir = path.dirname(config.vehicleMasterPath)) {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(727003)");
    const n = (await lock.query(`SELECT (SELECT COUNT(*) FROM content_items)::int + (SELECT COUNT(*) FROM content_cats)::int AS n`)).rows[0].n;
    if (n > 0) return;
    const F = readAssign(path.join(dir, "faq.js"), "CHAQ_FAQ"), R = readAssign(path.join(dir, "reviews.js"), "CHAQ_REVIEWS"), C = readAssign(path.join(dir, "content.js"), "CHAQ_CONTENT");
    if (!F && !R && !C) { log.warn("[content] 사이트 파일 없음 — 빈 상태로 시작"); return; }
    await tx(async (c) => {
      const ins = (kind: ContentKind, id: string, sort: number, data: any) => c.query(`INSERT INTO content_items (kind, id, sort, data) VALUES ($1,$2,$3,$4)`, [kind, id, sort, data]);
      const catIds: string[] = [];
      for (const [i, name] of (F?.cats || []).entries()) { const id = "c" + (i + 1); catIds.push(id); await c.query(`INSERT INTO content_cats (kind, id, name, sort) VALUES ('faq',$1,$2,$3)`, [id, name, i]); }
      for (const [i, it] of (F?.items || []).entries()) await ins("faq", "f" + (i + 1), i, { cat: catIds[it.c] || catIds[0], q: it.q, a: cleanHtml(it.a), p: it.p });
      for (const [i, r] of (R || []).entries()) await ins("review", String(r.id ?? i + 1), i, { name: r.name, stars: r.stars, car: r.car, trim: r.trim, modelId: r.modelId || null, trimId: r.trimId || null, text: r.text, photos: r.photos || [] });
      const aCats = [...new Set((C?.articles || []).map((a: any) => a.cat).filter(Boolean))] as string[];
      for (const [i, name] of aCats.entries()) await c.query(`INSERT INTO content_cats (kind, id, name, sort) VALUES ('article',$1,$2,$3)`, ["a" + (i + 1), name, i]);
      for (const [i, a] of (C?.articles || []).entries()) await ins("article", a.id, i, { cat: a.cat, title: a.title, date: String(a.date || "").replace(/\./g, "-"), img: a.img, lead: a.lead, body: a.body || [] });
      for (const [i, e] of (C?.events || []).entries()) {
        const m = String(e.period || "").match(/(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(?:(\d{4})\.(\d{2})\.(\d{2}))?/);
        await ins("event", e.id, i, { title: e.title, start: m ? `${m[1]}-${m[2]}-${m[3]}` : null, end: m && m[4] ? `${m[4]}-${m[5]}-${m[6]}` : null, periodText: m ? "" : e.period || "", forceEnd: e.status === "end" && !(m && m[4] && `${m[4]}-${m[5]}-${m[6]}` < today()), img: e.img, lead: e.lead, body: e.body || [], cta: e.cta });
      }
      await bump(c);
    });
    log.info("[content] 사이트 파일에서 FAQ·후기·이벤트·아티클 가져옴");
  } finally { await lock.query("SELECT pg_advisory_unlock(727003)").catch(() => {}); lock.release(); }
}
