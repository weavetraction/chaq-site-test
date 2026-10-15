/* 회원 후기 작성 — 이용 후기 페이지 · 마이페이지 공용 (대표 261015)
   · 로그인 회원 중 '계약완료' 상담 건이 있는 고객만 작성 (계약 1건당 1개)
   · 입력: 계약 선택(차량명 · 출고일) · 후기 내용 · 차량 사진(최대 5장)
   · 등록하면 관리자 확인 후 이용 후기에 게시 (작성 즉시 노출 안 됨)
   · window.CHAQ_REVIEW_WRITE.open() → 로그인 확인 → 작성 시트. 등록 완료 시 document 에 'chaq:review' 이벤트 */
(function () {
  "use strict";
  var BASE = String((window.CHAQ_API || {}).base || "").replace(/\/$/, "");
  var MAX_PHOTOS = 5, MAX_MB = 10;
  var CSS = ".rvw_bg{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;background:rgba(17,20,24,.55)}" +
    ".rvw{width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;background:#fff;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:inherit;color:#202124}" +
    "@media(min-width:600px){.rvw_bg{align-items:center}.rvw{border-radius:20px}}" +
    ".rvw h3{margin:0 0 4px;font-size:20px;font-weight:800}.rvw .rvw_sub{margin:0 0 16px;color:#5f6368;font-size:13.5px;line-height:1.5}" +
    ".rvw label.f{display:block;margin:0 0 14px;font-size:13px;font-weight:700;color:#3c4043}.rvw label.f em{color:#e5484d;font-style:normal}" +
    ".rvw select,.rvw textarea{display:block;width:100%;margin-top:6px;padding:12px 13px;border:1px solid #dadce0;border-radius:10px;font:inherit;font-size:15px;font-weight:400;box-sizing:border-box;background:#fff;color:#202124}" +
    ".rvw textarea{min-height:130px;resize:vertical}.rvw select:focus,.rvw textarea:focus{outline:none;border-color:#18a85c}" +
    ".rvw .rvw_cnt{display:block;margin-top:4px;color:#80868b;font-size:12px;font-weight:400;text-align:right}" +
    ".rvw .rvw_ph{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.rvw .rvw_ph span{position:relative;width:72px;height:72px;border-radius:10px;overflow:hidden;background:#f1f3f4}" +
    ".rvw .rvw_ph img{width:100%;height:100%;object-fit:cover}.rvw .rvw_ph span button{position:absolute;top:3px;right:3px;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:14px;line-height:22px;cursor:pointer}" +
    ".rvw .rvw_add{display:flex;align-items:center;justify-content:center;width:72px;height:72px;border:1px dashed #c4c7cc;border-radius:10px;background:#fafafa;color:#5f6368;font-size:12px;font-weight:600;cursor:pointer;text-align:center;line-height:1.3}" +
    ".rvw .rvw_note{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#f4f6f5;color:#5f6368;font-size:12.5px;line-height:1.5}" +
    ".rvw .rvw_err{min-height:18px;margin:0 0 8px;color:#e5484d;font-size:13px}" +
    ".rvw .rvw_btns{display:flex;gap:8px}.rvw .rvw_btns button{font:inherit;cursor:pointer;border-radius:12px;padding:14px;font-size:15.5px;font-weight:700;border:0}" +
    ".rvw .rvw_close{flex:0 0 96px;background:#f1f3f4;color:#3c4043}.rvw .rvw_send{flex:1;background:#1c1f23;color:#fff}.rvw .rvw_send:disabled{opacity:.6;cursor:default}";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function toast(m) { var U = window.CHAQ_UTIL; if (U && U.toast) U.toast(m); }
  function dot(d) { return d ? String(d).slice(0, 10).replace(/-/g, ".") : ""; }
  var opened = null;
  function close() { if (!opened) return; opened.remove(); opened = null; document.body.style.overflow = ""; document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  function sheet(html) {
    close();
    if (!document.getElementById("rvwCss")) { var st = document.createElement("style"); st.id = "rvwCss"; st.textContent = CSS; document.head.appendChild(st); }
    var bg = document.createElement("div"); bg.className = "rvw_bg"; opened = bg;
    bg.innerHTML = '<div class="rvw" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg); document.body.style.overflow = "hidden"; document.addEventListener("keydown", onKey);
    bg.addEventListener("click", function (e) { if (e.target === bg || (e.target.closest && e.target.closest("[data-close]"))) close(); });
    return bg;
  }
  function notice(title, msg) { sheet('<h3>' + esc(title) + '</h3><p class="rvw_sub">' + msg + '</p><div class="rvw_btns"><button type="button" class="rvw_send" data-close>확인</button></div>'); }

  function form(rows) {
    var open = rows.filter(function (r) { return !r.reviewed; });
    var bg = sheet('<h3>후기 작성</h3><p class="rvw_sub">차큐로 계약하신 차량의 이용 후기를 남겨 주세요.</p>' +
      '<label class="f">계약 선택 <em>*</em><select name="contract">' + (open.length > 1 ? '<option value="">계약 차량을 선택해 주세요</option>' : '') +
        rows.map(function (r) { return '<option value="' + r.id + '"' + (r.reviewed ? " disabled" : "") + '>' + esc(r.car || "계약 차량") + ' · ' + (r.deliveredOn ? '출고 ' + dot(r.deliveredOn) : '출고일 확인 중') + (r.reviewed ? ' (작성 완료)' : '') + '</option>'; }).join("") + '</select></label>' +
      '<label class="f">후기 내용 <em>*</em><textarea name="text" maxlength="3000" placeholder="상담부터 출고까지 어떠셨나요? (10자 이상)"></textarea><span class="rvw_cnt"><b>0</b> / 3000</span></label>' +
      '<div class="f" style="margin:0 0 14px;font-size:13px;font-weight:700;color:#3c4043">차량 사진 <small style="color:#80868b;font-weight:400">(선택 · 최대 ' + MAX_PHOTOS + '장)</small><div class="rvw_ph"></div><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div>' +
      '<p class="rvw_note">작성하신 후기는 확인 후 이용 후기에 게시돼요. 이름은 일부만 표시돼요 (예: 홍**님).</p>' +
      '<p class="rvw_err" aria-live="polite"></p>' +
      '<div class="rvw_btns"><button type="button" class="rvw_close" data-close>닫기</button><button type="button" class="rvw_send">후기 등록</button></div>');
    var box = bg.querySelector(".rvw"), files = [], ph = box.querySelector(".rvw_ph"), fin = box.querySelector("input[type=file]"), err = box.querySelector(".rvw_err"), ta = box.querySelector("textarea");
    function draw() {
      ph.innerHTML = files.map(function (f, i) { return '<span><img src="' + f.url + '" alt=""><button type="button" data-x="' + i + '" aria-label="사진 빼기">×</button></span>'; }).join("") +
        (files.length < MAX_PHOTOS ? '<button type="button" class="rvw_add">+ 사진<br>' + files.length + '/' + MAX_PHOTOS + '</button>' : '');
    }
    draw();
    ph.addEventListener("click", function (e) {
      var x = e.target.getAttribute("data-x");
      if (x != null) { URL.revokeObjectURL(files[+x].url); files.splice(+x, 1); draw(); return; }
      if (e.target.closest(".rvw_add")) fin.click();
    });
    fin.addEventListener("change", function () {
      [].forEach.call(fin.files, function (f) {
        if (files.length >= MAX_PHOTOS) return;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { err.textContent = "사진은 jpg·png·webp 파일만 올릴 수 있어요"; return; }
        if (f.size > MAX_MB * 1024 * 1024) { err.textContent = "사진 1장은 " + MAX_MB + "MB 이하로 올려 주세요"; return; }
        files.push({ f: f, url: URL.createObjectURL(f) });
      });
      fin.value = ""; draw();
    });
    ta.addEventListener("input", function () { box.querySelector(".rvw_cnt b").textContent = ta.value.length; });
    box.querySelector(".rvw_send").addEventListener("click", function () {
      var btn = this, cid = box.querySelector("select").value, text = ta.value.trim();
      err.textContent = "";
      if (!cid) { err.textContent = "계약 차량을 선택해 주세요"; return; }
      if (text.length < 10) { err.textContent = "후기 내용을 10자 이상 적어 주세요"; return; }
      var fd = new FormData(); fd.append("contractId", cid); fd.append("text", text); files.forEach(function (x) { fd.append("photos", x.f, x.f.name); });
      btn.disabled = true; btn.textContent = "등록 중…";
      fetch(BASE + "/api/me/reviews", { method: "POST", credentials: "include", body: fd })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(r.status === 413 ? "사진 용량이 너무 커요" : (j.error || "잠시 후 다시 시도해 주세요")); return j; }); })
        .then(function () {
          files.forEach(function (x) { URL.revokeObjectURL(x.url); });
          notice("후기가 등록됐어요", "소중한 후기 감사합니다.<br>확인 후 이용 후기에 게시해 드릴게요. 마이페이지에서 작성한 후기를 볼 수 있어요.");
          document.dispatchEvent(new CustomEvent("chaq:review"));
        })
        .catch(function (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = "후기 등록"; });
    });
  }

  function start() {
    var AU = window.CHAQ_AUTH;
    return AU.api("/api/me/contracts").then(function (j) {
      var rows = j.rows || [];
      if (!rows.length) return notice("계약 완료 고객만 작성할 수 있어요", "후기는 차큐로 계약을 마치신 고객님만 작성할 수 있어요.<br>계약이 완료되면 이곳에서 출고 후기를 남겨 주세요.");
      if (!rows.some(function (r) { return !r.reviewed; })) return notice("이미 후기를 작성하셨어요", "계약하신 차량의 후기를 모두 작성하셨어요.<br>작성한 후기는 마이페이지에서 볼 수 있어요.");
      form(rows);
    }).catch(function (e) { toast(e.message || "잠시 후 다시 시도해 주세요"); });
  }
  function open() {
    var AU = window.CHAQ_AUTH;
    if (!AU || !BASE) { toast("잠시 후 다시 시도해 주세요"); return; }
    AU.me().then(function (m) {
      if (m) return start();
      var A = (AU.state() || {}).auth || {};
      if (!(A.kakao || A.sms)) { toast("로그인 준비 중이에요. 잠시 후 다시 시도해 주세요"); return; }
      return AU.requireLogin({ reason: "review", pending: { action: "review" } }).then(function (mm) { if (mm) start(); }).catch(function () {});
    });
  }
  // 카카오 로그인으로 다녀온 뒤 이어서 작성
  document.addEventListener("chaq:login", function (e) { var p = e.detail && e.detail.pending; if (p && p.action === "review") setTimeout(start, 300); });
  window.CHAQ_REVIEW_WRITE = { open: open };
})();
