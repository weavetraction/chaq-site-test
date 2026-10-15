/* 관리자: 관리자 계정 · 탭별 접근권한 (대표만, #46) — 멤버 추가(초대 링크) · 권한 저장 · 초대 링크 재발급(비밀번호 재설정) · 중지/재개 */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN, $ = A.$, esc = A.esc, dt = A.dt, api = A.api;
  var TABS = [], EXTRA = [], LBL = {}, HOURS = 72;   // EXTRA = 탭이 아닌 권한(상담 문의 삭제) — 없음/허용
  var LV = [["none", "없음"], ["view", "보기"], ["edit", "수정"]];
  var STATE = { active: ["사용 중", "live"], invited: ["초대 대기", "invited"], expired: ["초대 만료", "draft"], stopped: ["중지", "stopped"] };

  function sel(name, v, dis) { return '<select name="' + name + '"' + (dis ? " disabled" : "") + '>' + LV.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>'; }
  function selX(name, v, dis) { return '<select name="' + name + '"' + (dis ? " disabled" : "") + '><option value="none">없음</option><option value="edit"' + (v === "edit" ? " selected" : "") + '>허용</option></select>'; }
  function permInputs(perms, dis) { return TABS.map(function (t) { return '<label class="ad_perm">' + esc(LBL[t]) + sel("p_" + t, (perms || {})[t] || "none", dis) + '</label>'; }).join("") +
    EXTRA.map(function (t) { return '<label class="ad_perm" title="휴지통으로 삭제·복원 (상담 문의 탭 권한도 있어야 화면이 보여요)">' + esc(LBL[t]) + selX("p_" + t, (perms || {})[t] || "none", dis) + '</label>'; }).join(""); }
  function readPerms(root) { var o = {}; TABS.concat(EXTRA).forEach(function (t) { var s = root.querySelector('[name="p_' + t + '"]'); o[t] = s ? s.value : "none"; }); return o; }
  function toast(m) { var t = document.getElementById("vmToast"); if (!t) return; t.textContent = m; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2200); }

  function showLink(who, token) {
    var url = location.origin + "/admin/?invite=" + token;
    var box = $("#adLink"); box.hidden = false;
    box.innerHTML = '<b>' + esc(who) + '님 초대 링크</b> <small class="hint">(' + HOURS + '시간 안 1회 · 본인에게만 보내세요 · 이 화면을 닫으면 다시 볼 수 없어요 → 필요하면 [초대 링크] 재발급)</small>' +
      '<input readonly value="' + esc(url) + '"><div class="row gap"><button type="button" class="btn primary" id="adCopy">링크 복사</button><button type="button" class="btn" id="adHide">닫기</button></div>';
    $("#adCopy").onclick = function () {
      var b = this, done = function () { b.textContent = "복사됨 ✓"; setTimeout(function () { b.textContent = "링크 복사"; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(function () { box.querySelector("input").select(); });
      else box.querySelector("input").select();
    };
    $("#adHide").onclick = function () { box.hidden = true; box.innerHTML = ""; };
    box.scrollIntoView({ block: "nearest" });
  }

  function load() {
    api("/api/admin/admins").then(function (r) {
      TABS = r.tabs; EXTRA = r.extraPerms || []; LBL = r.tabLabels; HOURS = r.inviteHours || 72;
      if (!$("#adAddPerms").innerHTML) $("#adAddPerms").innerHTML = permInputs({}, false);
      $("#adTable").innerHTML = '<tr><th>이름</th><th>이메일</th><th>상태</th><th>탭별 권한</th><th>최근 로그인</th><th></th></tr>' + r.rows.map(function (a) {
        var st = STATE[a.state] || [a.state, ""], owner = a.role === "owner";
        return '<tr data-id="' + a.id + '"><td>' + (owner ? esc(a.name) : '<input name="name" value="' + esc(a.name) + '" maxlength="50" style="width:110px">') + '</td><td>' + esc(a.email) + '</td>' +
          '<td><span class="pill ' + st[1] + '">' + st[0] + '</span>' + (a.state === "invited" && a.inviteExpiresAt ? '<br><small class="hint">~' + dt(a.inviteExpiresAt) + '</small>' : '') + '</td>' +
          '<td>' + (owner ? '<span class="hint">대표 — 모든 탭 수정 + 상담 문의 삭제 + 관리자 계정·외부 연동</span>' : '<div class="perm_cell">' + permInputs(a.perms, !a.active) + '</div>') + '</td>' +
          '<td>' + (a.lastLoginAt ? dt(a.lastLoginAt) : '<span class="hint">-</span>') + '</td>' +
          '<td>' + (owner ? '' : '<div class="row gap ad_acts">' + (a.active ? '<button class="btn sm primary" data-act="save">저장</button><button class="btn sm" data-act="invite">' + (a.state === "active" ? "비밀번호 재설정 링크" : "초대 링크") + '</button><button class="btn sm danger" data-act="stop">중지</button>' : '<button class="btn sm" data-act="resume">사용 재개</button>') + '</div>') + '</td></tr>';
      }).join("");
    }).catch(function (e) { $("#adTable").innerHTML = '<tr><td class="hint">' + esc(e.message) + '</td></tr>'; });
  }

  $("#adAddForm").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target, perms = readPerms(f);
    if (!TABS.some(function (t) { return perms[t] !== "none"; }) && !confirm("열 수 있는 탭이 하나도 없어요. 그래도 추가할까요?")) return;
    api("/api/admin/admins", { method: "POST", json: { name: f.name.value, email: f.email.value, perms: perms } }).then(function (a) {
      f.reset(); $("#adAddPerms").innerHTML = permInputs({}, false); showLink(a.name, a.inviteToken); load();
    }).catch(function (er) { alert(er.message); });
  });

  $("#adTable").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var tr = b.closest("tr"), id = tr.getAttribute("data-id"), act = b.getAttribute("data-act"), name = (tr.querySelector('[name="name"]') || {}).value || "";
    if (act === "save") api("/api/admin/admins/" + id, { method: "PATCH", json: { name: name, perms: readPerms(tr) } }).then(function () { toast("권한을 저장했어요"); load(); }).catch(function (er) { alert(er.message); });
    if (act === "invite") {
      if (!confirm(name + "님 링크를 새로 만들까요?\n· 전에 보낸 링크는 못 쓰게 됩니다\n· 이미 쓰던 계정이면 지금 비밀번호와 로그인이 풀리고, 새 링크에서 비밀번호를 다시 정합니다")) return;
      api("/api/admin/admins/" + id + "/invite", { method: "POST" }).then(function (a) { showLink(a.name, a.inviteToken); load(); }).catch(function (er) { alert(er.message); });
    }
    if (act === "stop" || act === "resume") {
      if (act === "stop" && !confirm(name + "님 계정을 중지할까요? 바로 로그아웃되고 로그인할 수 없어요. (작업 기록은 남고, 언제든 재개할 수 있어요)")) return;
      api("/api/admin/admins/" + id, { method: "PATCH", json: { active: act === "resume" } }).then(function () { toast(act === "stop" ? "중지했어요" : "재개했어요 — 로그인이 안 되면 [초대 링크]로 비밀번호를 다시 정하게 하세요"); load(); }).catch(function (er) { alert(er.message); });
    }
  });

  document.addEventListener("chaq:tab", function (e) { if (e.detail === "admins") load(); });
})();
