/* 차큐 이용 후기 ↔ 차량 데이터 연동 (CHAQ_REVIEWS × CHAQ_VM × CHAQ 견적)
   · 후기 → 차량: reviews.js 의 trimId / modelId (권장, API 에서 내려줄 값). 없으면 car 문자열("현대 팰리세이드")을 Vehicle Master 브랜드·모델명으로 매칭
   · 차량 → 후기: 같은 트림(3) > 같은 모델(2) > 같은 계열 familyKey(1, 예: 캐스퍼 ↔ 캐스퍼 일렉트릭) 순, 동점은 최신(id 큰 순)
   · 사용처: car-detail.html (하단 후기 슬라이드 위젯 — 재고특가 ?id=s… · 빠른인도 ?id=f…&from=fast · 견적조회 ?id=e…&from=estimate · 차종선택 ?trimId= 모두 같은 페이지. 이 차량 후기가 없으면 전체 최신 후기로 대체), review__list.html (?model=<familyKey> 차량별 필터)
   Vehicle Master(CHAQ_VM) 가 없는 페이지에서는 reviews.js 의 modelId 로만 비교한다. */
(function (root) {
  "use strict";
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s·\-_/()]+/g, ""); }
  var esc = root.CHAQ_UTIL.esc;   // 공통 site-util.js
  function VM() { return root.CHAQ_VM || null; }

  /** "현대 팰리세이드" / (brand, model) → Vehicle Master modelId. 정확 일치만 (추정 금지) */
  function modelIdByName(brandAndModel) {
    var vm = VM(); if (!vm) return null;
    var car = norm(brandAndModel); if (!car) return null;
    var hit = null;
    vm.getBrands().forEach(function (b) {
      [b.nameKo, b.nameEn].forEach(function (bn) {
        bn = norm(bn); if (!bn || car.indexOf(bn) !== 0 || hit) return;
        var rest = car.slice(bn.length);
        vm.getModels(b.id).forEach(function (m) { if (!hit && (norm(m.nameKo) === rest || norm(m.nameEn) === rest)) hit = m.id; });
      });
    });
    return hit;
  }
  /** 후기 1건의 차량 연결 { trimId, modelId, familyKey } */
  function reviewVehicle(r) {
    var vm = VM(), trimId = r.trimId || null, modelId = r.modelId || null;
    if (vm) {
      if (trimId) { var d = vm.describe(trimId); if (d) modelId = d.model.id; else trimId = null; }
      if (modelId && !vm.getModel(modelId)) modelId = null;
      if (!modelId) modelId = modelIdByName(r.car);
    }
    var m = vm && modelId ? vm.getModel(modelId) : null;
    return { trimId: trimId, modelId: modelId, familyKey: (m && m.familyKey) || r.familyKey || modelId };
  }
  /** 차량 → 연결된 후기 [{ review, level(3 트림·2 모델·1 계열), vehicle }] */
  function reviewsFor(ctx, list) {
    list = list || root.CHAQ_REVIEWS || [];
    if (!ctx || (!ctx.modelId && !ctx.familyKey)) return [];
    var out = [];
    list.forEach(function (r) {
      var v = reviewVehicle(r), lv = 0;
      if (ctx.trimId && v.trimId === ctx.trimId) lv = 3;
      else if (ctx.modelId && v.modelId === ctx.modelId) lv = 2;
      else if (ctx.familyKey && v.familyKey === ctx.familyKey) lv = 1;
      if (lv) out.push({ review: r, level: lv, vehicle: v });
    });
    return out.sort(function (a, b) { return (b.level - a.level) || ((+b.review.id || 0) - (+a.review.id || 0)); });
  }
  /** 차량 문맥: trimId → { trimId, modelId, familyKey, modelName }. trimId 가 없으면 브랜드+모델명으로 */
  function contextFromTrim(trimId) {
    var vm = VM(); if (!vm || !trimId) return null; var d = vm.describe(trimId); if (!d) return null;
    return { trimId: trimId, modelId: d.model.id, familyKey: d.model.familyKey || d.model.id, modelName: d.modelName || d.model.nameKo };
  }
  function contextFromQuote(rec) {
    if (!rec) return null;
    var c = rec.trimId ? contextFromTrim(rec.trimId) : null; if (c) return c;
    var vm = VM(), mid = modelIdByName((rec.brand || "") + " " + (rec.model || "")); if (!mid) return null;
    var m = vm.getModel(mid); return { trimId: null, modelId: mid, familyKey: (m && m.familyKey) || mid, modelName: m ? m.nameKo : rec.model };
  }
  /** car-detail.html 의 현재 차량 (페이지와 같은 규칙: ?trimId= → ?id= 견적 → 기본 재고 첫 차량) */
  function detailContext() {
    var q = location.search, tm = (q.match(/[?&]trimId=([^&]+)/) || [])[1];
    var c = tm ? contextFromTrim(decodeURIComponent(tm)) : null; if (c) return c;
    var D = root.CHAQ || {}, all = (D.stock || []).concat(D.fast || [], D.estimate || []);
    var idm = (q.match(/[?&]id=([a-z0-9]+)/i) || [])[1];
    var rec = root.CHAQ_DETAIL_QUOTE || (idm ? all.filter(function (r) { return r.id === idm; })[0] : null) || (D.stock && D.stock[0]) || all[0];
    return contextFromQuote(rec);
  }

  function stars(n) { n = Math.max(0, Math.min(5, +n || 0)); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
  /** 상세 페이지 하단 후기 슬라이드 위젯. 연결 후기가 없으면 아무것도 넣지 않음(레이아웃 그대로) */
  function mountDetailWidget(opt) {
    opt = opt || {};
    var ctx = opt.context || detailContext(); var rows = reviewsFor(ctx);
    // 이 차량 후기가 아직 없으면: 전체 최신 후기로 대체(제목 '차큐 고객 이용 후기', 카드에 해당 차량 표기만) — 재고특가·빠른인도·견적조회 모든 상세에서 위젯 노출
    var fallback = !rows.length;
    if (fallback) { if (opt.fallback === false) return null; rows = (root.CHAQ_REVIEWS || []).slice().sort(function (a, b) { return (+b.id || 0) - (+a.id || 0); }).slice(0, opt.fallbackMax || 10).map(function (r) { return { review: r, level: 0, vehicle: null }; }); }
    if (!rows.length) return null;
    var anchor = opt.after || [].slice.call(document.querySelectorAll(".detail_shell > section.detail_card")).pop(); if (!anchor) return null;
    var sec = document.createElement("div");   // section/.detail_card 가 아님: 기존 :last-of-type(차량 가격 카드) 스타일을 건드리지 않도록
    sec.className = "detail_reviews"; sec.id = "detailReviews"; sec.setAttribute("role", "region"); sec.setAttribute("aria-label", fallback ? "차큐 고객 이용 후기" : "이 차량 이용 후기");
    if (fallback) sec.classList.add("is-fallback");
    var listUrl = fallback || !ctx ? "review__list.html" : "review__list.html?model=" + encodeURIComponent(ctx.familyKey);
    var cards = rows.map(function (x) {
      var r = x.review, ph = (r.photos || []).slice(0, 3);
      var tag = x.level === 3 ? "같은 등급" : x.level === 2 ? "같은 모델" : x.level === 1 ? "같은 계열" : "";
      return '<a class="drv_card" role="listitem" href="review__list.html?id=' + encodeURIComponent(r.id) + '" data-review-id="' + esc(r.id) + '">' +
        '<span class="drv_top"><span class="drv_avatar">' + esc(String(r.name || "").charAt(0)) + '</span>' +
        '<span class="drv_meta"><strong>' + esc(r.name) + '</strong><span class="drv_stars" aria-label="별점 ' + (+r.stars || 0) + '점">' + stars(r.stars) + '</span></span>' +
        (tag ? '<em class="drv_tag drv_tag' + x.level + '">' + tag + '</em>' : '') + '</span>' +
        '<span class="drv_car"><strong>' + esc(r.car) + '</strong>' + (r.trim ? '<em>' + esc(r.trim) + '</em>' : '') + '</span>' +
        '<span class="drv_text">' + esc(r.text) + '</span>' +
        (ph.length ? '<span class="drv_photos">' + ph.map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join("") + ((r.photos || []).length > 3 ? '<b>+' + ((r.photos || []).length - 3) + '</b>' : '') + '</span>' : '') +
        '</a>';
    }).join("");
    sec.innerHTML = '<div class="drv_head"><p class="cond_label">' + (fallback ? "차큐 고객 이용 후기" : "이 차량 이용 후기") + ' <b>' + rows.length + '</b></p><a class="drv_more" href="' + esc(listUrl) + '">전체보기</a></div>' +
      '<div class="drv_track" role="list">' + cards + '</div>' +
      (rows.length > 1 ? '<div class="drv_dots">' + rows.map(function (_, i) { return '<button type="button" aria-label="' + (i + 1) + '번째 후기"' + (i ? '' : ' class="on"') + '></button>'; }).join("") + '</div>' : '');
    anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    sec.querySelectorAll(".drv_photos img").forEach(function (im) { im.onerror = function () { var box = this.parentNode; this.remove(); if (box && !box.querySelector("img")) box.remove(); }; });
    if (rows.length > 1) slider(sec);
    return { section: sec, context: ctx, count: rows.length, fallback: fallback };
  }
  /** 가로 스와이프(scroll-snap) + 점 표시 + 자동 넘김(터치·호버 시 일시정지, 동작 줄이기 설정 존중) */
  function slider(sec) {
    var track = sec.querySelector(".drv_track"), dots = [].slice.call(sec.querySelectorAll(".drv_dots button")), cards = [].slice.call(track.children);
    var idx = 0, timer = null, pausedUntil = 0;
    function cur() { var x = track.scrollLeft, base = cards[0].offsetLeft, best = 0, bd = 1e9; cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft - base - x); if (d < bd) { bd = d; best = i; } }); return best; }
    function go(i, smooth) { idx = (i + cards.length) % cards.length; var c = cards[idx]; track.scrollTo({ left: c.offsetLeft - cards[0].offsetLeft, behavior: smooth === false ? "auto" : "smooth" }); mark(idx); }
    function mark(i) { dots.forEach(function (d, k) { d.classList.toggle("on", k === i); }); }
    var raf = 0; track.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { idx = cur(); mark(idx); }); }, { passive: true });
    dots.forEach(function (d, i) { d.addEventListener("click", function () { pause(); go(i); }); });
    function pause() { pausedUntil = Date.now() + 6000; }
    ["pointerdown", "touchstart", "wheel", "mouseenter", "focusin"].forEach(function (ev) { track.addEventListener(ev, pause, { passive: true }); });
    var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) timer = setInterval(function () {
      if (Date.now() < pausedUntil || document.hidden) return;
      var r = sec.getBoundingClientRect(); if (r.bottom < 0 || r.top > (root.innerHeight || 800)) return;   // 화면에 보일 때만
      go(idx + 1);
    }, 4500);
    return { go: go, stop: function () { clearInterval(timer); } };
  }

  root.CHAQ_REVIEW_LINK = { reviewVehicle: reviewVehicle, reviewsFor: reviewsFor, modelIdByName: modelIdByName, contextFromTrim: contextFromTrim, contextFromQuote: contextFromQuote, detailContext: detailContext, mountDetailWidget: mountDetailWidget };
})(typeof window !== "undefined" ? window : globalThis);
