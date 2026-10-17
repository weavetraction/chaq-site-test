/* 현금지원 페이지 (대표 261018) — 이벤트가 아닌 상시 페이지. 디자인: 02_딜리버/디자인 '현금지원' 시안(페이백 혜택 · 날짜 · 지원금 차량 카드 · Q&A · 차큐 출고지원 표 · 카톡 상담 · 유의사항)
   운영 구조
   · 차량 카드 = 견적 데이터(window.CHAQ 재고특가 stock + 빠른인도 fast) 중 `cash`(고객에게 드리는 금융사 지원금, 원 단위)가 0보다 큰 차량만, 지원금 큰 순 → 월 납입금 낮은 순
     - `cash` 는 금융사 선주문 견적을 가져올 때 페이백성 금액을 트래킹해 넣는 칸(업로드 열 추가 예정). 칸이 없거나 0이면 카드에 안 나옴 → 추정·임의 금액 없음
     - 같은 값을 재고특가·빠른인도 차량 카드·상세에도 붙일 예정이라 이 페이지는 같은 칸만 읽음
   · 상단 '최대 ○만원' = 카드 중 최대 금융사 지원금 + 차큐 출고지원 최대(아래 표) — 데이터에서 계산, 지원금 차량이 없으면 차큐 출고지원만 안내
   · 날짜 타일 = 오늘 날짜(한국시간), 'N월 재고 소진 시 종료' = 이번 달
   · 월 납입금 = 메인과 같은 기본 조건(60개월 · 초기비용 0원 · 연 1만 km), 그 조건 견적이 없으면 같은 60개월·초기 0원의 가장 짧은 거리 */
