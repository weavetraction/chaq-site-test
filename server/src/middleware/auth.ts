// 관리자 인증: 로그인 시 JWT 를 httpOnly 쿠키로 발급
// #46: 매 요청 DB 에서 계정 상태·역할·탭 권한을 다시 읽음 → 중지·권한 변경·비밀번호 재설정이 바로 적용
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { q } from "../db.js";
import { denyReason, normPerms, Perms, TABS } from "../lib/admin-perms.js";

export const COOKIE = "chaq_admin";
export type AdminClaims = { id: number; email: string; name: string; role?: string; perms?: Perms };

export function issue(res: Response, a: AdminClaims) {
  const token = jwt.sign({ id: a.id, email: a.email, name: a.name }, config.jwtSecret, { expiresIn: "12h" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 12 * 3600 * 1000, path: "/" });
}
export function clear(res: Response) { res.clearCookie(COOKIE, { path: "/" }); }

export async function loadAdmin(id: number) {
  const { rows } = await q(`SELECT id, email, name, role, perms, active, pw_changed_at FROM admins WHERE id = $1`, [id]);
  return rows[0] as { id: number; email: string; name: string; role: string; perms: unknown; active: boolean; pw_changed_at: Date | null } | undefined;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다" });
  let claims: any;
  try { claims = jwt.verify(token, config.jwtSecret); } catch { return res.status(401).json({ error: "로그인이 만료되었습니다" }); }
  loadAdmin(Number(claims.id)).then((a) => {
    if (!a || !a.active) { clear(res); return res.status(401).json({ error: "사용이 중지된 계정입니다" }); }
    // 비밀번호가 바뀐 뒤 발급 전 로그인은 무효 (초 단위 비교)
    if (a.pw_changed_at && Number(claims.iat || 0) < Math.floor(new Date(a.pw_changed_at).getTime() / 1000)) { clear(res); return res.status(401).json({ error: "비밀번호가 바뀌어 다시 로그인해 주세요" }); }
    const perms = a.role === "owner" ? (Object.fromEntries(TABS.map((t) => [t, "edit"])) as Perms) : normPerms(a.perms);
    const path = String(req.originalUrl || "").split("?")[0];
    const why = denyReason(a.role, perms, req.method, path);
    if (why) return res.status(403).json({ error: why });
    (req as any).admin = { id: a.id, email: a.email, name: a.name, role: a.role, perms } as AdminClaims;
    next();
  }, next);
}
export const adminOf = (req: Request) => (req as any).admin as AdminClaims;
