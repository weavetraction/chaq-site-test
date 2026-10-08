// 관리자 API — 메인 화면 (섹션별 노출 선택 · 상단 배너 · 중간 띠배너). 저장하면 1분 안에 사이트 반영
import { Router } from "express";
import { wrap } from "../lib/http.js";
import { adminOf } from "../middleware/auth.js";
import { getConfig, saveConfig, SECTIONS, SECTION_KO, Section, HomeError } from "../lib/home.js";
import { getPublished } from "../lib/quotes-store.js";
import { vm } from "../lib/vm.js";
import { q } from "../db.js";

export const adminHomeRouter = Router();
const monthly = (r: any) => { try { return r.cost["2"]["60"]["0"] ?? null; } catch { return null; } };

adminHomeRouter.get("/api/admin/home", wrap(async (_req, res) => res.json({ config: await getConfig(), sections: SECTION_KO })));
adminHomeRouter.put("/api/admin/home", wrap(async (req, res) => res.json(await saveConfig(req.body || {}, adminOf(req).id))));

/** 직접 선택용 후보: 재고특가·빠른인도 = 지금 사이트에 나가는 견적, 후기·FAQ = 노출 중인 콘텐츠 */
adminHomeRouter.get("/api/admin/home/candidates", wrap(async (req, res) => {
  const s = String(req.query.section) as Section;
  if (!SECTIONS.includes(s)) throw new HomeError("구분 오류");
  if (s === "stock" || s === "fast") {
    const pub = await getPublished();
    return res.json((pub[s] || []).map((r: any) => {
      const t = vm.get(r.trimId);
      return { id: r.id, label: t ? `${t.brandName} ${t.modelName} · ${t.trimName}` : `${r.brand} ${r.model} · ${r.trim}`, sub: [r.year, r.ext, r.rem != null ? `재고 ${r.rem}` : ""].filter(Boolean).join(" · "), monthly: monthly(r), linked: !!r.trimId };
    }));
  }
  const kind = s === "review" ? "review" : "faq";
  const { rows } = await q(`SELECT id, visible, data FROM content_items WHERE kind = $1 ORDER BY sort, created_at`, [kind]);
  const cats = new Map((await q(`SELECT id, name FROM content_cats WHERE kind = 'faq'`)).rows.map((c) => [c.id, c.name]));
  res.json(rows.map((r) => kind === "review"
    ? { id: r.id, label: `${r.data.name} ${"★".repeat(r.data.stars || 5)} · ${r.data.car || ""}`, sub: String(r.data.text || "").slice(0, 60), visible: r.visible }
    : { id: r.id, label: r.data.q, sub: cats.get(r.data.cat) || "", visible: r.visible }));
}));
