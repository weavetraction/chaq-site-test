/* 회원 — 카카오 로그인 · 휴대폰 인증 가입/로그인 시트, 비회원 조건 변경 횟수 제한
   · window.CHAQ_AUTH.me()            → Promise(회원 정보 | null) — 서버(/api/me) 기준
   · window.CHAQ_AUTH.require(opts)   → 로그인돼 있으면 바로, 아니면 가입 시트 → Promise(회원) (닫으면 reject)
       opts: { reason: "inquiry"|"cond"|"mypage", pending: { action, data } }  ← 카카오 로그인으로 페이지를 떠났다 돌아오면 이어서 실행
   · window.CHAQ_AUTH.required        → 로그인 수단이 켜져 있어 문의에 회원가입이 필요한지 (me() 이후 값)
   · 비회원 조건 변경: 목록(재고특가·견적조회) 5회 · 차량 상세 2회까지 → 그 다음은 가입 시트 (이 기기 기준, 로그인하면 제한 없음) */
(function () {
  "use strict";
  var C = window.CHAQ_API || {}, BASE = String(C.base || "").replace(/\/$/, "");
  var LIMIT = { list: 5, detail: 2 }, LS_CNT = "chaq_cond_cnt_v1", SS_ME = "chaq_me_v1", SS_PEND = "chaq_pending_v1";
  var TEL = "1533-5663";
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || "null"); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function toast(m) { var U = window.CHAQ_UTIL; if (U && U.toast) U.toast(m); }
  function api(path, opt) {
    opt = opt || {};
    var init = { method: opt.method || "GET", credentials: "include", headers: {} };
    if (opt.json) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(opt.json); }
    return fetch(BASE + path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "잠시 후 다시 시도해 주세요"); e.status = r.status; e.body = j; throw e; } return j; }); });
  }
  function agreementsHref() { return /\/pages\//.test(location.pathname) ? "agreement.html" : "pages/agreement.html"; }

  // ---------------------------------------------------------------- 내 정보 (세션 동안 기억 → 조건 변경 제한을 바로 판단)
  var state = ss(SS_ME) || null, loading = null;
  function me(force) {
    if (!BASE) return Promise.resolve(null);
    if (loading && !force) return loading;
    loading = api("/api/me").then(function (j) { state = j; ss(SS_ME, j); bootChannel(j); return j.member; }).catch(function () { return state ? state.member : null; });
    return loading;
  }
  function member() { return state && state.member; }
  function required() { return !!(state && state.auth && state.auth.required); }

  // 채널톡: 회원이면 같은 고객으로 묶어서 부팅 (키는 관리자 '외부 연동' 또는 사이트 설정)
  var booted = false;
  function bootChannel(j) {
    var key = (j && j.channel && j.channel.pluginKey) || C.channelPluginKey; if (!key || booted) return; booted = true;
    var w = window; if (!w.ChannelIO) { var ch = function () { ch.c(arguments); }; ch.q = []; ch.c = function (a) { ch.q.push(a); }; w.ChannelIO = ch;
      var s = document.createElement("script"); s.async = true; s.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"; (document.head || document.body).appendChild(s); }
    var o = { pluginKey: key, hideChannelButtonOnBoot: !C.channelButton, language: "ko" };
    if (j.channel.memberId) { o.memberId = j.channel.memberId; if (j.channel.memberHash) o.memberHash = j.channel.memberHash; if (j.channel.profile) o.profile = j.channel.profile; }
    try { w.ChannelIO("boot", o); } catch (e) {}
  }

  // ---------------------------------------------------------------- 가입·로그인 시트
  var CSS = ".au [hidden]{display:none!important}.au_bg{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;background:rgba(17,20,24,.55)}" +
    ".au{position:relative;width:100%;max-width:480px;max-height:94vh;overflow:auto;border-radius:20px 20px 0 0;background:#fff;padding:24px 20px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:inherit;color:#202124}" +
    "@media(min-width:600px){.au_bg{align-items:center}.au{border-radius:20px}}" +
    ".au h3{margin:0 0 6px;font-size:20px;font-weight:800;letter-spacing:-.3px}.au .au_sub{margin:0 0 18px;color:#5f6368;font-size:14px;line-height:1.5}" +
    ".au .au_x{position:absolute;top:14px;right:14px;width:34px;height:34px;border:0;border-radius:50%;background:#f1f3f4;color:#5f6368;font-size:20px;line-height:1;cursor:pointer}" +
    ".au .au_kakao{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;padding:15px;border:0;border-radius:12px;background:#FEE500;color:rgba(0,0,0,.85);font:inherit;font-size:16px;font-weight:700;cursor:pointer}" +
    ".au .au_kakao svg{width:20px;height:20px}" +
    ".au .au_or{display:flex;align-items:center;gap:10px;margin:16px 0;color:#9aa0a6;font-size:12.5px}.au .au_or:before,.au .au_or:after{content:'';flex:1;height:1px;background:#e8eaed}" +
    ".au label.f{display:block;margin:0 0 10px;font-size:13px;font-weight:700;color:#3c4043}" +
    ".au .au_row{display:flex;gap:8px;margin-top:6px}.au input[type=tel],.au input[type=text]{flex:1;min-width:0;width:100%;padding:13px;border:1px solid #dadce0;border-radius:10px;font:inherit;font-size:15.5px;box-sizing:border-box;background:#fff;color:#202124}" +
    ".au input:focus{outline:none;border-color:#18a85c}.au .au_btn2{flex:none;padding:0 14px;border:1px solid #18a85c;border-radius:10px;background:#fff;color:#18a85c;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}.au .au_btn2:disabled{opacity:.5;cursor:default}" +
    ".au .au_timer{margin:6px 0 0;color:#e5484d;font-size:12.5px}.au .au_hint{margin:6px 0 0;color:#5f6368;font-size:12.5px}" +
    ".au .au_agree{margin:16px 0 4px;padding:12px 14px;border-radius:12px;background:#f8f9fa;font-size:13.5px}.au .au_agree.need{outline:2px solid #e5484d}" +
    ".au .au_agree label{display:flex;gap:8px;align-items:flex-start;margin:6px 0;line-height:1.45;cursor:pointer}.au .au_agree label.all{margin:0 0 8px;padding-bottom:8px;border-bottom:1px solid #e8eaed;font-weight:700}" +
    ".au .au_agree input{width:18px;height:18px;margin:1px 0 0;accent-color:#18a85c;flex:none}.au .au_agree a{margin-left:auto;color:#80868b;font-size:12px;white-space:nowrap}" +
    ".au .au_agree small{display:block;color:#80868b;font-size:12px;margin-top:2px}" +
    ".au .au_err{min-height:18px;margin:8px 0;color:#e5484d;font-size:13px;line-height:1.45}" +
    ".au .au_go{display:block;width:100%;padding:15px;border:0;border-radius:12px;background:#18a85c;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}.au .au_go:disabled{opacity:.55;cursor:default}" +
    ".au .au_note{margin:12px 0 0;color:#80868b;font-size:12px;line-height:1.5;text-align:center}";
  var KAKAO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.65 1.74 4.98 4.37 6.31l-.9 3.3c-.08.3.26.54.52.37l3.93-2.6c.52.06 1.04.1 1.58.1 5.25 0 9.5-3.36 9.5-7.48S17.25 3.5 12 3.5z"/></svg>';
  var REASON = {
    inquiry: ["3초 가입하고 견적 받기", "가입하면 이 견적을 카카오톡으로 바로 보내드리고, 담당 매니저가 상담을 이어가요."],
    cond: ["조건을 더 바꿔보시려면 가입이 필요해요", "비회원은 조건 변경 횟수가 정해져 있어요. 3초 가입하면 제한 없이 비교할 수 있어요."],
    mypage: ["차큐 시작하기", "가입하면 상담 내역과 견적서를 어디서든 확인할 수 있어요."],
    phone: ["휴대폰 번호 확인", "견적서를 카카오톡(알림톡)으로 보내드리려면 휴대폰 번호 확인이 필요해요."],
  };
  var opened = null;
  function closeSheet() { if (!opened) return; var o = opened; opened = null; o.el.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); clearInterval(o.timer); if (o.reject) o.reject(new Error("closed")); }
  function onKey(e) { if (e.key === "Escape") closeSheet(); }
  function fmtPhone(v) { var d = String(v || "").replace(/\D/g, "").slice(0, 11); if (d.length < 4) return d; if (d.length <= 7) return d.slice(0, 3) + "-" + d.slice(3); return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4); }

  /** 가입·로그인 시트. mode: 'join' | 'phone'(카카오 회원 번호 확인) */
  function openSheet(reason, pending, mode) {
    return new Promise(function (resolve, reject) {
      closeSheet();
      if (!document.getElementById("auCss")) { var st = document.createElement("style"); st.id = "auCss"; st.textContent = CSS; document.head.appendChild(st); }
      var A = (state && state.auth) || {}, phoneOnly = mode === "phone", R = REASON[phoneOnly ? "phone" : reason] || REASON.mypage;
      var bg = document.createElement("div"); bg.className = "au_bg";
      bg.innerHTML = '<div class="au" role="dialog" aria-modal="true" aria-labelledby="auTitle"><button type="button" class="au_x" aria-label="닫기">×</button>' +
        '<h3 id="auTitle">' + esc(R[0]) + '</h3><p class="au_sub">' + esc(R[1]) + '</p>' +
        (!phoneOnly && A.kakao ? '<button type="button" class="au_kakao">' + KAKAO_SVG + '카카오로 3초 만에 시작하기</button>' : '') +
        (!phoneOnly && A.kakao && A.sms ? '<div class="au_or">또는 휴대폰 번호로</div>' : '') +
        (A.sms || phoneOnly ? '<div class="au_phone">' +
          '<label class="f">휴대폰 번호<span class="au_row"><input type="tel" name="phone" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000" maxlength="13"><button type="button" class="au_btn2 au_send">인증번호 받기</button></span></label>' +
          '<label class="f au_codewrap" hidden>인증번호<span class="au_row"><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6자리 숫자"></span><p class="au_timer"></p></label>' +
          (phoneOnly ? '' : '<label class="f au_namewrap" hidden>이름 <small style="font-weight:400;color:#80868b">(선택 · 상담 시 호칭)</small><span class="au_row"><input type="text" name="name" autocomplete="name" maxlength="30" placeholder="홍길동"></span></label>') +
          '</div>' : '') +
        (phoneOnly ? '' : '<div class="au_agree"><label class="all"><input type="checkbox" data-all>전체 동의 <small style="display:inline;margin-left:4px">(처음 가입할 때만 필요해요)</small></label>' +
          '<label><input type="checkbox" data-req="age">[필수] 만 14세 이상입니다</label>' +
          '<label><input type="checkbox" data-req="terms">[필수] 이용약관 동의<a href="' + agreementsHref() + '#terms" target="_blank" rel="noopener">보기</a></label>' +
          '<label><input type="checkbox" data-req="privacy"><span>[필수] 개인정보 수집·이용 동의<small>휴대폰 번호·이름(카카오 가입 시 카카오 회원번호·닉네임), 상담 차량·조건 / 회원 관리·견적 상담·알림톡 안내 / 회원 탈퇴 시까지 (상담 기록은 상담 종료 후 1년)</small></span><a href="' + agreementsHref() + '#privacy" target="_blank" rel="noopener">보기</a></label>' +
          '<label><input type="checkbox" data-opt="marketing">[선택] 혜택·이벤트 소식 받기 (카카오톡·문자)</label></div>') +
        '<p class="au_err" role="alert"></p>' +
        (A.sms || phoneOnly ? '<button type="button" class="au_go" disabled>' + (phoneOnly ? "확인" : "인증하고 시작하기") + '</button>' : '') +
        (!A.kakao && !A.sms && !phoneOnly ? '<p class="au_note">지금은 온라인 가입이 어려워요. <a href="tel:' + TEL.replace(/-/g, "") + '">' + TEL + '</a>로 전화 주세요.</p>' : '') +
        '</div>';
      document.body.appendChild(bg); document.body.style.overflow = "hidden"; document.addEventListener("keydown", onKey);
      var o = opened = { el: bg, reject: reject, timer: null }, box = bg.querySelector(".au"), err = box.querySelector(".au_err");
      bg.addEventListener("click", function (e) { if (e.target === bg) closeSheet(); });
      box.querySelector(".au_x").addEventListener("click", closeSheet);
      function agreeVals() { var g = function (k) { var i = box.querySelector('[data-req="' + k + '"],[data-opt="' + k + '"]'); return !!(i && i.checked); }; return { age: g("age"), terms: g("terms") && g("age"), privacy: g("privacy"), marketing: g("marketing") }; }
      var all = box.querySelector("[data-all]");
      if (all) {
        all.addEventListener("change", function () { if (/동의/.test(err.textContent)) err.textContent = ""; [].forEach.call(box.querySelectorAll("[data-req],[data-opt]"), function (i) { i.checked = all.checked; }); box.querySelector(".au_agree").classList.remove("need"); });
        box.querySelector(".au_agree").addEventListener("change", function (e) { if (/동의/.test(err.textContent)) err.textContent = ""; if (e.target === all) return; var a = agreeVals(); all.checked = a.age && a.terms && a.privacy && a.marketing; if (a.terms && a.privacy) box.querySelector(".au_agree").classList.remove("need"); });
      }
      function needAgree(msg) { var ag = box.querySelector(".au_agree"); if (ag) { ag.classList.add("need"); ag.scrollIntoView({ block: "nearest" }); } err.textContent = msg || "처음 가입이시면 필수 항목에 동의해 주세요"; }
      function done(m, created) {
        var r = o.reject; o.reject = null; closeSheet();
        toast(created ? "가입이 완료됐어요" : "로그인됐어요");
        resolve(m);
      }
      // 카카오
      var kb = box.querySelector(".au_kakao");
      if (kb) kb.addEventListener("click", function () {
        var a = agreeVals(); if (pending) ss(SS_PEND, { action: pending.action, data: pending.data || null, url: location.href.split("#")[0], at: Date.now() });
        var ret = location.href.split("#")[0];
        location.href = BASE + "/api/auth/kakao/start?return=" + encodeURIComponent(ret) + "&terms=" + (a.terms ? 1 : 0) + "&privacy=" + (a.privacy ? 1 : 0) + "&marketing=" + (a.marketing ? 1 : 0);
      });
      // 휴대폰
      var ph = box.querySelector('input[name="phone"]'), code = box.querySelector('input[name="code"]'), send = box.querySelector(".au_send"), go = box.querySelector(".au_go");
      if (!ph) return;
      ph.addEventListener("input", function () { ph.value = fmtPhone(ph.value); });
      setTimeout(function () { try { (A.kakao && !phoneOnly ? kb : ph).focus(); } catch (e) {} }, 60);
      function startTimer() {
        var end = Date.now() + 5 * 60000, t = box.querySelector(".au_timer"); clearInterval(o.timer);
        o.timer = setInterval(function () { var s = Math.max(0, Math.round((end - Date.now()) / 1000)); t.textContent = s ? "남은 시간 " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : "인증 시간이 지났어요. 인증번호를 다시 받아 주세요"; if (!s) clearInterval(o.timer); }, 500);
      }
      send.addEventListener("click", function () {
        err.textContent = ""; var d = ph.value.replace(/\D/g, "");
        if (!/^01[016789]\d{7,8}$/.test(d)) { err.textContent = "휴대폰 번호를 정확히 입력해 주세요 (예: 010-1234-5678)"; ph.focus(); return; }
        send.disabled = true; send.textContent = "보내는 중…";
        api("/api/auth/sms/send", { method: "POST", json: { phone: d } }).then(function (j) {
          box.querySelector(".au_codewrap").hidden = false; var nw = box.querySelector(".au_namewrap"); if (nw) nw.hidden = false;
          send.textContent = "다시 받기"; setTimeout(function () { send.disabled = false; }, 30000);
          go.disabled = false; startTimer(); code.focus();
          if (j.devCode) { code.value = j.devCode; box.querySelector(".au_timer").insertAdjacentHTML("afterend", '<p class="au_hint">개발 환경: 인증번호를 자동으로 채웠어요</p>'); }
        }).catch(function (e) { send.disabled = false; send.textContent = "인증번호 받기"; err.textContent = e.message; });
      });
      code.addEventListener("input", function () { code.value = code.value.replace(/\D/g, "").slice(0, 6); });
      go.addEventListener("click", function () {
        err.textContent = ""; var c = code.value.replace(/\D/g, "");
        if (c.length !== 6) { err.textContent = "문자로 받은 인증번호 6자리를 입력해 주세요"; code.focus(); return; }
        var a = agreeVals(), nm = box.querySelector('input[name="name"]');
        go.disabled = true; go.textContent = "확인 중…";
        api("/api/auth/sms/verify", { method: "POST", json: { phone: ph.value.replace(/\D/g, ""), code: c, name: nm ? nm.value.trim() : "", agree: { terms: a.terms, privacy: a.privacy, marketing: a.marketing } } })
          .then(function (j) { return me(true).then(function () { done(j.member, j.created); }); })
          .catch(function (e) { go.disabled = false; go.textContent = phoneOnly ? "확인" : "인증하고 시작하기"; if (/동의/.test(e.message)) needAgree(); else err.textContent = e.message; });
      });
    });
  }

  /** 로그인(+휴대폰 번호)이 필요한 동작 앞에서 */
  function requireMember(opts) {
    opts = opts || {};
    return me().then(function (m) {
      if (!required() && !(state && state.auth && (state.auth.kakao || state.auth.sms))) return null;   // 로그인 수단이 아직 없음 → 기존 방식
      if (m && m.hasPhone) return m;
      if (m && !m.hasPhone) return openSheet(opts.reason, opts.pending, "phone");
      return openSheet(opts.reason || "mypage", opts.pending, "join").then(function (mm) { return mm && !mm.hasPhone ? openSheet(opts.reason, opts.pending, "phone") : mm; });
    });
  }
  function logout() { return api("/api/auth/logout", { method: "POST" }).catch(function () {}).then(function () { state = null; ss(SS_ME, null); try { window.ChannelIO && window.ChannelIO("shutdown"); } catch (e) {} return me(true); }); }

  // ---------------------------------------------------------------- 비회원 조건 변경 제한 (목록 5회 · 상세 2회)
  var bypass = false;
  document.addEventListener("click", function (e) {
    if (bypass || !e.target.closest) return;
    var chip = e.target.closest(".cond_wrap .filter_chip"); if (!chip || chip.classList.contains("on") || chip.disabled) return;
    if (e.target.closest(".chip_help,.tag_info")) return;                 // 설명(!) 아이콘
    var wrap = chip.closest(".cond_wrap"); if (wrap.classList.contains("is-locked")) return;   // 아직 차량 미선택 (페이지가 안내)
    var kind = chip.closest(".detail_conds") ? "detail" : "list";
    if (member() || !(state && state.auth && state.auth.required)) return;
    var cnt = ls(LS_CNT) || {}, n = cnt[kind] || 0;
    if (n >= LIMIT[kind]) {
      e.preventDefault(); e.stopImmediatePropagation();
      var idx = [].indexOf.call(document.querySelectorAll(".cond_wrap .filter_chip"), chip);
      requireMember({ reason: "cond", pending: { action: "chip", data: { idx: idx } } }).then(function (m) { if (m) { bypass = true; try { chip.click(); } finally { bypass = false; } } }).catch(function () {});
      return;
    }
    cnt[kind] = n + 1; ls(LS_CNT, cnt);
    if (n + 1 === LIMIT[kind]) setTimeout(function () { toast("비회원은 여기까지 조건을 바꿀 수 있어요. 더 비교하려면 3초 가입해 주세요"); }, 300);
  }, true);

  // ---------------------------------------------------------------- 카카오 로그인 후 돌아왔을 때
  function afterReturn() {
    var h = location.hash, mm = h.match(/chaq_login=([a-z]+)/); if (!mm) return;
    var msg = (h.match(/[&#]msg=([^&]+)/) || [])[1];
    try { history.replaceState(null, "", location.href.split("#")[0]); } catch (e) {}
    var pend = ss(SS_PEND); ss(SS_PEND, null);
    if (pend && (pend.url !== location.href.split("#")[0] || Date.now() - pend.at > 20 * 60000)) pend = null;
    me(true).then(function (m) {
      if (mm[1] === "error") { toast(msg ? decodeURIComponent(msg) : "로그인에 실패했어요"); return; }
      var go = function (mem) { if (mem) document.dispatchEvent(new CustomEvent("chaq:login", { detail: { member: mem, pending: pend } })); };
      if (mm[1] === "needphone" || (m && !m.hasPhone)) { openSheet(pend && pend.action === "inquiry" ? "inquiry" : "mypage", null, "phone").then(go).catch(function () {}); return; }
      toast("로그인됐어요"); go(m);
    });
  }
  // 이어서 하기: 조건 칩 (상세·목록 공통) — 문의는 inquiry.js 가 받음
  document.addEventListener("chaq:login", function (e) {
    var p = e.detail && e.detail.pending; if (!p || p.action !== "chip" || !p.data) return;
    setTimeout(function () { var c = document.querySelectorAll(".cond_wrap .filter_chip")[p.data.idx]; if (c && !c.classList.contains("on")) { bypass = true; try { c.click(); } finally { bypass = false; } } }, 400);
  });

  window.CHAQ_AUTH = { me: me, member: member, require: requireMember, open: function (r) { return me().then(function () { return openSheet(r || "mypage", null, "join"); }); }, logout: logout, api: api, withoutLimit: function (fn) { bypass = true; try { fn(); } finally { bypass = false; } }, get required() { return required(); }, state: function () { return state; } };
  me(true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", afterReturn); else afterReturn();
})();
