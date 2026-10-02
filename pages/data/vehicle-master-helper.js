/* ============================================================================
   차큐 Vehicle Master Helper — window.CHAQ_VM   (FINAL final-1.0)
   ----------------------------------------------------------------------------
   · 화면 코드는 window.CHAQ_VEHICLE_MASTER 를 직접 순회하지 않고 이 Helper만 사용한다.
   · CHAQ_VM.load(data) 한 줄로 소스 교체(정적 파일 → API 응답). pilot-0.1 데이터를 넣으면 FINAL 형태로 자동 변환.
   · ES5 / 의존성 없음 / file:// 및 Node 양쪽 동작 (tools/vm-validate.js 공용).
   · Quote/Finance(window.CHAQ)는 건드리지 않는다. 연결은 quote.trimId 로만 (STEP 8: getQuotes/pickQuote/quoteView — 견적 데이터 우선 합성).
   ========================================================================== */
(function (root) {
  "use strict";

  var ENUMS = {
    STATUS:           ["ACTIVE", "DISCONTINUED", "UPCOMING"],
    DOMESTIC_IMPORT:  ["DOMESTIC", "IMPORT"],
    BODY_TYPE:        ["SEDAN", "SUV", "MPV", "HATCHBACK", "COUPE", "WAGON", "VAN", "PICKUP", "CONVERTIBLE", "ETC"],
    FUEL_TYPE:        ["GASOLINE", "DIESEL", "LPG", "HEV", "PHEV", "EV", "HYDROGEN_FCEV", "ETC"],
    SALES_CHANNEL:    ["GENERAL", "RENTAL", "BUSINESS", "DISABLED", "DRIVING_SCHOOL", "COMMERCIAL"],
    DRIVETRAIN:       ["2WD", "AWD", "4WD"],
    OPTION_TYPE:      ["SELECTABLE", "STANDARD"],
    OPTION_CATEGORY:  ["PACKAGE", "ITEM", "POWERTRAIN", "DRIVETRAIN", "SEAT", "WHEEL", "ACCESSORY", "ETC"],
    COLOR_TYPE:       ["EXTERIOR", "INTERIOR"],
    COLOR_KIND:       ["SOLID", "TWO_TONE", "MATTE", "ETC"],
    IMAGE_STATUS:     ["VERIFIED", "REVIEW_REQUIRED", "NOT_FOUND", "NOT_SEARCHED", "LICENSE_NOT_VERIFIED"],
    MATCH_CONFIDENCE: ["HIGH", "MEDIUM", "LOW"],
    SOURCE_TYPE:      ["OFFICIAL_SITE", "OFFICIAL_PRICE_LIST", "OFFICIAL_CATALOG", "OFFICIAL_CONFIGURATOR", "OFFICIAL_PRESS", "PUBLIC_DATA", "WIKIMEDIA_COMMONS", "CHAQ_INTERNAL"]
  };
  var FUEL_LABEL_KO = { GASOLINE: "가솔린", DIESEL: "디젤", LPG: "LPG", HEV: "하이브리드", PHEV: "플러그인 하이브리드", EV: "전기", HYDROGEN_FCEV: "수소전기", ETC: "기타" };
  var CHANNEL_LABEL_KO = { GENERAL: "일반", RENTAL: "렌터카용", BUSINESS: "영업용", DISABLED: "장애인용", DRIVING_SCHOOL: "운전교습용", COMMERCIAL: "상용" };
  var TABLES = ["brands", "models", "lineups", "trims", "options", "trimOptions", "colors", "trimColors", "colorRules", "vehicleSpecs", "vehicleImages", "sources"];

  var D = null, IX = null;

  function emptyData() { var o = { meta: {} }; for (var i = 0; i < TABLES.length; i++) o[TABLES[i]] = []; return o; }
  function indexBy(arr, key) { var m = {}; for (var i = 0; i < arr.length; i++) m[arr[i][key]] = arr[i]; return m; }
  function groupBy(arr, key) { var m = {}; for (var i = 0; i < arr.length; i++) { var k = arr[i][key]; if (k == null) continue; (m[k] = m[k] || []).push(arr[i]); } return m; }
  function bySort(a, b) { var x = a.sortOrder == null ? 0 : a.sortOrder, y = b.sortOrder == null ? 0 : b.sortOrder; return x - y; }
  function copy(arr) { return arr ? arr.slice() : []; }
  function has(arr, v) { return arr && arr.indexOf(v) >= 0; }

  // ---------------------------------------------------------------- Pilot(pilot-0.x) → FINAL 자동 변환
  function isPilot(data) { var v = (data && data.meta && data.meta.schemaVersion) || ""; return /^pilot/.test(String(v)); }
  function adaptPilot(data) {
    var out = emptyData(), i, r;
    out.meta = { schemaVersion: "final-1.0", schemaStatus: "ADAPTED_FROM_PILOT", generatedAt: data.meta && data.meta.generatedAt, description: "pilot-0.1 데이터를 Helper 가 FINAL 형태로 즉석 변환" };
    out.brands = copy(data.brands); out.sources = copy(data.sources);
    for (i = 0; i < (data.models || []).length; i++) { r = data.models[i]; out.models.push({ id: r.id, brandId: r.brandId, nameKo: r.nameKo, nameEn: r.nameEn, bodyType: r.bodyType || "ETC", familyKey: r.id, status: r.status, sortOrder: r.sortOrder, sourceIds: r.sourceIds || [] }); }
    for (i = 0; i < (data.lineups || []).length; i++) { r = data.lineups[i]; out.lineups.push({ id: r.id, modelId: r.modelId, displayName: r.displayName, shortLabel: r.displayName, generationName: r.generationName || null, generationCode: r.generationCode || null, generationCodeVerified: false, modelYear: r.modelYear, fuelType: r.fuelType, engineSummary: r.engineSummary || null, salesChannel: "GENERAL", status: r.status, imageStatus: r.imageStatus, sortOrder: r.sortOrder, sourceIds: r.sourceIds || [] }); }
    var stdByTrim = {};
    for (i = 0; i < (data.trimOptions || []).length; i++) { r = data.trimOptions[i]; if (r.type === "STANDARD") { var o = null; for (var k = 0; k < data.options.length; k++) if (data.options[k].id === r.optionId) { o = data.options[k]; break; } (stdByTrim[r.trimId] = stdByTrim[r.trimId] || []).push(o ? o.name : r.optionId); } else { var dep = [], exc = [], dn = [], en = [], oid = indexBy(data.options || [], "id"); (r.dependency || []).forEach(function (d) { (oid[d] ? dep : dn).push(d); }); (r.exclusionRule || []).forEach(function (d) { (oid[d] ? exc : en).push(d); }); out.trimOptions.push({ trimId: r.trimId, optionId: r.optionId, price: r.price == null ? null : r.price, type: "SELECTABLE", condition: null, dependency: dep, exclusionRule: exc, dependencyNote: dn.length ? dn.join("; ") : null, exclusionNote: en.length ? en.join("; ") : null }); } }
    var usedOpt = {}; for (i = 0; i < out.trimOptions.length; i++) usedOpt[out.trimOptions[i].optionId] = 1;
    var trimModel = {}; var lineupModel = indexBy(out.lineups, "id");
    for (i = 0; i < (data.trims || []).length; i++) { r = data.trims[i]; var lm = lineupModel[r.lineupId]; trimModel[r.id] = lm ? lm.modelId : null; out.trims.push({ id: r.id, lineupId: r.lineupId, name: r.name, nameEn: null, drivetrain: null, seatCount: null, variantNote: null, standardItems: stdByTrim[r.id] || [], status: r.status, sortOrder: r.sortOrder, sourceIds: r.sourceIds || [] }); }
    var optModel = {}; for (i = 0; i < out.trimOptions.length; i++) if (!optModel[out.trimOptions[i].optionId]) optModel[out.trimOptions[i].optionId] = trimModel[out.trimOptions[i].trimId];
    for (i = 0; i < (data.options || []).length; i++) { r = data.options[i]; if (!usedOpt[r.id]) continue; out.options.push({ id: r.id, modelId: optModel[r.id] || null, name: r.name, nameEn: null, category: "PACKAGE", description: r.description || "", items: [] }); }
    for (i = 0; i < (data.colors || []).length; i++) { r = data.colors[i]; out.colors.push({ id: r.id, brandId: null, name: r.name, nameEn: null, hex: r.hex || null, manufacturerCode: r.manufacturerCode || null, kind: null }); }
    for (i = 0; i < (data.trimColors || []).length; i++) { r = data.trimColors[i]; out.trimColors.push({ trimId: r.trimId, colorId: r.colorId, type: r.type, extraPrice: r.extraPrice == null ? 0 : r.extraPrice, note: null }); }
    for (i = 0; i < (data.vehicleSpecs || []).length; i++) { r = data.vehicleSpecs[i]; var lid = r.lineupId; if (!lid && r.trimId) { for (var t = 0; t < out.trims.length; t++) if (out.trims[t].id === r.trimId) { lid = out.trims[t].lineupId; break; } }
      out.vehicleSpecs.push({ id: r.id, lineupId: lid, trimIds: r.trimId ? [r.trimId] : [], variant: { wheelInch: null, builtInCam: null, seatCount: r.seatCount || null, drivetrain: r.drivetrain || null, transmission: r.transmission || null }, engine: r.engine, displacementCc: r.displacementCc, drivetrain: r.drivetrain, transmission: r.transmission, seatCount: r.seatCount, maxPowerPs: null, maxPowerRpm: null, maxPowerText: r.horsepower == null ? null : String(r.horsepower), maxTorqueKgfm: null, maxTorqueRpm: null, maxTorqueText: r.torque == null ? null : String(r.torque), combinedEfficiency: r.combinedEfficiency == null ? null : Number(r.combinedEfficiency) || null, efficiencyUnit: null, efficiencyCity: null, efficiencyHighway: null, efficiencyGrade: null, co2GPerKm: null, curbWeightKg: r.curbWeightKg, dimensions: r.dimensions || { lengthMm: null, widthMm: null, heightMm: null, wheelbaseMm: null }, hev: { motorPowerKw: null, systemPowerPs: null }, ev: { batteryCapacityKwh: r.ev && r.ev.batteryCapacityKwh, batteryVoltage: null, batteryAh: null, electricRangeKm: r.ev && r.ev.electricRangeKm, electricRangeCityKm: null, electricRangeHighwayKm: null, motorPowerKw: r.ev && r.ev.motorPowerKw, motorPowerFrontKw: null, motorPowerRearKw: null, electricEfficiency: r.ev && r.ev.electricEfficiency != null ? Number(r.ev.electricEfficiency) || null : null, electricEfficiencyCity: null, electricEfficiencyHighway: null }, fcev: r.fcev || {}, note: null, sourceIds: r.sourceIds || [] }); }
    for (i = 0; i < (data.vehicleImages || []).length; i++) { r = data.vehicleImages[i]; out.vehicleImages.push({ id: r.id, lineupId: r.lineupId, trimId: r.trimId || null, imageUrl: r.imageUrl, thumbnailUrl: r.thumbnailUrl || null, source: r.source, sourceUrl: r.sourceUrl || null, filename: r.filename || null, author: r.author || null, license: r.license || null, licenseUrl: r.licenseUrl || null, attribution: r.attribution || null, verified: r.verified === true, matchConfidence: null, reviewNote: null, sortOrder: r.sortOrder }); }
    return out;
  }

  function build() {
    IX = {
      brand: indexBy(D.brands, "id"), model: indexBy(D.models, "id"), lineup: indexBy(D.lineups, "id"), trim: indexBy(D.trims, "id"),
      option: indexBy(D.options, "id"), color: indexBy(D.colors, "id"), source: indexBy(D.sources, "id"),
      modelsByBrand: groupBy(D.models, "brandId"), lineupsByModel: groupBy(D.lineups, "modelId"), trimsByLineup: groupBy(D.trims, "lineupId"),
      trimOptionsByTrim: groupBy(D.trimOptions, "trimId"), trimColorsByTrim: groupBy(D.trimColors, "trimId"), colorRulesByTrim: groupBy(D.colorRules, "trimId"),
      specsByLineup: groupBy(D.vehicleSpecs, "lineupId"),
      imagesByTrim: groupBy(D.vehicleImages, "trimId"), imagesByLineup: groupBy(D.vehicleImages.filter(function (im) { return im.trimId == null; }), "lineupId")
    };
  }

  /** 데이터 소스 교체. pilot 데이터는 자동 변환. 누락 테이블은 빈 배열. */
  function load(data) {
    data = data || {};
    if (isPilot(data)) data = adaptPilot(data);
    D = emptyData(); D.meta = data.meta || {};
    for (var i = 0; i < TABLES.length; i++) D[TABLES[i]] = Array.isArray(data[TABLES[i]]) ? data[TABLES[i]] : [];
    build(); LOADED_DETAIL = {};
    (root.CHAQ_VM_DETAILS || []).forEach(function (d) { addDetail(d, true); }); if ((root.CHAQ_VM_DETAILS || []).length) build();
    return VM;
  }
  // ---------------------------------------------------------------- 분할 배포: 모델별 상세본(vm/<모델id>.js) 합치기
  var LOADED_DETAIL = {};
  /** 상세본(옵션·트림옵션·색상·트림색상·색상규칙·기본품목)을 공통본에 합침. 같은 모델은 한 번만 */
  function addDetail(d, noBuild) {
    if (!d || !D || LOADED_DETAIL[d.modelId]) return VM; LOADED_DETAIL[d.modelId] = true;
    var seenC = {}; D.colors.forEach(function (c) { seenC[c.id] = 1; });
    var seenO = {}; D.options.forEach(function (o) { seenO[o.id] = 1; });
    (d.options || []).forEach(function (o) { if (!seenO[o.id]) { seenO[o.id] = 1; D.options.push(o); } });
    (d.colors || []).forEach(function (c) { if (!seenC[c.id]) { seenC[c.id] = 1; D.colors.push(c); } });
    D.trimOptions = D.trimOptions.concat(d.trimOptions || []); D.trimColors = D.trimColors.concat(d.trimColors || []); D.colorRules = D.colorRules.concat(d.colorRules || []);
    var std = d.standardItems || {}; D.trims.forEach(function (t) { if (std[t.id]) t.standardItems = std[t.id]; });
    if (!noBuild) build(); return VM;
  }
  function isDetailLoaded(modelId) { return !!LOADED_DETAIL[modelId] || !(D.meta && D.meta.split); }
  /** 트림 선택옵션 개수: 상세본이 있으면 실제 행 수, 없으면 공통본의 optCount */
  function getTrimOptionCount(trimId) { var t = getTrim(trimId); if (!t) return 0; var rows = IX.trimOptionsByTrim[trimId]; return rows && rows.length ? rows.length : (t.optCount || 0); }
  /** trimId → 모델 id (상세본 파일 이름) */
  function modelIdOfTrim(trimId) { var t = getTrim(trimId); var l = t && IX.lineup[t.lineupId]; return l ? l.modelId : null; }

  // ---------------------------------------------------------------- 필터
  function activeOnly(arr, opt) { if (opt && opt.includeInactive) return arr; return arr.filter(function (r) { return !r.status || r.status === "ACTIVE"; }); }
  function channelFilter(lineups, opt) {
    var ch = opt && opt.salesChannels; if (!ch) return lineups;
    var f = lineups.filter(function (l) { return has(ch, l.salesChannel || "GENERAL"); });
    // 상용 전용 모델(1톤 트럭·카고 밴 등)은 노출 범위(scope)에 지정돼 있으므로 요청 채널에 없어도 상용 라인업을 그대로 노출
    if (!f.length && lineups.length && lineups.every(function (l) { return l.salesChannel === "COMMERCIAL"; })) return lineups;
    return f;
  }

  // ---------------------------------------------------------------- 조회
  function getBrands(opt) { return activeOnly(copy(D.brands), opt).sort(bySort); }
  function getBrand(id) { return IX.brand[id] || null; }
  function getModels(brandId, opt) { return activeOnly(copy(IX.modelsByBrand[brandId]), opt).sort(bySort); }
  function getModel(id) { return IX.model[id] || null; }
  function getModelsByFamily(familyKey) { return D.models.filter(function (m) { return m.familyKey === familyKey; }).sort(bySort); }
  function getLineups(modelId, opt) { return channelFilter(activeOnly(copy(IX.lineupsByModel[modelId]), opt), opt).sort(bySort); }
  function getLineup(id) { return IX.lineup[id] || null; }
  function getTrims(lineupId, opt) { return activeOnly(copy(IX.trimsByLineup[lineupId]), opt).sort(bySort); }
  function getTrim(id) { return IX.trim[id] || null; }
  /** 모델 하위 전체 트림 (라인업 순 → 트림 순). opt.salesChannels 로 채널 필터. */
  function getTrimsByModel(modelId, opt) { var out = [], ls = getLineups(modelId, opt); for (var i = 0; i < ls.length; i++) out = out.concat(getTrims(ls[i].id, opt)); return out; }
  /** 등급 팝업용: 라인업별 섹션 [{ lineup, label, trims }] — 라인업이 1개면 label 은 null(헤더 생략) */
  function getTrimGroups(modelId, opt) {
    var ls = getLineups(modelId, opt), out = [];
    for (var i = 0; i < ls.length; i++) { var ts = getTrims(ls[i].id, opt); if (!ts.length) continue; out.push({ lineup: ls[i], label: ls.length > 1 ? lineupLabel(ls[i]) : null, trims: ts }); }
    return out;
  }
  function lineupLabel(l) { var s = l.shortLabel || l.displayName || ""; if (l.salesChannel && l.salesChannel !== "GENERAL" && s.indexOf(CHANNEL_LABEL_KO[l.salesChannel]) < 0) s += " · " + CHANNEL_LABEL_KO[l.salesChannel]; return s; }
  /** 동일 트림명이 같은 모델의 다른 라인업에도 있으면 "shortLabel · 트림명", 아니면 트림명 */
  function trimLabel(trimId) {
    var t = getTrim(trimId); if (!t) return ""; var l = getLineup(t.lineupId); if (!l) return t.name;
    var same = getTrimsByModel(l.modelId, { includeInactive: true }).filter(function (x) { return x.name === t.name && x.id !== t.id; });
    if (!same.length) return t.name;
    // 같은 이름이 있으면 구분값을 앞에: 라인업 · 인승 · 구동 (final-1.3: 트림명에는 구동·인승을 쓰지 않음)
    var lb = lineupLabel(l), parts = [];
    if (same.some(function (x) { return x.lineupId !== t.lineupId; })) parts.push(lb);
    if (t.seatCount && same.some(function (x) { return x.seatCount !== t.seatCount; }) && lb.indexOf(t.seatCount + "인승") < 0) parts.push(t.seatCount + "인승");
    if (same.some(function (x) { return (x.drivetrain || "") !== (t.drivetrain || ""); }) && t.drivetrain) parts.push(t.driveLabel || t.drivetrain);
    if (!parts.length) parts.push(lb);
    return parts.concat([t.name]).join(" · ");
  }
  /** 브랜드 + 모델 (모델명이 브랜드명으로 시작하면 한 번만: '폴스타 폴스타 2' → '폴스타 2') */
  function carFullName(b, m) { var bn = (b && b.nameKo) || "", mn = (m && m.nameKo) || ""; return mn.indexOf(bn + " ") === 0 || mn === bn ? mn : [bn, mn].filter(Boolean).join(" "); }
  /** 견적 레코드의 화면용 차명: 차량 데이터와 연결돼 있으면 카탈로그 차명, 아니면 견적의 브랜드·모델 */
  function carName(rec) { var d = rec && rec.trimId ? describe(rec.trimId) : null; return d ? d.fullName : ((rec && rec.brand) || "") + " " + ((rec && rec.model) || ""); }
  function describe(trimId) {
    var t = getTrim(trimId); if (!t) return null;
    var l = getLineup(t.lineupId) || {}, m = getModel(l.modelId) || {}, b = getBrand(m.brandId) || {};
    return { trim: t, lineup: l, model: m, brand: b, brandName: b.nameKo || "", modelName: m.nameKo || "", lineupName: l.displayName || "", lineupLabel: lineupLabel(l), trimName: t.name || "",
      fuelType: l.fuelType || null, fuelLabel: FUEL_LABEL_KO[l.fuelType] || "", modelYear: l.modelYear || null, generationName: l.generationName || null, generationCode: l.generationCode || null,
      salesChannel: l.salesChannel || "GENERAL", drivetrain: t.drivetrain || null, seatCount: t.seatCount || null,
      fullName: carFullName(b, m), trimLabel: trimLabel(trimId) };
  }

  // ---------------------------------------------------------------- 옵션 / 색상
  function getStandardItems(trimId) { var t = getTrim(trimId); return t && t.standardItems ? copy(t.standardItems) : []; }
  function getTrimOptions(trimId, type) {
    var rows = copy(IX.trimOptionsByTrim[trimId]); if (type) rows = rows.filter(function (r) { return r.type === type; });
    return rows.map(function (r) { var o = IX.option[r.optionId] || {}; return { trimId: r.trimId, optionId: r.optionId, name: o.name || "", nameEn: o.nameEn || null, category: o.category || null, description: o.description || "", items: o.items || [], price: r.price == null ? null : r.price, type: r.type, condition: r.condition || null, dependency: r.dependency || [], exclusionRule: r.exclusionRule || [], dependencyNote: r.dependencyNote || null, exclusionNote: r.exclusionNote || null }; });
  }
  function getTrimColors(trimId, type) {
    var rows = copy(IX.trimColorsByTrim[trimId]); if (type) rows = rows.filter(function (r) { return r.type === type; });
    return rows.map(function (r) { var c = IX.color[r.colorId] || {}; return { trimId: r.trimId, colorId: r.colorId, name: c.name || "", nameEn: c.nameEn || null, hex: c.hex || null, manufacturerCode: c.manufacturerCode || null, kind: c.kind || null, type: r.type, extraPrice: r.extraPrice == null ? null : r.extraPrice, note: r.note || null }; });
  }
  function getColorRules(trimId) { return copy(IX.colorRulesByTrim[trimId]); }
  /** 내장색 선택 시 허용되는 외장색 ID 목록 (규칙 없으면 트림의 전체 외장색) */
  function allowedExteriorColors(trimId, interiorColorId) {
    var all = getTrimColors(trimId, "EXTERIOR").map(function (c) { return c.colorId; });
    var rules = getColorRules(trimId).filter(function (r) { return r.interiorColorId === interiorColorId; });
    if (!rules.length) return all;
    var out = all;
    for (var i = 0; i < rules.length; i++) { var r = rules[i]; if (r.allowedExteriorColorIds && r.allowedExteriorColorIds.length) out = out.filter(function (id) { return has(r.allowedExteriorColorIds, id); }); if (r.excludedExteriorColorIds && r.excludedExteriorColorIds.length) out = out.filter(function (id) { return !has(r.excludedExteriorColorIds, id); }); }
    return out;
  }

  // ---------------------------------------------------------------- 제원
  /** 트림에 적용되는 제원 레코드 전체 (trimIds 포함 또는 라인업 공통). variant 조건으로 추가 필터 가능 */
  function getSpecList(trimId, variant) {
    var t = getTrim(trimId); if (!t) return [];
    var rows = copy(IX.specsByLineup[t.lineupId]).filter(function (s) { return !s.trimIds || !s.trimIds.length || has(s.trimIds, trimId); });
    if (variant) rows = rows.filter(function (s) { var v = s.variant || {}; for (var k in variant) { if (variant[k] == null) continue; if (v[k] != null && String(v[k]) !== String(variant[k])) return false; } return true; });
    return rows;
  }
  /** 대표 제원 1건: 트림 지정 레코드 > 트림의 구동/인승과 일치 > 빌트인캠 없음 > 첫 레코드. 없으면 null (추정 금지) */
  function getSpecs(trimId, variant) {
    var t = getTrim(trimId); if (!t) return null;
    var rows = getSpecList(trimId, variant); if (!rows.length) return null;
    function score(s) { var v = s.variant || {}, n = 0; if (s.trimIds && has(s.trimIds, trimId)) n += 8; if (t.drivetrain && v.drivetrain === t.drivetrain) n += 4; if (t.seatCount && v.seatCount === t.seatCount) n += 2; if (!v.builtInCam) n += 1; if (s.dimensions && s.dimensions.lengthMm) n += 2; if (s.maxPowerPs) n += 1; return n; }
    rows.sort(function (a, b) { return score(b) - score(a); }); return rows[0];
  }

  // ---------------------------------------------------------------- 이미지
  function verifiedFirst(arr) { return copy(arr).filter(function (im) { return im.verified === true; }).sort(bySort); }
  /** 외장색 → 이미지 파일 키 (tools/own-images.js 와 동일 규칙): 제조사 코드 소문자, 없으면 color id 에서 브랜드 접두어 제거 */
  function colorKeyOf(c) { if (!c) return null; if (typeof c === "string") c = IX.color[c] || { id: c }; var k = c.manufacturerCode ? c.manufacturerCode : String(c.id || c.colorId || "").replace(/^[a-z-]+?-color-/, ""); return String(k).toLowerCase().replace(/[^a-z0-9-]+/g, "-") || null; }
  /** 견적(재고 실차)의 외장색 이름 → 이 트림 외장색의 colorKey. 공백·괄호 무시 정확 일치 → 포함 관계. 없으면 null (추정 금지) */
  function colorKeyByName(trimId, name) { if (!name) return null; var n = function (x) { return String(x || "").toLowerCase().replace(/\(.*?\)|\[.*?\]|[\s·\-_/]+/g, ""); }; var q = n(name); if (!q) return null; var cs = getTrimColors(trimId, "EXTERIOR"), i; for (i = 0; i < cs.length; i++) if (n(cs[i].name) === q || (cs[i].nameEn && n(cs[i].nameEn) === q) || (cs[i].manufacturerCode && n(cs[i].manufacturerCode) === q)) return colorKeyOf(cs[i].colorId); for (i = 0; i < cs.length; i++) { var c = n(cs[i].name); if (c && (q.indexOf(c) >= 0 || c.indexOf(q) >= 0)) return colorKeyOf(cs[i].colorId); } return null; }
  function getImageKey(trimId) { var t = getTrim(trimId); var l = t && IX.lineup[t.lineupId]; return (l && l.imageKey) || null; }
  /** 이미지 선택: trim → lineup 순, 각 단계에서 colorKey 일치 → 대표(default, colorKey 없음) → 첫 이미지. view 기본 side. 미검증 이미지는 자동 노출 안 함 */
  function pickByColor(arr, colorKey, view) { if (!arr.length) return null; view = view || "side"; var v = arr.filter(function (im) { return (im.view || "side") === view; }); if (!v.length) v = arr; var i; if (colorKey) for (i = 0; i < v.length; i++) if (v[i].colorKey === colorKey) return v[i]; for (i = 0; i < v.length; i++) if (!v[i].colorKey) return v[i]; return v[0]; }
  function getPrimaryImage(trimId, colorKey, view) { var t = getTrim(trimId); if (!t) return null; var a = verifiedFirst(IX.imagesByTrim[trimId]); if (a.length) return pickByColor(a, colorKey, view); var b = verifiedFirst(IX.imagesByLineup[t.lineupId]); return pickByColor(b, colorKey, view); }
  // ---------------------------------------------------------------- 트림 가격 (final-1.2)
  /** 차량 데이터의 트림 기본가(listPrice). 파일 기준 기본값 — 견적 데이터가 있으면 화면은 견적 차량가 우선 */
  function getListPrice(trimId) { var t = getTrim(trimId); if (!t || t.listPrice == null) return null; return { price: t.listPrice, beforeTaxBenefit: t.listPriceBeforeTaxBenefit == null ? null : t.listPriceBeforeTaxBenefit, basis: t.listPriceBasis || null, source: t.listPriceSource || null, date: t.listPriceDate || null }; }
  /** 화면용 차량가: 견적 레코드(rec.base) → 이 트림에 연결된 대표 견적 → 트림 기본가 순 */
  function getTrimPrice(trimId, rec) { if (rec && rec.base != null) return { price: rec.base, source: "QUOTE" }; var pk = pickQuote(trimId); if (pk && pk.rec && pk.rec.base != null) return { price: pk.rec.base, source: "QUOTE" }; var lp = getListPrice(trimId); return lp ? { price: lp.price, source: "VM_" + (lp.source || "FILE") } : null; }
  function getImages(lineupId, includeUnverified) { var all = copy(IX.imagesByLineup[lineupId]); return includeUnverified ? all.sort(bySort) : verifiedFirst(all); }
  /** 트림에서 실제 이미지가 있는 외장색 키 목록 (색상 선택 UI 에서 이미지 교체 가능 여부 판단용) */
  function getImageColorKeys(trimId) { var t = getTrim(trimId); if (!t) return []; var arr = verifiedFirst(IX.imagesByTrim[trimId]).concat(verifiedFirst(IX.imagesByLineup[t.lineupId])), o = {}, r = []; arr.forEach(function (im) { if (im.colorKey && !o[im.colorKey]) { o[im.colorKey] = 1; r.push(im.colorKey); } }); return r; }
  /** 사이트 루트 기준 상대경로(assets/…)를 현재 페이지 위치에 맞게 보정 (pages/ 하위면 ../) */
  function siteUrl(u) { if (u && /^\/api\//.test(u) && root.CHAQ_API && root.CHAQ_API.base) return String(root.CHAQ_API.base).replace(/\/$/, '') + u;   // 관리자 화면에서 올린 이미지 (/api/pub/media/...)
    if (!u || /^(https?:|data:|\/|\.\.\/|file:)/.test(u)) return u; var p = (root.location && root.location.pathname) || ""; return /\/pages\//.test(p) ? "../" + u : u; }
  /** 노출 우선순위: trim VERIFIED → lineup VERIFIED(외장색 일치 → 대표) → fallbacks[] (placeholder) */
  function resolveImageUrl(trimId, fallbacks, preferThumb, colorKey, view) { var im = getPrimaryImage(trimId, colorKey, view); if (im) return siteUrl((preferThumb && im.thumbnailUrl) || im.imageUrl); fallbacks = fallbacks || []; for (var i = 0; i < fallbacks.length; i++) if (fallbacks[i]) return fallbacks[i]; return null; }
  /** 이미지 출처 표기문: 차큐 자체 제작 이미지는 표기 없음(null). 과거 외부 이미지 호환: Commons / 뉴스룸 */
  function imageCredit(trimId, colorKey) { var im = getPrimaryImage(trimId, colorKey); if (!im || im.source === "CHAQ_OWN") return null; var t = im.attribution || [im.author, im.license].filter(Boolean).join(" / "); if (im.source === "WIKIMEDIA_COMMONS") t = "사진: " + t + " (Wikimedia Commons)"; else if (!/^사진:/.test(t)) t = "사진: " + t; return t; }

  function getSources(entity) { var ids = (entity && entity.sourceIds) || []; return ids.map(function (id) { return IX.source[id] || null; }).filter(Boolean); }
  /** Quote/Stock 레코드에 trimId 가 있으면 Vehicle Master 정보, 없으면 null (추측 금지) */
  function fromQuote(rec) { return (rec && rec.trimId) ? describe(rec.trimId) : null; }

  // ---------------------------------------------------------------- STEP 8: Quote ↔ Vehicle Master
  //  원칙: 차량이 "무엇인가"는 Vehicle Master, "얼마·어떤 조건·어떤 실차인가"는 Quote.
  //  재고 차량은 연식·구동·인승·장착옵션·색상이 Vehicle Master 기준 등급과 다를 수 있다 → 견적 데이터가 우선.
  //   · 항상 견적 기준: 연식/유종 설명(year), 등급 표기(trim), 차량가(vehiclePrice), 월납입금·잔가, 장착옵션(opts), 색상(ext/int)
  //   · Vehicle Master 사용: 브랜드·모델명, 이미지(세대 단위 검증), 그리고 연식이 같을 때만 선택옵션·공식 옵션가·색상 목록·기본품목·제원
  //   · 연식이 다르면(yearMatch=false): 1년 이내 차이는 VM(공식 가격표) 옵션·색상을 "기준 연식" 표기와 함께 참고로 노출, 2년 이상 차이는 노출하지 않음
  var QIX = null;
  function quoteIndex(Q) {
    Q = Q || root.CHAQ || {}; if (QIX && QIX.src === Q) return QIX;
    QIX = { src: Q, byTrim: {} };
    ["stock", "fast", "estimate"].forEach(function (kind) { (Q[kind] || []).forEach(function (r) { if (r && r.trimId) (QIX.byTrim[r.trimId] = QIX.byTrim[r.trimId] || []).push({ kind: kind, rec: r }); }); });
    return QIX;
  }
  /** trimId 에 연결된 견적 레코드 [{kind, rec}] */
  function getQuotes(trimId, Q) { return copy(quoteIndex(Q).byTrim[trimId]); }
  /** 대표 견적 1건: 월납입금 있는 견적 → 선호 종류(prefer: stock|fast|estimate) → 연식 일치 → 최신 연식 → 낮은 차량가. 없으면 null */
  function pickQuote(trimId, prefer, Q) {
    var list = getQuotes(trimId, Q); if (!list.length) return null;
    function yr(x) { return (x.rec.vmLink && x.rec.vmLink.quoteModelYear) || 0; }
    function hasCost(x) { var c = x.rec.cost || {}; for (var d in c) for (var t in c[d]) for (var p in c[d][t]) if (c[d][t][p]) return 1; return 0; }
    list.sort(function (a, b) {
      var ca = hasCost(a), cb = hasCost(b); if (ca !== cb) return cb - ca;   // 월납입금 있는 견적 우선
      var pa = a.kind === prefer ? 0 : 1, pb = b.kind === prefer ? 0 : 1; if (pa !== pb) return pa - pb;
      var ya = a.rec.vmLink && a.rec.vmLink.yearMatch === false ? 1 : 0, yb = b.rec.vmLink && b.rec.vmLink.yearMatch === false ? 1 : 0; if (ya !== yb) return ya - yb;
      if (yr(b) !== yr(a)) return yr(b) - yr(a);
      return (a.rec.vehiclePrice || 0) - (b.rec.vehiclePrice || 0);
    });
    return list[0];
  }
  /** 견적 1건을 화면용으로 합성. src 에 각 값의 출처(QUOTE|VM|NONE), notices 에 기준정보와 다른 점 */
  function quoteView(rec) {
    if (!rec) return null;
    var d = rec.trimId ? describe(rec.trimId) : null;
    var link = rec.vmLink || {}; var sameYear = !!d && link.yearMatch !== false;
    // 연식 차이 1년 이내면 VM(공식 가격표) 옵션·색상은 참고용으로 사용 — 화면에 기준 연식 표기. 2년 이상 차이면 미사용
    var yDiff = (link.quoteModelYear && link.vmModelYear) ? Math.abs(link.quoteModelYear - link.vmModelYear) : 0;
    var vmUsable = !!d && (sameYear || yDiff <= 1);
    var qColors = [rec.ext, rec["int"]].filter(Boolean);
    var v = {
      trimId: rec.trimId || null, matched: !!d, sameYear: sameYear, vmUsable: vmUsable, vmModelYear: link.vmModelYear || (d ? d.lineup.modelYear : null), confidence: link.confidence || "NONE",
      name: d ? d.fullName : [rec.brand, rec.model].filter(Boolean).join(" "),
      yearLabel: rec.year || null, trimLabel: rec.trim || (d ? d.trimName : null),
      modelYear: link.quoteModelYear || (d && sameYear ? d.lineup.modelYear : null),
      vehiclePrice: rec.vehiclePrice != null ? rec.vehiclePrice : (rec.base != null ? rec.base : null),
      quoteOptions: (rec.opts || []).map(function (o) { return { name: o.n, price: o.p != null ? o.p : null }; }),
      quoteColors: qColors,
      vmOptions: vmUsable ? getTrimOptions(rec.trimId, "SELECTABLE") : [],
      vmColors: vmUsable ? getTrimColors(rec.trimId) : [],
      standardItems: vmUsable ? getStandardItems(rec.trimId) : [],
      specs: vmUsable ? getSpecs(rec.trimId) : null,
      image: d ? getPrimaryImage(rec.trimId) : null,
      diffs: link.diffs || [],
      notices: []
    };
    v.src = { name: d ? "VM" : "QUOTE", year: "QUOTE", trim: "QUOTE", price: "QUOTE", options: v.quoteOptions.length ? "QUOTE" : (v.vmOptions.length ? "VM" : "NONE"), colors: qColors.length ? "QUOTE" : (v.vmColors.length ? "VM" : "NONE"), specs: v.specs ? "VM" : "NONE", image: v.image ? "VM" : "NONE" };
    if (d && link.yearMatch === false) v.notices.push("연식 차이: 견적 " + (link.quoteModelYear || "?") + "년형 / 기준정보 " + link.vmModelYear + "년형 — " + (vmUsable ? "옵션·색상·옵션가는 " + link.vmModelYear + "년형 공식 가격표 기준(참고)" : "해당 연식 옵션 정보 없음"));
    (link.diffs || []).forEach(function (x) { if (x.field === "drivetrain" && x.vm) v.notices.push("구동방식: 견적 " + x.quote + " (기준 등급 " + x.vm + ")"); if (x.field === "seatCount") v.notices.push("인승: 견적 " + x.quote + "인승 (기준 등급 " + x.vm + "인승)"); });
    return v;
  }

  // ---------------------------------------------------------------- 검증
  function validate() {
    var errors = [], warnings = [];
    function dup(table, key) { var s = {}; for (var i = 0; i < D[table].length; i++) { var k = D[table][i][key]; if (k == null) { errors.push(table + "[" + i + "] " + key + " 누락"); continue; } if (s[k]) errors.push(table + " 중복 " + key + ": " + k); s[k] = 1; } }
    function ref(table, field, index, required) { for (var i = 0; i < D[table].length; i++) { var v = D[table][i][field]; if (v == null) { if (required) errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 누락"); continue; } if (!index[v]) errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 참조 없음: " + v); } }
    function refList(table, field, index) { for (var i = 0; i < D[table].length; i++) { var a = D[table][i][field] || []; for (var j = 0; j < a.length; j++) if (!index[a[j]]) errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 참조 없음: " + a[j]); } }
    function enumCheck(table, field, list, required) { for (var i = 0; i < D[table].length; i++) { var v = D[table][i][field]; if (v == null) { if (required) errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 누락"); continue; } if (list.indexOf(v) < 0) errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 허용값 아님: " + v); } }
    function req(table, field) { for (var i = 0; i < D[table].length; i++) { var v = D[table][i][field]; if (v == null || v === "") errors.push(table + "[" + (D[table][i].id || i) + "] " + field + " 누락"); } }
    function sourceRefs(table) { for (var i = 0; i < D[table].length; i++) { var r = D[table][i]; var ids = r.sourceIds || []; if (!ids.length) warnings.push(table + "[" + r.id + "] sourceIds 없음"); for (var j = 0; j < ids.length; j++) if (!IX.source[ids[j]]) errors.push(table + "[" + r.id + "] sourceId 참조 없음: " + ids[j]); } }
    ["brands", "models", "lineups", "trims", "options", "colors", "vehicleSpecs", "vehicleImages", "sources"].forEach(function (t) { dup(t, "id"); });
    ref("models", "brandId", IX.brand, true); ref("lineups", "modelId", IX.model, true); ref("trims", "lineupId", IX.lineup, true);
    ref("options", "modelId", IX.model, false); ref("colors", "brandId", IX.brand, false);
    ref("trimOptions", "trimId", IX.trim, true); ref("trimOptions", "optionId", IX.option, true);
    ref("trimColors", "trimId", IX.trim, true); ref("trimColors", "colorId", IX.color, true);
    ref("colorRules", "trimId", IX.trim, true); ref("colorRules", "interiorColorId", IX.color, true); refList("colorRules", "allowedExteriorColorIds", IX.color); refList("colorRules", "excludedExteriorColorIds", IX.color);
    ref("vehicleSpecs", "lineupId", IX.lineup, true); refList("vehicleSpecs", "trimIds", IX.trim);
    ref("vehicleImages", "lineupId", IX.lineup, true); ref("vehicleImages", "trimId", IX.trim, false);
    req("brands", "nameKo"); req("brands", "nameEn"); req("models", "nameKo"); req("models", "nameEn"); req("lineups", "displayName"); req("lineups", "shortLabel"); req("lineups", "modelYear"); req("trims", "name"); req("options", "name"); req("colors", "name"); req("sources", "retrievedAt");
    enumCheck("brands", "status", ENUMS.STATUS, true); enumCheck("brands", "domesticImport", ENUMS.DOMESTIC_IMPORT, true);
    enumCheck("models", "status", ENUMS.STATUS, true); enumCheck("models", "bodyType", ENUMS.BODY_TYPE, true);
    enumCheck("lineups", "status", ENUMS.STATUS, true); enumCheck("lineups", "fuelType", ENUMS.FUEL_TYPE, true); enumCheck("lineups", "imageStatus", ENUMS.IMAGE_STATUS, true); enumCheck("lineups", "salesChannel", ENUMS.SALES_CHANNEL, true);
    enumCheck("trims", "status", ENUMS.STATUS, true); enumCheck("trims", "drivetrain", ENUMS.DRIVETRAIN, false);
    enumCheck("options", "category", ENUMS.OPTION_CATEGORY, true); enumCheck("trimOptions", "type", ENUMS.OPTION_TYPE, true);
    enumCheck("colors", "kind", ENUMS.COLOR_KIND, false); enumCheck("trimColors", "type", ENUMS.COLOR_TYPE, true);
    enumCheck("vehicleImages", "matchConfidence", ENUMS.MATCH_CONFIDENCE, false); enumCheck("sources", "type", ENUMS.SOURCE_TYPE, true);
    var i, j;
    // 가격 정책
    for (i = 0; i < D.trims.length; i++) { var t = D.trims[i]; if (t.basePrice != null || t.price != null || t.vehiclePrice != null || t.salePrice != null) errors.push("trims[" + t.id + "] 차량가격 필드 금지"); }
    for (i = 0; i < D.lineups.length; i++) { var l0 = D.lineups[i]; if (l0.basePrice != null || l0.price != null || l0.vehiclePrice != null) errors.push("lineups[" + l0.id + "] 차량가격 필드 금지"); }
    // 옵션 의존/배타는 optionId 여야 함 (문장은 Note 로)
    for (i = 0; i < D.trimOptions.length; i++) { var to = D.trimOptions[i]; var a = (to.dependency || []).concat(to.exclusionRule || []); for (j = 0; j < a.length; j++) if (!IX.option[a[j]]) errors.push("trimOptions[" + to.trimId + "/" + to.optionId + "] dependency/exclusionRule 에 optionId 아닌 값: " + a[j]); }
    // 이미지
    for (i = 0; i < D.lineups.length; i++) { var l = D.lineups[i]; var imgs = IX.imagesByLineup[l.id] || []; var v = imgs.filter(function (x) { return x.verified === true; }).length; if (l.imageStatus === "VERIFIED" && !v) errors.push("lineups[" + l.id + "] imageStatus=VERIFIED 이나 verified 이미지 없음"); if (l.imageStatus !== "VERIFIED" && v) warnings.push("lineups[" + l.id + "] verified 이미지 있으나 imageStatus=" + l.imageStatus); }
    for (i = 0; i < D.vehicleImages.length; i++) { var im = D.vehicleImages[i]; if (im.verified === true && im.source !== "CHAQ_OWN" && (!im.license || !im.author || !im.sourceUrl || !im.licenseUrl)) errors.push("vehicleImages[" + im.id + "] verified 이미지에 license/licenseUrl/author/sourceUrl 누락"); if (im.verified === true && im.matchConfidence && im.matchConfidence !== "HIGH") errors.push("vehicleImages[" + im.id + "] verified 이나 matchConfidence=" + im.matchConfidence); }
    // 제원: variant 키 enum
    for (i = 0; i < D.vehicleSpecs.length; i++) { var s = D.vehicleSpecs[i]; var dv = (s.variant && s.variant.drivetrain) || s.drivetrain; if (dv && ENUMS.DRIVETRAIN.indexOf(dv) < 0) errors.push("vehicleSpecs[" + s.id + "] drivetrain 허용값 아님: " + dv); }
    sourceRefs("brands"); sourceRefs("models"); sourceRefs("lineups"); sourceRefs("trims"); sourceRefs("vehicleSpecs");
    // 세대코드 미검증 경고
    for (i = 0; i < D.lineups.length; i++) if (D.lineups[i].generationCode && D.lineups[i].generationCodeVerified !== true) warnings.push("lineups[" + D.lineups[i].id + "] generationCode 미검증");
    // 동일 트림명 라벨 중복 (정보)
    for (i = 0; i < D.models.length; i++) { var mid = D.models[i].id, seen = {}; var ts = getTrimsByModel(mid, { includeInactive: true }); for (j = 0; j < ts.length; j++) { var lb = trimLabel(ts[j].id); if (seen[lb]) errors.push("models[" + mid + "] 트림 라벨 중복: '" + lb + "' (lineups.shortLabel 로 구분 필요)"); seen[lb] = 1; } }
    var counts = {}; for (i = 0; i < TABLES.length; i++) counts[TABLES[i]] = D[TABLES[i]].length;
    var img = { VERIFIED: 0, REVIEW_REQUIRED: 0, NOT_FOUND: 0, NOT_SEARCHED: 0, LICENSE_NOT_VERIFIED: 0 }; for (i = 0; i < D.lineups.length; i++) { var st = D.lineups[i].imageStatus; if (img[st] != null) img[st]++; }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, counts: counts, imageStatus: img, schemaVersion: D.meta.schemaVersion || null, schemaStatus: D.meta.schemaStatus || null };
  }

  var VM = {
    ENUMS: ENUMS, FUEL_LABEL_KO: FUEL_LABEL_KO, CHANNEL_LABEL_KO: CHANNEL_LABEL_KO, SCHEMA_VERSION: "final-1.3",
    load: load, raw: function () { return D; }, meta: function () { return D.meta; },
    getBrands: getBrands, getBrand: getBrand, getModels: getModels, getModel: getModel, getModelsByFamily: getModelsByFamily,
    getLineups: getLineups, getLineup: getLineup, lineupLabel: lineupLabel,
    carName: carName, getTrims: getTrims, getTrim: getTrim, getTrimsByModel: getTrimsByModel, getTrimGroups: getTrimGroups, trimLabel: trimLabel, describe: describe,
    getStandardItems: getStandardItems, getTrimOptions: getTrimOptions, getTrimColors: getTrimColors, getColorRules: getColorRules, allowedExteriorColors: allowedExteriorColors,
    getSpecs: getSpecs, getSpecList: getSpecList,
    getPrimaryImage: getPrimaryImage, getImages: getImages, resolveImageUrl: resolveImageUrl, imageCredit: imageCredit,
    addDetail: addDetail, isDetailLoaded: isDetailLoaded, getTrimOptionCount: getTrimOptionCount, modelIdOfTrim: modelIdOfTrim, getListPrice: getListPrice, getTrimPrice: getTrimPrice, colorKeyOf: colorKeyOf, colorKeyByName: colorKeyByName, getImageKey: getImageKey, getImageColorKeys: getImageColorKeys, siteUrl: siteUrl,
    getSources: getSources, fromQuote: fromQuote, getQuotes: getQuotes, pickQuote: pickQuote, quoteView: quoteView, validate: validate
  };
  load(root.CHAQ_VEHICLE_MASTER || {});
  root.CHAQ_VM = VM;
  if (typeof module !== "undefined" && module.exports) module.exports = VM;
})(typeof window !== "undefined" ? window : globalThis);
