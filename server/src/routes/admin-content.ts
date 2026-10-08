// 관리자 API — 자주 묻는 질문 · 이용후기 · 이벤트 · 아티클 (저장하면 1분 안에 사이트 반영)
import { Router } from "express";
import { wrap } from "../lib/http.js";
import { adminOf } from "../middleware/auth.js";
import { CONTENT_KINDS, ContentKind, CAT_KINDS, CatKind, ContentError, list, getOne, save, remove, reorder, setVisible, cats, saveCat, removeCat, reorderCats } from "../lib/content.js";

export const adminContentRouter = Router();
const kindOf = (k: unknown): ContentKind => { if (!CONTENT_KINDS.includes(k as ContentKind)) throw new ContentError("종류 오류"); return k as ContentKind; };
const catKindOf = (k: unknown): CatKind => { if (!CAT_KINDS.includes(k as CatKind)) throw new ContentError("종류 오류"); return k as CatKind; };

adminContentRouter.get("/api/admin/content/:kind", wrap(async (req, res) => {
  const kind = kindOf(req.params.kind);
  res.json({ items: await list(kind), cats: kind === "faq" || kind === "article" ? await cats(kind) : [] });
}));
adminContentRouter.get("/api/admin/content/:kind/:id", wrap(async (req, res) => { const r = await getOne(kindOf(req.params.kind), String(req.params.id)); if (!r) return res.status(404).json({ error: "없음" }); res.json(r); }));
adminContentRouter.post("/api/admin/content/:kind", wrap(async (req, res) => res.status(201).json(await save(kindOf(req.params.kind), null, req.body, adminOf(req).id))));
adminContentRouter.put("/api/admin/content/:kind/:id", wrap(async (req, res) => res.json(await save(kindOf(req.params.kind), String(req.params.id), req.body, adminOf(req).id))));
adminContentRouter.patch("/api/admin/content/:kind/:id/visible", wrap(async (req, res) => { await setVisible(kindOf(req.params.kind), String(req.params.id), !!req.body?.visible, adminOf(req).id); res.json({ ok: true }); }));
adminContentRouter.delete("/api/admin/content/:kind/:id", wrap(async (req, res) => { await remove(kindOf(req.params.kind), String(req.params.id)); res.json({ ok: true }); }));
adminContentRouter.post("/api/admin/content/:kind/reorder", wrap(async (req, res) => { await reorder(kindOf(req.params.kind), (req.body?.ids || []).map(String)); res.json({ ok: true }); }));
// 분류 (FAQ 카테고리 · 아티클 분류)
adminContentRouter.post("/api/admin/content-cats/:kind", wrap(async (req, res) => res.status(201).json(await saveCat(catKindOf(req.params.kind), null, req.body?.name))));
adminContentRouter.put("/api/admin/content-cats/:kind/:id", wrap(async (req, res) => res.json(await saveCat(catKindOf(req.params.kind), String(req.params.id), req.body?.name))));
adminContentRouter.delete("/api/admin/content-cats/:kind/:id", wrap(async (req, res) => { await removeCat(catKindOf(req.params.kind), String(req.params.id)); res.json({ ok: true }); }));
adminContentRouter.post("/api/admin/content-cats/:kind/reorder", wrap(async (req, res) => { await reorderCats(catKindOf(req.params.kind), (req.body?.ids || []).map(String)); res.json({ ok: true }); }));
