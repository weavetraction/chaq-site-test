/* 상담 문의 → 채널톡 연결 (data/api-config.js 설정 사용)
   · '이 조건 그대로 문의하기'(차량 상세): 차량·등급·사양·조건·월 납입금·옵션·색상을 모아 API 에 문의로 저장 → 채널톡 상담창을 열고 첫 메시지로 미리 채움
   · 그 밖의 상담 버튼([data-pending-link][data-action="inquiry"]): 일반 상담으로 저장 후 채널톡 열기
   · 채널톡 키가 없으면 아무것도 하지 않음 → 기존 안내(alert) 그대로 */
(function () {
  "use strict";
  var C = window.CHAQ_API || {}, KEY = C.channelPluginKey, BASE = String(C.base || "").replace(/\/$/, "");
  if (!KEY) return;

  // 채널톡 SDK (공식 설치 코드)
  (function () { var w = window; if (w.ChannelIO) return; var ch = function () { ch.c(arguments); }; ch.q = []; ch.c = function (a) { ch.q.push(a); }; w.ChannelIO = ch;
    function l() { if (w.ChannelIOInitialized) return; w.ChannelIOInitialized = true; var s = document.createElement("script"); s.async = true; s.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"; var x = document.getElementsByTagName("script")[0]; if (x && x.parentNode) x.parentNode.insertBefore(s, x); else document.head.appendChild(s); }
    if (document.readyState === "complete") l(); else { w.addEventListener("DOMContentLoaded", l); w.addEventListener("load", l); } })();
  window.ChannelIO("boot", { pluginKey: KEY, hideChannelButtonOnBoot: !C.channelButton, language: "ko" });

  var PLAN = { "0": "초기비용 0원", b: "보증금 30%", s: "선납금 30%" };
  function txt(sel) { var e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; }
  function onChip(g) { var b = document.querySelector('.detail_conds .filter_chip[data-group="' + g + '"].on'); return b ? b.textContent.replace(/[!\s]+/g, " ").trim() : ""; }

  /** 차량 상세 화면에서 문의 내용 모으기 */
  function detailContext() {
    var q = location.search, D = window.CHAQ || {}, all = (D.stock || []).concat(D.fast || [], D.estimate || []);
    var idm = (q.match(/[?&]id=([a-z0-9]+)/i) || [])[1], tm = (q.match(/[?&]trimId=([^&]+)/) || [])[1];
    var rec = window.CHAQ_DETAIL_QUOTE || (idm ? all.filter(function (r) { return r.id === idm; })[0] : null);
    var from = (q.match(/[?&]from=(stock|fast|estimate)/) || [])[1];
    var kind = rec ? (String(rec.id)[0] === "f" ? "fast" : String(rec.id)[0] === "e" ? "estimate" : "stock") : (from || null);
    var it = onChip("init"), m = txt(".detail_monthly strong").replace(/[^\d]/g, "");
    var opts = [].map.call(document.querySelectorAll('#optPop .opt_row.on[data-grp="opt"] span'), function (s) { return s.textContent.trim(); });
    if (!opts.length && rec && rec.opts) opts = rec.opts.map(function (o) { return o.n; });
    var col = txt('#optPop .opt_row.on[data-grp="color"] span') || (rec ? [rec.ext, rec["int"]].filter(Boolean).join(" / ") : "");
    return {
      source: "DETAIL", kind: kind, recId: rec ? rec.id : null, trimId: (rec && rec.trimId) || (tm ? decodeURIComponent(tm) : null),
      carName: txt(".detail_header h1"), spec: txt(".detail_card .detail_year"), trimName: txt(".dts_name"),
      conditions: { product: onChip("type"), term: (onChip("term").match(/\d+/) || [""])[0], plan: it.indexOf("보증") > -1 ? "b" : it.indexOf("선납") > -1 ? "s" : "0", dist: (onChip("dist").match(/(\d)만/) || [, ""])[1] },
      monthly: m ? Number(m) : null, options: opts.slice(0, 40), color: col, pageUrl: location.href.slice(0, 500),
    };
  }
  function localMessage(c) {
    var k = c.conditions || {}, cond = [k.product, k.term ? k.term + "개월" : "", PLAN[k.plan] || "", k.dist ? "연 " + k.dist + "만 km" : ""].filter(Boolean).join(" · ");
    return [c.source === "DETAIL" ? "이 조건으로 상담 받고 싶어요." : "상담 받고 싶어요.", c.carName ? "차량: " + c.carName + (c.trimName ? " " + c.trimName : "") : "", c.spec ? "사양: " + c.spec : "", cond ? "조건: " + cond : "",
      c.monthly ? "월 납입금: " + c.monthly.toLocaleString("ko-KR") + "원" : "", c.options && c.options.length ? "옵션: " + c.options.join(", ") : "", c.color ? "색상: " + c.color : ""].filter(Boolean).join("\n");
  }
  function openChat(c) {
    var done = function (msg, id) {
      try { if (id) window.ChannelIO("updateUser", { profile: { lastInquiryId: id, lastCar: (c.carName + " " + (c.trimName || "")).trim() } }); } catch (e) {}
      window.ChannelIO("openChat", undefined, msg);
    };
    if (!BASE) return done(localMessage(c));
    fetch(BASE + "/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { done(j && j.message ? j.message : localMessage(c), j && j.id); })
      .catch(function () { done(localMessage(c)); });   // 서버가 안 돼도 상담은 열림
  }
  // 기존 버튼의 안내(alert)보다 먼저 받아서 채널톡으로 (캡처 단계)
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-pending-link][data-action="inquiry"]') : null; if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (b.classList.contains("detail_inquiry")) openChat(detailContext());
    else openChat({ source: "GUIDE", carName: "", spec: "", trimName: "", conditions: {}, options: [], color: "", pageUrl: location.href.slice(0, 500) });
  }, true);
  window.CHAQ_INQUIRY = { open: openChat, detailContext: detailContext };
})();