(function (root) {
  "use strict";
  var CFG = {
    // 차큐 출고지원 지급 기준(월 납입금 구간 → 지원금). 표·최대 금액 모두 여기서
    chaqRules: [
      { label: "20~40만원", amount: 500000 },
      { label: "40~60만원", amount: 600000 },
      { label: "60~90만원", amount: 800000 },
      { label: "90만원~", amount: 1000000 }
    ],
    firstShow: 6,                 // 처음에 보여줄 카드 수(넘으면 '더보기')
    channelId: "_xhxmKFX"         // 카카오톡 채널(차큐 @chaq) — 서버 연동값이 있으면 그것 우선
  };

  var doc = root.document, U = root.CHAQ_UTIL || {};
  var $ = function (s) { return doc.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var man = function (won) { var n = Math.round(Number(won) / 10000); return n.toLocaleString("ko-KR") + "만원"; };

  /* 기본 조건 월 납입금: 60개월 · 초기비용 0원 · 연 1만 km 우선 */
  function monthlyOf(r) {
    var c = r && r.cost; if (!c) return null;
    var dists = ["1", "2", "3", "4"];
    for (var i = 0; i < dists.length; i++) {
      try { var v = c[dists[i]]["60"]["0"]; if (v > 0) return { m: v, dist: dists[i] }; } catch (e) {}
    }
    return null;
  }
  function carName(r) { return (root.CHAQ_VM && root.CHAQ_VM.carName) ? root.CHAQ_VM.carName(r) : (r.brand + " " + r.model); }

  function rows() {
    var C = root.CHAQ || {}, seen = {}, out = [];
    [["stock", "재고특가"], ["fast", "빠른인도"]].forEach(function (k) {
      (C[k[0]] || []).forEach(function (r) {
        var cash = Number(r && r.cash);
        if (!r || !(cash > 0) || seen[r.id]) return;
        if (typeof r.rem === "number" && r.rem <= 0) return;   // 재고 0 = 목록에서 숨김(사이트 공통)
        var mo = monthlyOf(r); if (!mo) return;
        seen[r.id] = 1;
        out.push({ r: r, cash: cash, m: mo.m, dist: mo.dist, kind: k[0], kindLabel: k[1] });
      });
    });
    return out.sort(function (a, b) { return (b.cash - a.cash) || (a.m - b.m); });
  }

  function card(o) {
    var r = o.r, img = U.carThumb ? U.carThumb(r) : (U.PH || "../assets/icons/car-placeholder.svg");
    var href = "car-detail.html?id=" + encodeURIComponent(r.id) + (o.kind === "fast" ? "&from=fast" : "") + "&term=60&plan=0&dist=" + o.dist;
    var detail = [r.year, r.trim].filter(Boolean).join(" ");
    return '<a class="cs-card" href="' + href + '">' +
      '<span class="cs-badge">지원금 <b>' + man(o.cash) + '</b></span>' +
      '<span class="cs-img"><img src="' + esc(img) + '" alt="' + esc(carName(r)) + '" loading="lazy" decoding="async"></span>' +
      '<strong class="cs-name">' + esc(carName(r)) + '</strong>' +
      '<span class="cs-detail">' + esc(detail) + '</span>' +
      '<span class="cs-monthly">월 ' + Number(o.m).toLocaleString("ko-KR") + '<em>원</em></span>' +
      '<span class="cs-meta">60개월<i></i>초기비용 0원<i></i>연 ' + o.dist + '만km</span>' +
      '<span class="cs-stock"><span>' + o.kindLabel + ' 재고</span><b>' + (typeof r.rem === "number" ? r.rem : 1) + '대</b></span>' +
    '</a>';
  }

  function setDate() {
    var mm = "", dd = "";
    try {
      new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(function (p) { if (p.type === "month") mm = p.value; if (p.type === "day") dd = p.value; });
    } catch (e) {}
    if (!mm || !dd) { var d = new Date(); mm = ("0" + (d.getMonth() + 1)).slice(-2); dd = ("0" + d.getDate()).slice(-2); }
    var tiles = [].slice.call(doc.querySelectorAll(".cs-flip .cs-digit"));
    (mm + dd).split("").forEach(function (ch, i) { var t = tiles[i]; if (!t) return; t.querySelectorAll("b").forEach(function (b) { b.textContent = ch; }); t.classList.add("is-in"); });
    var dl = $("#csDeadline"); if (dl) dl.textContent = mm + "월 재고 소진 시 종료";
  }

  function render() {
    setDate();
    var list = rows(), chaqMax = CFG.chaqRules.reduce(function (m, x) { return Math.max(m, x.amount); }, 0);
    var finMax = list.reduce(function (m, o) { return Math.max(m, o.cash); }, 0);
    var chaqMin = CFG.chaqRules.reduce(function (m, x) { return Math.min(m, x.amount); }, Infinity);

    var t = $("#csMax"); if (t) t.textContent = man(finMax + chaqMax);
    var lead = $("#csLead");
    if (lead) lead.innerHTML = finMax > 0
      ? '재고 특가에 현금지원까지, 최대 ' + man(finMax + chaqMax) + ' 페이백<br>금융사 지원 최대 <strong>' + man(finMax) + '</strong> + 차큐 출고 지원 최대 <strong>' + man(chaqMax) + '</strong>'
      : '재고 특가에 현금지원까지,<br>차큐 출고 지원 최대 <strong>' + man(chaqMax) + '</strong>';
    var bx = $("#csBoxMax"); if (bx) bx.textContent = man(chaqMax) + " 지급";
    var rg = $("#csRange"); if (rg) rg.textContent = man(chaqMin).replace("만원", "") + "~" + man(chaqMax);
    var rb = $("#csRules"); if (rb) rb.innerHTML = CFG.chaqRules.map(function (x) { return "<tr><td>" + esc(x.label) + "</td><td>" + man(x.amount) + "</td></tr>"; }).join("");

    var box = $("#csCars"), more = $("#csMore");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="cs-empty"><strong>금융사 지원금 차량을 업데이트하고 있어요</strong><span>재고특가 차량도 차큐 출고 지원 ' + man(chaqMin).replace("만원", "") + '~' + man(chaqMax) + '을 드려요</span><a href="special-price-car__list.html">재고특가 차량 보기 ›</a></div>';
      box.classList.add("is-empty"); if (more) more.hidden = true; return;
    }
    box.innerHTML = list.map(card).join("");
    var cards = [].slice.call(box.children);
    if (more) {
      if (cards.length > CFG.firstShow) {
        cards.forEach(function (c, i) { if (i >= CFG.firstShow) c.hidden = true; });
        more.hidden = false; more.querySelector("span").textContent = "(" + (cards.length - CFG.firstShow) + ")";
        more.addEventListener("click", function () { cards.forEach(function (c) { c.hidden = false; }); more.hidden = true; });
      } else more.hidden = true;
    }
  }

  /* 카톡 버튼: 서버 연동값(카카오톡 채널) 우선, 없으면 차큐 채널 */
  function channel() {
    var st = root.CHAQ_AUTH && root.CHAQ_AUTH.state ? (root.CHAQ_AUTH.state() || {}) : {}, ch = st.kakaoChannel;
    var home = (ch && ch.home) || ("https://pf.kakao.com/" + CFG.channelId);
    return { chat: (ch && ch.chat) || (home + "/chat"), add: home + "/friend" };
  }
  function bindKakao() {
    [["#csChat", "chat"], ["#csAdd", "add"]].forEach(function (k) {
      var a = $(k[0]); if (!a) return;
      a.href = channel()[k[1]];
      a.addEventListener("click", function () { a.href = channel()[k[1]]; });   // 로그인 상태 정보가 늦게 와도 누를 때 최신 주소
    });
  }

  root.CHAQ_CASH_SUPPORT = { CFG: CFG, rows: rows, render: render };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { render(); bindKakao(); });
  else { render(); bindKakao(); }
})(typeof window !== "undefined" ? window : globalThis);
