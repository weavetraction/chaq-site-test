// 관리자 계정·탭별 권한 (#46) — 대표(owner)만 멤버 추가·권한·중지·초대 링크 재발급
// 비밀번호는 대표가 정하지 않음: 초대 링크(72시간, 1회용)로 본인이 설정. 계정은 지우지 않고 중지(작업 이력 보존)
import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { q } from "../db.js";
import { wrap, intParam } from "../lib/http.js";
import { limiter } from "../lib/limits.js";
import { issue, adminOf } from "../middleware/auth.js";
import { normPerms, pwProblem, TABS, TAB_KO, EXTRA_PERMS } from "../lib/admin-perms.js";

const INVITE_HOURS = 72;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const newInvite = () => { const token = crypto.randomBytes(32).toString("base64url"); return { token, hash: sha(token), expires: new Date(Date.now() + INVITE_HOURS * 3600_000) }; };
const tokenOk = (t: unknown) => typeof t === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(t);

// ---------------------------------------------------------------- 로그인 전 (초대 링크)
export const adminInviteRouter = Router();
const inviteLimit = limiter("admin-invite", { windowMs: 15 * 60_000, limit: 30, message: { error: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요" } });

async function findInvite(token: string) {
  const { rows } = await q(`SELECT id, email, name, active, invite_expires_at FROM admins WHERE invite_hash = $1`, [sha(token)]);
  const a = rows[0];
  if (!a || !a.active) return { error: "유효하지 않은 초대 링크예요. 대표에게 새 링크를 요청하세요" };
  if (!a.invite_expires_at || new Date(a.invite_expires_at).getTime() < Date.now()) return { error: "초대 링크가 만료됐어요(72시간). 대표에게 새 링크를 요청하세요" };
  return { a };
}
adminInviteRouter.get("/api/admin/invite/:token", inviteLimit, wrap(async (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(400).json({ error: "유효하지 않은 초대 링크예요" });
  const r = await findInvite(req.params.token);
  if (r.error) return res.status(410).json({ error: r.error });
  res.setHeader("Cache-Control", "no-store");
  res.json({ email: r.a.email, name: r.a.name });
}));
adminInviteRouter.post("/api/admin/invite/:token", inviteLimit, wrap(async (req, res) => {
  if (!tokenOk(req.params.token)) return res.status(400).json({ error: "유효하지 않은 초대 링크예요" });
  const r = await findInvite(req.params.token);
  if (r.error) return res.status(410).json({ error: r.error });
  const pw = String(req.body?.password || ""); const bad = pwProblem(pw);
  if (bad) return res.status(400).json({ error: bad });
  const hash = await bcrypt.hash(pw, 12);
  // 같은 링크 동시 사용 방지: invite_hash 가 그대로일 때만 갱신
  const u = await q(`UPDATE admins SET password_hash = $1, invite_hash = NULL, invite_expires_at = NULL, pw_changed_at = now() - interval '5 seconds', last_login_at = now() WHERE id = $2 AND invite_hash = $3 RETURNING id, email, name`, [hash, r.a.id, sha(req.params.token)]);
  if (!u.rows[0]) return res.status(410).json({ error: "이미 사용된 초대 링크예요" });
  issue(res, u.rows[0]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- 로그인 후
export const adminAccountsRouter = Router();
const ownerOnly = (req: any, res: any, next: any) => (adminOf(req)?.role === "owner" ? next() : res.status(403).json({ error: "이 기능은 대표 계정만 쓸 수 있어요" }));

adminAccountsRouter.get("/api/admin/me", (req, res) => { const a = adminOf(req); res.json({ ...a, tabs: TABS, tabLabels: TAB_KO }); });

const pwLimit = limiter("admin-pw", { windowMs: 15 * 60_000, limit: 10, message: { error: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요" } });
adminAccountsRouter.post("/api/admin/me/password", pwLimit, wrap(async (req, res) => {
  const me = adminOf(req); const cur = String(req.body?.current || ""), next = String(req.body?.next || "");
  const { rows } = await q(`SELECT password_hash FROM admins WHERE id = $1`, [me.id]);
  if (!rows[0]?.password_hash || !(await bcrypt.compare(cur, rows[0].password_hash))) return res.status(400).json({ error: "지금 비밀번호가 맞지 않아요" });
  const bad = pwProblem(next); if (bad) return res.status(400).json({ error: bad });
  if (cur === next) return res.status(400).json({ error: "지금과 다른 비밀번호로 바꿔 주세요" });
  await q(`UPDATE admins SET password_hash = $1, pw_changed_at = now() - interval '5 seconds' WHERE id = $2`, [await bcrypt.hash(next, 12), me.id]);
  issue(res, me);   // 이 기기는 로그인 유지, 다른 기기 로그인은 무효
  res.json({ ok: true });
}));

const view = (r: any) => ({ id: r.id, email: r.email, name: r.name, role: r.role, perms: normPerms(r.perms), active: r.active, createdAt: r.created_at, lastLoginAt: r.last_login_at,
  state: !r.active ? "stopped" : r.password_hash ? "active" : r.invite_expires_at && new Date(r.invite_expires_at).getTime() > Date.now() ? "invited" : "expired", inviteExpiresAt: r.invite_expires_at });
const COLS = `id, email, name, role, perms, active, created_at, last_login_at, password_hash <> '' AS password_hash, invite_expires_at`;

adminAccountsRouter.get("/api/admin/admins", ownerOnly, wrap(async (_req, res) => {
  const { rows } = await q(`SELECT ${COLS} FROM admins ORDER BY (role = 'owner') DESC, active DESC, id`);
  res.json({ rows: rows.map(view), tabs: TABS, extraPerms: EXTRA_PERMS, tabLabels: TAB_KO, inviteHours: INVITE_HOURS });
}));

const PermsIn = z.record(z.string(), z.enum(["none", "view", "edit"]));
const AddIn = z.object({ email: z.string().trim().toLowerCase().email().max(200), name: z.string().trim().min(1).max(50), perms: PermsIn });
adminAccountsRouter.post("/api/admin/admins", ownerOnly, wrap(async (req, res) => {
  const p = AddIn.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: "이름·이메일을 확인해 주세요" });
  const dup = await q(`SELECT id FROM admins WHERE email = $1`, [p.data.email]);
  if (dup.rows[0]) return res.status(409).json({ error: "이미 등록된 이메일이에요" });
  const inv = newInvite();
  const { rows } = await q(`INSERT INTO admins (email, name, password_hash, role, perms, active, created_by, invite_hash, invite_expires_at) VALUES ($1,$2,'','member',$3,true,$4,$5,$6) RETURNING ${COLS}`,
    [p.data.email, p.data.name, JSON.stringify(normPerms(p.data.perms)), adminOf(req).id, inv.hash, inv.expires]);
  res.status(201).json({ ...view(rows[0]), inviteToken: inv.token });
}));

const PatchIn = z.object({ name: z.string().trim().min(1).max(50).optional(), perms: PermsIn.optional(), active: z.boolean().optional() });
async function memberRow(id: number) {
  const { rows } = await q(`SELECT ${COLS} FROM admins WHERE id = $1`, [id]); const r = rows[0];
  if (!r) throw Object.assign(new Error("없는 계정이에요"), { status: 404 });
  if (r.role === "owner") throw Object.assign(new Error("대표 계정은 여기서 바꿀 수 없어요"), { status: 400 });
  return r;
}
adminAccountsRouter.patch("/api/admin/admins/:id", ownerOnly, wrap(async (req, res) => {
  const id = intParam(req.params.id); await memberRow(id);
  const p = PatchIn.safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: "입력 형식 오류" });
  const sets: string[] = [], vals: unknown[] = [];
  if (p.data.name !== undefined) { vals.push(p.data.name); sets.push(`name = $${vals.length}`); }
  if (p.data.perms !== undefined) { vals.push(JSON.stringify(normPerms(p.data.perms))); sets.push(`perms = $${vals.length}`); }
  if (p.data.active !== undefined) { vals.push(p.data.active); sets.push(`active = $${vals.length}`); if (!p.data.active) sets.push(`invite_hash = NULL, invite_expires_at = NULL`); }
  if (!sets.length) return res.status(400).json({ error: "바꿀 내용이 없어요" });
  vals.push(id);
  const { rows } = await q(`UPDATE admins SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING ${COLS}`, vals);
  res.json(view(rows[0]));
}));
/** 초대 링크 (재)발급 = 비밀번호 재설정. 기존 비밀번호는 지워지고 링크로 새로 정함 → 기존 로그인 무효 */
adminAccountsRouter.post("/api/admin/admins/:id/invite", ownerOnly, wrap(async (req, res) => {
  const id = intParam(req.params.id); const r = await memberRow(id);
  if (!r.active) return res.status(400).json({ error: "중지된 계정이에요. 먼저 사용을 재개해 주세요" });
  const inv = newInvite();
  const { rows } = await q(`UPDATE admins SET password_hash = '', pw_changed_at = now(), invite_hash = $1, invite_expires_at = $2 WHERE id = $3 RETURNING ${COLS}`, [inv.hash, inv.expires, id]);
  res.json({ ...view(rows[0]), inviteToken: inv.token });
}));
