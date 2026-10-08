/* 차큐 등급 묶음 (큰 항목) — 차종 선택의 '등급'은 대중이 알아보는 기준만, 세부 트림은 차량 상세에서 선택
   · 묶음 기준 = 라인업(연식·연료/엔진·인승 등 라인업 이름) × 인승(라인업이 7/9인승처럼 섞였을 때만) × 구동(같은 라인업 안에서 2WD/4WD 등이 섞였을 때만)
     예) 팰리세이드 → '2027년형 가솔린 터보 2.5 (9인승) · 2WD' 안에 익스클루시브 / H-Pick / 캘리그래피 / 블랙잉크
   · 세부 트림 이름(shortName) = 트림명에서 묶음에 이미 나온 구동·인승 표기를 뺀 것 (예: '익스클루시브 2WD' → '익스클루시브')
   · 사용처: special-price-car__list.html(재고특가·빠른인도·견적조회), car-select__master.html, car-detail.html(세부 등급 선택)
   · 필요: vehicle-master.js + vehicle-master-helper.js (window.CHAQ_VM) */
(function (root) {
  "use strict";
  var CHANNELS = ["GENERAL", "RENTAL"];   // 장기렌트 화면 노출 판매채널 (차종 선택 화면과 동일)
  var SEAT_MULTI = /\s*·?\s*\(?\s*\d+(?:\/\d+)+\s*인승\s*\)?/;   // '(7/9인승)', '(9/11인승)'
  var cache = {}, byTrim = {};
  function VM() { return root.CHAQ_VM || null; }

  /** 모델의 등급 묶음 [{ key, label, lineup, trims:[trim], seat, drive }] — 라인업 순서 → 인승 → 구동 순 */
  function groups(modelId) {
    var vm = VM(); if (!vm || !modelId) return [];
    if (cache[modelId]) return cache[modelId];
    var out = [];
    vm.getLineups(modelId, { salesChannels: CHANNELS }).forEach(function (l) {
      var ts = vm.getTrims(l.id, { salesChannels: CHANNELS }); if (!ts.length) return;
      var base = vm.lineupLabel(l), seats = {}; ts.forEach(function (t) { seats[t.seatCount || 0] = 1; });
      var multiSeat = Object.keys(seats).length > 1;   // 같은 라인업에 5/6/7인승(또는 인승 미표기)이 섞이면 인승으로 나눔
      var drives = {}; ts.forEach(function (t) { drives[t.drivetrain || ""] = 1; });
      var splitDrive = Object.keys(drives).length > 1;
      // (v196 명칭 정리) 트림명에서 구동·인승을 뺐으므로 묶음 이름이 알려줌: 구동은 알 수 있으면 항상, 인승은 라인업 이름에 없고 5인승이 아닐 때
      var allDrive = !splitDrive && ts[0].drivetrain ? ts[0].drivetrain : null;
      var allSeat = !multiSeat && ts[0].seatCount && ts[0].seatCount !== 5 && !/인승/.test(base) ? ts[0].seatCount : null;
      var map = {}, order = [];
      ts.forEach(function (t) {
        var seat = multiSeat && t.seatCount ? t.seatCount : (allSeat || null), drive = splitDrive ? (t.drivetrain || null) : allDrive;
        var key = l.id + "|" + (seat || "") + "|" + (drive || "");
        if (!map[key]) {
          var label = multiSeat && seat ? base.replace(SEAT_MULTI, "").trim() : base;   // '(7/9인승)' 표기는 빼고 '· 9인승'으로
          var dl = drive && t.driveLabel && ts.every(function (x) { return (x.drivetrain || null) !== drive || x.driveLabel === t.driveLabel; }) ? t.driveLabel : drive;   // 테슬라 RWD 등 표기
          map[key] = { key: key, label: [label, seat ? seat + "인승" : null, dl].filter(Boolean).join(" · "), lineup: l, trims: [], seat: seat, drive: drive, driveName: dl !== drive ? dl : null };
          order.push(key);
        }
        map[key].trims.push(t);
      });
      // 구동 표기는 트림명에 쓰인 표기를 우선 (예: 테슬라 'Premium RWD' → 데이터 2WD 대신 'RWD')
      order.forEach(function (k) {
        var g = map[k]; if (!g.drive) return;
        var tok = null, same = g.trims.every(function (t) { var m = String(t.name).match(/\b(RWD|FWD|AWD|4WD|2WD)\b/i); if (!m) return false; m = m[1].toUpperCase(); if (tok && tok !== m) return false; tok = m; return true; });
        if (same && tok && tok !== g.drive) { g.label = g.label.replace(new RegExp(" · " + g.drive + "$"), " · " + tok); g.driveName = tok; }
      });
      order.sort(function (a, b) { var A = map[a], B = map[b]; return ((A.seat || 0) - (B.seat || 0)) || String(A.drive || "").localeCompare(String(B.drive || "")); });
      order.forEach(function (k) { out.push(map[k]); map[k].trims.forEach(function (t) { byTrim[t.id] = map[k]; }); });
    });
    cache[modelId] = out;
    return out;
  }
  /** 트림이 속한 묶음 (없으면 null) */
  function groupOfTrim(trimId) {
    if (byTrim[trimId]) return byTrim[trimId];
    var vm = VM(); if (!vm || !trimId) return null;
    var mid = vm.modelIdOfTrim ? vm.modelIdOfTrim(trimId) : (vm.describe(trimId) || { model: {} }).model.id;
    groups(mid);
    return byTrim[trimId] || null;
  }
  function groupByKey(modelId, key) { var gs = groups(modelId); for (var i = 0; i < gs.length; i++) if (gs[i].key === key) return gs[i]; return null; }
  /** 세부 트림 표시명: 묶음 이름에 이미 있는 구동·인승 표기는 뺀다 */
  function shortName(t) {
    var n = String(t && t.name || ""), g = t ? byTrim[t.id] : null, s = n;
    if (g && g.drive) [g.drive, g.driveName].forEach(function (dv) { if (dv) s = s.replace(new RegExp("\\s*\\b" + dv.replace(/[-]/g, "\\-") + "\\b", "i"), ""); });
    if (g && g.seat) s = s.replace(new RegExp("\\s*\\(?\\s*" + g.seat + "\\s*인승\\s*\\)?"), "");
    s = s.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
    return s || "기본형";   // 트림명이 구동뿐인 경우 → 기본형
  }
  /** 카탈로그 한 줄: 'YYYY년형 · 라인업 · 인승 · 구동 · 세부 등급' (rec = 견적이면 견적 연식 우선) */
  function specLine(trimId, rec, withTrim) {
    var vm = VM(), t = vm && vm.getTrim(trimId), g = groupOfTrim(trimId); if (!t || !g) return null;
    var yr = rec && String(rec.year || "").match(/(20\d{2})/); var ly = g.lineup && g.lineup.modelYear;
    var lab = g.label.replace(/^\d{4}년형\s*/, "");
    return [(yr ? yr[1] : ly) ? (yr ? yr[1] : ly) + "년형" : null, lab, withTrim === false ? null : shortName(t)].filter(Boolean).join(" · ");
  }

  /** 견적조회 카드 한 줄: 'YYYY년형 · 연료 · 구동' 까지만 (대표 261008) */
  function basicLine(trimId, rec) {
    var vm = VM(), t = vm && vm.getTrim(trimId); if (!t) return null;
    var g = groupOfTrim(trimId), l = vm.getLineup(t.lineupId) || {};
    var yr = rec && String(rec.year || "").match(/(20\d{2})/), y = yr ? yr[1] : l.modelYear;
    var fuel = (vm.FUEL_LABEL_KO || {})[l.fuelType] || null;
    var drive = (g && (g.driveName || g.drive)) || t.driveLabel || t.drivetrain || null;
    return [y ? y + "년형" : null, fuel, drive].filter(Boolean).join(" · ");
  }

  root.CHAQ_TRIM_GROUPS = { CHANNELS: CHANNELS, groups: groups, groupOfTrim: groupOfTrim, groupByKey: groupByKey, shortName: shortName, specLine: specLine, basicLine: basicLine };
})(typeof window !== "undefined" ? window : globalThis);
