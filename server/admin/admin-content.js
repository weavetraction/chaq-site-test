/* 차큐 관리자 — 콘텐츠: 자주 묻는 질문(카테고리) · 이용후기 · 이벤트 · 아티클
   저장하면 1분 안에 사이트에 반영됩니다. '노출'을 끄면 사이트에서 숨김. 순서는 ▲▼ 로 (사이트에 보이는 순서) */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN; if (!A) return;
  var api = A.api, esc = A.esc, dt = A.dt, $ = A.$, $$ = A.$$;
  if (!$("#ctRoot")) return;
  var KO = { faq: "자주 묻는 질문", review: "이용후기", event: "이벤트", article: "아티클" };
  var S = { kind: "faq", items: [], cats: [], catFilter: "" };
  var toast = function (m, bad) { var t = $("#vmToast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(function () { t.className = "toast"; }, 2600); };
  var fail = function (er) { toast(er.message || String(er), true); };
  var imgSrc = function (u) { return !u ? "" : /^(https?:|\/|data:)/.test(u) ? u : "/" + String(u).replace(/^(\.\.\/)+/, ""); };   // 관리자 화면 미리보기용 (사이트 경로 → 절대 경로)
  var strip = function (h) { var d = document.createElement("div"); d.innerHTML = h || ""; return (d.textContent || "").replace(/\s+/g, " ").trim(); };

  $("#ctTabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-k]"); if (!b) return;
    S.kind = b.getAttribute("data-k"); S.catFilter = "";
    $$("#ctTabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
    load();
  });
  function load() {
    return api("/api/admin/content/" + S.kind).then(function (r) { S.items = r.items; S.cats = r.cats; render(); }).catch(fail);
  }
  function summary(it) {
    var d = it.data;
    if (S.kind === "faq") { var c = S.cats.filter(function (x) { return x.id === d.cat; })[0]; return '<span class="pill">' + esc(c ? c.name : "분류 없음") + '</span> <b>' + esc(d.q) + '</b><br><small class="hint">' + esc(strip(d.a).slice(0, 90)) + '</small>'; }
    if (S.kind === "review") return (d.photos && d.photos[0] ? '<img class="ct_thumb" src="' + esc(imgSrc(d.photos[0])) + '" alt="">' : '') + '<b>' + esc(d.name) + '</b> ' + "★★★★★".slice(0, d.stars) + ' · ' + esc(d.car || "") + ' ' + esc(d.trim || "") + (d.trimId || d.modelId ? ' <span class="pill live">차량 연결</span>' : '') + '<br><small class="hint">' + esc(String(d.text || "").slice(0, 90)) + '</small>';
    if (S.kind === "event") {
      var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), end = d.forceEnd || (d.end && d.end < today);
      return (d.img ? '<img class="ct_thumb" src="' + esc(imgSrc(d.img)) + '" alt="">' : '') + '<span class="pill ' + (end ? "" : "live") + '">' + (end ? "종료" : "진행중") + '</span> <b>' + esc(d.title) + '</b><br><small class="hint">' + esc(d.periodText || ((d.start || "") + " ~ " + (d.end || ""))) + '</small>';
    }
    return (d.img ? '<img class="ct_thumb" src="' + esc(imgSrc(d.img)) + '" alt="">' : '') + '<span class="pill">' + esc(d.cat || "") + '</span> <b>' + esc(d.title) + '</b><br><small class="hint">' + esc(d.date || "") + ' · ' + esc(String(d.lead || "").slice(0, 70)) + '</small>';
  }
  function render() {
    var rows = S.items.filter(function (it) { return !S.catFilter || it.data.cat === S.catFilter; });
    var catBar = S.kind === "faq" ? '<div class="chips" id="ctCats"><button data-c="" class="' + (S.catFilter ? "" : "on") + '">전체 ' + S.items.length + '</button>' + S.cats.map(function (c) { var n = S.items.filter(function (it) { return it.data.cat === c.id; }).length; return '<button data-c="' + esc(c.id) + '" class="' + (S.catFilter === c.id ? "on" : "") + '">' + esc(c.name) + ' ' + n + '</button>'; }).join("") + '</div>' : '';
    $("#ctBody").innerHTML =
      '<div class="row between wrap"><div class="hint">' + KO[S.kind] + ' ' + S.items.length + '개 · 사이트 노출 ' + S.items.filter(function (i) { return i.visible; }).length + '개 — 위에서부터 사이트에 보이는 순서입니다' + (S.kind === "review" ? ' (메인 화면에는 위에서 5개)' : '') + '</div>' +
      '<div class="row gap">' + (S.kind === "faq" || S.kind === "article" ? '<button class="btn" id="ctCatMng">' + (S.kind === "faq" ? "카테고리" : "분류") + ' 관리</button>' : '') + '<button class="btn primary" id="ctNew">+ 새로 등록</button></div></div>' + catBar +
      '<table class="tbl ct"><tr><th style="width:70px">순서</th><th>내용</th><th style="width:70px">노출</th><th style="width:100px">수정일</th><th style="width:120px"></th></tr>' +
      (rows.length ? rows.map(function (it) {
        return '<tr class="' + (it.visible ? "" : "off") + '"><td><button class="btn sm" data-up="' + esc(it.id) + '">▲</button><button class="btn sm" data-down="' + esc(it.id) + '">▼</button></td><td>' + summary(it) + '</td>' +
          '<td><label class="switch"><input type="checkbox" data-vis="' + esc(it.id) + '"' + (it.visible ? " checked" : "") + '><span></span></label></td><td><small>' + dt(it.updated_at) + '</small></td>' +
          '<td class="row gap"><button class="btn sm" data-edit="' + esc(it.id) + '">수정</button><button class="btn sm danger" data-del="' + esc(it.id) + '">삭제</button></td></tr>';
      }).join("") : '<tr><td colspan="5" class="hint">등록된 항목이 없습니다</td></tr>') + '</table>';
    $("#ctNew").onclick = function () { edit(null); };
    var cm = $("#ctCatMng"); if (cm) cm.onclick = manageCats;
    var cb = $("#ctCats"); if (cb) cb.onclick = function (e) { var b = e.target.closest("button[data-c]"); if (!b) return; S.catFilter = b.getAttribute("data-c"); render(); };
  }
  $("#ctBody").addEventListener("click", function (e) {
    var t = e.target, id;
    if ((id = t.getAttribute("data-edit"))) edit(id);
    if ((id = t.getAttribute("data-del")) && confirm("삭제할까요? 사이트에서도 바로 사라집니다.")) api("/api/admin/content/" + S.kind + "/" + encodeURIComponent(id), { method: "DELETE" }).then(function () { toast("삭제됨"); load(); }).catch(fail);
    var up = t.getAttribute("data-up"), dn = t.getAttribute("data-down");
    if (up || dn) {
      var ids = S.items.map(function (x) { return x.id; }), i = ids.indexOf(up || dn), j = up ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
      api("/api/admin/content/" + S.kind + "/reorder", { method: "POST", json: { ids: ids } }).then(load).catch(fail);
    }
  });
  $("#ctBody").addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-vis"); if (!id) return;
    api("/api/admin/content/" + S.kind + "/" + encodeURIComponent(id) + "/visible", { method: "PATCH", json: { visible: e.target.checked } }).then(function () { toast(e.target.checked ? "사이트에 노출합니다" : "사이트에서 숨겼습니다"); load(); }).catch(fail);
  });

  // ---------------------------------------------------------------- 분류 관리
  function manageCats() {
    var ck = S.kind, m = $("#ctModal");
    $("#ctModalTitle").textContent = (ck === "faq" ? "자주 묻는 질문 카테고리" : "아티클 분류") + " 관리";
    var draw = function () {
      $("#ctModalBody").innerHTML = '<p class="hint">순서는 사이트 탭 순서입니다.' + (ck === "faq" ? ' 질문이 있는 카테고리는 지울 수 없습니다.' : '') + '</p>' + S.cats.map(function (c, i) {
        return '<div class="row gap cat_line"><button class="btn sm" data-cu="' + i + '">▲</button><button class="btn sm" data-cd="' + i + '">▼</button><input value="' + esc(c.name) + '" data-cn="' + esc(c.id) + '"><button class="btn sm danger" data-cx="' + esc(c.id) + '">삭제</button></div>';
      }).join("") + '<div class="row gap cat_line"><input id="ctCatNew" placeholder="새 ' + (ck === "faq" ? "카테고리" : "분류") + ' 이름"><button class="btn sm" id="ctCatAdd">추가</button></div>';
    };
    draw(); m.hidden = false; $("#ctModalSave").textContent = "닫기";
    $("#ctModalSave").onclick = function () { m.hidden = true; $("#ctModalSave").textContent = "저장"; load(); };
    var reload = function () { return api("/api/admin/content/" + ck).then(function (r) { S.cats = r.cats; S.items = r.items; draw(); }); };
    $("#ctModalBody").onclick = function (e) {
      var t = e.target, v;
      if (t.id === "ctCatAdd") { var n = $("#ctCatNew").value.trim(); if (!n) return; api("/api/admin/content-cats/" + ck, { method: "POST", json: { name: n } }).then(reload).catch(fail); }
      if ((v = t.getAttribute("data-cx")) && confirm("삭제할까요?")) api("/api/admin/content-cats/" + ck + "/" + encodeURIComponent(v), { method: "DELETE" }).then(reload).catch(fail);
      var u = t.getAttribute("data-cu"), d = t.getAttribute("data-cd");
      if (u != null || d != null) {
        var ids = S.cats.map(function (c) { return c.id; }), i = +(u != null ? u : d), j = u != null ? i - 1 : i + 1; if (j < 0 || j >= ids.length) return;
        var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
        api("/api/admin/content-cats/" + ck + "/reorder", { method: "POST", json: { ids: ids } }).then(reload).catch(fail);
      }
    };
    $("#ctModalBody").onchange = function (e) { var id = e.target.getAttribute("data-cn"); if (!id) return; api("/api/admin/content-cats/" + ck + "/" + encodeURIComponent(id), { method: "PUT", json: { name: e.target.value } }).then(function () { toast("이름을 바꿨습니다"); reload(); }).catch(fail); };
  }

  // ---------------------------------------------------------------- 이미지 올리기 (공통)
  function upload(files, purpose) {
    var fd = new FormData(); fd.append("purpose", purpose); [].forEach.call(files, function (f) { fd.append("files", f); });
    toast("올리는 중…");
    return api("/api/admin/media", { method: "POST", body: fd });
  }
  function imageField(name, label, val, purpose) {
    return '<label class="wide"><span>' + label + '</span><div class="img_field" data-img-field="' + name + '" data-purpose="' + purpose + '"><img src="' + esc(imgSrc(val)) + '" alt=""' + (val ? "" : " hidden") + '><input type="hidden" name="' + name + '" value="' + esc(val || "") + '"><span class="row gap"><span class="btn sm">이미지 올리기<input type="file" accept="image/*" hidden></span>' + (val ? '<button type="button" class="btn sm link" data-img-clear>지우기</button>' : '') + '</span></div></label>';
  }
  function bindImageFields(el) {
    $$("[data-img-field]", el).forEach(function (box) {
      var inp = $("input[type=hidden]", box), img = $("img", box), file = $("input[type=file]", box);
      $(".btn.sm", box).onclick = function () { file.click(); };
      file.onchange = function () { if (!file.files.length) return; upload(file.files, box.getAttribute("data-purpose")).then(function (u) { inp.value = u[0].url; img.src = u[0].url; img.hidden = false; toast("이미지를 올렸습니다 — 저장을 눌러야 반영됩니다"); }).catch(fail); };
      var clr = $("[data-img-clear]", box); if (clr) clr.onclick = function () { inp.value = ""; img.hidden = true; };
    });
  }

  // ---------------------------------------------------------------- 글 + 이미지 편집기
  function editorHtml(name, html) {
    return '<div class="rte" data-rte="' + name + '"><div class="rte_bar">' +
      '<button type="button" data-cmd="h3" title="소제목">소제목</button><button type="button" data-cmd="p" title="본문">본문</button><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="insertUnorderedList">• 목록</button><button type="button" data-cmd="insertOrderedList">1. 목록</button>' +
      '<button type="button" data-cmd="link">링크</button><button type="button" data-cmd="image">이미지</button><button type="button" data-cmd="insertHorizontalRule">구분선</button><button type="button" data-cmd="removeFormat">서식 지우기</button><input type="file" accept="image/*" multiple hidden></div>' +
      '<div class="rte_body" contenteditable="true">' + (html || "<p><br></p>") + '</div></div>';
  }
  function bindEditor(el) {
    $$("[data-rte]", el).forEach(function (box) {
      var body = $(".rte_body", box), file = $("input[type=file]", box), range = null;
      try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
      var save = function () { var s = window.getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
      var restore = function () { body.focus(); if (range) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(range); } };
      body.addEventListener("keyup", save); body.addEventListener("mouseup", save); body.addEventListener("blur", save);
      body.addEventListener("paste", function (e) {   // 붙여넣기: 다른 사이트 서식은 버리고 글자만 (줄 단위 문단)
        e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text/plain");
        var html = t.split(/\r?\n/).map(function (l) { return l.trim() ? "<p>" + esc(l) + "</p>" : ""; }).join("");
        document.execCommand("insertHTML", false, html || esc(t));
      });
      $(".rte_bar", box).addEventListener("mousedown", function (e) { if (e.target.closest("button")) e.preventDefault(); });
      $(".rte_bar", box).addEventListener("click", function (e) {
        var b = e.target.closest("button[data-cmd]"); if (!b) return; var c = b.getAttribute("data-cmd"); restore();
        if (c === "h3" || c === "p") document.execCommand("formatBlock", false, c);
        else if (c === "link") { var u = prompt("링크 주소 (https://… 또는 사이트 페이지 예: special-price-car__list.html)", "https://"); if (u) document.execCommand("createLink", false, u); }
        else if (c === "image") file.click();
        else document.execCommand(c, false, null);
        save();
      });
      file.onchange = function () {
        if (!file.files.length) return;
        upload(file.files, box.closest("[data-purpose-scope]") ? box.closest("[data-purpose-scope]").getAttribute("data-purpose-scope") : "etc").then(function (ups) {
          restore(); document.execCommand("insertHTML", false, ups.map(function (u) { return '<p><img src="' + u.url + '" alt=""></p>'; }).join("")); save(); file.value = ""; toast("이미지를 넣었습니다");
        }).catch(fail);
      };
    });
  }
  var rteValue = function (el, name) { var b = $('[data-rte="' + name + '"] .rte_body', el); return b ? b.innerHTML : ""; };

  // ---------------------------------------------------------------- 등록·수정 팝업
  function edit(id) {
    var it = id ? S.items.filter(function (x) { return x.id === id; })[0] : null, d = it ? it.data : {};
    var m = $("#ctModal"), body = $("#ctModalBody"), k = S.kind;
    $("#ctModalTitle").textContent = KO[k] + (it ? " 수정" : " 등록");
    $("#ctModalSave").textContent = "저장";
    var legacy = (k === "event" || k === "article") && !d.html && (d.body || []).length ? d.body.map(function (b) { return "<h3>" + esc(b.h) + "</h3><p>" + esc(b.p) + "</p>"; }).join("") : null;
    var html = '<div class="fgrid" data-purpose-scope="' + k + '">';
    if (k === "faq") {
      html += '<label><span>카테고리</span><select name="cat">' + S.cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + ((d.cat || S.catFilter) === c.id ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("") + '</select></label>' +
        '<label class="wide"><span>질문</span><input name="q" value="' + esc(d.q || "") + '"></label>' +
        '<label class="wide"><span>답변 (첫 문단은 메인 화면 요약으로도 쓰입니다)</span>' + editorHtml("a", d.a) + '</label>';
    } else if (k === "review") {
      html += '<label><span>고객 표시 이름</span><input name="name" value="' + esc(d.name || "") + '" placeholder="홍**님"></label>' +
        '<label><span>별점</span><select name="stars">' + [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '"' + ((d.stars || 5) === n ? " selected" : "") + '>' + "★★★★★".slice(0, n) + '</option>'; }).join("") + '</select></label>' +
        '<label><span>작성일</span><input type="date" name="date" value="' + esc(d.date || "") + '"></label>' +
        '<label class="wide"><span>출고 차량 — 차량 데이터에서 고르면 차량 상세 하단 후기와 연결됩니다</span><div class="picker"><div class="done" id="ctCar">' + (d.trimId || d.modelId ? "✔ 연결됨 · " : "") + esc((d.car || "") + " " + (d.trim || "")) + '</div><input type="search" id="ctCarQ" placeholder="트림 검색 (예: 팰리세이드 캘리그래피)"><div class="res" hidden id="ctCarRes"></div></div></label>' +
        '<label><span>차량명 (표시)</span><input name="car" value="' + esc(d.car || "") + '"></label><label><span>등급 (표시)</span><input name="trim" value="' + esc(d.trim || "") + '"></label>' +
        '<input type="hidden" name="modelId" value="' + esc(d.modelId || "") + '"><input type="hidden" name="trimId" value="' + esc(d.trimId || "") + '">' +
        '<label class="wide"><span>후기 내용</span><textarea name="text" rows="8">' + esc(d.text || "") + '</textarea></label>' +
        '<label class="wide"><span>사진 (여러 장, 첫 장이 대표)</span><div class="photos" id="ctPhotos"></div><span class="btn sm" id="ctPhotoBtn">+ 사진 올리기<input type="file" accept="image/*" multiple hidden id="ctPhotoFile"></span></label>';
    } else if (k === "event") {
      html += '<label class="wide"><span>제목</span><input name="title" value="' + esc(d.title || "") + '"></label>' +
        '<label><span>시작일</span><input type="date" name="start" value="' + esc(d.start || "") + '"></label><label><span>종료일 (비우면 계속)</span><input type="date" name="end" value="' + esc(d.end || "") + '"></label>' +
        '<label><span>기간 문구 (선택 · 예: 상시 진행)</span><input name="periodText" value="' + esc(d.periodText || "") + '"></label>' +
        '<label><span>상태</span><select name="forceEnd"><option value="">기간에 따라 자동 (종료일 지나면 종료)</option><option value="1"' + (d.forceEnd ? " selected" : "") + '>지금 종료 처리</option></select></label>' +
        imageField("img", "대표 이미지 (목록·상단)", d.img, "event") +
        '<label class="wide"><span>요약 문구</span><textarea name="lead" rows="2">' + esc(d.lead || "") + '</textarea></label>' +
        '<label class="wide"><span>본문</span>' + editorHtml("html", d.html || legacy) + '</label>' +
        '<label><span>버튼 문구</span><input name="cta" value="' + esc(d.cta || "") + '" placeholder="차량 보러가기"></label><label><span>버튼 링크 (비우면 재고특가 목록)</span><input name="ctaHref" value="' + esc(d.ctaHref || "") + '" placeholder="special-price-car__list.html"></label>';
    } else {
      html += '<label class="wide"><span>제목</span><input name="title" value="' + esc(d.title || "") + '"></label>' +
        '<label><span>분류</span><select name="cat"><option value="">-</option>' + S.cats.map(function (c) { return '<option' + (d.cat === c.name ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("") + '</select></label>' +
        '<label><span>게시일</span><input type="date" name="date" value="' + esc(d.date || "") + '"></label>' +
        imageField("img", "대표 이미지 (목록·상단)", d.img, "article") +
        '<label class="wide"><span>요약 문구</span><textarea name="lead" rows="2">' + esc(d.lead || "") + '</textarea></label>' +
        '<label class="wide"><span>본문</span>' + editorHtml("html", d.html || legacy) + '</label>';
    }
    html += '</div>' + (legacy ? '<p class="hint">이 글은 예전 형식이라 편집기 형식으로 바꿔 열었습니다. 저장하면 이 형식으로 바뀝니다.</p>' : '');
    body.innerHTML = html; m.hidden = false; body.onclick = null; body.onchange = null;
    bindImageFields(body); bindEditor(body);
    if (k === "review") bindReview(body, d);
    $("#ctModalSave").onclick = function () {
      var g = function (n) { var e = $("[name=" + n + "]", body); return e ? e.value.trim() : undefined; }, out = {};
      if (k === "faq") out = { cat: g("cat"), q: g("q"), a: rteValue(body, "a") };
      else if (k === "review") out = { name: g("name"), stars: +g("stars"), date: g("date"), car: g("car"), trim: g("trim"), modelId: g("modelId"), trimId: g("trimId"), text: $("[name=text]", body).value, photos: S.photos.slice() };
      else if (k === "event") out = { title: g("title"), start: g("start"), end: g("end"), periodText: g("periodText"), forceEnd: !!g("forceEnd"), img: g("img"), lead: g("lead"), html: rteValue(body, "html"), cta: g("cta"), ctaHref: g("ctaHref") };
      else out = { title: g("title"), cat: g("cat"), date: g("date"), img: g("img"), lead: g("lead"), html: rteValue(body, "html") };
      (it ? api("/api/admin/content/" + k + "/" + encodeURIComponent(it.id), { method: "PUT", json: out }) : api("/api/admin/content/" + k, { method: "POST", json: out }))
        .then(function () { m.hidden = true; toast("저장했습니다 — 1분 안에 사이트에 보입니다"); load(); }).catch(fail);
    };
  }
  function bindReview(body, d) {
    S.photos = (d.photos || []).slice();
    var drawPhotos = function () {
      $("#ctPhotos").innerHTML = S.photos.map(function (u, i) { return '<span class="ph"><img src="' + esc(imgSrc(u)) + '" alt=""><button type="button" class="btn sm" data-pl="' + i + '">◀</button><button type="button" class="btn sm danger" data-px="' + i + '">×</button></span>'; }).join("") || '<span class="hint">사진 없음</span>';
    };
    drawPhotos();
    $("#ctPhotoBtn").onclick = function (e) { if (e.target.id !== "ctPhotoFile") $("#ctPhotoFile").click(); };
    $("#ctPhotoFile").onchange = function () { if (!this.files.length) return; var f = this; upload(f.files, "review").then(function (ups) { ups.forEach(function (u) { S.photos.push(u.url); }); drawPhotos(); f.value = ""; toast("사진을 올렸습니다 — 저장을 눌러야 반영됩니다"); }).catch(fail); };
    $("#ctPhotos").onclick = function (e) {
      var x = e.target.getAttribute("data-px"), l = e.target.getAttribute("data-pl");
      if (x != null) { S.photos.splice(+x, 1); drawPhotos(); }
      if (l != null && +l > 0) { var t = S.photos[+l]; S.photos[+l] = S.photos[+l - 1]; S.photos[+l - 1] = t; drawPhotos(); }
    };
    var tm = null;
    $("#ctCarQ").oninput = function () {
      var v = this.value.trim(), box = $("#ctCarRes"); clearTimeout(tm);
      tm = setTimeout(function () {
        if (v.length < 2) { box.hidden = true; return; }
        api("/api/admin/vm/search?q=" + encodeURIComponent(v)).then(function (list) {
          box.innerHTML = list.length ? list.slice(0, 30).map(function (t) { return '<button type="button" data-trim="' + esc(t.trimId) + '" data-car="' + esc(t.brand + " " + t.model) + '" data-tn="' + esc(t.trim) + '">' + esc([t.brand, t.model, t.modelYear, t.lineup, t.trim].join(" · ")) + '</button>'; }).join("") : '<button type="button" disabled>결과 없음</button>';
          box.hidden = false;
        }).catch(fail);
      }, 250);
    };
    $("#ctCarRes").onclick = function (e) {
      var b = e.target.closest("button[data-trim]"); if (!b) return; this.hidden = true;
      var tid = b.getAttribute("data-trim");
      api("/api/admin/vm/trim/" + encodeURIComponent(tid)).then(function (bd) {
        $("[name=trimId]", body).value = tid; $("[name=modelId]", body).value = bd.model.id;
        $("[name=car]", body).value = b.getAttribute("data-car"); $("[name=trim]", body).value = b.getAttribute("data-tn");
        $("#ctCar").textContent = "✔ 연결됨 · " + b.getAttribute("data-car") + " " + b.getAttribute("data-tn"); $("#ctCarQ").value = "";
      }).catch(fail);
    };
  }
  $("#ctModalClose").addEventListener("click", function () { $("#ctModal").hidden = true; });

  var started = false;
  document.addEventListener("chaq:tab", function (e) { if (e.detail === "content" && !started) { started = true; load(); } });
})();
