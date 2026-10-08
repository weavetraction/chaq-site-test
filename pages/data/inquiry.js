/* 상담 문의 — 회원 로그인 수단(카카오·휴대폰)이 켜져 있으면: 로그인 → 견적 그대로 접수 → 카카오톡 알림톡으로 견적서 → 카카오톡 채널 채팅방에서 상담 (data/auth.js)
   로그인 수단이 없으면 기존 방식: 채널톡 키가 있으면 채널톡, 없으면 사이트 상담 신청 양식(이름·연락처·동의)
   · '이 조건 그대로 문의하기'(차량 상세): 차량·등급·사양·조건·월 납입금·옵션·색상을 함께 접수
   · 그 밖의 상담 버튼([data-pending-link][data-action="inquiry"]): 일반 상담 (버튼 제목을 상담 주제로)
   · 접수한 상담은 이 기기의 '마이페이지 > 상담 신청 내역'에 남음 (localStorage) */
(function () {
  "use strict";
  var C = window.CHAQ_API || {}, KEY = C.channelPluginKey, BASE = String(C.base || "").replace(/\/$/, "");
  var TEL = "1533-5663";
  var LS_INQ = "chaq_inquiries_v1";
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "[]") || []; } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // 채널톡 SDK (공식 설치 코드) — 키가 있을 때만
  if (KEY && !window.CHAQ_AUTH) (function () { var w = window; if (w.ChannelIO) return; var ch = function () { ch.c(arguments); }; ch.q = []; ch.c = function (a) { ch.q.push(a); }; w.ChannelIO = ch;
    function l() { if (w.ChannelIOInitialized) return; w.ChannelIOInitialized = true; var s = document.createElement("script"); s.async = true; s.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"; var x = document.getElementsByTagName("script")[0]; if (x && x.parentNode) x.parentNode.insertBefore(s, x); else document.head.appendChild(s); }
    if (document.readyState === "complete") l(); else { w.addEventListener("DOMContentLoaded", l); w.addEventListener("load", l); } })();
  if (KEY && !window.CHAQ_AUTH) window.ChannelIO("boot", { pluginKey: KEY, hideChannelButtonOnBoot: !C.channelButton, language: "ko" });   // auth.js 가 있으면 auth.js 가 회원으로 부팅

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
      snapshot: snapshot(rec, kind),
    };
  }
  /** 견적서 보기·알림톡에 쓸 화면 그대로의 값 */
  function snapshot(rec, kind) {
    var img = document.querySelector(".detail_car_visual img"), src = img ? img.getAttribute("src") || "" : "";
    var it = onChip("init").replace(/\s+/g, ""), plan = it.indexOf("보증") > -1 ? "보증금 " + (it.match(/\d+%/) || ["30%"])[0] : it.indexOf("선납") > -1 ? "선납금 " + (it.match(/\d+%/) || ["30%"])[0] : "초기비용 0원";
    var opts = [].map.call(document.querySelectorAll('#optPop .opt_row.on[data-grp="opt"]'), function (r) { var n = r.querySelector("span"), e = r.querySelector("em"), pv = e ? Number(e.textContent.replace(/[^\d]/g, "")) : 0; return { n: n ? n.textContent.trim() : "", p: pv || null }; }).filter(function (o) { return o.n; });
    if (!opts.length && rec && rec.opts) opts = rec.opts.filter(function (o) { return o && o.n && !/^무옵션$/.test(String(o.n).trim()); }).map(function (o) { return { n: String(o.n).slice(0, 120), p: o.p ? Number(o.p) : null }; });
    var price = txt("#pTotal").replace(/[^\d]/g, ""), ext = txt('#optPop .opt_row.on[data-grp="color"] span') || (rec && rec.ext) || "";
    var o = { product: onChip("type") || "장기렌트", term: onChip("term"), plan: plan, dist: onChip("dist") ? "연 " + onChip("dist") : "", vehiclePrice: price ? Number(price) : null,
      options: opts.slice(0, 40), ext: String(ext).slice(0, 80), int: String((rec && rec["int"]) || "").slice(0, 80), delivery: kind === "stock" ? "재고 차량 · 바로 출고" : kind === "fast" ? "빠른 인도" : "" };
    if (/^(\.\.\/)?assets\/|^https:\/\//.test(src) && src.length <= 300) o.image = src;
    return o;
  }
  function localMessage(c) {
    var k = c.conditions || {}, cond = [k.product, k.term ? k.term + "개월" : "", PLAN[k.plan] || "", k.dist ? "연 " + k.dist + "만 km" : ""].filter(Boolean).join(" · ");
    return [c.source === "DETAIL" ? "이 조건으로 상담 받고 싶어요." : "상담 받고 싶어요.", c.carName ? "차량: " + c.carName + (c.trimName ? " " + c.trimName : "") : "", c.spec ? "사양: " + c.spec : "", cond ? "조건: " + cond : "",
      c.monthly ? "월 납입금: " + c.monthly.toLocaleString("ko-KR") + "원" : "", c.options && c.options.length ? "옵션: " + c.options.join(", ") : "", c.color ? "색상: " + c.color : ""].filter(Boolean).join("\n");
  }
  function openChat(c) {
    var T = window.CHAQ_TRACK, a = T ? T.attribution() : {}, k;   // 유입 경로(UTM·광고 클릭 ID)·GA/메타 식별값 → 서버 전환·매체별 성과
    for (k in a) if (a[k] != null) c[k] = a[k];
    var AU = window.CHAQ_AUTH;
    if (AU && BASE) return AU.me().then(function () {
      if (!AU.required) return legacy(c);
      return AU.require({ reason: "inquiry", pending: { action: "inquiry", data: pendingData(c) } }).then(function (m) { if (m) submitMember(c); else legacy(c); }).catch(function () {});
    });
    legacy(c);
  }
  function legacy(c) {
    if (!KEY) return openForm(c);
    var T = window.CHAQ_TRACK;
    var done = function (msg, id) {
      try { if (T) T.lead(id, c); } catch (e) {}
      try { if (id) window.ChannelIO("updateUser", { profile: { lastInquiryId: id, lastCar: (c.carName + " " + (c.trimName || "")).trim() } }); } catch (e) {}
      window.ChannelIO("openChat", undefined, msg);
    };
    if (!BASE) return done(localMessage(c));
    fetch(BASE + "/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { done(j && j.message ? j.message : localMessage(c), j && j.id); })
      .catch(function () { done(localMessage(c)); });   // 서버가 안 돼도 상담은 열림
  }
  // ---------------------------------------------------------------- 회원 문의: 견적 그대로 접수 → 카카오톡(알림톡) 견적서 → 카카오 상담
  function pendingData(c) {
    if (c.source !== "DETAIL") return { source: c.source, topic: c.topic || "", car: c.carName || "" };
    return { source: "DETAIL", chips: [].map.call(document.querySelectorAll(".cond_wrap .filter_chip"), function (b, i) { return b.classList.contains("on") ? i : -1; }).filter(function (i) { return i > -1; }) };
  }
  function guideContext(topic, car) { return { source: "GUIDE", topic: topic || "", carName: car || "", spec: "", trimName: "", conditions: {}, options: [], color: "", pageUrl: location.href.slice(0, 500) }; }
  var sending = false;
  function submitMember(c) {
    if (sending) return; sending = true;
    var AU = window.CHAQ_AUTH, T = window.CHAQ_TRACK, body = {}, k;
    for (k in c) if (c[k] != null && k !== "topic") body[k] = c[k];
    if (c.topic) body.message = "[" + c.topic + "]";
    var U = window.CHAQ_UTIL; if (U && U.toast) U.toast(c.source === "DETAIL" ? "견적을 카카오톡으로 보내는 중이에요…" : "상담을 접수하는 중이에요…");
    AU.api("/api/inquiries", { method: "POST", json: body }).then(function (j) {
      sending = false;
      try { if (T) T.lead(j.id, c); } catch (x) {}
      var list = lsGet(LS_INQ); list.unshift({ id: j.id, at: new Date().toISOString(), car: (c.carName + " " + (c.trimName || "")).trim(), cond: condLine(c), topic: c.topic || "", recId: c.recId || null, report: j.report || null }); lsSet(LS_INQ, list.slice(0, 20));
      showDone(c, j);
    }).catch(function (e) {
      sending = false;
      if (e.status === 401) return AU.me(true).then(function () { return AU.require({ reason: "inquiry" }); }).then(function (m) { if (m) submitMember(c); }).catch(function () {});
      showError(e.message);
    });
  }
  function reportHref(t) { return (/\/pages\//.test(location.pathname) ? "" : "pages/") + "quote-report.html?t=" + encodeURIComponent(t); }
  function sheet(html) {
    close();
    if (!document.getElementById("iqfCss")) { var st = document.createElement("style"); st.id = "iqfCss"; st.textContent = CSS; document.head.appendChild(st); }
    var bg = document.createElement("div"); bg.className = "iqf_bg"; opened = bg;
    bg.innerHTML = '<div class="iqf" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg); document.body.style.overflow = "hidden"; document.addEventListener("keydown", onKey);
    bg.addEventListener("click", function (e) { if (e.target === bg || (e.target.closest && e.target.closest("[data-close]"))) close(); });
    return bg;
  }
  function showDone(c, j) {
    var st = window.CHAQ_AUTH.state() || {}, ch = st.kakaoChannel, m = st.member || {}, sent = j.kakao && j.kakao.sent;
    var car = c.carName ? '<div class="iqf_car"><b>' + esc((c.carName + " " + (c.trimName || "")).trim()) + '</b>' + esc([c.spec, condLine(c)].filter(Boolean).join(" · ")) + '</div>' : "";
    // 알림톡이 실제로 발송됐을 때만 '발송됐어요' (알림톡 연동 전·미인증 번호는 접수 안내)
    sheet('<div class="iqf_done"><i>✓</i><h3>' + (sent ? "카톡으로 견적서가 발송됐어요 :)" : c.source === "DETAIL" ? "견적 상담이 접수됐어요" : "상담 신청이 접수됐어요") + '</h3>' +
      '<p>' + (sent ? "카카오톡 <b>차큐</b> 채널에서<br>견적서를 확인해 주세요." : j.report ? "아래 '견적서 보기'에서<br>접수한 견적을 확인할 수 있어요." : "") + '</p>' +
      (j.id ? '<p style="font-size:12.5px;color:#80868b">접수번호 #' + j.id + '</p>' : '') + '</div>' + car +
      '<div class="iqf_btns" style="flex-direction:column">' +
      (ch ? '<a class="iqf_send iqf_kakao" href="' + esc(ch.chat) + '" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;background:#FEE500;color:rgba(0,0,0,.85);border-radius:12px;padding:14px;font-weight:700">카카오톡에서 상담 이어가기</a>' : '') +
      (j.report ? '<a class="iqf_close" href="' + reportHref(j.report) + '" style="display:block;flex:none;text-align:center;text-decoration:none;border-radius:12px;padding:14px;font-weight:700">견적서 보기</a>' : '') +
      '<button type="button" class="iqf_close" data-close style="flex:none">확인</button></div>');
  }
  function showError(msg) {
    sheet('<h3>접수하지 못했어요</h3><p class="iqf_sub">' + esc(msg || "잠시 후 다시 시도해 주세요.") + '</p><p class="iqf_sub">급하신 문의는 <a href="tel:' + TEL.replace(/-/g, "") + '">' + TEL + '</a>로 전화 주세요.</p><div class="iqf_btns"><button type="button" class="iqf_send" data-close>확인</button></div>');
  }
  // 카카오 로그인으로 페이지를 다녀온 뒤: 고르던 조건 그대로 돌려놓고 이어서 접수
  document.addEventListener("chaq:login", function (e) {
    var p = e.detail && e.detail.pending; if (!p || p.action !== "inquiry" || !p.data) return;
    setTimeout(function () {
      var d = p.data, AU = window.CHAQ_AUTH;
      if (d.source === "DETAIL") {
        var chips = document.querySelectorAll(".cond_wrap .filter_chip");
        AU.withoutLimit(function () { (d.chips || []).forEach(function (i) { var b = chips[i]; if (b && !b.classList.contains("on")) b.click(); }); });
        setTimeout(function () { submitMember(detailContext()); }, 250);
      } else submitMember(guideContext(d.topic, d.car));
    }, 300);
  });
  // 기존 버튼의 안내(alert)보다 먼저 받아서 채널톡으로 (캡처 단계)
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-pending-link][data-action="inquiry"]') : null; if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (b.classList.contains("detail_inquiry")) openChat(detailContext());
    else { var tp = b.getAttribute("data-topic") || (b.querySelector("strong") ? b.querySelector("strong").textContent.trim() : ""); openChat(guideContext(tp, b.getAttribute("data-car") || "")); }
  }, true);

  // ---------------------------------------------------------------- 사이트 상담 신청 양식 (채널톡 키가 없을 때)
  var CSS = ".iqf_bg{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(17,20,24,.55)}" +
    ".iqf{width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;background:#fff;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:inherit;color:#202124}" +
    "@media(min-width:600px){.iqf_bg{align-items:center}.iqf{border-radius:20px}}" +
    ".iqf h3{margin:0 0 4px;font-size:20px;font-weight:800}.iqf .iqf_sub{margin:0 0 16px;color:#5f6368;font-size:13.5px;line-height:1.5}" +
    ".iqf .iqf_car{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#f4f6f5;font-size:13.5px;line-height:1.5}.iqf .iqf_car b{display:block;font-size:15px}" +
    ".iqf label.f{display:block;margin:0 0 12px;font-size:13px;font-weight:700;color:#3c4043}.iqf label.f em{color:#e5484d;font-style:normal}" +
    ".iqf input[type=text],.iqf input[type=tel],.iqf select,.iqf textarea{display:block;width:100%;margin-top:6px;padding:12px 13px;border:1px solid #dadce0;border-radius:10px;font:inherit;font-size:15px;font-weight:400;box-sizing:border-box;background:#fff;color:#202124}" +
    ".iqf textarea{min-height:76px;resize:vertical}.iqf input:focus,.iqf select:focus,.iqf textarea:focus{outline:none;border-color:#18a85c}" +
    ".iqf .iqf_agree{display:flex;gap:8px;align-items:flex-start;margin:4px 0 6px;font-size:13.5px;line-height:1.45}.iqf .iqf_agree input{width:18px;height:18px;margin:1px 0 0;accent-color:#18a85c;flex:none}" +
    ".iqf details{margin:0 0 14px;font-size:12px;color:#5f6368;line-height:1.55}.iqf details summary{cursor:pointer;color:#5f6368;text-decoration:underline}.iqf details dl{margin:6px 0 0;padding:10px 12px;border-radius:10px;background:#f8f9fa}.iqf details dt{font-weight:700;color:#3c4043}.iqf details dd{margin:0 0 6px}" +
    ".iqf .iqf_err{min-height:18px;margin:0 0 8px;color:#e5484d;font-size:13px}" +
    ".iqf .iqf_btns{display:flex;gap:8px}.iqf button{font:inherit;cursor:pointer;border-radius:12px;padding:14px;font-size:15.5px;font-weight:700;border:0}" +
    ".iqf .iqf_close{flex:0 0 96px;background:#f1f3f4;color:#3c4043}.iqf .iqf_send{flex:1;background:#18a85c;color:#fff}.iqf .iqf_send:disabled{opacity:.6;cursor:default}" +
    ".iqf .iqf_done{text-align:center;padding:10px 0 4px}.iqf .iqf_done i{display:inline-flex;width:56px;height:56px;margin-bottom:12px;border-radius:50%;background:#e8f7ef;color:#18a85c;align-items:center;justify-content:center;font-style:normal;font-size:28px;font-weight:800}" +
    ".iqf .iqf_done p{margin:0 0 6px;color:#5f6368;font-size:14px;line-height:1.55}.iqf .iqf_done a{color:#18a85c;font-weight:700}.iqf .iqf_hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function fmtPhone(v) { var d = String(v || "").replace(/\D/g, "").slice(0, 11); if (d.length < 4) return d; if (d.indexOf("02") === 0) return d.length <= 5 ? d.slice(0, 2) + "-" + d.slice(2) : d.length <= 9 ? d.slice(0, 2) + "-" + d.slice(2, d.length - 4) + "-" + d.slice(-4) : d.slice(0, 2) + "-" + d.slice(2, 6) + "-" + d.slice(6, 10); if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3); return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4); }
  function condLine(c) { var k = c.conditions || {}; return [k.product, k.term ? k.term + "개월" : "", PLAN[k.plan] || "", k.dist ? "연 " + k.dist + "만 km" : "", c.monthly ? "월 " + Number(c.monthly).toLocaleString("ko-KR") + "원" : ""].filter(Boolean).join(" · "); }
  var opened = null;
  function close() { if (!opened) return; opened.remove(); opened = null; document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  function openForm(c) {
    close();
    if (!document.getElementById("iqfCss")) { var st = document.createElement("style"); st.id = "iqfCss"; st.textContent = CSS; document.head.appendChild(st); }
    var bg = document.createElement("div"); bg.className = "iqf_bg"; opened = bg;
    var car = c.carName ? '<div class="iqf_car"><b>' + esc((c.carName + " " + (c.trimName || "")).trim()) + '</b>' + esc([c.spec, condLine(c)].filter(Boolean).join(" · ")) + '</div>' : "";
    bg.innerHTML = '<form class="iqf" role="dialog" aria-modal="true" aria-labelledby="iqfTitle" novalidate>' +
      '<h3 id="iqfTitle">상담 신청</h3><p class="iqf_sub">' + (c.topic ? esc(c.topic) + " — " : "") + '남겨주신 연락처로 담당 매니저가 연락드려요.</p>' + car +
      '<label class="f">연락처 <em>*</em><input type="tel" name="phone" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000" maxlength="13" required></label>' +
      '<label class="f">이름<input type="text" name="name" autocomplete="name" maxlength="30" placeholder="홍길동 (선택)"></label>' +
      '<label class="f">연락 받기 편한 시간<select name="contactTime"><option value="언제든 괜찮아요">언제든 괜찮아요</option><option value="오전 (9~12시)">오전 (9~12시)</option><option value="오후 (12~18시)">오후 (12~18시)</option><option value="저녁 (18시 이후)">저녁 (18시 이후)</option></select></label>' +
      '<label class="f">문의 내용<textarea name="message" maxlength="1000" placeholder="' + (c.carName ? "궁금한 점이나 원하는 조건을 적어주세요 (선택)" : "관심 차량, 예산, 궁금한 점을 적어주세요 (선택)") + '"></textarea></label>' +
      '<div class="iqf_hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<label class="iqf_agree"><input type="checkbox" name="agree"><span><b>[필수]</b> 개인정보 수집·이용에 동의합니다</span></label>' +
      '<details><summary>내용 보기</summary><dl><dt>수집 항목</dt><dd>연락처(휴대전화번호), 이름(선택), 연락 희망 시간, 문의 내용, 상담 차량·조건</dd><dt>이용 목적</dt><dd>장기렌트·리스 상담 및 견적 안내</dd><dt>보유 기간</dt><dd>상담 종료 후 1년 (관계 법령에 따라 보관이 필요한 경우 그 기간), 삭제 요청 시 지체 없이 파기</dd><dt>동의 거부</dt><dd>동의하지 않을 수 있으며, 이 경우 온라인 상담 신청이 어렵습니다. (전화 ' + TEL + ')</dd></dl></details>' +
      '<p class="iqf_err" role="alert"></p>' +
      '<div class="iqf_btns"><button type="button" class="iqf_close">닫기</button><button type="submit" class="iqf_send">상담 신청하기</button></div></form>';
    document.body.appendChild(bg); document.body.style.overflow = "hidden"; document.addEventListener("keydown", onKey);
    var f = bg.querySelector("form"), err = f.querySelector(".iqf_err"), ph = f.phone, btn = f.querySelector(".iqf_send");
    bg.addEventListener("click", function (e) { if (e.target === bg) close(); });
    f.querySelector(".iqf_close").addEventListener("click", close);
    ph.addEventListener("input", function () { var p = ph.selectionStart, before = ph.value.length; ph.value = fmtPhone(ph.value); try { ph.setSelectionRange(p + (ph.value.length - before), p + (ph.value.length - before)); } catch (e) {} });
    setTimeout(function () { try { ph.focus(); } catch (e) {} }, 50);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = "";
      var digits = ph.value.replace(/\D/g, "");
      if (!/^0\d{8,10}$/.test(digits)) { err.textContent = "연락처를 정확히 입력해 주세요 (예: 010-1234-5678)"; ph.focus(); return; }
      if (!f.agree.checked) { err.textContent = "개인정보 수집·이용에 동의해 주세요"; return; }
      var body = {}; for (var k in c) if (c[k] != null && k !== "topic") body[k] = c[k];
      body.source = c.source === "DETAIL" ? "DETAIL" : "FORM";
      body.phone = digits; body.name = f.name.value.trim(); body.contactTime = f.contactTime.value; body.privacyAgreed = true; body.website = f.website.value;
      body.message = [c.topic ? "[" + c.topic + "]" : "", f.message.value.trim()].filter(Boolean).join(" ");
      if (!BASE) { err.innerHTML = "지금은 온라인 접수가 어려워요. <a href=\"tel:" + TEL.replace(/-/g, "") + "\">" + TEL + "</a>로 전화 주세요."; return; }
      btn.disabled = true; btn.textContent = "접수 중…";
      fetch(BASE + "/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j && j.error || "접수 실패"); return j; }); })
        .then(function (j) {
          try { if (window.CHAQ_TRACK) window.CHAQ_TRACK.lead(j.id, c); } catch (x) {}
          var list = lsGet(LS_INQ); list.unshift({ id: j.id, at: new Date().toISOString(), car: (c.carName + " " + (c.trimName || "")).trim(), cond: condLine(c), topic: c.topic || "", recId: c.recId || null }); lsSet(LS_INQ, list.slice(0, 20));
          f.innerHTML = '<div class="iqf_done"><i>✓</i><h3>상담 신청이 접수됐어요</h3><p>' + (j.id ? "접수번호 #" + j.id + "<br>" : "") + '담당 매니저가 확인 후 남겨주신 번호로 연락드릴게요.</p><p>급하신 문의는 <a href="tel:' + TEL.replace(/-/g, "") + '">' + TEL + '</a></p></div><div class="iqf_btns"><button type="button" class="iqf_send">확인</button></div>';
          f.querySelector(".iqf_send").addEventListener("click", close);
        })
        .catch(function (x) { btn.disabled = false; btn.textContent = "상담 신청하기"; err.innerHTML = esc(x && x.message && !/fetch|network/i.test(x.message) ? x.message : "접수 중 문제가 생겼어요.") + ' 잠시 후 다시 시도하거나 <a href="tel:' + TEL.replace(/-/g, "") + '">' + TEL + '</a>로 전화 주세요.'; });
    });
  }
  window.CHAQ_INQUIRY = { open: openChat, detailContext: detailContext, history: function () { return lsGet(LS_INQ); } };
})();
