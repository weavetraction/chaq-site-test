/* 차큐 관리자 — 견적 데이터 화면 수정 (페이지별: 견적조회 · 재고특가 · 빠른인도)
   현재 사이트 데이터를 복사한 '작업본'에서 행을 추가·수정·삭제 → [사이트 반영]
   · 브랜드·모델·등급명은 차량 데이터(마스터) 기준 — 차량(트림)을 고르면 자동
   · 옵션·색상: 여기 입력하면 견적 기준, 비워두면 사이트가 차량 데이터의 옵션·색상을 보여줌 */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN; if (!A) return;
  var api = A.api, esc = A.esc, won = A.won, dt = A.dt, $ = A.$, $$ = A.$$, KIND = A.KIND;
  if (!$("#qeRoot")) return;
  var DISTS = ["1", "2", "3"], TERMS = ["36", "48", "60"], PLANS = [["0", "0원"], ["b", "보증금 30%"], ["s", "선납금 30%"]];
  var INCL = [["tint", "선팅"], ["blackbox", "블박"], ["delivery", "탁송"]];
  var S = { kind: "stock", batch: null, rows: [], filter: "" };
  var toast = function (m, bad) { var t = $("#vmToast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(function () { t.className = "toast"; }, 2600); };
  var fail = function (er) { toast(er.message || String(er), true); };
  var num = function (v) { v = String(v == null ? "" : v).replace(/[,\s원]/g, ""); return v === "" ? null : isNaN(Number(v)) ? v : Number(v); };   // 숫자가 아니면 그대로 보내 서버가 알려줌

  // 페이지 탭
  $("#qeTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-k]"); if (!b) return;
    S.kind = b.getAttribute("data-k"); $$("#qeTabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
    S.batch = null; renderIdle();
  });
  function renderIdle() {
    $("#qeBody").innerHTML = '<p class="hint">' + KIND[S.kind] + ' 페이지 데이터를 화면에서 고치려면 [수정 시작] 을 누르세요. 지금 사이트 데이터를 복사한 작업본이 만들어지고, [사이트 반영] 전까지 사이트는 그대로입니다.</p>' +
      '<div class="row gap"><button class="btn primary" id="qeStart">수정 시작</button><a class="btn" href="/api/admin/quotes/export.xlsx?kinds=' + S.kind + '">' + KIND[S.kind] + ' 엑셀 받기</a></div>';
    $("#qeStart").onclick = function () { start(false); };
  }
  function start(reset) {
    api("/api/admin/quotes/" + S.kind + "/draft", { method: "POST", json: { reset: !!reset } }).then(function (r) { S.batch = r.batchId; if (!r.created) toast("이어서 수정합니다 (작업본 #" + r.batchId + ")"); load(); }).catch(fail);
  }
  function load() {
    return api("/api/admin/batches/" + S.batch + "?kind=" + S.kind).then(function (r) { S.rows = r.rows; S.info = r.batch; render(); A.reloadQuotes(); });
  }
  function inclTxt(i) { if (!i) return '<span class="hint">기본</span>'; return INCL.map(function (x) { return i[x[0]] === false ? '<s class="hint">' + x[1] + '</s>' : (i[x[0]] ? '<b>' + x[1] + '</b>' : '<span class="hint">' + x[1] + '</span>'); }).join(" "); }
  function render() {
    var s = (S.info.summary.kinds || {})[S.kind] || {}, unl = S.rows.filter(function (r) { return !r.trim_id; }).length;
    var f = S.filter.toLowerCase();
    var rows = S.rows.filter(function (r) { return !f || [r.rec_id, r.brand, r.model, r.year, r.trim, r.ext, r.fin].join(" ").toLowerCase().indexOf(f) >= 0; });
    $("#qeBody").innerHTML =
      '<div class="row between wrap"><div><b>작업본 #' + S.batch + '</b> · ' + KIND[S.kind] + ' ' + S.rows.length + '대 <small class="hint">(사이트 ' + (s.published || 0) + '대 · 신규 ' + (s.added || 0) + ' · 빠짐 ' + (s.removed || 0) + ' · 금액 변경 ' + (s.changedPrice || 0) + ')</small>' +
      (unl ? ' <b class="down">· 차량 미연결 ' + unl + '대 (반영 시 사이트에서 빠짐)</b>' : '') + '</div>' +
      '<div class="row gap"><input type="search" id="qeFilter" placeholder="차량·ID 검색" value="' + esc(S.filter) + '"><button class="btn" id="qeAdd">+ 차량 추가</button><button class="btn danger" id="qeReset">처음부터 (사이트 데이터로)</button><button class="btn primary" id="qePub">사이트 반영</button></div></div>' +
      '<div class="tbl_wrap"><table class="tbl qe"><tr><th>ID</th><th>차량 (차량 데이터 기준)</th><th>연식/사양</th><th>색상</th>' + (S.kind !== "estimate" ? '<th class="num">재고</th>' : '') + '<th class="num">차량가</th><th class="num">최저 월</th><th class="num">옵션</th><th>포함</th><th></th></tr>' +
      rows.map(function (r) {
        return '<tr class="' + (r.trim_id ? "" : "unl") + '"><td>' + esc(r.rec_id) + '</td><td>' + (r.trim_id ? '<b>' + esc(r.brand + " " + r.model) + '</b> ' + esc(r.trim) : '<b class="down">미연결</b> <small>' + esc(r.brand + " " + r.model + " " + r.trim) + '</small>') + '</td><td><small>' + esc(r.year) + '</small></td><td><small>' + esc([r.ext, r.int].filter(Boolean).join(" / ") || "차량 데이터 기준") + '</small></td>' +
          (S.kind !== "estimate" ? '<td class="num">' + (r.rem == null ? "" : r.rem) + '</td>' : '') + '<td class="num">' + won(r.base) + '</td><td class="num">' + won(r.min_monthly) + '</td><td class="num">' + (r.opt_count || '<span class="hint">마스터</span>') + '</td><td>' + inclTxt(r.incl) + '</td>' +
          '<td class="row gap"><button class="btn sm" data-edit="' + esc(r.rec_id) + '">수정</button><button class="btn sm danger" data-del="' + esc(r.rec_id) + '">삭제</button></td></tr>';
      }).join("") + '</table></div>';
    $("#qeFilter").oninput = function () { S.filter = this.value; var p = this.selectionStart; render(); var el = $("#qeFilter"); el.focus(); el.setSelectionRange(p, p); };
    $("#qeAdd").onclick = function () { edit(null); };
    $("#qeReset").onclick = function () { if (confirm("작업본에서 고친 내용을 버리고 지금 사이트 데이터로 다시 시작할까요?")) start(true); };
    $("#qePub").onclick = function () {
      if (!confirm(KIND[S.kind] + " 페이지를 이 작업본으로 반영할까요?" + (unl ? "\n\n⚠ 차량(트림) 미연결 " + unl + "대는 사이트에서 빠집니다." : ""))) return;
      api("/api/admin/batches/" + S.batch + "/publish", { method: "POST" }).then(function () { toast("반영했습니다 — 1분 안에 사이트에 보입니다"); S.batch = null; renderIdle(); A.reloadQuotes(); }).catch(fail);
    };
  }
  $("#qeBody").addEventListener("click", function (e) {
    var ed = e.target.getAttribute("data-edit"), del = e.target.getAttribute("data-del");
    if (ed) edit(ed);
    if (del && confirm(del + " 을(를) 삭제할까요?")) api("/api/admin/batches/" + S.batch + "/rows/" + S.kind + "/" + encodeURIComponent(del), { method: "DELETE" }).then(function () { toast("삭제됨"); load(); }).catch(fail);
  });

  // ---------------------------------------------------------------- 행 편집 팝업
  function edit(recId) {
    (recId ? api("/api/admin/batches/" + S.batch + "/rows/" + S.kind + "/" + encodeURIComponent(recId)) : Promise.resolve({ data: { opts: [], cost: {}, resid: {} }, trim_id: null, trimLabel: null })).then(function (row) {
      var r = row.data, m = $("#qeModal"), st = { trimId: row.trim_id, vm: null };
      $("#qeModalTitle").textContent = recId ? recId + " 수정" : KIND[S.kind] + " 차량 추가";
      var cell = function (name, v, ph) { return '<input class="num_in" name="' + name + '" value="' + (v == null ? "" : won(v)) + '" placeholder="' + (ph || "") + '">'; };
      var grid = '<table class="tbl cost"><tr><th>주행</th><th>기간</th>' + PLANS.map(function (p) { return '<th class="num">월 · ' + p[1] + '</th>'; }).join("") + '<th class="num">잔존가치</th></tr>' +
        DISTS.map(function (d) { return TERMS.map(function (t, i) { return '<tr>' + (i === 0 ? '<td rowspan="3"><b>' + d + '만 km</b></td>' : '') + '<td>' + t + '개월</td>' + PLANS.map(function (p) { return '<td>' + cell("c_" + d + "_" + t + "_" + p[0], ((r.cost || {})[d] || {})[t] && r.cost[d][t][p[0]]) + '</td>'; }).join("") + '<td>' + cell("r_" + d + "_" + t, ((r.resid || {})[d] || {})[t]) + '</td></tr>'; }).join(""); }).join("") + '</table>';
      $("#qeModalBody").innerHTML =
        '<div class="fgrid">' +
        '<label class="wide"><span>차량 (트림) — 브랜드·모델·등급명은 차량 데이터 기준</span><div class="picker"><div id="qeTrim" class="done">' + (row.trimLabel ? "✔ " + esc(row.trimLabel) : '<b class="down">미연결</b> ' + esc((r.brand || "") + " " + (r.model || "") + " " + (r.trim || ""))) + '</div><input type="search" id="qeTrimQ" placeholder="트림 검색 (예: 그랜저 2.5 익스클루시브)"><div class="res" hidden id="qeTrimRes"></div></div></label>' +
        '<label class="wide"><span>연식/사양 (사이트 표시용 문구)</span><input name="year" value="' + esc(r.year || "") + '" placeholder="2027년형 가솔린 2.5"></label>' +
        '<label><span>외장색 (비우면 차량 데이터 색상)</span><input name="ext" list="qeExtList" value="' + esc(r.ext || "") + '"><datalist id="qeExtList"></datalist></label>' +
        '<label><span>내장색</span><input name="int" list="qeIntList" value="' + esc(r["int"] || "") + '"><datalist id="qeIntList"></datalist></label>' +
        '<label><span>연료</span><input name="fuel" value="' + esc(r.fuel || "") + '"></label><label><span>차급</span><input name="seg" value="' + esc(r.seg || "") + '"></label>' +
        '<label><span>금융사</span><input name="fin" value="' + esc(r.fin || "") + '"></label>' +
        (S.kind !== "estimate" ? '<label><span>재고 수 (0 이면 목록에서 숨김)</span><input name="rem" inputmode="numeric" value="' + (r.rem == null ? "" : r.rem) + '"></label>' : '') +
        '<label><span>차량가 (원)</span><input name="base" class="num_in" value="' + (r.base == null ? "" : won(r.base)) + '" placeholder="차량 데이터 트림가 + 옵션"><small class="hint" id="qeListPrice"></small></label>' +
        '<label class="wide"><span>포함 사항 (사이트 상세의 선팅·블박·탁송 표시)</span><div class="row gap">' + INCL.map(function (x) { var v = (r.incl || {})[x[0]]; return '<select name="incl_' + x[0] + '"><option value="">' + x[1] + ' — 기본(포함)</option><option value="Y"' + (v === true ? " selected" : "") + '>' + x[1] + ' 포함</option><option value="N"' + (v === false ? " selected" : "") + '>' + x[1] + ' 미포함</option></select>'; }).join("") + '</div></label>' +
        '</div>' +
        '<div class="row between"><h3>장착 옵션 <small>— 비워두면 사이트가 차량 데이터의 선택 옵션(공식 가격)을 보여줍니다</small></h3><button type="button" class="btn sm" id="qeOptAdd">+ 옵션</button></div><datalist id="qeOptList"></datalist><div id="qeOpts"></div>' +
        '<h3>월 납입금 · 잔존가치 (원) <small>— 없는 조건은 비워두면 사이트에 \'별도문의\'</small></h3><div class="tbl_wrap">' + grid + '</div>';
      m.hidden = false;
      var optRow = function (o) { return '<div class="row gap opt_line"><input class="opt_n" list="qeOptList" value="' + esc(o.n || "") + '" placeholder="옵션명"><input class="num_in opt_p" value="' + (o.p ? won(o.p) : "") + '" placeholder="가격 (모르면 비움)"><button type="button" class="btn sm danger opt_x">×</button></div>'; };
      $("#qeOpts").innerHTML = (r.opts || []).map(optRow).join("");
      $("#qeOptAdd").onclick = function () { $("#qeOpts").insertAdjacentHTML("beforeend", optRow({})); };
      $("#qeOpts").onclick = function (e) { if (e.target.classList.contains("opt_x")) e.target.parentNode.remove(); };
      $("#qeOpts").oninput = function (e) {   // 차량 데이터 옵션명을 고르면 공식 가격 채움
        if (!e.target.classList.contains("opt_n") || !st.vm) return;
        var hit = st.vm.options.filter(function (x) { return x.option && x.option.name === e.target.value; })[0];
        var p = e.target.parentNode.querySelector(".opt_p"); if (hit && hit.price && !p.value) p.value = won(hit.price);
      };
      var loadVm = function () {
        if (!st.trimId) return;
        api("/api/admin/vm/trim/" + encodeURIComponent(st.trimId)).then(function (b) {
          st.vm = b;
          $("#qeExtList").innerHTML = b.colors.filter(function (x) { return x.type === "EXTERIOR" && x.color; }).map(function (x) { return '<option value="' + esc(x.color.name) + '">'; }).join("");
          $("#qeIntList").innerHTML = b.colors.filter(function (x) { return x.type === "INTERIOR" && x.color; }).map(function (x) { return '<option value="' + esc(x.color.name) + '">'; }).join("");
          $("#qeOptList").innerHTML = b.options.filter(function (x) { return x.option; }).map(function (x) { return '<option value="' + esc(x.option.name) + '">' + (x.price ? won(x.price) + "원" : "") + '</option>'; }).join("");
          $("#qeListPrice").textContent = b.trim.listPrice ? "차량 데이터 트림가 " + won(b.trim.listPrice) + "원" : "";
        }).catch(function () {});
      };
      loadVm();
      // 트림 검색
      var tm = null;
      $("#qeTrimQ").oninput = function () {
        var v = this.value.trim(), box = $("#qeTrimRes"); clearTimeout(tm);
        tm = setTimeout(function () {
          if (v.length < 2) { box.hidden = true; return; }
          api("/api/admin/trims?q=" + encodeURIComponent(v)).then(function (list) {
            box.innerHTML = list.length ? list.map(function (t) { return '<button type="button" data-trim="' + esc(t.trimId) + '" data-label="' + esc(t.label) + '">' + esc(t.label) + '</button>'; }).join("") : '<button type="button" disabled>검색 결과 없음</button>';
            box.hidden = false;
          });
        }, 250);
      };
      $("#qeTrimRes").onclick = function (e) {
        var b = e.target.closest("button[data-trim]"); if (!b) return;
        st.trimId = b.getAttribute("data-trim"); $("#qeTrim").innerHTML = "✔ " + esc(b.getAttribute("data-label")); this.hidden = true; $("#qeTrimQ").value = ""; loadVm();
      };
      $("#qeModalSave").onclick = function () {
        var body = $("#qeModalBody"), g = function (n) { var el = $("[name=" + n + "]", body); return el ? el.value.trim() : undefined; };
        var out = { trimId: st.trimId, year: g("year"), ext: g("ext"), "int": g("int"), fuel: g("fuel"), seg: g("seg"), fin: g("fin"), base: num(g("base")) };
        if (S.kind !== "estimate") out.rem = num(g("rem"));
        out.incl = {}; INCL.forEach(function (x) { var v = g("incl_" + x[0]); if (v) out.incl[x[0]] = v === "Y"; });
        out.opts = $$(".opt_line", body).map(function (l) { return { n: l.querySelector(".opt_n").value.trim(), p: num(l.querySelector(".opt_p").value) }; }).filter(function (o) { return o.n; });
        out.cost = {}; out.resid = {};
        DISTS.forEach(function (d) { TERMS.forEach(function (t) { PLANS.forEach(function (p) { var v = num(g("c_" + d + "_" + t + "_" + p[0])); if (v != null) ((out.cost[d] = out.cost[d] || {})[t] = out.cost[d][t] || {})[p[0]] = v; }); var rv = num(g("r_" + d + "_" + t)); if (rv != null) (out.resid[d] = out.resid[d] || {})[t] = rv; }); });
        var req = recId ? api("/api/admin/batches/" + S.batch + "/rows/" + S.kind + "/" + encodeURIComponent(recId), { method: "PUT", json: out }) : api("/api/admin/batches/" + S.batch + "/rows/" + S.kind, { method: "POST", json: out });
        req.then(function (res) { m.hidden = true; toast((recId ? "저장됨" : res.rec.id + " 추가됨") + " — [사이트 반영] 을 눌러야 사이트에 나갑니다"); load(); }).catch(fail);
      };
    }).catch(fail);
  }
  $("#qeModalClose").addEventListener("click", function () { $("#qeModal").hidden = true; });
  // 숫자 칸: 천 단위 쉼표
  document.addEventListener("change", function (e) { if (e.target.classList && e.target.classList.contains("num_in") && e.target.closest("#qeModal")) { var v = num(e.target.value); if (typeof v === "number") e.target.value = won(v); } });

  document.addEventListener("chaq:app", renderIdle);
})();
