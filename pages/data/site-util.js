/* 차큐 사이트 공통 함수 (여러 페이지가 같이 씀) — 글자 이스케이프 · 금액 · 차량 이미지 · 색상칩 · 숫자 애니메이션
   · 페이지마다 복사돼 있던 같은 함수를 한 곳으로 모음 (261008 코드 정비)
   · 사용: window.CHAQ_UTIL.esc(s) / won(n) / PH / carImg(rec) / hex(colorName[, trimId, type]) / animateNum(el, to, em, nullText) */
(function (root) {
  "use strict";
  var inPages = /\/pages\//.test(root.location && root.location.pathname || "");
  var PH = (inPages ? "../" : "") + "assets/icons/car-placeholder.svg";   // 차량 이미지가 없을 때 대체 이미지
  /** HTML 글자 이스케이프 (본문·속성 공용). null/undefined → '' */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  /** 금액 천 단위 쉼표 */
  function won(n) { return (n || 0).toLocaleString("ko-KR"); }
  /** 차량가 짧게: 만원 단위로 떨어지면 '4,287만원', 아니면 원 단위 그대로 (반올림으로 다른 금액처럼 보이지 않게) */
  function priceShort(n) { n = +n || 0; return n % 10000 ? won(n) + "원" : won(n / 10000) + "만원"; }
  /** 견적 옵션 칸의 특수 토큰 종류 (사이트 로직 지시 2호 ①, RL-41 / 08 §3):
   *  'tax'   세제혜택:-N (구 토큰 '하이브리드 세제혜택:-N' 호환) → 상세 '세제혜택' 줄
   *  'pdisc' 차량가 할인:-N · 할인:-N (구 토큰 '대리점 할인 n%:-N' 호환) → 할인 줄 '차량가 할인 −N원'
   *  'mdisc' 월납입료 할인 (금액 없음) → 할인 줄 '월납입료 할인'
   *  'opt'   그 외(옵션·색상 추가금·기타). 위 라벨 밖의 음수 토큰은 차량가 할인으로 합산 + 콘솔 경고(게이트가 막으므로 0건이어야 함) */
  function tokKind(o) {
    if (!o || !o.n) return "opt";
    var n = String(o.n).replace(/\s+/g, " ").trim(), p = Number(o.p);
    if (/^(하이브리드 )?세제혜택$/.test(n)) return "tax";
    if (/^월납입료 할인$/.test(n)) return "mdisc";
    if (/^(차량가 할인|할인)$/.test(n) || /^대리점 할인/.test(n)) return "pdisc";
    if (p < 0) { try { console.warn("[chaq] 알 수 없는 음수 토큰 → 차량가 할인으로 처리:", n, p); } catch (e) {} return "pdisc"; }
    if (/할인/.test(n) && !(p > 0)) return "mdisc";   // 금액 없는 '○○ 할인' 류 — 옵션 줄에 두지 않음
    return "opt";
  }
  /** 견적 옵션 칸의 할인·세제혜택 항목(옵션 줄에 표시하지 않음) */
  function isDisc(o) { return tokKind(o) !== "opt"; }
  /** 장착 옵션(특수 토큰 제외) · 특수 항목 · 합계(음수) + 분해: tax(세제혜택, 양수) · pdisc(차량가 할인, 양수) · mdisc(월납입료 할인 여부) */
  function splitOpts(rec) {
    var all = (rec && rec.opts) || [], opts = [], discs = [], disc = 0, tax = 0, pdisc = 0, mdisc = false;
    all.forEach(function (o) {
      if (!o || !o.n) return;
      var k = tokKind(o);
      if (k === "opt") { opts.push(o); return; }
      discs.push(o); var p = Number(o.p);
      if (p < 0) disc += p;
      if (k === "tax") tax += Math.abs(p) || 0; else if (k === "pdisc") pdisc += Math.abs(p) || 0; else if (k === "mdisc") mdisc = true;
    });
    return { opts: opts, discs: discs, disc: disc, tax: tax, pdisc: pdisc, mdisc: mdisc };
  }
  /** 세제혜택 금액: 토큰 'tax' 있으면 그 금액, 없으면 차량 데이터 트림 '세제혜택액'(> 0), 둘 다 없으면 0 (2호 ①) */
  function taxBenefitOf(rec, sp) {
    sp = sp || splitOpts(rec); if (sp.tax > 0) return sp.tax;
    var VM = root.CHAQ_VM; if (VM && rec && rec.trimId && VM.getTaxBenefit) { var v = VM.getTaxBenefit(rec.trimId); if (v > 0) return v; }
    return 0;
  }
  /** 견적조회 '딜리버 기준가(추정)' 행 (DC-70, RL-19 #39): 금융사 칸이 실견적이 아닌 외부 기준가·역산 추정값 — 실견적이 있으면 뒤로, 노출 시 '추정' 표기 */
  var EST_FIN = "딜리버 기준가(추정)";
  function isEstFin(rec) { var f = String((rec && rec.fin) || "").replace(/\s+/g, ""); return !!f && /기준가/.test(f) && /추정/.test(f); }
  /** 할인 금액 표기: −3,031,500원 */
  function discWon(n) { return "\u2212" + won(Math.abs(+n || 0)) + "원"; }
  /** 차량 총가격 = 기본 차량가 + 옵션가(견적 금액, 없으면 차량 데이터 공식가) − 세제혜택 − 차량가 할인 — 상세 가격 영역과 같은 계산 (목록 '차량가' 정렬용) */
  function carTotal(rec) {
    if (!rec) return 0;
    var VM = root.CHAQ_VM, base = rec.base;
    if (base == null && VM && rec.trimId && VM.getListPrice) { var lp = VM.getListPrice(rec.trimId); if (lp) base = lp.price; }
    if (base == null) return 0;
    var sp = splitOpts(rec), sum = 0;
    sp.opts.forEach(function (o) { if (/^무옵션$/.test(String(o.n).trim())) return; var r = VM && VM.resolveOption ? VM.resolveOption(rec.trimId, o) : null; var p = r ? (r.price || 0) : (Number(o.p) > 0 && o.pSrc !== "VM" ? Number(o.p) : 0); sum += p; });   // 옵션ID → 마스터 공식가 / 미매칭은 견적 금액만 (RL-19 #36)
    return base + sum - taxBenefitOf(rec, sp) - sp.pdisc;   // 2호 ①: 총차량가 = 기본 + 옵션 − 세제혜택 − 차량가 할인
  }
  /** 견적 레코드의 차량 이미지: 차량 데이터 이미지(재고 외장색 → 색상 이미지, 없으면 대표) → 없으면 대체 이미지 */
  function carImg(r) {
    try {
      var VM = root.CHAQ_VM; if (!VM || !r) return PH;
      if (r.trimId && VM.getTrim && VM.getTrim(r.trimId)) return VM.resolveImageUrl(r.trimId, [PH], true, VM.colorKeyForQuote && VM.colorKeyForQuote(r.trimId, r.ext, r.extId)) || PH;   // 색상ID 우선, 없으면 이름 정확 일치, 없으면 대표 이미지
      return (VM.imageByName && VM.imageByName(r.brand, r.model)) || PH;   // 트림 미연결 견적: 같은 모델 대표 이미지
    } catch (e) { return PH; }
  }
  /** 색상 이름 → 색상칩 색. trimId 가 있으면 차량 데이터의 HEX(type: EXTERIOR·INTERIOR), 못 찾으면 이름으로 대략 색 */
  function hex(name, trimId, type, colorId) {
    if (colorId) { try { var hi = root.CHAQ_VM && root.CHAQ_VM.colorHexById && root.CHAQ_VM.colorHexById(colorId); if (hi) return hi; } catch (e) {} }   // 견적 행 색상ID(마스터 참조) 우선
    if (trimId) { try { var h = root.CHAQ_VM && root.CHAQ_VM.colorHexByName && root.CHAQ_VM.colorHexByName(trimId, name, type); if (h) return h; } catch (e) {} }
    var n = String(name || "");
    if (/화이트|white|스노우|아이보리|백/i.test(n)) return "#eef0f2";
    if (/블랙|black|느와르|오닉스|원톤|모노톤/i.test(n)) return "#1b1b1d";
    if (/그레이|gray|grey|실버|silver|건메탈|메탈릭|metallic/i.test(n)) return "#9aa0a6";
    if (/네이비|navy|블루|blue/i.test(n)) return "#3b5aa6";
    if (/레드|red|버건디|루비|burgundy/i.test(n)) return "#b8352f";
    if (/그린|green|카키|세이지|khaki/i.test(n)) return "#3d7a4e";
    if (/브라운|브론즈|베이지|탄|카퍼|골드|gold|brown|bronze|beige|코냑/i.test(n)) return "#8a6d4b";
    return "#d0d3d7";
  }
  /** 월 납입금 숫자 올라가는 효과 (to = null 이면 '—'). nullText: em 아닐 때 '—' 뒤 글자 */
  function animateNum(el, to, em, nullText) {
    if (!el) return;
    var from = parseInt((el.textContent || "").replace(/[^0-9]/g, "")) || 0;
    if (to == null) { el.innerHTML = em ? "—<em>원</em>" : "—" + (nullText || ""); return; }
    var dur = 480, t0 = performance.now();
    function put(v) { el.innerHTML = won(v) + (em ? "<em>원</em>" : "원"); }
    if (from === to) { put(to); return; }
    function frame(t) { var p = Math.min(1, (t - t0) / dur); var e = 1 - Math.pow(1 - p, 3); put(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }
  /** 이 기기에 저장 (로그인 없이 마이페이지에서 보기) — 저장한 견적·최근 본 견적 */
  var K_SAVED = "chaq_saved_v1", K_RECENT = "chaq_recent_v1";
  function lsGet(k) { try { var v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var keyOf = function (x) { return x.id ? "q:" + x.id : "t:" + x.trimId; };
  var store = {
    saved: function () { return lsGet(K_SAVED); },
    isSaved: function (x) { var k = keyOf(x); return lsGet(K_SAVED).some(function (s) { return keyOf(s) === k; }); },
    save: function (x) { var k = keyOf(x), list = lsGet(K_SAVED).filter(function (s) { return keyOf(s) !== k; }); x.at = new Date().toISOString(); list.unshift(x); return lsSet(K_SAVED, list.slice(0, 30)); },
    unsave: function (x) { var k = keyOf(x); return lsSet(K_SAVED, lsGet(K_SAVED).filter(function (s) { return keyOf(s) !== k; })); },
    recent: function () { return lsGet(K_RECENT); },
    addRecent: function (x) { if (!x || (!x.id && !x.trimId)) return; var k = keyOf(x), list = lsGet(K_RECENT).filter(function (s) { return keyOf(s) !== k; }); list.unshift({ id: x.id || null, trimId: x.trimId || null, carName: x.carName || "" }); lsSet(K_RECENT, list.slice(0, 12)); }
  };
  /** 화면 아래 짧은 안내 */
  function toast(msg) {
    var t = document.getElementById("chaqToast");
    if (!t) { t = document.createElement("div"); t.id = "chaqToast"; t.setAttribute("role", "status"); t.style.cssText = "position:fixed;left:50%;bottom:96px;z-index:9998;transform:translateX(-50%);max-width:calc(100% - 40px);padding:12px 18px;border-radius:12px;background:rgba(32,33,36,.92);color:#fff;font-size:14px;line-height:1.4;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none"; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = "1"; clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = "0"; }, 2200);
  }
  /** 예시 후기(#44): 실제 고객 후기가 아닌 항목 표기 — 카드 배지 HTML · 목록이 전부 예시인지 */
  var SAMPLE_BADGE = '<em class="rv_sample_badge" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:#eef0f3;color:#6b7280;font-size:11px;font-style:normal;font-weight:600;line-height:1.5;vertical-align:middle">예시</em>';
  function sampleBadge(r) { return r && r.sample ? SAMPLE_BADGE : ""; }
  function allSample(list) { return !!(list && list.length) && list.every(function (r) { return r && (r.sample || (r.review && r.review.sample)); }); }
  root.CHAQ_UTIL = { sampleBadge: sampleBadge, allSample: allSample, EST_FIN: EST_FIN, isEstFin: isEstFin, PH: PH, esc: esc, won: won, priceShort: priceShort, tokKind: tokKind, isDisc: isDisc, splitOpts: splitOpts, taxBenefitOf: taxBenefitOf, discWon: discWon, carTotal: carTotal, carImg: carImg, hex: hex, animateNum: animateNum, store: store, toast: toast };
})(window);
