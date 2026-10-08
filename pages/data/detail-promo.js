/* 차량 상세 하단 안내 블록 (후기 위젯 아래) — 디자인 시안 1080px 기준 그대로, 화면 폭에 비례(cqw)
   ① 배너 슬라이드  ② 장기렌트. 더이상 견적 받으러 다니지마세요. (3 타일)  ③ 문의부터 인도까지 딱 5일! (5단계)  ④ 뒤: 자주 묻는 질문 · ChaQ Guide (메인 섹션 그대로)
   ④ 같은 조건, 다른 차량도 볼까요? — 지금 선택한 조건(계약기간·초기비용·주행거리)과 같은 조건의 다른 차량을
      같은 목록(재고특가 s / 빠른인도 f / 견적조회 e)에서 월 납입금대가 같은 차량으로 추천. 조건 칩을 바꾸면 즉시 다시 계산
   데이터: window.CHAQ(견적 · cost[주행][기간][초기비용]) · window.CHAQ_VM(차량 이미지·계열) — 금액은 견적 값 그대로, 추정 없음
   이미지: assets/img/detail-*.{jpg,png}, 아이콘 assets/icons/tag-sale.svg(세일태그) · instant.svg(즉시출고) */
(function (root) {
  "use strict";
  var IMG = "../assets/img/", ICON = "../assets/icons/", PH = "../assets/icons/car-placeholder.svg";
  // 배너: 여러 장이면 배열에 추가 (1장이면 시안처럼 좌우가 보이도록 같은 배너를 이어 붙임)
  var BANNERS = [{ src: IMG + "detail-banner-quote.jpg", alt: "여러 곳에 견적을 요청할 필요 없이 내 조건에 딱 맞는 최저가 견적을 10초 만에 확인하세요! 재고부터 월 납입금까지 직접 비교해보세요.", href: null }];

  var esc = root.CHAQ_UTIL.esc;   // 공통 site-util.js
  function norm(s) { return String(s || "").toLowerCase().replace(/[\s·\-_/()]+/g, ""); }

  // ---------------------------------------------------------------- 현재 차량·조건 (car-detail.html 과 같은 규칙)
  function allRecs() { var D = root.CHAQ || {}; return [["stock", D.stock || []], ["fast", D.fast || []], ["estimate", D.estimate || []]]; }
  function kindOf(rec) { var id = String(rec && rec.id || ""); return id[0] === "f" ? "fast" : id[0] === "e" ? "estimate" : "stock"; }
  function currentRec() {
    var q = location.search, D = root.CHAQ || {}, all = (D.stock || []).concat(D.fast || [], D.estimate || []);
    if (root.CHAQ_DETAIL_VM_MODE) return root.CHAQ_DETAIL_QUOTE || null;
    var idm = (q.match(/[?&]id=([a-z0-9]+)/i) || [])[1];
    return root.CHAQ_DETAIL_QUOTE || (idm ? all.filter(function (r) { return r.id === idm; })[0] : null) || (D.stock && D.stock[0]) || all[0] || null;
  }
  function readCond() {
    function on(g) { var b = document.querySelector('.detail_conds .filter_chip[data-group="' + g + '"].on'); return b ? b.textContent : ""; }
    var term = (on("term").match(/[0-9]+/) || ["60"])[0], it = on("init");
    var plan = it.indexOf("보증") > -1 ? "b" : (it.indexOf("선납") > -1 ? "s" : "0");
    var dist = (on("dist").match(/(\d)만/) || [0, "1"])[1];   // 1만 / 2만 / 3만 km
    var lease = /운용리스/.test(on("type"));
    return { term: term, plan: plan, dist: dist, lease: lease };
  }
  function condText(c) { return (c.plan === "b" ? "보증금 30%" : c.plan === "s" ? "선납금 30%" : "초기비용 0") + " · 주행거리 " + c.dist + "만km · " + c.term + "개월"; }
  function monthlyExact(r, c) { var d = r.cost && r.cost[c.dist], t = d && d[c.term], v = t && t[c.plan]; return v == null ? null : v; }
  function monthlyLoose(r, c) { var d = r.cost && r.cost[c.dist]; if (!d) return null; var t = d[c.term] || d[Object.keys(d)[0]]; if (!t) return null; if (t[c.plan] != null) return t[c.plan]; for (var p in t) return t[p]; return null; }   // 페이지 표시값과 동일
  function familyOf(r) { var VM = root.CHAQ_VM; if (VM && r.trimId) { var d = VM.describe(r.trimId); if (d) return d.model.familyKey || d.model.id; } return norm(r.brand) + "|" + norm(r.model); }
  function vmName(r) { var VM = root.CHAQ_VM; if (!VM || !r.trimId) return null; var d = VM.describe(r.trimId); return d ? (d.brandName + " " + d.modelName) : null; }   // 짧은 차명(모델 단위)
  var carImg = root.CHAQ_UTIL.carImg;   // 공통 site-util.js

  /** 같은 조건 · 같은 월 납입금대(10만원 단위) 다른 차량. 없으면 월 납입금이 가까운 차량 */
  function sameCondCars(cur, c, max) {
    var kind = cur ? kindOf(cur) : ((location.search.match(/[?&]from=(fast|estimate)/) || [])[1] || "stock");
    var pool = allRecs().filter(function (x) { return x[0] === kind; })[0][1];
    var curM = cur ? monthlyLoose(cur, c) : null, curFam = cur ? familyOf(cur) : null;
    function collect(val) {
      var best = {};
      pool.forEach(function (r) {
        if (cur && r.id === cur.id) return;
        if (r.rem === 0) return;
        if (!r.trimId || !vmName(r)) return;             // 차량 데이터(Vehicle Master)와 연결된 견적만 — 차명·계열·이미지 일관
        var m = val(r, c); if (m == null) return;
        var fam = familyOf(r); if (fam === curFam) return;
        var key = fam, score = curM == null ? m : Math.abs(m - curM);
        if (!best[key] || score < best[key].score) best[key] = { r: r, m: m, score: score };
      });
      return Object.keys(best).map(function (k) { return best[k]; });
    }
    // 정확히 같은 조건 금액 우선. 이 목록(예: 견적조회)에 그 조건 금액이 아예 없으면(견적조회 데이터엔 보증금 30% 금액 없음)
    // 상세 페이지가 보여주는 값과 같은 규칙(monthlyLoose)으로 대체 — 섹션이 사라지지 않게
    var list = collect(monthlyExact);
    if (!list.length) list = collect(monthlyLoose);
    var band = curM == null ? null : Math.floor(curM / 100000) * 10, label, rows;
    if (band != null) {
      rows = list.filter(function (x) { return Math.floor(x.m / 100000) * 10 === band; });
      if (rows.length) label = "월 " + band + "만원대 차량";
      else { rows = list; label = "월 납입금이 비슷한 차량"; }
    } else { rows = list; label = "월 납입금이 낮은 차량"; }
    rows.sort(function (a, b) { return a.score - b.score || a.m - b.m; });
    return { kind: kind, label: label, rows: rows.slice(0, max || 10) };
  }

  // ---------------------------------------------------------------- 마크업
  function bannerHtml() {
    var list = BANNERS.length === 1 ? [BANNERS[0], BANNERS[0], BANNERS[0]] : BANNERS;
    return '<div class="dp_banner" aria-roledescription="carousel"><div class="dp_btrack">' + list.map(function (b, i) {
      var dup = BANNERS.length === 1 && i !== 1, img = '<img src="' + esc(b.src) + '" alt="' + (dup ? "" : esc(b.alt)) + '" loading="lazy">';
      return '<div class="dp_bslide"' + (dup ? ' aria-hidden="true"' : "") + ">" + (b.href ? '<a href="' + esc(b.href) + '"' + (dup ? ' tabindex="-1"' : "") + ">" + img + "</a>" : img) + "</div>";
    }).join("") + "</div></div>";
  }
  function whyHtml() {
    return '<section class="dp_why"><h3 class="dp_h">장기렌트.<br>더이상 견적 받으러 다니지마세요.</h3><div class="dp_bento">' +
      '<div class="dp_tile dp_tile--cond"><p class="dp_tt">조건을 바꾸면<br>금액에 바로 반영!</p>' +
        '<img class="dp_shot dp_shot--back" src="' + IMG + 'detail-cond-60m.png" alt="" loading="lazy">' +
        '<img class="dp_shot dp_shot--front" src="' + IMG + 'detail-cond-48m.png" alt="계약 조건을 바꾸면 월 납입금이 바로 바뀌는 화면" loading="lazy"></div>' +
      '<div class="dp_tile dp_tile--deal"><p class="dp_tt">잡으면 무조건 이득인<br>재고특가 노출!</p>' +
        '<img class="dp_deal_car" src="' + IMG + 'detail-deal-car.png" alt="" loading="lazy">' +
        '<img class="dp_deal_tag" src="' + ICON + 'tag-sale.svg" alt="특가" loading="lazy"></div>' +
      '<div class="dp_tile dp_tile--mgr"><img class="dp_mgr_bg" src="' + IMG + 'detail-manager-delivery.jpg" alt="" loading="lazy">' +
        '<p class="dp_tt">심사부터 출고까지<br>맨투맨</p><p class="dp_td">담당이 바뀌지 않아요.<br>전담 매니저가 처음부터 끝까지 책임집니다.</p></div>' +
      "</div></section>";
  }
  function flowHtml() {
    function step(n, t, d, extra) { return '<li><span class="dp_num">' + n + '</span><p class="dp_st">' + t + (extra || "") + '</p><p class="dp_sd">' + d + "</p></li>"; }
    return '<section class="dp_flow"><h3 class="dp_h">문의부터 인도까지<br><em>딱 5일!</em></h3><p class="dp_sub">지금 이 화면에서</p>' +
      '<ol class="dp_steps">' +
        step(1, "차량 선택", "차종·트림 고르고 재고 확인. 지금 보고 계신 이 차량이에요.") +
        step(2, "조건 설정", "계약기간·초기비용·주행거리 고르면 월 납입금 바로 확인.") +
        step(3, "이 조건으로 문의", "버튼 한 번에 차량·조건이 그대로 전달. 다시 설명 안 해도 돼요.") +
      '</ol><p class="dp_pill">이후 담당 매니저</p><ol class="dp_steps dp_steps--mgr" start="4">' +
        step(4, "심사·계약", "재고·심사 결과를 반영한 최종 조건을 매니저가 확인해 드려요.") +
        step(5, "차량 인도", "계약 끝나면 원하는 일정에 맞춰 받으세요.", '<img class="dp_instant" src="' + ICON + 'instant.svg" alt="">') +
      "</ol></section>";
  }
  // '자주 묻는 질문' · 'ChaQ Guide' — 메인(index.html) 섹션과 같은 마크업·데이터(window.CHAQ_FAQ: 카테고리별 대표 1개)
  function faqGuideHtml() {
    var Fq = root.CHAQ_FAQ || { cats: [], items: [] }, seen = {}, sel = [];
    Fq.items.forEach(function (it) { if (seen[it.c] === undefined) { seen[it.c] = 1; sel.push(it); } });
    var faq = sel.map(function (it) {
      return '<details><summary><span class="faq-cat">' + esc(Fq.cats[it.c]) + '</span>' +
        '<span class="faq-qrow"><span class="faq-q">' + esc(it.q) + '</span><i class="faq-arrow"></i></span></summary>' +
        '<p>' + esc(it.p) + '</p></details>';
    }).join("");
    return '<div class="dfg">' +
      (sel.length ? '<section class="faq-section content-pad section-space"><h2>자주 묻는 질문</h2><div class="faq-list">' + faq + '</div>' +
        '<a class="more-button" href="faq__list.html">자주 묻는 질문 더보기</a></section>' : "") +
      '<section class="guide-section content-pad section-space"><h2>ChaQ Guide</h2><p>장기렌트/리스에 대해 궁금하신 모든 부분을 알려드릴게요 :)</p><div class="guide-grid">' +
        '<button type="button" data-pending-link data-action="inquiry"><strong>이미 이용 중이신가요?</strong><span>사고·보험 처리,<br>반납/위약금 등</span><b>무엇이든 물어보세요 ›</b></button>' +
        '<button type="button" data-pending-link data-action="inquiry"><strong>계약 고민 중이신가요?</strong><span>최저가 비교, 숨은 조건,<br>즉시 출고 차량 조회 등</span><b>출고 고민 상담 ›</b></button>' +
      "</div></section></div>";
  }
  function bindFaqGuide(box) {
    var dets = [].slice.call(box.querySelectorAll(".dfg .faq-list details"));   // 한 번에 하나만 펼침 (메인과 동일)
    dets.forEach(function (d) { d.addEventListener("toggle", function () { if (!d.open) return; dets.forEach(function (o) { if (o !== d && o.open) o.open = false; }); }); });
    // 상담 버튼([data-action=inquiry])은 inquiry.js 가 처리 (상담 신청 양식 또는 채널톡)
  }
  function sameHtml() {
    return '<div class="dp_band" aria-hidden="true"></div><section class="dp_same"><h3 class="dp_h">같은 조건,<br>다른 차량도 볼까요?</h3>' +
      '<p class="dp_chip"><b>내가 선택한 조건</b><span class="dp_chip_v"></span></p><p class="dp_blabel"></p><div class="dp_ctrack" role="list"></div></section>';
  }
  function renderSame(box) {
    var c = readCond(), sec = box.querySelector(".dp_same"), band = box.querySelector(".dp_band");
    if (c.lease) { sec.hidden = true; band.hidden = true; return; }   // 운용리스: 견적 준비중(페이지와 동일) → 추천 숨김
    var cur = currentRec(), res = sameCondCars(cur, c, 10);
    if (!res.rows.length) { sec.hidden = true; band.hidden = true; return; }
    sec.hidden = false; band.hidden = false;
    var ct = condText(c);
    sec.querySelector(".dp_chip_v").textContent = ct;
    sec.querySelector(".dp_blabel").textContent = res.label;
    var q = "&term=" + c.term + "&plan=" + c.plan + "&dist=" + c.dist, from = res.kind === "stock" ? "" : "&from=" + res.kind;
    sec.querySelector(".dp_ctrack").innerHTML = res.rows.map(function (x) {
      var r = x.r, name = vmName(r) || ((r.brand || "") + " " + (r.model || ""));
      return '<a class="dp_card" role="listitem" href="car-detail.html?id=' + encodeURIComponent(r.id) + from + q + '">' +
        '<span class="dp_cname">' + esc(name) + '</span><img src="' + esc(carImg(r)) + '" alt="' + esc(name) + '" loading="lazy">' +
        '<span class="dp_ccond">' + esc(ct) + '</span><span class="dp_cprice">월 ' + Math.round(x.m / 10000) + "만원</span></a>";
    }).join("");
    sec.querySelectorAll(".dp_card img").forEach(function (im) { im.onerror = function () { if (this.dataset.ph) return; this.dataset.ph = "1"; this.src = PH; }; });
    var tr = sec.querySelector(".dp_ctrack"); tr.scrollLeft = 0;
  }

  // ---------------------------------------------------------------- 배너 슬라이드 (가운데 정렬 스냅, 1장일 때는 가운데에서 시작)
  function bannerSlider(box) {
    var tr = box.querySelector(".dp_btrack"), slides = [].slice.call(tr.children); if (!slides.length) return;
    var start = BANNERS.length === 1 ? 1 : 0;
    function to(i, smooth) { var s = slides[i]; tr.scrollTo({ left: s.offsetLeft - (tr.clientWidth - s.clientWidth) / 2, behavior: smooth ? "smooth" : "auto" }); }
    requestAnimationFrame(function () { to(start, false); });
    var rt = 0; root.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { to(BANNERS.length === 1 ? 1 : 0, false); }, 120); });
    if (BANNERS.length > 1) {
      var idx = 0, paused = 0;
      ["pointerdown", "touchstart", "wheel", "mouseenter"].forEach(function (e) { tr.addEventListener(e, function () { paused = Date.now() + 6000; }, { passive: true }); });
      if (!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches)) setInterval(function () { if (Date.now() < paused || document.hidden) return; idx = (idx + 1) % slides.length; to(idx, true); }, 5000);
    }
  }

  function mount() {
    if (document.getElementById("detailPromo")) return null;
    var anchor = document.getElementById("detailReviews") || [].slice.call(document.querySelectorAll(".detail_shell > section.detail_card")).pop();
    if (!anchor) return null;
    var box = document.createElement("div");      // section 아님: 기존 section:last-of-type(차량 가격 카드) 스타일 유지
    box.className = "detail_promo"; box.id = "detailPromo";
    box.innerHTML = '<div class="dp_in">' + bannerHtml() + whyHtml() + flowHtml() + sameHtml() + faqGuideHtml() + "</div>";
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    bannerSlider(box);
    bindFaqGuide(box);
    renderSame(box);
    // 조건 칩(상품·기간·초기비용·주행거리)을 바꾸면 같은 조건 추천도 다시 계산 (페이지 금액 계산 뒤)
    document.querySelectorAll(".detail_conds .filter_chip").forEach(function (ch) { ch.addEventListener("click", function () { setTimeout(function () { renderSame(box); }, 0); }); });
    return box;
  }
  root.CHAQ_DETAIL_PROMO = { mount: mount, sameCondCars: sameCondCars, BANNERS: BANNERS };
})(typeof window !== "undefined" ? window : globalThis);
