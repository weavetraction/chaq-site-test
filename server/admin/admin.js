/* 차큐 관리자 화면 — 견적 데이터(엑셀 업로드·미리보기·트림 연결·반영·되돌리기) / 상담 문의 */
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  var esc = function (x) { return String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var won = function (n) { return n == null ? "" : Number(n).toLocaleString("ko-KR"); };
  var dt = function (s) { return s ? new Date(s).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""; };
  var KIND = { stock: "재고특가", fast: "빠른인도", estimate: "견적조회" };
  var PLAN = { "0": "초기 0원", b: "보증금 30%", s: "선납금 30%" };

  function api(path, opt) {
    opt = opt || {};
    if (opt.json) { opt.body = JSON.stringify(opt.json); opt.headers = Object.assign({ "content-type": "application/json" }, opt.headers || {}); delete opt.json; }
    return fetch(path, Object.assign({ credentials: "same-origin" }, opt)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && path.indexOf("/login") < 0) { showLogin(); throw new Error(j.error || "로그인이 필요합니다"); }
        if (!r.ok) throw new Error(j.error || ("오류 " + r.status));
        return j;
      });
    });
  }

  // ---------------------------------------------------------------- 로그인
  function showLogin() { $("#appView").hidden = true; $("#loginView").hidden = false; }
  function showApp(me) { $("#loginView").hidden = true; $("#appView").hidden = false; $("#whoName").textContent = (me.name || me.email) + "님"; loadQuotes(); loadInquiries(); document.dispatchEvent(new CustomEvent("chaq:app")); }
  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("#loginErr").textContent = "";
    api("/api/admin/login", { method: "POST", json: { email: e.target.email.value, password: e.target.password.value } }).then(showApp).catch(function (er) { $("#loginErr").textContent = er.message; });
  });
  $("#logoutBtn").addEventListener("click", function () { api("/api/admin/logout", { method: "POST" }).finally(showLogin); });
  $$(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $$("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== b.getAttribute("data-tab"); });
      if (b.getAttribute("data-tab") === "inquiries") loadInquiries();
      document.dispatchEvent(new CustomEvent("chaq:tab", { detail: b.getAttribute("data-tab") }));
    });
  });

  // ---------------------------------------------------------------- 견적 데이터
  var currentBatch = null;
  function loadQuotes() {
    api("/api/admin/quotes/status").then(function (s) {
      $("#liveKinds").innerHTML = ["stock", "fast", "estimate"].map(function (k) {
        var p = s.published[k];
        return '<div class="kind"><b>' + KIND[k] + '</b>' + (p ? '<strong>' + won(p.rows) + '대</strong><small>트림 연결 ' + won(p.linked) + ' · ' + dt(p.published_at) + ' 반영 · #' + p.batch_id + '</small><small>' + esc(p.file_name) + '</small>' : '<strong>-</strong><small>반영된 데이터 없음</small>') + '</div>';
      }).join("");
    }).catch(function () {});
    loadHistory();
  }
  function loadHistory() {
    api("/api/admin/batches").then(function (rows) {
      $("#historyTable").innerHTML = '<tr><th>#</th><th>파일</th><th>상태</th><th>구분</th><th class="num">행</th><th>올린 시각</th><th>올린 사람</th><th></th></tr>' + rows.map(function (b) {
        var live = b.live_kinds && b.live_kinds.length, cnt = 0; Object.keys(b.summary.kinds || {}).forEach(function (k) { cnt += b.summary.kinds[k].rows; });
        var st = live ? '<span class="pill live">사이트 반영 중 (' + b.live_kinds.map(function (k) { return KIND[k]; }).join("·") + ')</span>' : b.status === "DRAFT" ? '<span class="pill draft">미리보기</span>' : b.status === "DISCARDED" ? '<span class="pill discarded">폐기</span>' : '<span class="pill">이전 반영</span>';
        return '<tr><td>' + b.id + '</td><td>' + esc(b.file_name) + '</td><td>' + st + '</td><td>' + (b.kinds || []).map(function (k) { return KIND[k]; }).join(", ") + '</td><td class="num">' + won(cnt) + '</td><td>' + dt(b.created_at) + '</td><td>' + esc(b.created_by_name || (b.source === "SEED" ? "초기 이전" : "")) + '</td><td class="row gap">' +
          (b.status !== "DISCARDED" ? '<button class="btn sm" data-open="' + b.id + '">보기</button>' : '') +
          (b.status === "PUBLISHED" && !live ? '<button class="btn sm" data-republish="' + b.id + '">이 데이터로 되돌리기</button>' : '') + '</td></tr>';
      }).join("");
    });
  }
  $("#historyTable").addEventListener("click", function (e) {
    var o = e.target.getAttribute("data-open"), r = e.target.getAttribute("data-republish");
    if (o) openBatch(+o);
    if (r && confirm("#" + r + " 업로드 데이터로 사이트를 되돌릴까요? (그 파일에 있는 구분만 바뀝니다)")) api("/api/admin/batches/" + r + "/publish", { method: "POST" }).then(function () { loadQuotes(); alert("되돌렸습니다"); }).catch(function (er) { alert(er.message); });
  });

  $("#uploadForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("#uploadErr").textContent = "";
    var fd = new FormData(e.target), btn = $("button", e.target); btn.disabled = true; btn.textContent = "올리는 중…";
    api("/api/admin/quotes/upload", { method: "POST", body: fd }).then(function (r) { e.target.reset(); loadHistory(); openBatch(r.batchId); })
      .catch(function (er) { $("#uploadErr").textContent = er.message; }).finally(function () { btn.disabled = false; btn.textContent = "올리고 미리보기"; });
  });

  function openBatch(id) {
    api("/api/admin/batches/" + id + "?unlinked=1").then(function (r) {
      currentBatch = r.batch; var s = r.batch.summary || {};
      $("#previewCard").hidden = false;
      $("#previewTitle").textContent = "#" + id + " " + (r.batch.file_name || "") + (r.batch.status === "DRAFT" ? " — 미리보기 (아직 사이트에 반영 안 됨)" : "");
      $("#publishBtn").hidden = r.batch.status === "DISCARDED";
      $("#publishBtn").textContent = r.batch.status === "PUBLISHED" ? "다시 반영" : "사이트 반영";
      $("#discardBtn").hidden = r.batch.status !== "DRAFT";
      $("#previewTable").innerHTML = '<tr><th>구분</th><th class="num">올린 행</th><th class="num">지금 사이트</th><th class="num">신규</th><th class="num">빠짐</th><th class="num">금액 변경</th><th class="num">트림 미연결</th></tr>' +
        Object.keys(s.kinds || {}).map(function (k) { var x = s.kinds[k];
          return '<tr><td>' + KIND[k] + '</td><td class="num">' + won(x.rows) + '</td><td class="num">' + won(x.published) + '</td><td class="num up">' + (x.added ? "+" + x.added : 0) + '</td><td class="num down">' + (x.removed ? "-" + x.removed : 0) + '</td><td class="num">' + x.changedPrice + '</td><td class="num">' + x.unlinked + '</td></tr>'; }).join("");
      $("#problems").innerHTML = (s.problems && s.problems.length) ? '<div class="problems"><b>확인이 필요한 행 ' + s.problemCount + '개' + (s.blockingErrors ? ' — 오류 행은 제외하고 올라갔습니다' : '') + '</b><br>' + s.problems.map(function (p) { return p.rowNo + "행: " + esc(p.errors.join(", ")); }).join("<br>") + '</div>' : "";
      renderUnlinked(r.rows);
    }).catch(function (er) { alert(er.message); });
  }
  function renderUnlinked(rows) {
    if (!rows.length) { $("#unlinked").innerHTML = '<p class="hint">모두 연결되었습니다.</p>'; return; }
    $("#unlinked").innerHTML = rows.slice(0, 300).map(function (r) {
      return '<div class="ul_row" data-kind="' + r.kind + '" data-rec="' + esc(r.rec_id) + '"><div><span class="pill">' + KIND[r.kind] + '</span> ' + esc(r.rec_id) + '</div>' +
        '<div class="car">' + esc(r.brand + " " + r.model) + '<small>' + esc(r.year) + ' · ' + esc(r.trim) + '</small></div>' +
        '<div class="picker"><input type="search" placeholder="트림 검색 (예: 그랜저 2.5 익스클루시브)" value="' + esc(r.brand + " " + r.model) + '"><div class="res" hidden></div>' +
        '<label><input type="checkbox" checked> 같은 차량(브랜드·모델·연식·등급) 모두 적용</label></div></div>';
    }).join("") + (rows.length > 300 ? '<p class="hint">처음 300개만 표시 — 연결 후 다시 열면 나머지가 나옵니다</p>' : "");
  }
  var searchTimer = null;
  $("#unlinked").addEventListener("input", function (e) {
    if (!e.target.matches(".picker input[type=search]")) return;
    var box = e.target.parentNode.querySelector(".res"); clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      if (e.target.value.trim().length < 2) { box.hidden = true; return; }
      api("/api/admin/trims?q=" + encodeURIComponent(e.target.value)).then(function (list) {
        box.innerHTML = list.length ? list.map(function (t) { return '<button type="button" data-trim="' + esc(t.trimId) + '">' + esc(t.label) + '</button>'; }).join("") : '<button type="button" disabled>검색 결과 없음 — 단어를 줄여 보세요</button>';
        box.hidden = false;
      });
    }, 250);
  });
  $("#unlinked").addEventListener("focusin", function (e) { if (e.target.matches(".picker input[type=search]") && e.target.value) e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  $("#unlinked").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-trim]"); if (!b) return;
    var row = b.closest(".ul_row"), pk = row.querySelector(".picker"), same = pk.querySelector("input[type=checkbox]").checked;
    api("/api/admin/batches/" + currentBatch.id + "/rows", { method: "PATCH", json: { kind: row.getAttribute("data-kind"), recId: row.getAttribute("data-rec"), trimId: b.getAttribute("data-trim"), applySame: same } })
      .then(function (r) { pk.innerHTML = '<span class="done">✔ ' + esc(r.trimLabel) + (r.applied > 1 ? ' (같은 차량 ' + r.applied + '건)' : '') + '</span>'; if (r.applied > 1) setTimeout(function () { openBatch(currentBatch.id); }, 600); })
      .catch(function (er) { alert(er.message); });
  });
  $("#publishBtn").addEventListener("click", function () {
    if (!currentBatch) return;
    var kinds = (currentBatch.kinds || []).map(function (k) { return KIND[k]; }).join("·");
    if (!confirm(kinds + " 데이터를 이 파일 내용으로 사이트에 반영할까요?")) return;
    api("/api/admin/batches/" + currentBatch.id + "/publish", { method: "POST" }).then(function () { loadQuotes(); openBatch(currentBatch.id); alert("사이트에 반영했습니다 (1분 안에 사이트에 보입니다)"); }).catch(function (er) { alert(er.message); });
  });
  $("#discardBtn").addEventListener("click", function () {
    if (!currentBatch || !confirm("이 업로드를 폐기할까요?")) return;
    api("/api/admin/batches/" + currentBatch.id + "/discard", { method: "POST" }).then(function () { $("#previewCard").hidden = true; loadHistory(); }).catch(function (er) { alert(er.message); });
  });

  // ---------------------------------------------------------------- 상담 문의
  var iqState = { status: "", q: "", page: 1 };
  function touch(t) {   // 광고 유입 표시: source / medium · campaign (클릭ID 로 매체 추정)
    t = t || {}; var src = t.source || (t.gclid ? "google" : t.fbclid ? "meta" : (t.n_media || t.n_ad) ? "naver" : t.kclid ? "kakao" : "");
    if (!src) return '<span class="hint">직접·알 수 없음</span>';
    return '<b>' + esc(src) + '</b>' + (t.medium ? ' / ' + esc(t.medium) : '') + (t.campaign ? '<br><small class="hint">' + esc(t.campaign) + (t.term ? ' · ' + esc(t.term) : '') + '</small>' : '');
  }
  function loadInquiries() {
    var qs = "?page=" + iqState.page + (iqState.status ? "&status=" + iqState.status : "") + (iqState.q ? "&q=" + encodeURIComponent(iqState.q) : "");
    api("/api/admin/inquiries" + qs).then(function (r) {
      var L = r.statusLabels, total = 0; Object.keys(r.counts).forEach(function (k) { total += r.counts[k]; });
      $("#newBadge").hidden = !r.counts.NEW; $("#newBadge").textContent = r.counts.NEW || "";
      $("#statusChips").innerHTML = '<button data-st="" class="' + (iqState.status ? "" : "on") + '">전체 ' + total + '</button>' + Object.keys(L).map(function (k) { return '<button data-st="' + k + '" class="' + (iqState.status === k ? "on" : "") + '">' + L[k] + ' ' + (r.counts[k] || 0) + '</button>'; }).join("");
      $("#iqTable").innerHTML = '<tr><th>#</th><th>접수</th><th>상태</th><th>차량</th><th>조건</th><th>유입</th><th class="num">월 납입금</th><th>메모</th></tr>' + (r.rows.length ? r.rows.map(function (x) {
        var c = x.conditions || {}, cond = [c.product, c.term ? c.term + "개월" : "", PLAN[c.plan] || "", c.dist ? c.dist + "만 km" : ""].filter(Boolean).join(" · ");
        return '<tr><td>' + x.id + '</td><td>' + dt(x.created_at) + '<br><small class="hint">' + (x.kind ? KIND[x.kind] : x.source === "GUIDE" ? "일반 상담" : "") + (x.rec_id ? " " + esc(x.rec_id) : "") + '</small></td>' +
          '<td><select data-id="' + x.id + '" class="st-' + x.status + '">' + Object.keys(L).map(function (k) { return '<option value="' + k + '"' + (k === x.status ? " selected" : "") + '>' + L[k] + '</option>'; }).join("") + '</select></td>' +
          '<td class="car"><strong>' + esc(x.car_name || "-") + ' ' + esc(x.trim_name) + '</strong>' + esc(x.spec) + (x.options && x.options.length ? '<br><small class="hint">옵션: ' + esc(x.options.join(", ")) + '</small>' : '') + (x.color ? '<br><small class="hint">색상: ' + esc(x.color) + '</small>' : '') + (x.page_url ? '<br><a href="' + esc(x.page_url) + '" target="_blank" rel="noopener">페이지 열기</a>' : '') + '</td>' +
          '<td>' + esc(cond) + '</td><td>' + touch(x.last_touch) + (x.first_touch && x.first_touch.source && x.first_touch.source !== (x.last_touch || {}).source ? '<br><small class="hint">처음: ' + touch(x.first_touch) + '</small>' : '') + '</td><td class="num">' + (x.monthly ? won(x.monthly) + "원" : "별도문의") + '</td>' +
          '<td><textarea data-memo="' + x.id + '" rows="2" placeholder="상담 메모">' + esc(x.memo) + '</textarea></td></tr>';
      }).join("") : '<tr><td colspan="8" class="hint">문의가 없습니다</td></tr>');
      var pages = Math.ceil(r.total / r.size);
      $("#iqPager").innerHTML = pages > 1 ? Array.from({ length: Math.min(pages, 20) }, function (_, i) { return '<button class="btn sm' + (i + 1 === r.page ? " primary" : "") + '" data-page="' + (i + 1) + '">' + (i + 1) + '</button>'; }).join("") : "";
    }).catch(function () {});
  }
  $("#statusChips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; iqState.status = b.getAttribute("data-st"); iqState.page = 1; loadInquiries(); });
  $("#iqPager").addEventListener("click", function (e) { var p = e.target.getAttribute("data-page"); if (p) { iqState.page = +p; loadInquiries(); } });
  var sTimer = null; $("#iqSearch").addEventListener("input", function (e) { clearTimeout(sTimer); sTimer = setTimeout(function () { iqState.q = e.target.value.trim(); iqState.page = 1; loadInquiries(); }, 300); });
  $("#iqTable").addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-id"); if (!id) return;
    api("/api/admin/inquiries/" + id, { method: "PATCH", json: { status: e.target.value } }).then(function () { e.target.className = "st-" + e.target.value; loadInquiries(); }).catch(function (er) { alert(er.message); });
  });
  $("#iqTable").addEventListener("focusout", function (e) {
    var id = e.target.getAttribute("data-memo"); if (!id || e.target.value === e.target.defaultValue) return;
    api("/api/admin/inquiries/" + id, { method: "PATCH", json: { memo: e.target.value } }).then(function () { e.target.defaultValue = e.target.value; e.target.style.borderColor = "#18a85c"; }).catch(function (er) { alert(er.message); });
  });
  setInterval(function () { if (!$("#appView").hidden) loadInquiries(); }, 60000);   // 새 문의 배지 1분마다 갱신

  // 다른 화면 모듈(admin-vm.js · admin-qedit.js)에서 같이 쓰는 도구
  window.CHAQ_ADMIN = { api: api, esc: esc, won: won, dt: dt, $: $, $$: $$, KIND: KIND, reloadQuotes: loadQuotes, openBatch: openBatch };
  api("/api/admin/me").then(showApp).catch(showLogin);
})();
