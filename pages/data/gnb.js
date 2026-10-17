/* 하단 GNB · 전체메뉴 공통 (#55)
   · 전체메뉴: 지금 페이지 위에서 바로 열림 (예전: 홈으로 이동한 뒤 메뉴 → 홈 화면이 먼저 보였음)
   · 휴대폰 뒤로가기 = 메뉴 닫기 · 옛 링크(index.html#menu)도 그대로 열림
   · 메뉴의 상담 버튼: 상담 스크립트(inquiry.js)가 없는 페이지에서는 처음 누를 때 불러와서 이어서 처리 */
(function () {
  "use strict";
  if (window.CHAQ_GNB) return;
  var inPages = /\/pages\//.test(location.pathname);
  var R = inPages ? "../" : "", P = inPages ? "" : "pages/", A = R + "assets/";

  function banners() {   // 메인 중간 배너와 같은 것: 관리자 '메인 화면' 중간 배너가 있으면 그것, 없으면 기본 2장 (현금지원 · 비교견적)
    var HM = window.CHAQ_HOME, MB = HM && HM.midBanners || [];
    var fix = function (u) { u = String(u || ""); return inPages && /^(assets|pages)\//.test(u) ? "../" + u : u; };
    if (MB.length) return MB.filter(function (b) { return b && b.img; }).map(function (b) { return { img: fix(b.img), href: b.href ? fix(b.href) : "", alt: b.alt || "" }; });
    return [{ img: A + "img/banner-cash.jpg?v=261014", href: P + "cash-support.html", alt: "최대 100만원 현금지원" },   // 현금지원 상시 페이지(대표 261018)
            { img: A + "img/banner-compare.jpg", href: P + "special-price-car__list.html?from=estimate", alt: "금융사 다이렉트 비교견적" }];
  }
  var esc = function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var menu = null, pushed = false;
  function build() {
    if (menu) return menu;
    var BN = banners();
    menu = document.createElement("section");
    menu.className = "cgm"; menu.id = "chaqMenu"; menu.setAttribute("aria-hidden", "true"); menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", "차큐 전체 서비스");
    menu.innerHTML =
      '<div class="cgm_in">' +
        '<header class="cgm_head"><button type="button" class="cgm_back" aria-label="전체메뉴 닫기" data-cgm-close></button><h2>차큐 전체 서비스</h2></header>' +
        '<div class="cgm_guides">' +
          '<button type="button" data-pending-link data-action="inquiry"><strong>이미 이용 중이신가요?</strong><span>사고·보험 처리,<br>반납/위약금 등</span><b>무엇이든 물어보세요 ›</b></button>' +
          '<button type="button" data-pending-link data-action="inquiry"><strong>계약 고민 중이신가요?</strong><span>최저가 비교, 숨은 조건,<br>즉시 출고 차량 조회 등</span><b>출고 고민 상담 ›</b></button>' +
        '</div>' +
        '<nav class="cgm_links">' +
          '<a href="' + P + 'special-price-car__list.html?from=estimate"><img src="' + A + 'icons/estimate.svg" alt=""><span><strong>견적조회</strong><small>내 조건에서 승인 가능한 최저가 금융사/렌탈사</small></span></a>' +
          '<a href="' + P + 'special-price-car__list.html"><img src="' + A + 'icons/special.svg" alt=""><span><strong>재고특가</strong><small>금융사 · 렌탈사 재고 차량 특별 할인</small></span></a>' +
          '<a href="' + P + 'special-price-car__list.html?from=fast"><img src="' + A + 'icons/fast-delivery.svg" alt=""><span><strong>빠른인도</strong><small>1주 이내 인도 가능한 장기렌트 차량</small></span></a>' +
          '<a href="' + P + 'event__list__ing.html"><img src="' + A + 'icons/release-event.svg" alt=""><span><strong>이벤트</strong><small>출고 이벤트 · 후기 이벤트</small></span></a>' +
        '</nav>' +
        '<a class="cgm_cash" href="' + esc(BN[0] && BN[0].href || (P + 'cash-support.html')) + '" aria-label="현금지원">' +
          '<span class="cgm_track">' + BN.map(function (x, i) { return '<span class="cgm_slide' + (i === 0 ? ' is-active' : '') + '" data-href="' + esc(x.href) + '"><img src="' + esc(x.img) + '" alt="' + esc(x.alt) + '"></span>'; }).join('') + '</span>' +
          (BN.length > 1 ? '<span class="cgm_dots" aria-hidden="true">' + BN.map(function (_, i) { return '<i' + (i === 0 ? ' class="is-on"' : '') + '></i>'; }).join('') + '</span>' : '') +
        '</a>' +
      '</div>';
    document.body.appendChild(menu);
    // 배너: 메인과 같은 방식 — 3.5초마다 넘김, 누르면 지금 보이는 배너의 링크로
    var cash = menu.querySelector('.cgm_cash'), sl = [].slice.call(cash.querySelectorAll('.cgm_slide')), dt = [].slice.call(cash.querySelectorAll('.cgm_dots i')), ci = 0;
    if (sl.length > 1) setInterval(function () { sl[ci].classList.remove('is-active'); if (dt[ci]) dt[ci].classList.remove('is-on'); ci = (ci + 1) % sl.length; sl[ci].classList.add('is-active'); if (dt[ci]) dt[ci].classList.add('is-on'); }, 3500);
    cash.addEventListener('click', function (e) { var h = sl[ci] && sl[ci].getAttribute('data-href'); e.preventDefault(); if (h) location.href = h; });
    menu.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-cgm-close]")) close(); });
    return menu;
  }
  function open() {
    build(); menu.classList.add("is-open"); menu.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
    menu.querySelector(".cgm_in").scrollTop = 0;
    if (!pushed) { try { history.pushState(Object.assign({}, history.state, { chaqMenu: 1 }), ""); pushed = true; } catch (e) {} }
  }
  function hide() { if (!menu) return; menu.classList.remove("is-open"); menu.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
  function close() { if (pushed) { pushed = false; history.back(); } hide(); }   // 메뉴를 열 때 쌓은 기록 1칸을 되돌림
  window.addEventListener("popstate", function () { if (menu && menu.classList.contains("is-open")) { pushed = false; hide(); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu && menu.classList.contains("is-open")) close(); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-gnb-menu]") : null;
    if (t) { e.preventDefault(); open(); }
  });

  // 메뉴의 상담 버튼: 상담 스크립트가 없는 페이지면 불러온 뒤 같은 버튼을 다시 눌러 줌
  function load(src) { return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.body.appendChild(s); }); }
  function hasScript(name) { return !![].filter.call(document.scripts, function (s) { return (s.getAttribute("src") || "").indexOf(name) > -1; }).length; }
  if (!hasScript("inquiry.js")) {
    var loading = null;
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest('.cgm [data-pending-link][data-action="inquiry"]') : null; if (!b || hasScript("inquiry.js") && window.CHAQ_INQ_READY) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (loading) return;
      var D = R + "pages/data/";
      loading = (window.CHAQ_AUTH ? Promise.resolve() : load(D + "auth.js")).then(function () { return load(D + "inquiry.js"); })
        .then(function () { window.CHAQ_INQ_READY = true; hide(); pushed = false; b.click(); })
        .catch(function () { location.href = "tel:1533-5663"; })
        .then(function () { loading = null; });
    }, true);
  } else window.CHAQ_INQ_READY = true;

  if (location.hash === "#menu") { try { history.replaceState(history.state, "", location.href.split("#")[0]); } catch (e) {} open(); }
  window.CHAQ_GNB = { open: open, close: close };
})();
