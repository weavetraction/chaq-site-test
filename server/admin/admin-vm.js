/* 차큐 관리자 — 차량 데이터(마스터): 브랜드 → 모델 → 라인업 → 트림 편집 · 옵션/색상/이미지 · 엑셀 일괄 · 사이트 반영/되돌리기
   수정하면 '작업본'에 바로 저장되고, 위의 [사이트 반영] 을 눌러야 사이트에 나갑니다. */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN; if (!A) return;
  var api = A.api, esc = A.esc, won = A.won, dt = A.dt, $ = A.$, $$ = A.$$;
  var root = $("#vmRoot"); if (!root) return;

  var LABEL = {
    nameKo: "이름", nameEn: "영문명", country: "국가", domesticImport: "국산/수입", officialSite: "공식 사이트", status: "사이트 노출", sortOrder: "정렬 순서",
    brandId: "브랜드ID", bodyType: "차체", segment: "차급", familyKey: "묶음키 (후기 연결)", modelId: "모델ID", displayName: "라인업명", shortLabel: "짧은 이름 (목록·상세 표시)",
    generationName: "세대명", generationCode: "세대 코드", modelYear: "연식", fuelType: "연료", engineSummary: "엔진", salesChannel: "판매 채널", imageKey: "이미지 키",
    lineupId: "라인업ID", name: "이름", drivetrain: "구동", driveLabel: "구동 표시", seatCount: "인승", variantNote: "비고", listPrice: "트림 가격 (원, 옵션 제외)",
    listPriceBeforeTaxBenefit: "세제혜택 전 가격 (원)", listPriceBasis: "가격 기준", listPriceDate: "가격 기준일", standardItems: "기본 품목 (한 줄에 하나)",
    category: "분류", description: "설명", items: "구성 품목 (한 줄에 하나)", hex: "색상 코드 (#RRGGBB)", manufacturerCode: "제조사 색상 코드", kind: "종류",
    trimId: "트림ID", optionId: "옵션ID", price: "옵션 가격 (원)", type: "구분", dependencyNote: "선행 조건", exclusionNote: "동시 선택 불가",
    colorId: "색상ID", extraPrice: "추가 금액 (원)", note: "비고", imageUrl: "이미지 주소", thumbnailUrl: "썸네일 주소", colorKey: "색상 키", view: "보기 방향", author: "제작", license: "라이선스",
  };
  var SELECT = {
    domesticImport: [["DOMESTIC", "국산"], ["IMPORT", "수입"]],
    fuelType: [["GASOLINE", "가솔린"], ["DIESEL", "디젤"], ["LPG", "LPG"], ["HEV", "하이브리드"], ["PHEV", "플러그인 하이브리드"], ["EV", "전기"], ["FCEV", "수소"]],
    bodyType: [["SEDAN", "세단"], ["SUV", "SUV"], ["HATCHBACK", "해치백"], ["WAGON", "왜건"], ["COUPE", "쿠페"], ["CONVERTIBLE", "컨버터블"], ["MPV", "MPV"], ["VAN", "밴"], ["TRUCK", "트럭"]],
    salesChannel: [["GENERAL", "일반"], ["RENTAL", "렌터카"], ["COMMERCIAL", "영업용"], ["TAXI", "택시"]],
    category: [["PACKAGE", "패키지"], ["ITEM", "단품"], ["ACCESSORY", "액세서리"], ["WHEEL", "휠"], ["SEAT", "시트"], ["DRIVETRAIN", "구동"]],
    type: [["EXTERIOR", "외장"], ["INTERIOR", "내장"]],
    view: [["side", "측면"], ["front", "전면"], ["rear", "후면"], ["interior", "실내"]],
  };
  // 화면에서 숨기는 필드 (부모 ID 등 — 목록 이동으로 정해짐)
  var HIDE = { models: ["brandId"], lineups: ["modelId"], trims: ["lineupId"], options: ["modelId"], colors: ["brandId"] };
  var TITLE = { brands: "브랜드", models: "모델", lineups: "라인업", trims: "트림" };
  var NEXT = { brands: "models", models: "lineups", lineups: "trims" };
  var PARENT_FIELD = { models: "brandId", lineups: "modelId", trims: "lineupId" };

  var S = { fields: null, path: [], level: "brands", list: [], sel: null, loaded: false };   // path: [{level, item}]
  var imgSrc = function (u) { return !u ? "" : /^(https?:|\/|data:)/.test(u) ? u : "/" + u.replace(/^(\.\.\/)+/, ""); };
  var colorKeyOf = function (c) { if (!c) return ""; var k = c.manufacturerCode ? c.manufacturerCode : String(c.id || "").replace(/^[a-z-]+?-color-/, ""); return String(k).toLowerCase().replace(/[^a-z0-9-]+/g, "-"); };
  var nameOf = function (o) { return o.nameKo || o.shortLabel || o.displayName || o.name || o.id; };
  var toast = function (m, bad) { var t = $("#vmToast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(t._t); t._t = setTimeout(function () { t.className = "toast"; }, 2600); };
  var fail = function (er) { toast(er.message || String(er), true); };

  // ---------------------------------------------------------------- 상단: 현황 · 반영
  function loadStatus() {
    return api("/api/admin/vm/status").then(function (s) {
      S.fields = s.fields; var c = s.counts;
      $("#vmCounts").innerHTML = [["브랜드", c.brands], ["모델", c.models], ["라인업", c.lineups], ["트림", c.trims], ["옵션", c.options], ["색상", c.colors], ["이미지", c.vehicleImages]].map(function (x) { return '<span><b>' + won(x[1]) + '</b>' + x[0] + '</span>'; }).join("");
      $("#vmPending").innerHTML = s.pending ? '<b class="down">반영 안 된 변경 ' + s.pending + '건</b>' : '<span class="up">사이트와 같음</span>';
      $("#vmCurrent").textContent = s.current ? "현재 사이트: 반영본 #" + s.current.id + " · " + dt(s.current.created_at) + (s.current.by ? " · " + s.current.by : "") : "";
      $("#vmPublish").classList.toggle("primary", !!s.pending);
    });
  }
  $("#vmPublish").addEventListener("click", function () {
    var note = prompt("사이트에 반영합니다. 변경 내용을 짧게 적어 주세요 (이력에 남음)", ""); if (note === null) return;
    this.disabled = true; var b = this;
    api("/api/admin/vm/publish", { method: "POST", json: { note: note } }).then(function (r) {
      toast("반영본 #" + r.releaseId + " — 1분 안에 사이트에 보입니다" + (r.warningCount ? " (확인 필요 " + r.warningCount + "건)" : ""));
      loadStatus(); if (!$("#vmHistory").hidden) loadHistory();
    }).catch(fail).finally(function () { b.disabled = false; });
  });
  $("#vmHistoryBtn").addEventListener("click", function () { var h = $("#vmHistory"); h.hidden = !h.hidden; if (!h.hidden) loadHistory(); });
  function loadHistory() {
    Promise.all([api("/api/admin/vm/releases"), api("/api/admin/vm/changes")]).then(function (r) {
      $("#vmReleases").innerHTML = '<tr><th>반영본</th><th>시각</th><th>담당</th><th>내용</th><th class="num">트림</th><th></th></tr>' + r[0].map(function (x) {
        return '<tr><td>#' + x.id + (x.is_current ? ' <span class="pill live">사이트</span>' : '') + '</td><td>' + dt(x.created_at) + '</td><td>' + esc(x.by || "") + '</td><td>' + esc(x.note) + '</td><td class="num">' + won((x.counts || {}).trims) + '</td><td>' + (x.is_current ? '' : '<button class="btn sm" data-rb="' + x.id + '">이 반영본으로 되돌리기</button>') + '</td></tr>';
      }).join("");
      var ACT = { create: "추가", update: "수정", delete: "삭제", import: "엑셀 적용", replace: "전체 교체", reset_blocked: "초기화 보류", publish: "사이트 반영", rollback: "되돌리기" };
      $("#vmChanges").innerHTML = '<tr><th>시각</th><th>담당</th><th>작업</th><th>항목</th><th>내용</th></tr>' + r[1].map(function (x) {
        return '<tr><td>' + dt(x.at) + '</td><td>' + esc(x.by || "") + '</td><td>' + (ACT[x.action] || x.action) + '</td><td>' + esc(x.kindKo || "") + ' <small class="hint">' + esc(x.item_id || "") + '</small></td><td>' + esc(x.summary) + '</td></tr>';
      }).join("");
    }).catch(fail);
  }
  $("#vmReleases").addEventListener("click", function (e) {
    var id = e.target.getAttribute("data-rb"); if (!id) return;
    if (!confirm("반영본 #" + id + " 로 사이트와 작업본을 모두 되돌릴까요?\n(그 이후 고친 내용은 사라집니다 — 지금 상태도 반영본으로 남아 있으면 다시 돌아올 수 있습니다)")) return;
    api("/api/admin/vm/releases/" + id + "/rollback", { method: "POST" }).then(function () { toast("되돌렸습니다"); loadStatus(); loadHistory(); go([], "brands"); showEmptyEditor(); }).catch(fail);
  });

  // ---------------------------------------------------------------- 목록 (단계 이동)
  function crumbs() {
    $("#vmCrumbs").innerHTML = '<button data-depth="0">전체 브랜드</button>' + S.path.map(function (p, i) { return ' › <button data-depth="' + (i + 1) + '">' + esc(nameOf(p.item)) + (p.item.modelYear && p.level === "lineups" ? " " + p.item.modelYear : "") + '</button>'; }).join("");
  }
  $("#vmCrumbs").addEventListener("click", function (e) {
    var d = e.target.getAttribute("data-depth"); if (d == null) return; d = +d;
    var path = S.path.slice(0, d), level = d === 0 ? "brands" : NEXT[path[d - 1].level];
    go(path, level); if (d > 0) openEditor(path[d - 1].level, path[d - 1].item);
    else showEmptyEditor();
  });
  function go(path, level) {
    if (level !== S.level || path.length !== S.path.length) $("#vmFilter").value = "";   // 다른 단계로 가면 목록 찾기 비움
    S.path = path; S.level = level; crumbs();
    var parent = path.length ? path[path.length - 1].item.id : "";
    $("#vmListTitle").textContent = TITLE[level] + " 목록";
    $("#vmAdd").textContent = "+ " + TITLE[level] + " 추가";
    $("#vmList").innerHTML = '<p class="hint">불러오는 중…</p>';
    return api("/api/admin/vm/tree?level=" + level + "&parent=" + encodeURIComponent(parent)).then(function (list) { S.list = list; renderList(); }).catch(fail);
  }
  function renderList() {
    var f = ($("#vmFilter").value || "").trim().toLowerCase();
    var rows = S.list.filter(function (o) { return !f || JSON.stringify([o.nameKo, o.nameEn, o.shortLabel, o.displayName, o.name, o.modelYear, o.id]).toLowerCase().indexOf(f) >= 0; });
    $("#vmList").innerHTML = rows.length ? rows.map(function (o) {
      var sub = S.level === "brands" ? "모델 " + o.childCount : S.level === "models" ? (o.segment || "") + " · 라인업 " + o.childCount
        : S.level === "lineups" ? (o.modelYear || "") + " · 트림 " + o.childCount + " · 이미지 " + o.imageCount
        : (o.listPrice ? won(o.listPrice) + "원" : '<span class="down">가격 없음</span>') + " · 옵션 " + o.optionCount + " · 색상 " + o.colorCount;
      return '<button type="button" class="vm_item' + (S.sel && S.sel.id === o.id ? " on" : "") + (o.status === "INACTIVE" ? " off" : "") + '" data-id="' + esc(o.id) + '"><b>' + esc(S.level === "lineups" ? (o.displayName || o.shortLabel) : nameOf(o)) + (o.status === "INACTIVE" ? ' <span class="pill">숨김</span>' : '') + '</b><small>' + sub + '</small></button>';
    }).join("") : '<p class="hint">항목이 없습니다</p>';
  }
  $("#vmFilter").addEventListener("input", renderList);
  $("#vmList").addEventListener("click", function (e) {
    var b = e.target.closest(".vm_item"); if (!b) return;
    var o = S.list.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0]; if (!o) return;
    if (S.level === "trims") { S.sel = o; renderList(); openTrim(o.id); return; }
    var path = S.path.concat([{ level: S.level, item: o }]);
    go(path, NEXT[S.level]); openEditor(path[path.length - 1].level, o);
  });
  $("#vmAdd").addEventListener("click", function () {
    var data = {}; var pf = PARENT_FIELD[S.level]; if (pf) data[pf] = S.path[S.path.length - 1].item.id;
    openForm(S.level, null, data, function (saved) { toast(TITLE[S.level] + " 추가됨"); go(S.path, S.level).then(function () { if (S.level === "trims") openTrim(saved.id); }); loadStatus(); });
  });

  // 검색 → 트림으로 바로 이동
  var sT = null;
  $("#vmSearch").addEventListener("input", function (e) {
    clearTimeout(sT); var box = $("#vmSearchRes");
    sT = setTimeout(function () {
      var v = e.target.value.trim(); if (v.length < 2) { box.hidden = true; return; }
      api("/api/admin/vm/search?q=" + encodeURIComponent(v)).then(function (list) {
        box.innerHTML = list.length ? list.map(function (t) { return '<button type="button" data-trim="' + esc(t.trimId) + '">' + esc([t.brand, t.model, t.modelYear, t.lineup, t.trim].join(" · ")) + (t.listPrice ? ' <small>' + won(t.listPrice) + '원</small>' : '') + '</button>'; }).join("") : '<button type="button" disabled>결과 없음</button>';
        box.hidden = false;
      }).catch(fail);
    }, 250);
  });
  $("#vmSearchRes").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-trim]"); if (!b) return; $("#vmSearchRes").hidden = true;
    openTrim(b.getAttribute("data-trim"), true);
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".vm_search")) $("#vmSearchRes").hidden = true; });

  // ---------------------------------------------------------------- 공통 입력 폼
  function input(kind, f, v) {
    var t = (S.fields[kind] || {})[f], id = "f_" + f;
    if (t === "status") return '<select name="' + f + '"><option value="ACTIVE"' + (v !== "INACTIVE" ? " selected" : "") + '>노출</option><option value="INACTIVE"' + (v === "INACTIVE" ? " selected" : "") + '>숨김</option></select>';
    if (t === "strArr") return '<textarea name="' + f + '" rows="' + Math.min(12, Math.max(3, (v || []).length + 1)) + '">' + esc((v || []).join("\n")) + '</textarea>';
    if (SELECT[f]) { var opts = SELECT[f].slice(); if (v && !opts.some(function (o) { return o[0] === v; })) opts.unshift([v, v]); return '<select name="' + f + '"><option value="">-</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>'; }
    if (t === "int") return '<input name="' + f + '" inputmode="numeric" value="' + esc(v == null ? "" : (f === "modelYear" || f === "sortOrder" || f === "seatCount" ? v : won(v))) + '">';
    return '<input name="' + f + '" value="' + esc(v == null ? "" : v) + '"' + (f === "hex" ? ' placeholder="#000000"' : "") + '>';
  }
  function formHtml(kind, item, opts) {
    opts = opts || {};
    var keys = Object.keys(S.fields[kind] || {}).filter(function (f) { return (HIDE[kind] || []).indexOf(f) < 0 && (opts.only ? opts.only.indexOf(f) >= 0 : true) && (opts.skip || []).indexOf(f) < 0; });
    return '<div class="fgrid">' + keys.map(function (f) { var wide = S.fields[kind][f] === "strArr" || f === "description"; return '<label class="' + (wide ? "wide" : "") + '"><span>' + esc(LABEL[f] || f) + '</span>' + input(kind, f, item ? item[f] : null) + '</label>'; }).join("") + '</div>';
  }
  function readForm(el, kind, item) {
    var out = {};
    $$("[name]", el).forEach(function (x) {
      var f = x.name, t = (S.fields[kind] || {})[f]; if (!t) return;
      var v = t === "strArr" ? x.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean) : x.value.trim();
      var cur = item ? item[f] : undefined;
      if (t === "int" && v !== "") v = Number(String(v).replace(/[,\s원]/g, ""));
      if (JSON.stringify(cur == null || cur === "" ? (t === "strArr" ? [] : null) : cur) !== JSON.stringify(v === "" ? null : v)) out[f] = v === "" ? null : v;
    });
    return out;
  }
  /** 팝업 폼 (추가·수정) */
  function openForm(kind, item, preset, done, extra) {
    var m = $("#vmModal"), isNew = !item;
    var KO = { brands: "브랜드", models: "모델", lineups: "라인업", trims: "트림", options: "옵션", colors: "색상", vehicleImages: "이미지", trimOptions: "트림 옵션", trimColors: "트림 색상" };
    $("#vmModalTitle").textContent = KO[kind] + (isNew ? " 추가" : " 수정");
    var base = Object.assign({}, preset || {}, item || {});
    $("#vmModalBody").innerHTML = (isNew && ["brands", "models", "lineups", "trims", "options", "colors"].indexOf(kind) >= 0 ? '<label class="idrow"><span>ID (비우면 자동 — 영문 소문자·숫자·- 만)</span><input name="__id" placeholder="자동"></label>' : '') + (extra || "") + formHtml(kind, base);
    m.hidden = false;
    $("#vmModalSave").onclick = function () {
      var body = $("#vmModalBody"), data = readForm(body, kind, isNew ? null : item);
      if (isNew) Object.keys(preset || {}).forEach(function (k) { if (!(k in data) && (S.fields[kind] || {})[k]) data[k] = preset[k]; });
      var idEl = $("[name=__id]", body);
      var req = isNew ? api("/api/admin/vm/item/" + kind, { method: "POST", json: { data: data, id: idEl && idEl.value.trim() || undefined } })
        : (Object.keys(data).length ? api("/api/admin/vm/item/" + kind + "/" + encodeURIComponent(item.__key || item.id), { method: "PATCH", json: { data: data } }) : Promise.resolve(item));
      req.then(function (saved) { m.hidden = true; done && done(saved); }).catch(fail);
    };
  }
  $("#vmModalClose").addEventListener("click", function () { $("#vmModal").hidden = true; });
  $("#vmModal").addEventListener("click", function (e) { if (e.target.id === "vmModal") $("#vmModal").hidden = true; });

  // ---------------------------------------------------------------- 오른쪽 편집 (브랜드·모델·라인업)
  function showEmptyEditor() { $("#vmEditor").innerHTML = '<p class="hint pad">왼쪽 목록에서 항목을 고르거나 위에서 트림을 검색하세요.<br>수정한 내용은 작업본에 바로 저장되고, 위의 <b>[사이트 반영]</b> 을 눌러야 사이트에 나갑니다.</p>'; }
  function delBtn(kind, id) { return '<button class="btn danger sm" data-del-kind="' + kind + '" data-del-id="' + esc(id) + '">삭제</button>'; }
  function openEditor(kind, item) {
    S.sel = null;
    var ed = $("#vmEditor");
    ed.innerHTML = '<div class="row between"><h2>' + TITLE[kind] + ' · ' + esc(nameOf(item)) + '</h2><div class="row gap">' + delBtn(kind, item.id) + '</div></div><p class="hint">ID ' + esc(item.id) + '</p>' +
      '<form class="vm_form" data-kind="' + kind + '">' + formHtml(kind, item) + '<div class="row gap"><button class="btn primary" type="submit">저장</button></div></form><div id="vmSub"></div>';
    $("form", ed).addEventListener("submit", function (e) {
      e.preventDefault(); var data = readForm(e.target, kind, item);
      if (!Object.keys(data).length) return toast("바뀐 내용이 없습니다");
      api("/api/admin/vm/item/" + kind + "/" + encodeURIComponent(item.id), { method: "PATCH", json: { data: data } }).then(function (saved) { Object.assign(item, saved); toast("저장됨"); loadStatus(); crumbs(); }).catch(fail);
    });
    if (kind === "brands") subColors(item);
    if (kind === "models") subOptions(item);
    if (kind === "lineups") subImages(item);
  }
  // 삭제 (공통)
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-del-kind]"); if (!b) return;
    var kind = b.getAttribute("data-del-kind"), id = b.getAttribute("data-del-id");
    if (!confirm("삭제할까요? (사이트에는 [사이트 반영] 후 적용)\n" + id)) return;
    api("/api/admin/vm/item/" + kind + "/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
      toast("삭제됨"); loadStatus();
      var h = b.getAttribute("data-after");
      if (h === "trim") openTrim(S.trimId); else if (h === "sub") { var cur = S.path[S.path.length - 1]; if (cur) openEditor(cur.level, cur.item); }
      else { var path = S.path.slice(0, -1); if (kind === "trims") { go(S.path, "trims"); showEmptyEditor(); } else { go(path, path.length ? NEXT[path[path.length - 1].level] : "brands"); showEmptyEditor(); } }
    }).catch(fail);
  });

  function subColors(brand) {
    api("/api/admin/vm/list?kind=colors&parent=" + encodeURIComponent(brand.id)).then(function (list) {
      $("#vmSub").innerHTML = '<div class="row between"><h3>색상 (' + list.length + ')</h3><button class="btn sm" id="addColor">+ 색상 추가</button></div><p class="hint">트림별 색상은 트림 화면에서 이 목록 중에 고릅니다.</p>' +
        '<table class="tbl"><tr><th></th><th>색상명</th><th>영문</th><th>제조사 코드</th><th></th></tr>' + list.map(function (c) {
          return '<tr><td><i class="chip" style="background:' + esc(c.hex || "#ddd") + '"></i></td><td>' + esc(c.name) + '</td><td>' + esc(c.nameEn || "") + '</td><td>' + esc(c.manufacturerCode || "") + '</td><td class="row gap"><button class="btn sm" data-edit-color="' + esc(c.id) + '">수정</button>' + delBtn("colors", c.id).replace("<button", '<button data-after="sub"') + '</td></tr>';
        }).join("") + '</table>';
      $("#addColor").onclick = function () { openForm("colors", null, { brandId: brand.id }, function () { toast("색상 추가됨"); subColors(brand); loadStatus(); }); };
      $$("[data-edit-color]").forEach(function (b) { b.onclick = function () { var c = list.filter(function (x) { return x.id === b.getAttribute("data-edit-color"); })[0]; openForm("colors", c, null, function () { toast("저장됨"); subColors(brand); loadStatus(); }); }; });
    }).catch(fail);
  }
  function subOptions(model) {
    api("/api/admin/vm/list?kind=options&parent=" + encodeURIComponent(model.id)).then(function (list) {
      $("#vmSub").innerHTML = '<div class="row between"><h3>옵션 (' + list.length + ')</h3><button class="btn sm" id="addOpt">+ 옵션 추가</button></div><p class="hint">옵션 가격은 트림마다 다를 수 있어 트림 화면에서 정합니다.</p>' +
        '<table class="tbl"><tr><th>옵션명</th><th>분류</th><th>구성</th><th></th></tr>' + list.map(function (o) {
          return '<tr><td>' + esc(o.name) + '</td><td>' + esc(o.category || "") + '</td><td><small class="hint">' + esc((o.items || []).slice(0, 4).join(", ")) + ((o.items || []).length > 4 ? " …" : "") + '</small></td><td class="row gap"><button class="btn sm" data-edit-opt="' + esc(o.id) + '">수정</button>' + delBtn("options", o.id).replace("<button", '<button data-after="sub"') + '</td></tr>';
        }).join("") + '</table>';
      $("#addOpt").onclick = function () { openForm("options", null, { modelId: model.id }, function () { toast("옵션 추가됨"); subOptions(model); loadStatus(); }); };
      $$("[data-edit-opt]").forEach(function (b) { b.onclick = function () { var o = list.filter(function (x) { return x.id === b.getAttribute("data-edit-opt"); })[0]; openForm("options", o, null, function () { toast("저장됨"); subOptions(model); loadStatus(); }); }; });
    }).catch(fail);
  }

  // 이미지: 라인업 대표(트림 비움) 또는 트림 전용 · 색상별
  function imageGrid(list, trims, colors, afterKey) {
    return '<div class="imgs">' + list.map(function (im) {
      return '<div class="img_card"><img src="' + esc(imgSrc(im.thumbnailUrl || im.imageUrl)) + '" alt="" onerror="this.classList.add(\'broken\')"><div class="img_meta">' +
        '<select data-img="' + esc(im.id) + '" data-f="trimId"><option value="">라인업 대표 (모든 트림)</option>' + trims.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === im.trimId ? " selected" : "") + '>' + esc(t.name) + '</option>'; }).join("") + '</select>' +
        '<select data-img="' + esc(im.id) + '" data-f="colorKey"><option value="">기본 (색상 무관)</option>' + colors.map(function (c) { var k = colorKeyOf(c); return '<option value="' + esc(k) + '"' + (k === im.colorKey ? " selected" : "") + '>' + esc(c.name) + '</option>'; }).join("") + (im.colorKey && !colors.some(function (c) { return colorKeyOf(c) === im.colorKey; }) ? '<option selected value="' + esc(im.colorKey) + '">' + esc(im.colorKey) + '</option>' : '') + '</select>' +
        '<select data-img="' + esc(im.id) + '" data-f="view">' + SELECT.view.map(function (v) { return '<option value="' + v[0] + '"' + ((im.view || "side") === v[0] ? " selected" : "") + '>' + v[1] + '</option>'; }).join("") + '</select>' +
        delBtn("vehicleImages", im.id).replace("<button", '<button data-after="' + afterKey + '"') + '</div></div>';
    }).join("") + '</div>';
  }
  function bindImageEdits(el) {
    $$("select[data-img]", el).forEach(function (s) {
      s.addEventListener("change", function () {
        var d = {}; d[s.getAttribute("data-f")] = s.value || null;
        api("/api/admin/vm/item/vehicleImages/" + encodeURIComponent(s.getAttribute("data-img")), { method: "PATCH", json: { data: d } }).then(function () { toast("저장됨"); loadStatus(); }).catch(fail);
      });
    });
  }
  function uploadImages(files, lineupId, trimId, done) {
    if (!files.length) return;
    var fd = new FormData(); fd.append("purpose", "vehicle"); [].forEach.call(files, function (f) { fd.append("files", f); });
    toast("올리는 중… (" + files.length + "장)");
    api("/api/admin/media", { method: "POST", body: fd }).then(function (ups) {
      return ups.reduce(function (p, u) { return p.then(function () { return api("/api/admin/vm/item/vehicleImages", { method: "POST", json: { data: { lineupId: lineupId, trimId: trimId || null, imageUrl: u.url, thumbnailUrl: u.thumbUrl } } }); }); }, Promise.resolve());
    }).then(function () { toast("이미지 추가됨 — 색상·트림을 지정하세요"); loadStatus(); done(); }).catch(fail);
  }
  function subImages(lineup) {
    Promise.all([api("/api/admin/vm/list?kind=vehicleImages&parent=" + encodeURIComponent(lineup.id)), api("/api/admin/vm/tree?level=trims&parent=" + encodeURIComponent(lineup.id))]).then(function (r) {
      var list = r[0], trims = r[1];
      var first = trims[0];
      (first ? api("/api/admin/vm/trim/" + encodeURIComponent(first.id)) : Promise.resolve(null)).then(function (b) {
        var colors = b ? b.colors.filter(function (x) { return x.type === "EXTERIOR" && x.color; }).map(function (x) { return x.color; }) : [];
        $("#vmSub").innerHTML = '<div class="row between"><h3>차량 이미지 (' + list.length + ')</h3><label class="btn sm">+ 이미지 올리기<input type="file" accept="image/*" multiple hidden id="imgUp"></label></div>' +
          '<p class="hint">jpg·png·webp 를 올리면 webp 로 바꿔 저장합니다 (긴 변 2000px). 외장 색상을 지정하면 상세 화면에서 그 색을 고를 때 이 이미지가 나옵니다. 색상 무관 이미지는 기본 이미지입니다.</p>' + imageGrid(list, trims, colors, "sub");
        bindImageEdits($("#vmSub"));
        $("#imgUp").onchange = function () { uploadImages(this.files, lineup.id, null, function () { subImages(lineup); go(S.path, S.level); }); };
      });
    }).catch(fail);
  }

  // ---------------------------------------------------------------- 트림 편집 (가격·옵션·색상·기본품목·이미지)
  function openTrim(trimId, fromSearch) {
    S.trimId = trimId;
    api("/api/admin/vm/trim/" + encodeURIComponent(trimId)).then(function (b) {
      if (fromSearch) {   // 검색에서 열면 목록도 그 라인업으로
        S.path = [{ level: "brands", item: b.brand }, { level: "models", item: b.model }, { level: "lineups", item: b.lineup }];
        S.sel = b.trim; go(S.path, "trims");
      }
      var t = b.trim, ed = $("#vmEditor");
      var ext = b.colors.filter(function (x) { return x.type === "EXTERIOR"; }), int = b.colors.filter(function (x) { return x.type === "INTERIOR"; });
      var optTotal = b.options.reduce(function (a, x) { return a + (x.price || 0); }, 0);
      ed.innerHTML =
        '<div class="row between"><h2>' + esc(b.model.nameKo + " " + (b.lineup.shortLabel || "") + " · " + t.name) + '</h2><div class="row gap"><button class="btn sm" id="trimCopy">다른 트림에서 복사</button>' + delBtn("trims", t.id) + '</div></div>' +
        '<p class="hint">' + esc(b.brand.nameKo + " · " + (b.lineup.displayName || "") + " · " + (b.lineup.modelYear || "")) + ' · ID ' + esc(t.id) + '</p>' +
        '<form class="vm_form" id="trimForm">' + formHtml("trims", t, { skip: ["standardItems"] }) + '<label class="wide"><span>' + LABEL.standardItems + ' — ' + (t.standardItems || []).length + '개</span>' + input("trims", "standardItems", t.standardItems) + '</label><div class="row gap"><button class="btn primary" type="submit">트림 저장</button></div></form>' +
        '<div class="row between"><h3>선택 옵션 · 옵션 가격 (' + b.options.length + '개, 합계 ' + won(optTotal) + '원)</h3><div class="row gap"><select id="addOptSel"><option value="">+ 이 모델 옵션에서 추가</option>' + b.modelOptions.filter(function (o) { return !b.options.some(function (x) { return x.optionId === o.id; }); }).map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>'; }).join("") + '</select><button class="btn sm" id="newOpt">+ 새 옵션</button></div></div>' +
        '<table class="tbl"><tr><th>옵션명</th><th class="num">가격 (원)</th><th>선행 조건 · 동시 선택 불가</th><th></th></tr>' + b.options.map(function (x) {
          var key = x.trimId + "|" + x.optionId;
          return '<tr><td>' + esc(x.option ? x.option.name : x.optionId) + (x.option && x.option.category ? ' <small class="hint">' + esc(x.option.category) + '</small>' : '') + '</td><td class="num"><input class="num_in" data-to="' + esc(key) + '" data-f="price" value="' + (x.price == null ? "" : won(x.price)) + '"></td>' +
            '<td><input class="note_in" data-to="' + esc(key) + '" data-f="dependencyNote" placeholder="선행 조건" value="' + esc(x.dependencyNote || "") + '"><input class="note_in" data-to="' + esc(key) + '" data-f="exclusionNote" placeholder="동시 선택 불가" value="' + esc(x.exclusionNote || "") + '"></td><td>' + delBtn("trimOptions", key).replace("<button", '<button data-after="trim"') + '</td></tr>';
        }).join("") + '</table>' +
        colorTable("외장 색상", "EXTERIOR", ext, b) + colorTable("내장 색상", "INTERIOR", int, b) +
        '<div class="row between"><h3>이 트림 전용 이미지 (' + b.images.filter(function (i) { return i.trimId === t.id; }).length + ') <small>· 라인업 대표 이미지는 라인업 화면에서</small></h3><label class="btn sm">+ 이미지 올리기<input type="file" accept="image/*" multiple hidden id="trimImgUp"></label></div>' +
        imageGrid(b.images.filter(function (i) { return i.trimId === t.id; }), [t], ext.map(function (x) { return x.color; }).filter(Boolean), "trim");
      bindImageEdits(ed);
      $("#trimImgUp").onchange = function () { uploadImages(this.files, t.lineupId, t.id, function () { openTrim(t.id); }); };
      $("#trimForm").addEventListener("submit", function (e) {
        e.preventDefault(); var data = readForm(e.target, "trims", t);
        if (!Object.keys(data).length) return toast("바뀐 내용이 없습니다");
        api("/api/admin/vm/item/trims/" + encodeURIComponent(t.id), { method: "PATCH", json: { data: data } }).then(function () { toast("트림 저장됨"); loadStatus(); openTrim(t.id); if (S.level === "trims") go(S.path, "trims"); }).catch(fail);
      });
      // 옵션 가격·메모: 칸을 벗어나면 저장
      $$("[data-to]", ed).forEach(function (inp) {
        inp.addEventListener("change", function () {
          var d = {}; d[inp.getAttribute("data-f")] = inp.value.trim() || null;
          api("/api/admin/vm/item/trimOptions/" + encodeURIComponent(inp.getAttribute("data-to")), { method: "PATCH", json: { data: d } }).then(function () { inp.classList.add("saved"); toast("저장됨"); loadStatus(); }).catch(fail);
        });
      });
      $$("[data-tc]", ed).forEach(function (inp) {
        inp.addEventListener("change", function () {
          api("/api/admin/vm/item/trimColors/" + encodeURIComponent(inp.getAttribute("data-tc")), { method: "PATCH", json: { data: { extraPrice: inp.value.trim() || null } } }).then(function () { inp.classList.add("saved"); toast("저장됨"); loadStatus(); }).catch(fail);
        });
      });
      $("#addOptSel").onchange = function () {
        if (!this.value) return; var oid = this.value, p = prompt("옵션 가격 (원)", "");
        if (p === null) { this.value = ""; return; }
        api("/api/admin/vm/item/trimOptions", { method: "POST", json: { data: { trimId: t.id, optionId: oid, price: p || null } } }).then(function () { toast("옵션 추가됨"); loadStatus(); openTrim(t.id); }).catch(fail);
      };
      $("#newOpt").onclick = function () {
        openForm("options", null, { modelId: b.model.id }, function (o) {
          var p = prompt("'" + o.name + "' 옵션 가격 (원)", "");
          api("/api/admin/vm/item/trimOptions", { method: "POST", json: { data: { trimId: t.id, optionId: o.id, price: p || null } } }).then(function () { toast("옵션 추가됨"); loadStatus(); openTrim(t.id); }).catch(fail);
        });
      };
      $$("[data-addcolor]", ed).forEach(function (sel) {
        sel.onchange = function () {
          if (!sel.value) return;
          var go2 = function (cid) { api("/api/admin/vm/item/trimColors", { method: "POST", json: { data: { trimId: t.id, colorId: cid, type: sel.getAttribute("data-addcolor"), extraPrice: null } } }).then(function () { toast("색상 추가됨"); loadStatus(); openTrim(t.id); }).catch(fail); };
          if (sel.value === "__new") openForm("colors", null, { brandId: b.brand.id }, function (c) { go2(c.id); });
          else go2(sel.value);
        };
      });
      $("#trimCopy").onclick = function () { copyFrom(t); };
    }).catch(fail);
  }
  function colorTable(title, type, rows, b) {
    var used = rows.map(function (x) { return x.colorId; });
    return '<div class="row between"><h3>' + title + ' (' + rows.length + ')</h3><select data-addcolor="' + type + '"><option value="">+ 브랜드 색상에서 추가</option>' + b.brandColors.filter(function (c) { return used.indexOf(c.id) < 0; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join("") + '<option value="__new">+ 새 색상 만들기</option></select></div>' +
      (rows.length ? '<table class="tbl"><tr><th></th><th>색상명</th><th class="num">추가 금액 (원)</th><th></th></tr>' + rows.map(function (x) {
        var key = x.trimId + "|" + x.colorId + "|" + x.type;
        return '<tr><td><i class="chip" style="background:' + esc((x.color && x.color.hex) || "#ddd") + '"></i></td><td>' + esc(x.color ? x.color.name : x.colorId) + '</td><td class="num"><input class="num_in" data-tc="' + esc(key) + '" value="' + (x.extraPrice ? won(x.extraPrice) : "") + '" placeholder="0"></td><td>' + delBtn("trimColors", key).replace("<button", '<button data-after="trim"') + '</td></tr>';
      }).join("") + '</table>' : '<p class="hint">없음</p>');
  }
  function copyFrom(t) {
    var q = prompt("옵션·색상·기본품목을 가져올 트림을 검색하세요 (예: 그랜저 2.5 프레스티지)", ""); if (!q) return;
    api("/api/admin/vm/search?q=" + encodeURIComponent(q)).then(function (list) {
      list = list.filter(function (x) { return x.trimId !== t.id; }).slice(0, 15);
      if (!list.length) return toast("검색 결과 없음", true);
      var pick = prompt("번호를 입력하세요\n" + list.map(function (x, i) { return (i + 1) + ". " + [x.model, x.modelYear, x.lineup, x.trim].join(" · "); }).join("\n"), "1");
      var src = list[(+pick || 0) - 1]; if (!src) return;
      api("/api/admin/vm/trim/" + encodeURIComponent(t.id) + "/copy-from", { method: "POST", json: { sourceTrimId: src.trimId } }).then(function (r) { toast(r.copied + "개 복사됨 (이미 있는 항목은 건너뜀)"); loadStatus(); openTrim(t.id); }).catch(fail);
    }).catch(fail);
  }

  // ---------------------------------------------------------------- 엑셀 일괄
  function loadBrandsForExcel() {
    api("/api/admin/vm/tree?level=brands").then(function (bs) { $("#vmXlsBrand").innerHTML = '<option value="">전체 브랜드</option>' + bs.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.nameKo) + '</option>'; }).join(""); });
  }
  $("#vmXlsDown").addEventListener("click", function () { var b = $("#vmXlsBrand").value; location.href = "/api/admin/vm/export.xlsx" + (b ? "?brand=" + encodeURIComponent(b) : ""); });
  $("#vmXlsForm").addEventListener("submit", function (e) {
    e.preventDefault(); var fd = new FormData(e.target), btn = $("button", e.target); btn.disabled = true;
    $("#vmXlsPlan").innerHTML = '<p class="hint">확인 중… (전체 파일은 30초 정도 걸릴 수 있습니다)</p>';
    api("/api/admin/vm/import", { method: "POST", body: fd }).then(function (p) {
      var kinds = Object.keys(p.summary);
      $("#vmXlsPlan").innerHTML = '<h3>미리보기 — 바뀌는 항목 ' + p.total + '건</h3>' + (kinds.length ? '<table class="tbl"><tr><th>종류</th><th class="num">추가</th><th class="num">수정</th><th class="num">삭제</th></tr>' + kinds.map(function (k) { var s = p.summary[k]; return '<tr><td>' + esc(k) + '</td><td class="num up">' + s.create + '</td><td class="num">' + s.update + '</td><td class="num down">' + s["delete"] + '</td></tr>'; }).join("") + '</table>' : '<p class="hint">바뀐 내용이 없습니다</p>') +
        (p.errorCount ? '<div class="problems"><b>오류 ' + p.errorCount + '건 — 이 행들은 빼고 적용됩니다</b><br>' + p.errors.map(esc).join("<br>") + '</div>' : '') +
        (p.sample.length ? '<details><summary>바뀌는 항목 보기</summary><div class="problems ok">' + p.sample.map(function (s) { return ({ create: "추가", update: "수정", "delete": "삭제" })[s.op] + " · " + esc(s.label) + " · " + esc(s.kind) + " " + esc(s.id) + (s.fields.length ? " (" + esc(s.fields.join(", ")) + ")" : ""); }).join("<br>") + '</div></details>' : '') +
        (p.total ? '<div class="row gap"><button class="btn primary" id="vmXlsApply">작업본에 적용</button><span class="hint">적용 후 [사이트 반영] 을 눌러야 사이트에 나갑니다</span></div>' : '');
      var ap = $("#vmXlsApply"); if (ap) ap.onclick = function () {
        ap.disabled = true;
        api("/api/admin/vm/import/" + p.importId + "/apply", { method: "POST" }).then(function (r) { $("#vmXlsPlan").innerHTML = '<p class="up">' + r.applied + '건 적용했습니다. 확인 후 [사이트 반영] 을 누르세요.</p>'; e.target.reset(); loadStatus(); go(S.path, S.level); }).catch(function (er) { ap.disabled = false; fail(er); });
      };
    }).catch(function (er) { $("#vmXlsPlan").innerHTML = '<p class="err">' + esc(er.message) + '</p>'; }).finally(function () { btn.disabled = false; });
  });

  // ---------------------------------------------------------------- 엑셀로 전체 교체
  $("#vmRepForm").addEventListener("submit", function (e) {
    e.preventDefault(); var fd = new FormData(e.target), btn = $("button", e.target); btn.disabled = true;
    $("#vmRepPlan").innerHTML = '<p class="hint">확인 중… (전체 파일은 1분 정도 걸릴 수 있습니다)</p>';
    api("/api/admin/vm/replace", { method: "POST", body: fd }).then(function (p) {
      var im = p.impact, ks = Object.keys(p.counts), list = function (a) { return a.map(esc).join("<br>"); };
      var h = '<h3>전체 교체 미리보기</h3><table class="tbl"><tr><th>종류</th><th class="num">지금</th><th class="num">파일</th><th class="num">새로 생김</th><th class="num">없어짐</th></tr>' + ks.map(function (k) { var c = p.counts[k]; return '<tr><td>' + esc(c.kind) + '</td><td class="num">' + won(c.cur) + '</td><td class="num"><b>' + won(c.next) + '</b></td><td class="num up">' + won(c.added) + '</td><td class="num down">' + won(c.removed) + '</td></tr>'; }).join("") + '</table>';
      h += '<h3>연결 데이터 영향</h3><ul class="hint">' +
        '<li>사이트 견적(재고특가·빠른인도·금융사) 연결 ' + won(im.quotes.linked) + '건 중 <b class="' + (im.quotes.missing ? "down" : "up") + '">트림이 없어져 끊기는 견적 ' + won(im.quotes.missing) + '건</b>' + (im.quotes.hidden ? ' · 숨김 트림에 연결 ' + won(im.quotes.hidden) + '건' : '') + '</li>' +
        '<li>이용후기 ' + im.reviews.total + '건 중 <b class="' + (im.reviews.missing ? "down" : "up") + '">차종 연결이 끊기는 후기 ' + im.reviews.missing + '건</b></li>' +
        '<li>유지: 색상 조합 규칙 ' + won(im.keptOther.colorRules) + ' · 출처 ' + won(im.keptOther.sources) + ' · 제원 ' + won(im.keptOther.vehicleSpecs) + '</li>' +
        (Object.keys(im.deleteMarked).length ? '<li>삭제 표시(Y)라 뺀 행: ' + Object.keys(im.deleteMarked).map(function (k) { return esc(k) + " " + im.deleteMarked[k]; }).join(", ") + '</li>' : '') + '</ul>' +
        (im.quotes.missing ? '<details><summary>끊기는 견적 트림 보기</summary><div class="problems">' + list(im.quotes.missingTrims) + '</div></details>' : '') +
        (im.quotes.hidden ? '<details><summary>숨김 트림에 연결된 견적 보기</summary><div class="problems">' + list(im.quotes.hiddenTrims) + '</div></details>' : '') +
        (im.reviews.missing ? '<details><summary>끊기는 후기 보기</summary><div class="problems">' + list(im.reviews.sample) + '</div></details>' : '');
      if (p.warningCount) h += '<details><summary>확인 필요 ' + p.warningCount + '건 (적용은 가능)</summary><div class="problems ok">' + list(p.warnings) + '</div></details>';
      if (p.errorCount) h += '<div class="problems"><b>오류 ' + p.errorCount + '건 — 고쳐서 다시 올려야 적용할 수 있습니다</b><br>' + list(p.errors) + '</div>';
      else h += '<div class="row gap"><input id="vmRepConfirm" placeholder="' + esc(p.confirmText) + ' 라고 입력" style="width:160px"><button class="btn danger" id="vmRepApply" disabled>작업본 전체 교체</button><span class="hint">적용 전 작업본은 자동 백업됩니다</span></div>';
      $("#vmRepPlan").innerHTML = h;
      var inp = $("#vmRepConfirm"), ap = $("#vmRepApply"); if (!ap) return;
      inp.oninput = function () { ap.disabled = inp.value.trim() !== p.confirmText; };
      ap.onclick = function () {
        if (!confirm("작업본을 이 파일 내용으로 통째로 바꿉니다. 계속할까요?")) return;
        ap.disabled = true;
        api("/api/admin/vm/replace/" + p.importId + "/apply", { method: "POST", json: { confirm: inp.value } }).then(function (r) {
          $("#vmRepPlan").innerHTML = '<p class="up">전체 교체 완료 — 트림 ' + won(r.counts.trims) + ' · 이미지 ' + won(r.counts.vehicleImages) + '. 이전 작업본은 반영 이력 #' + r.backupReleaseId + ' 로 백업됐습니다. 확인 후 [사이트 반영] 을 누르세요.</p>';
          e.target.reset(); loadStatus(); go([], "brands"); showEmptyEditor(); if (!$("#vmHistory").hidden) loadHistory();
        }).catch(function (er) { ap.disabled = false; fail(er); });
      };
    }).catch(function (er) { $("#vmRepPlan").innerHTML = '<p class="err">' + esc(er.message) + '</p>'; }).finally(function () { btn.disabled = false; });
  });

  // ---------------------------------------------------------------- 시작
  function init() {
    if (S.loaded) return; S.loaded = true;
    loadStatus().then(function () { go([], "brands"); showEmptyEditor(); loadBrandsForExcel(); }).catch(function (er) { S.loaded = false; fail(er); });
  }
  document.addEventListener("chaq:tab", function (e) { if (e.detail === "vm") init(); });
  window.CHAQ_VM_ADMIN = { reload: function () { S.loaded = false; init(); } };
})();
