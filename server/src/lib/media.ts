// 관리자 이미지 업로드: webp 변환(긴 변 최대 2000px) + 썸네일(480px) → DB media 테이블
//  · 주소: /api/pub/media/<id>.webp  (썸네일: /api/pub/media/<id>.thumb.webp) — 내용이 바뀌지 않으므로 1년 캐시
//  · SVG·GIF(움직이는) 는 변환하지 않고 그대로 보관
import crypto from "node:crypto";
import sharp from "sharp";
import { q } from "../db.js";

export const MEDIA_PURPOSES = ["vehicle", "banner", "review", "event", "article", "etc"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg" };
export class MediaError extends Error { status = 400; }

export const mediaUrl = (id: string, mime: string, thumb = false) => `/api/pub/media/${id}${thumb ? ".thumb" : ""}.${EXT[mime] || "bin"}`;

export async function saveMedia(buf: Buffer, fileName: string, purpose: string, adminId: number | null, opts: { maxSide?: number } = {}) {
  const p = (MEDIA_PURPOSES as readonly string[]).includes(purpose) ? purpose : "etc";
  const head = buf.subarray(0, 512).toString("utf8");
  let mime: string, out: Buffer, thumb: Buffer | null = null, width: number | null = null, height: number | null = null;
  if (/<svg[\s>]/i.test(head) || /\.svg$/i.test(fileName)) {
    const s = buf.toString("utf8");
    if (/<script|on\w+\s*=|javascript:/i.test(s)) throw new MediaError("SVG 안에 스크립트가 있어 올릴 수 없습니다");
    mime = "image/svg+xml"; out = buf;
  } else {
    let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try { meta = await sharp(buf).metadata(); } catch { throw new MediaError("이미지 파일이 아닙니다 (jpg·png·webp·gif·svg)"); }
    if (!meta.width || !meta.height) throw new MediaError("이미지 크기를 읽을 수 없습니다");
    if (meta.format === "gif" && (meta.pages || 1) > 1) { mime = "image/gif"; out = buf; width = meta.width; height = meta.pageHeight || meta.height; }
    else {
      const max = opts.maxSide || 2000;
      const img = sharp(buf).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
      const r = await img.webp({ quality: 86, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
      out = r.data; width = r.info.width; height = r.info.height; mime = "image/webp";
      thumb = await sharp(buf).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    }
  }
  const id = crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
  await q(`INSERT INTO media (id, purpose, file_name, mime, width, height, bytes, thumb, size, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, p, fileName.slice(0, 200), mime, width, height, out, thumb, out.length, adminId]);
  return { id, url: mediaUrl(id, mime), thumbUrl: thumb ? mediaUrl(id, mime, true) : null, width, height, size: out.length, mime };
}

export async function getMedia(id: string, thumb: boolean) {
  const r = await q(`SELECT mime, ${thumb ? "COALESCE(thumb, bytes)" : "bytes"} AS b FROM media WHERE id = $1`, [id]);
  return r.rows[0] ? { mime: r.rows[0].mime as string, bytes: r.rows[0].b as Buffer } : null;
}

export async function listMedia(purpose?: string, page = 1) {
  const lim = 60, off = (Math.max(1, page) - 1) * lim;
  const { rows } = await q(`SELECT id, purpose, file_name, mime, width, height, size, created_at, thumb IS NOT NULL AS has_thumb FROM media ${purpose ? "WHERE purpose = $3" : ""} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, purpose ? [lim, off, purpose] : [lim, off]);
  return rows.map((m) => ({ ...m, url: mediaUrl(m.id, m.mime), thumbUrl: m.has_thumb ? mediaUrl(m.id, m.mime, true) : mediaUrl(m.id, m.mime) }));
}
