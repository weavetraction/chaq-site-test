/* 차큐 분석·광고 추적 (GTM 컨테이너 1개로 GA4·Google Ads·Meta·네이버·카카오 태그를 관리)
   설정: data/api-config.js 의 gtmId (예: "GTM-XXXXXXX") — 비어 있으면 GTM 은 안 불러오고 유입 기록·dataLayer 만 동작
   1) 유입 기록: utm_*, gclid·gbraid·wbraid(구글), fbclid(메타), n_media·n_query·n_ad·n_keyword(네이버 검색광고), kclid(카카오), 외부 검색·SNS 유입
      → 처음 유입(first touch, 90일)·마지막 유입(last touch)을 저장해 두고 상담 문의에 함께 보냄 (관리자·CSV 에서 매체별 문의·계약 확인)
   2) 이벤트(dataLayer): view_item_list · select_item · view_item · select_vehicle_filter · change_condition · select_trim · view_options · view_same_stock
      · begin_inquiry · generate_lead(문의번호 = lead_id, 서버 전환과 중복 제거용 event_id)  — 설계표: docs/analytics-events.md */
(function (w, d) {
  "use strict";
  var C = w.CHAQ_API || {};
  w.dataLayer = w.dataLayer || [];
  function push(o) { try { w.dataLayer.push(o); } catch (e) {} }

  // ---------------------------------------------------------------- GTM
  if (C.gtmId && !w.google_tag_manager) {
    push({ "gtm.start": Date.now(), event: "gtm.js" });
    var s = d.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(C.gtmId);
    var f = d.getElementsByTagName("script")[0]; if (f && f.parentNode) f.parentNode.insertBefore(s, f); else d.head.appendChild(s);
  }

  // ---------------------------------------------------------------- 유입 기록
  var KEY_F = "chaq_ft", KEY_L = "chaq_lt", DAYS = 90;
  var store = {
    get: function (k) { try { var v = JSON.parse(w.localStorage.getItem(k) || "null"); return v && v.exp > Date.now() ? v.t : null; } catch (e) { return null; } },
    set: function (k, t) { try { w.localStorage.setItem(k, JSON.stringify({ t: t, exp: Date.now() + DAYS * 864e5 })); } catch (e) {} },
  };
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "n_media", "n_query", "n_ad", "n_keyword", "kclid"];
  var SEARCH = { "naver.com": "naver", "google.": "google", "daum.net": "daum", "bing.com": "bing", "zum.com": "zum", "search.yahoo": "yahoo" };
  var SOCIAL = { "instagram.com": "instagram", "facebook.com": "facebook", "kakao.com": "kakao", "youtube.com": "youtube", "blog.naver.com": "naver_blog", "cafe.naver.com": "naver_cafe", "threads.net": "threads", "t.co": "x" };
  function currentTouch() {
    var q = {}; try { new URLSearchParams(w.location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    var has = PARAMS.some(function (p) { return q[p]; });
    var t = { landing: (w.location.pathname + w.location.search).slice(0, 500), referrer: (d.referrer || "").slice(0, 500), at: new Date().toISOString() };
    if (has) {
      t.source = q.utm_source || (q.gclid || q.gbraid || q.wbraid ? "google" : q.fbclid ? "meta" : (q.n_media || q.n_ad) ? "naver" : q.kclid ? "kakao" : "");
      t.medium = q.utm_medium || (q.gclid || q.gbraid || q.wbraid || q.n_ad || q.kclid ? "cpc" : q.fbclid ? "paid_social" : "");
      t.campaign = q.utm_campaign || ""; t.term = q.utm_term || q.n_keyword || q.n_query || ""; t.content = q.utm_content || "";
      PARAMS.slice(5).forEach(function (p) { if (q[p]) t[p] = String(q[p]).slice(0, 300); });
      return t;
    }
    var ref = ""; try { ref = d.referrer ? new URL(d.referrer).hostname : ""; } catch (e) {}
    if (!ref || ref === w.location.hostname) return null;                       // 직접 방문·사이트 안 이동은 기록 안 함
    var host = ref.replace(/^www\./, ""), k;
    for (k in SOCIAL) if (host.indexOf(k) > -1) { t.source = SOCIAL[k]; t.medium = "social"; return t; }
    for (k in SEARCH) if (host.indexOf(k) > -1) { t.source = SEARCH[k]; t.medium = "organic"; return t; }
    t.source = host; t.medium = "referral"; return t;
  }
  var touch = currentTouch();
  if (touch) { if (!store.get(KEY_F)) store.set(KEY_F, touch); store.set(KEY_L, touch); }

  function cookie(n) { var m = d.cookie.match(new RegExp("(?:^|; )" + n.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&") + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }
  function gaClientId() { var c = cookie("_ga"); if (!c) return null; var p = c.split("."); return p.length >= 4 ? p.slice(-2).join(".") : null; }   // GA1.1.123.456 → 123.456
  function fbc() { var c = cookie("_fbc"); if (c) return c; var lt = store.get(KEY_L); return lt && lt.fbclid ? "fb.1." + Date.parse(lt.at || new Date()) + "." + lt.fbclid : null; }

  // ---------------------------------------------------------------- 이벤트
  function event(name, params) { var o = { event: name }; for (var k in params || {}) o[k] = params[k]; push(o); }
  var KIND_KO = { stock: "재고특가", fast: "빠른인도", estimate: "견적조회" };
  function listName() { var m = w.location.search.match(/[?&]from=(fast|estimate)/); return /special-price-car__list/.test(w.location.pathname) ? (m ? KIND_KO[m[1]] : "재고특가") : /car-select/.test(w.location.pathname) ? "차량선택" : /index|\/$/.test(w.location.pathname) ? "메인" : ""; }
  function num(s) { var n = String(s || "").replace(/[^\d]/g, ""); return n ? Number(n) : null; }

  // 상세: view_item (차량 데이터·견적이 화면에 반영된 뒤)
  function detailItem() {
    var q = w.location.search, idm = (q.match(/[?&]id=([a-z0-9]+)/i) || [])[1], tm = (q.match(/[?&]trimId=([^&]+)/) || [])[1];
    var from = (q.match(/[?&]from=(stock|fast|estimate)/) || [])[1] || (idm ? (idm[0] === "f" ? "fast" : idm[0] === "e" ? "estimate" : "stock") : "");
    var name = (d.querySelector(".detail_header h1") || {}).textContent || "", trim = ((d.querySelector(".dts_name") || {}).textContent || "").trim();
    var m = num((d.querySelector(".detail_monthly strong") || {}).textContent);
    return { item_id: idm || (tm ? decodeURIComponent(tm) : ""), item_name: name.trim(), item_variant: trim, item_category: KIND_KO[from] || "", price: m || 0, currency: "KRW" };
  }
  function onReady() {
    if (/car-detail/.test(w.location.pathname)) { var it = detailItem(); event("view_item", { currency: "KRW", value: it.price, items: [it] }); }
    else if (listName()) event("view_item_list", { item_list_name: listName() });
  }
  if (d.readyState === "complete") setTimeout(onReady, 0); else w.addEventListener("load", function () { setTimeout(onReady, 0); });

  var lastFilter = "";   // 차량 선택 팝업을 연 필터(brand·model·trim)
  d.addEventListener("click", function (e) {
    var t = e.target, el;
    if (!t || !t.closest) return;
    if ((el = t.closest(".filter_select[data-filter]"))) lastFilter = el.getAttribute("data-filter") || "";
    if ((el = t.closest(".stock-card, #estCard, .dp_card, .est_card"))) {
      var nm = ((el.querySelector("small, .est_name, .dp_cname") || {}).textContent || "").trim();
      var href = el.getAttribute("href") || "", id = (href.match(/[?&]id=([a-z0-9]+)/i) || href.match(/[?&]trimId=([^&]+)/) || [])[1] || "";
      event("select_item", { item_list_name: el.classList.contains("dp_card") ? "같은 조건 다른 차량" : listName(), items: [{ item_id: decodeURIComponent(id), item_name: nm, price: num((el.querySelector("strong, .est_monthly b, .dp_cprice") || {}).textContent) || 0 }] });
    } else if ((el = t.closest("#fpopBody .fpop_row"))) {
      event("select_vehicle_filter", { filter_type: lastFilter, filter_value: el.getAttribute("data-label") || "" });
    } else if ((el = t.closest(".detail_conds .filter_chip"))) {
      event("change_condition", { condition_group: el.getAttribute("data-group") || "", condition_value: el.textContent.replace(/[!\s]+/g, " ").trim() });
    } else if ((el = t.closest(".dts_opt"))) {
      event("select_trim", { trim_name: ((el.querySelector("span") || {}).textContent || "").replace("현재", "").trim() });
    } else if ((el = t.closest("#optionToggle"))) {
      event("view_options", { item_name: detailItem().item_name });
    } else if ((el = t.closest(".detail_samestock"))) {
      event("view_same_stock", { item_name: detailItem().item_name });
    } else if ((el = t.closest('[data-pending-link][data-action="inquiry"]'))) {
      event("begin_inquiry", { inquiry_type: el.classList.contains("detail_inquiry") ? "detail" : "guide", item_name: el.classList.contains("detail_inquiry") ? detailItem().item_name : "" });
    }
  }, true);

  w.CHAQ_TRACK = {
    event: event,
    attribution: function () { return { firstTouch: store.get(KEY_F) || undefined, lastTouch: store.get(KEY_L) || undefined, gaClientId: gaClientId(), fbp: cookie("_fbp"), fbc: fbc() }; },
    /** 문의 접수 완료 — GTM 에서 GA4 generate_lead · 광고 전환 태그 트리거 (lead_event_id 로 Meta 서버 전환과 중복 제거) */
    lead: function (id, ctx) { ctx = ctx || {}; event("generate_lead", { lead_id: id ? String(id) : "", lead_event_id: id ? "chaq-lead-" + id : "", currency: "KRW", value: 0, inquiry_type: ctx.source === "DETAIL" ? "detail" : "guide", item_name: ctx.carName || "", item_variant: ctx.trimName || "", monthly: ctx.monthly || 0 }); },
  };
})(window, document);
