/* 차큐 관리자 — 메인 화면: 상단 배너 · 중간 띠배너(메뉴 페이지 배너 공통) · 섹션별 노출(자동/직접 선택)
   [저장]을 누르면 1분 안에 사이트에 반영됩니다. */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN; if (!A) return;
  var api = A.api, esc = A.esc, won = A.won, dt = A.dt, $ = A.$, $$ = A.$$;
  if (!$("#hmRoot")) return;
  var SEC = [["stock", "장기렌트 재고특가", "자동: 월 납입금 구간(50만 미만·50~80만·80만 이상)별 앞에서 6대씩"], ["fast", "장기렌트 빠른인도", "자동: 빠른인도 전체(차종 탭별 5대씩 더보기)"], ["review", "차큐 이용후기", "자동: 콘텐츠 > 이용후기 순서대로 위에서 5개"], ["faq", "자주 묻는 질문", "자동: 카테고리별 첫 질문 1개씩"]];
  var S = { cfg: null, cand: {}, dirty: false };
  var toast = function (m, bad) { var t = $("#vmToast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(function () { t.className = "toast"; }, 2600); };
  var fail = function (er) { toast(er.message || String(er), true); };
  var imgSrc = function (u) { return !u ? "" : /^(https?:|\/|data:)/.test(u) ? u : "/" + String(u).replace(/^(\.\.\/)+/, ""); };
  var dirty = function () { S.dirty = true; $("#hmSave").classList.add("primary"); $("#hmState").innerHTML = '<b class="down">저장 안 된 변경이 있습니다</b>'; };

  function load() {
    return api("/api/admin/home").then(function (r) {
      S.cfg = r.config; S.dirty = false; $("#hmSave").classList.remove("primary");
      $("#hmState").textContent = r.config.updatedAt ? "마지막 저장 " + dt(r.config.updatedAt) : "아직 저장한 설정이 없습니다 (지금은 사이트 기본 모습)";
      return Promise.all(SEC.map(function (s) { return api("/api/admin/home/candidates?section=" + s[0]).then(function (c) { S.cand[s[0]] = c; }); }));
    }).then(render).catch(fail);
  }

  // ---------------------------------------------------------------- 배너
  function bannerBlock(key, title, hint) {
    var list = S.cfg[key];
    return '<div class="card"><div class="row between wrap"><h2>' + title + ' <small class="hint">' + hint + '</small></h2><span class="btn sm" data-bup="' + key + '">+ 배너 올리기<input type="file" accept="image/*" multiple hidden></span></div>' +
      (list.length ? '<div class="banners">' + list.map(function (b, i) {
        var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), live = b.visible && (!b.start || b.start <= today) && (!b.end || b.end >= today);
        return '<div class="bn_card' + (live ? "" : " off") + '"><img src="' + esc(imgSrc(b.img)) + '" alt=""><div class="bn_meta">' +
          '<div class="row between"><b>' + (i + 1) + '번 ' + (live ? '<span class="pill live">노출 중</span>' : '<span class="pill">미노출</span>') + '</b><span class="row gap"><button class="btn sm" data-bmv="' + key + ':' + i + ':-1">▲</button><button class="btn sm" data-bmv="' + key + ':' + i + ':1">▼</button><button class="btn sm danger" data-bdel="' + key + ':' + i + '">삭제</button></span></div>' +
          '<label><span>링크 (비우면 이동 없음)</span><input data-bf="' + key + ':' + i + ':href" value="' + esc(b.href) + '" placeholder="pages/event__list__ing.html 또는 https://…"></label>' +
          '<label><span>설명 (이미지 대체 문구)</span><input data-bf="' + key + ':' + i + ':alt" value="' + esc(b.alt) + '"></label>' +
          '<div class="row gap"><label><span>시작일</span><input type="date" data-bf="' + key + ':' + i + ':start" value="' + esc(b.start || "") + '"></label><label><span>종료일</span><input type="date" data-bf="' + key + ':' + i + ':end" value="' + esc(b.end || "") + '"></label>' +
          '<label class="chk"><input type="checkbox" data-bf="' + key + ':' + i + ':visible"' + (b.visible ? " checked" : "") + '> 노출</label></div></div></div>';
      }).join("") + '</div>' : '<p class="hint">등록된 배너가 없습니다 — 지금은 사이트 기본 배너가 나옵니다.</p>') + '</div>';
  }

  // ---------------------------------------------------------------- 섹션 노출
  function sectionBlock(s) {
    var key = s[0], v = S.cfg.sections[key], cand = S.cand[key] || [], byId = {};
    cand.forEach(function (c) { byId[String(c.id)] = c; });
    var picked = v.ids.map(function (id) { return byId[String(id)] || { id: id, label: id + " (지금 사이트에 없음 — 저장해도 안 나옴)", missing: true }; });
    var opts = cand.filter(function (c) { return v.ids.indexOf(String(c.id)) < 0; });
    return '<div class="card hm_sec"><div class="row between wrap"><h2>' + s[1] + '</h2>' +
      '<div class="row gap"><label class="chk"><input type="radio" name="mode_' + key + '" value="auto"' + (v.mode !== "pick" ? " checked" : "") + ' data-mode="' + key + '"> 자동</label><label class="chk"><input type="radio" name="mode_' + key + '" value="pick"' + (v.mode === "pick" ? " checked" : "") + ' data-mode="' + key + '"> 직접 선택</label>' +
      '<label class="chk">노출 개수 <input type="number" min="1" class="cnt" data-cnt="' + key + '" value="' + (v.count || "") + '" placeholder="기본"></label></div></div>' +
      '<p class="hint">' + s[2] + (key === "stock" ? ' · 직접 선택이면 고른 순서대로(월 납입금 탭은 그대로 적용)' : '') + '</p>' +
      (v.mode === "pick" ? '<div class="pick_list">' + (picked.length ? picked.map(function (c, i) {
        return '<div class="pick_row' + (c.missing ? " miss" : "") + '"><span class="no">' + (i + 1) + '</span><span class="lb"><b>' + esc(c.label) + '</b>' + (c.sub ? ' <small class="hint">' + esc(c.sub) + '</small>' : '') + (c.monthly ? ' <small>월 ' + won(c.monthly) + '원</small>' : '') + (c.visible === false ? ' <span class="pill">숨김 콘텐츠</span>' : '') + '</span>' +
          '<button class="btn sm" data-pmv="' + key + ':' + i + ':-1">▲</button><button class="btn sm" data-pmv="' + key + ':' + i + ':1">▼</button><button class="btn sm danger" data-pdel="' + key + ':' + i + '">×</button></div>';
      }).join("") : '<p class="hint">아래에서 노출할 항목을 고르세요</p>') + '</div>' +
        '<div class="picker"><input type="search" data-pq="' + key + '" placeholder="추가할 항목 검색 (' + cand.length + '개 중)"><div class="res" hidden data-pres="' + key + '"></div></div>' : '') + '</div>';
  }

  function render() {
    $("#hmBody").innerHTML =
      bannerBlock("heroBanners", "상단 배너", "권장 1200×684 (10:5.7) · 여러 장이면 3.5초마다 넘어감") +
      bannerBlock("midBanners", "중간 띠배너", "메인 중간 + 전체메뉴 화면 배너 공통 · 권장 1080×300") +
      SEC.map(sectionBlock).join("");
    // 후보 검색
    $$("[data-pq]").forEach(function (inp) {
      inp.oninput = function () {
        var key = inp.getAttribute("data-pq"), box = $('[data-pres="' + key + '"]'), qv = inp.value.trim().toLowerCase(), v = S.cfg.sections[key];
        var list = (S.cand[key] || []).filter(function (c) { return v.ids.indexOf(String(c.id)) < 0 && (!qv || (c.label + " " + (c.sub || "") + " " + c.id).toLowerCase().indexOf(qv) >= 0); }).slice(0, 40);
        box.innerHTML = list.length ? list.map(function (c) { return '<button type="button" data-padd="' + key + ':' + esc(c.id) + '">' + esc(c.label) + (c.sub ? ' <small>' + esc(c.sub) + '</small>' : '') + (c.monthly ? ' <small>월 ' + won(c.monthly) + '원</small>' : '') + '</button>'; }).join("") : '<button type="button" disabled>결과 없음</button>';
        box.hidden = false;
      };
      inp.onfocus = inp.oninput;
    });
  }
  document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".hm_sec .picker")) $$(".hm_sec [data-pres]").forEach(function (b) { b.hidden = true; }); });

  $("#hmBody").addEventListener("click", function (e) {
    var t = e.target.closest("[data-bmv],[data-bdel],[data-pmv],[data-pdel],[data-padd],[data-bup]"); if (!t) return;
    var a;
    if ((a = t.getAttribute("data-bup"))) { if (e.target.tagName !== "INPUT") $("input[type=file]", t).click(); return; }
    if ((a = t.getAttribute("data-bmv"))) { a = a.split(":"); var L = S.cfg[a[0]], i = +a[1], j = i + +a[2]; if (j < 0 || j >= L.length) return; var x = L[i]; L[i] = L[j]; L[j] = x; }
    if ((a = t.getAttribute("data-bdel"))) { a = a.split(":"); if (!confirm("이 배너를 뺄까요? (저장해야 반영)")) return; S.cfg[a[0]].splice(+a[1], 1); }
    if ((a = t.getAttribute("data-pmv"))) { a = a.split(":"); var I = S.cfg.sections[a[0]].ids, p = +a[1], q2 = p + +a[2]; if (q2 < 0 || q2 >= I.length) return; var y = I[p]; I[p] = I[q2]; I[q2] = y; }
    if ((a = t.getAttribute("data-pdel"))) { a = a.split(":"); S.cfg.sections[a[0]].ids.splice(+a[1], 1); }
    if ((a = t.getAttribute("data-padd"))) { var k = a.slice(0, a.indexOf(":")), id = a.slice(a.indexOf(":") + 1); S.cfg.sections[k].ids.push(id); }
    dirty(); render();
    if (t.getAttribute("data-padd")) { var inp = $('[data-pq="' + t.getAttribute("data-padd").split(":")[0] + '"]'); if (inp) inp.focus(); }
  });
  $("#hmBody").addEventListener("change", function (e) {
    var t = e.target, a;
    if (t.type === "file" && t.closest("[data-bup]")) {
      var key = t.closest("[data-bup]").getAttribute("data-bup"); if (!t.files.length) return;
      if (S.cfg[key].length + t.files.length > 10) return toast("배너는 최대 10개입니다", true);
      var fd = new FormData(); fd.append("purpose", "banner"); [].forEach.call(t.files, function (f) { fd.append("files", f); });
      toast("올리는 중…");
      api("/api/admin/media", { method: "POST", body: fd }).then(function (ups) {
        ups.forEach(function (u) { S.cfg[key].push({ img: u.url, alt: "", href: "", start: null, end: null, visible: true }); });
        dirty(); render(); toast("배너를 추가했습니다 — 링크·기간을 정하고 [저장]을 누르세요");
      }).catch(fail);
      return;
    }
    if ((a = t.getAttribute("data-bf"))) { a = a.split(":"); S.cfg[a[0]][+a[1]][a[2]] = t.type === "checkbox" ? t.checked : (t.value.trim() || (a[2] === "start" || a[2] === "end" ? null : "")); dirty(); if (t.type === "checkbox" || a[2] === "start" || a[2] === "end") render(); return; }
    if ((a = t.getAttribute("data-mode"))) { S.cfg.sections[a].mode = t.value; dirty(); render(); return; }
    if ((a = t.getAttribute("data-cnt"))) { S.cfg.sections[a].count = t.value ? +t.value : null; dirty(); }
  });

  $("#hmSave").addEventListener("click", function () {
    var b = this; b.disabled = true;
    api("/api/admin/home", { method: "PUT", json: S.cfg }).then(function () { toast("저장했습니다 — 1분 안에 사이트에 보입니다"); return load(); }).catch(fail).finally(function () { b.disabled = false; });
  });
  $("#hmReload").addEventListener("click", function () { if (!S.dirty || confirm("저장하지 않은 변경을 버릴까요?")) load(); });
  window.addEventListener("beforeunload", function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

  var started = false;
  document.addEventListener("chaq:tab", function (e) { if (e.detail === "home" && !started) { started = true; load(); } });
})();
