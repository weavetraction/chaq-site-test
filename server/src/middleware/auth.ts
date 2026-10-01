// 관리자 인증: 로그인 시 JWT 를 httpOnly 쿠키로 발급
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const COOKIE = "chaq_admin";
export type AdminClaims = { id: number; email: string; name: string };

export function issue(res: Response, a: AdminClaims) {
  const token = jwt.sign(a, config.jwtSecret, { expiresIn: "12h" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 12 * 3600 * 1000, path: "/" });
}
export function clear(res: Response) { res.clearCookie(COOKIE, { path: "/" }); }

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다" });
  try { (req as any).admin = jwt.verify(token, config.jwtSecret) as AdminClaims; next(); }
  catch { res.status(401).json({ error: "로그인이 만료되었습니다" }); }
}
export const adminOf = (req: Request) => (req as any).admin as AdminClaims;
