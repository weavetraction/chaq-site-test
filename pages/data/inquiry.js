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
    var isDisc = (window.CHAQ_UTIL || {}).isDisc || function () { return false; };   // 할인 항목(음수 금액)은 옵션 이름에서 제외 — 스냅샷에 금액과 함께 따로
    if (!opts.length && rec && rec.opts) opts = rec.opts.filter(function (o) { return !isDisc(o); }).map(function (o) { return o.n; });
    var col = txt('#optPop .opt_row.on[data-grp="color"] span') || (rec ? [rec.ext, rec["int"]].filter(Boolean).join(" / ") : "");
    return {
      source: "DETAIL", kind: kind, recId: rec ? rec.id : null, trimId: (rec && rec.trimId) || (tm ? decodeURIComponent(tm) : null),
      carName: txt(".detail_header h1"), spec: txt(".detail_card .detail_year"), trimName: txt(".dts_name"),
      conditions: { product: onChip("type"), term: (onChip("term").match(/\d+/) || [""])[0], plan: it.indexOf("보증") > -1 ? "b" : it.indexOf("선납") > -1 ? "s" : "0", dist: window.CHAQ_DETAIL_DIST_UP || (onChip("dist").match(/(\d)만/) || [, ""])[1] },   // 3호 ③: 거리 상한으로 긴 거리 상품이면 약정거리 = 긴 거리
      monthly: m ? Number(m) : null, options: opts.slice(0, 40), color: col, pageUrl: location.href.slice(0, 500),
      snapshot: snapshot(rec, kind),
    };
  }
  /** 견적서 보기·알림톡에 쓸 화면 그대로의 값 */
  function snapshot(rec, kind) {
    var img = document.querySelector(".detail_car_visual img"), src = img ? img.getAttribute("src") || "" : "";
    var it = onChip("init").replace(/\s+/g, ""), plan = it.indexOf("보증") > -1 ? "보증금 " + (it.match(/\d+%/) || ["30%"])[0] : it.indexOf("선납") > -1 ? "선납금 " + (it.match(/\d+%/) || ["30%"])[0] : "초기비용 0원";
    // 옵션: 팝업에서 고른 행(마스터 옵션ID data-opt-id 포함, RL-19 #36) → 없으면 견적 행의 옵션(마스터 참조 표시명·ID)
    var opts = [].map.call(document.querySelectorAll('#optPop .opt_row.on[data-grp="opt"]'), function (r) { var n = r.querySelector("span"), e = r.querySelector("em"), pv = e ? Number(e.textContent.replace(/[^\d]/g, "")) : 0, id = r.getAttribute("data-opt-id") || null; var o = { n: n ? n.textContent.trim() : "", p: pv || null }; if (id) o.id = id; return o; }).filter(function (o) { return o.n; });
    var U = window.CHAQ_UTIL || {}, isDisc = U.isDisc || function () { return false; };
    if (!opts.length && rec && rec.opts) {
      var OP = window.CHAQ_OPT_PRICES ? window.CHAQ_OPT_PRICES(rec) : null;
      opts = OP ? OP.items.filter(function (it) { return !it.none; }).map(function (it) { var o = { n: String(it.n).slice(0, 120), p: it.price ? Number(it.price) : null }; if (it.id) o.id = it.id; return o; })
        : rec.opts.filter(function (o) { return o && o.n && !/^무옵션$/.test(String(o.n).trim()) && !isDisc(o); }).map(function (o) { var x = { n: String(o.n).slice(0, 120), p: o.p ? Number(o.p) : null }; if (o.id) x.id = o.id; return x; });
    }
    // 세제혜택·할인(2호 ①): 화면에 보이는 줄만 정규화된 이름으로 옵션 뒤에 → 견적서 '세제혜택'·'할인' 줄 (세제혜택은 토큰 없으면 차량 데이터 값)
    var TAX = Number(window.CHAQ_DETAIL_TAX) || 0, PD = Number(window.CHAQ_DETAIL_PDISC) || 0, MD = window.CHAQ_DETAIL_MDISC === true;
    if (TAX > 0) opts.push({ n: "세제혜택", p: -Math.round(TAX) });
    if (kind === "stock" || kind === "fast") { if (PD > 0) opts.push({ n: "차량가 할인", p: -Math.round(PD) }); if (kind === "stock" && MD) opts.push({ n: "월납입료 할인", p: null }); }
    var bp = window.CHAQ_DETAIL_BASE, basePrice = typeof bp === "number" && bp > 0 && window.CHAQ_DETAIL_DECOMPOSED !== false ? Math.round(bp) : null;   // 분해 표시 아닌 재고(미매칭)는 기본가 없이 총차량가만 (#37)
    var price = txt("#pTotal").replace(/[^\d]/g, ""), ext = txt('#optPop .opt_row.on[data-grp="color"] span') || (rec && rec.ext) || "";
    var o = { product: onChip("type") || "장기렌트", term: onChip("term"), plan: plan, dist: onChip("dist") ? "연 " + onChip("dist") : "", vehiclePrice: price ? Number(price) : null, basePrice: basePrice, estimated: window.CHAQ_DETAIL_ESTIMATED === true, estKind: window.CHAQ_DETAIL_ESTIMATED === true ? (window.CHAQ_DETAIL_EST_KIND || 'coef') : undefined, optionExtra: window.CHAQ_DETAIL_ESTIMATED === true ? Math.round(Number(window.CHAQ_DETAIL_OPT_EXTRA) || 0) : undefined,
      options: opts.slice(0, 40), ext: String(ext).slice(0, 80), int: String((rec && rec["int"]) || "").slice(0, 80), delivery: kind === "stock" ? "재고 차량 · 바로 출고" : kind === "fast" ? "빠른 인도" : "" };
    if (window.CHAQ_DETAIL_DIST_UP) { o.dist = "연 " + window.CHAQ_DETAIL_DIST_UP + "만 km"; o.distanceUpgraded = true; }   // 3호 ③ 거리 상한: 약정거리 = 긴 거리
    // 이미지 주소는 '../' 없이 사이트 기준(assets/…)으로 — '../' 가 들어가면 AWS 방화벽(WAF)이 경로 공격으로 보고 문의 자체를 막음(261009 운영 확인)
    src = src.replace(/^(\.\.\/)+/, "").replace(/^\//, "");
    if (/^assets\/|^api\/pub\/media\/|^https:\/\//.test(src) && src.length <= 300) o.image = /^api\//.test(src) ? "/" + src : src;
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
      return AU.require({ reason: "inquiry", pending: { action: "inquiry", data: pendingData(c) } }).then(function (m) { if (m) { if (goKakao && c.source === "DETAIL") kakaoConfirm(c); else submitMember(c); } else legacy(c); }).catch(function () {});
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
    return { source: "DETAIL", go: goKakao ? "kakao" : "", chips: [].map.call(document.querySelectorAll(".cond_wrap .filter_chip"), function (b, i) { return b.classList.contains("on") ? i : -1; }).filter(function (i) { return i > -1; }) };
  }
  function guideContext(topic, car) { return { source: "GUIDE", topic: topic || "", carName: car || "", spec: "", trimName: "", conditions: {}, options: [], color: "", pageUrl: location.href.slice(0, 500) }; }
  var sending = false, goKakao = false;   // goKakao: 상담 방법 '카톡상담'으로 들어온 접수 → 완료 창 없이 카카오톡 채팅방으로 바로 연결 (대표 261014)
  function quoteId() { var q = window.CHAQ_DETAIL_QUOTE; return q && q.id ? String(q.id) : (new URLSearchParams(location.search).get("id") || ""); }
  function goChat(c, j) {
    var st = (window.CHAQ_AUTH && window.CHAQ_AUTH.state()) || {}, ch = st.kakaoChannel, sent = !!(j.kakao && j.kakao.sent), U = window.CHAQ_UTIL, qid = quoteId();
    goKakao = false;
    if (!ch || !ch.chat) return false;
    if (!sent) copyText("차큐 견적서 요청 (접수번호 #" + (j.id || "") + (qid ? " · 견적번호 " + qid : "") + ")");
    if (U && U.toast) U.toast(sent ? "카카오톡으로 견적서를 보냈어요. 채팅방으로 연결할게요" : "채팅방으로 연결할게요. 복사된 요청 메시지를 붙여넣어 보내 주세요");
    setTimeout(function () { location.href = ch.chat; }, 900);
    return true;
  }
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
      if (goKakao && c.source === "DETAIL" && goChat(c, j)) return;
      showDone(c, j);
    }).catch(function (e) {
      sending = false;
      if (e.status === 401) return AU.me(true).then(function () { return AU.require({ reason: "inquiry" }); }).then(function (m) { if (m) submitMember(c); }).catch(function () {});
      showError(e.message);
    });
  }
  function reportHref(t) { return (/\/pages\//.test(location.pathname) ? "" : "pages/") + "quote-report.html?t=" + encodeURIComponent(t); }
  // '카카오톡에서 견적서 받기': 요청 메시지(접수번호)를 클립보드에 복사한 뒤 채팅방 열기 (링크 이동은 그대로)
  function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(function () { legacyCopy(t); }); return; } } catch (e) {}
    legacyCopy(t);
  }
  function legacyCopy(t) { try { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:-100px;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } catch (e) {} }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest(".iqf [data-copy]"); if (!a) return;
    copyText(a.getAttribute("data-copy"));
    var U = window.CHAQ_UTIL; if (U && U.toast) U.toast("요청 메시지를 복사했어요. 채팅방에 붙여넣어 보내 주세요");
  });
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
    // 견적 문의(차량 상세) 완료: '이 견적 그대로 신청되었어요 :)' (대표 확정 261008) · 일반 상담은 '상담 신청이 접수됐어요'
    //   안내 문장: 알림톡 발송됨 → 채널에서 견적서 확인 / 미발송 + 카카오톡 채널 있음 → 채팅으로 상담 이어가기
    var isQuote = sent || c.source === "DETAIL";
    sheet('<div class="iqf_done"><i>✓</i><h3>' + (isQuote ? "이 견적 그대로 신청되었어요 :)" : "상담 신청이 접수됐어요") + '</h3>' +
      '<p>' + (sent ? "카카오톡 <b>차큐</b> 채널에서<br>견적서를 확인해 주세요." : ch ? "아래 버튼을 눌러 채팅방에 메시지를 보내 주시면<br>카카오톡으로 견적서를 바로 보내드려요." : "") + '</p>' +
      (j.id ? '<p style="font-size:12.5px;color:#5f6670">접수번호 #' + j.id + '</p>' : '') + '</div>' + car +
      '<div class="iqf_btns" style="flex-direction:column">' +
      // 알림톡 연동 전: 채팅방을 열고 고객이 먼저 말을 걸게 (카카오 채널은 고객이 먼저 보내야 답장 가능) — 접수번호 메시지를 복사해 두어 붙여넣기만 하면 되게
      (ch ? '<a class="iqf_send iqf_kakao" href="' + esc(ch.chat) + '" target="_blank" rel="noopener"' + (sent ? '' : ' data-copy="' + esc("차큐 견적서 요청 (접수번호 #" + (j.id || "") + ")") + '"') + ' style="display:block;text-align:center;text-decoration:none;background:#FEE500;color:rgba(0,0,0,.85);border-radius:12px;padding:14px;font-weight:700">' + (sent ? "카카오톡에서 상담 이어가기" : "카카오톡에서 견적서 받기") + '</a>' +
        (sent ? '' : '<p style="margin:-2px 0 2px;color:#5f6670;font-size:12.5px;text-align:center">요청 메시지가 복사돼요. 채팅방에 붙여넣어 보내 주세요.</p>') : '') +
      (j.report ? '<a class="iqf_close" href="' + reportHref(j.report) + '" style="display:block;flex:none;text-align:center;text-decoration:none;border-radius:12px;padding:14px;font-weight:700">견적서 보기</a>' : '') +
      '<button type="button" class="iqf_close" data-close style="flex:none">확인</button></div>');
  }
  // 차량 상세 '이 조건 그대로 문의하기': 바로 접수하지 않고 상담 방법 선택 — 카톡상담(기존 접수 → 견적서) / 전화상담(견적번호 안내) (대표 261014)
  var HR_KAKAO = "9:00 - 21:30", HR_TEL = "9:00 - 17:50";   // 상담 시간 (대표 261015)
  function chooseDetail() {
    var qid = quoteId();
    var bg = sheet('<h3>상담 방법을 선택해 주세요</h3><div class="iqf_pick">' +
      '<button type="button" class="iqf_opt" data-pick="kakao"><span class="iqf_ol"><b>카톡상담</b><span>견적서 자동 발송</span></span><i class="iqf_hr">' + HR_KAKAO + '</i></button>' +
      '<a class="iqf_opt" data-pick="tel" href="tel:' + TEL.replace(/-/g, "") + '"><span class="iqf_ol"><b>전화상담</b><span>보고계신 견적번호를 말씀해주세요</span>' + (qid ? '<em>견적번호 ' + esc(qid) + '</em>' : '') + '</span><i class="iqf_hr">' + HR_TEL + '</i></a>' +
      '</div><div class="iqf_btns"><button type="button" class="iqf_close" data-close style="flex:1">닫기</button></div>');
    bg.querySelector('[data-pick="kakao"]').addEventListener("click", function () {
      goKakao = true; close(); openChat(detailContext());   // 로그인 전: 가입·로그인 시트(지금 그대로) → 로그인 후: 견적서 발송 확인 창
    });
  }
  // 카톡상담 — 로그인 후 확인 창: 지금 보던 견적 그대로 접수 → 카카오톡 견적서 (대표 261015)
  function kakaoConfirm(c) {
    goKakao = true;
    var bg = sheet('<div class="iqf_kc"><h3>지금 보고 계신 견적 그대로<br>상담을 도와드려요</h3><p class="iqf_sub">추가 영업전화는 없어요.</p></div>' +
      '<div class="iqf_btns"><button type="button" class="iqf_send" data-kc-go>카카오로 견적서 발송하기</button></div>');
    bg.querySelector("[data-kc-go]").addEventListener("click", function () {
      var st = (window.CHAQ_AUTH && window.CHAQ_AUTH.state && window.CHAQ_AUTH.state()) || {}, qid = quoteId();
      if (!(st.auth && st.auth.alimtalk)) copyText("차큐 견적서 요청" + (qid ? " (견적번호 " + qid + ")" : ""));   // 알림톡 전: 채팅방에 붙여넣을 요청 메시지 (버튼 누른 순간 복사)
      close(); submitMember(c);
    });
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
        setTimeout(function () { goKakao = d.go === "kakao"; if (goKakao) kakaoConfirm(detailContext()); else submitMember(detailContext()); }, 250);
      } else submitMember(guideContext(d.topic, d.car));
    }, 300);
  });
  // 기존 버튼의 안내(alert)보다 먼저 받아서 채널톡으로 (캡처 단계)
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-pending-link][data-action="inquiry"]') : null; if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (b.classList.contains("detail_inquiry")) chooseDetail();
    else chooseGuide();   // '이미 이용 중이신가요?'·'계약 고민 중이신가요?' 카드: 전화·카카오 선택만 (관리자 상담 문의로 접수하지 않음, 대표 261015)
  }, true);
  function chooseGuide() {
    var bg = sheet('<h3>문의 방법을 선택해 주세요</h3><div class="iqf_pick">' +
      '<a class="iqf_opt" data-pick="tel" href="tel:' + TEL.replace(/-/g, "") + '"><span class="iqf_ol"><b>전화로 문의하기</b><span>상담 매니저와 바로 통화해요</span></span><i class="iqf_hr">' + HR_TEL + '</i></a>' +
      '<button type="button" class="iqf_opt" data-pick="kakao"><span class="iqf_ol"><b>카카오로 문의하기</b><span>차큐 카카오톡 채널 채팅방으로 연결돼요</span></span><i class="iqf_hr">' + HR_KAKAO + '</i></button>' +
      '</div><div class="iqf_btns"><button type="button" class="iqf_close" data-close style="flex:1">닫기</button></div>');
    bg.querySelector('[data-pick="kakao"]').addEventListener("click", function () {
      var AU = window.CHAQ_AUTH, go = function () {
        var ch = AU && AU.state && (AU.state() || {}).kakaoChannel;
        if (ch && (ch.chat || ch.home)) { close(); location.href = ch.chat || ch.home; }
        else toastMsg("카카오톡 상담 준비 중이에요. 전화로 문의해 주세요");
      };
      if (AU && AU.me) AU.me().then(go, go); else go();
    });
  }
  function toastMsg(m) { var U = window.CHAQ_UTIL; if (U && U.toast) U.toast(m); }

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
    ".iqf .iqf_close{flex:0 0 96px;background:#f1f3f4;color:#3c4043}.iqf .iqf_send{flex:1;background:#1c1f23;color:#fff}.iqf .iqf_send:disabled{opacity:.6;cursor:default}" +
    ".iqf .iqf_done{text-align:center;padding:10px 0 4px}.iqf .iqf_done i{display:inline-flex;width:56px;height:56px;margin-bottom:12px;border-radius:50%;background:#e8f7ef;color:#18a85c;align-items:center;justify-content:center;font-style:normal;font-size:28px;font-weight:800}" +
    ".iqf .iqf_done p{margin:0 0 6px;color:#5f6368;font-size:14px;line-height:1.55}.iqf .iqf_done a{color:#18a85c;font-weight:700}.iqf .iqf_hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".iqf .iqf_pick{display:flex;flex-direction:column;gap:10px;margin:16px 0}.iqf .iqf_opt{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;padding:16px;border:1px solid #e3e6ea;border-radius:12px;background:#fff;color:#16181b;text-align:left;text-decoration:none;font:inherit;cursor:pointer;box-sizing:border-box}" +
    ".iqf .iqf_opt:hover{background:#f5f5f5}.iqf .iqf_opt b{font-size:16px;font-weight:700}.iqf .iqf_opt b small{margin-left:4px;color:#5f6670;font-size:13px;font-weight:500}.iqf .iqf_opt span{color:#5f6670;font-size:13.5px;font-weight:400;line-height:1.45}" +
    ".iqf .iqf_opt em{margin-top:4px;padding:2px 8px;border-radius:7px;background:#f2f3f5;color:var(--detail-green,#18a85c);font-size:12.5px;font-style:normal;font-weight:700}" +
    /* 상담 방법 버튼: 연한 회색 · 오른쪽 상담 시간 (대표 261015) */
    ".iqf .iqf_opt{flex-direction:row;align-items:center;justify-content:space-between;gap:12px;border-color:#f2f3f5;background:#f2f3f5}.iqf .iqf_opt:hover{background:#eaecef}" +
    ".iqf .iqf_ol{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:4px}.iqf .iqf_opt .iqf_ol>span{color:#5f6670;font-size:13.5px;font-weight:400;line-height:1.45}" +
    ".iqf .iqf_kc{padding:6px 0 18px}.iqf .iqf_kc h3{font-size:20px;line-height:1.4}.iqf .iqf_kc .iqf_sub{margin:8px 0 0}" +
    ".iqf .iqf_opt em{background:#fff}.iqf .iqf_hr{flex:none;color:#5f6670;font-size:13px;font-style:normal;font-weight:600;white-space:nowrap}";
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
