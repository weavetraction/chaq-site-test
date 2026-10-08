/* 관리자: 회원 목록 · 외부 연동 키 (카카오 로그인 · 휴대폰 인증 · 채널톡) */
(function () {
  "use strict";
  var A = window.CHAQ_ADMIN, $ = A.$, esc = A.esc, dt = A.dt, api = A.api;
  var FIELDS = [
    ["카카오 로그인", [["kakaoRestApiKey", "REST API 키", "카카오 디벨로퍼스 > 내 애플리케이션 > 앱 키"], ["kakaoClientSecret", "Client Secret", "카카오 로그인 > 보안 (사용 설정한 경우만)"]]],
    ["카카오톡 채널", [["kakaoChannelId", "채널 ID", "채널 홈 주소 pf.kakao.com/ 뒤의 _로 시작하는 값 (예: _AbCdE)"]]],
    ["채널톡 (카카오 상담·알림톡)", [["channelPluginKey", "플러그인 키", "채널톡 > 설정 > 채널 설정 > 버튼 설치"], ["channelAccessKey", "API Access Key", "채널톡 > 설정 > API 키 관리"], ["channelAccessSecret", "API Access Secret", ""], ["channelMemberHashSecret", "회원 해시 비밀값", "채널톡 > 설정 > 보안 > 회원 해시 (켠 경우만)"]]],
    ["휴대폰 인증문자 (NHN Cloud)", [["smsAppKey", "Appkey", "NHN Cloud 콘솔 > Notification > SMS > URL & Appkey"], ["smsSecretKey", "Secret Key", "같은 화면"], ["smsSender", "발신번호", "SMS > 발신번호 관리에 등록·승인된 번호 (예: 1533-5663)"]]],
  ];
  var cur = null;
  function render(d) {
    cur = d; var st = d.status;
    $("#igStatus").textContent = [st.kakaoLogin ? "카카오 로그인 켜짐" : "카카오 로그인 꺼짐", st.sms ? "휴대폰 인증 켜짐" : "휴대폰 인증 꺼짐", st.channelApi ? "채널톡 API 연결" : "채널톡 API 미연결"].join(" · ");
    $("#igForm").innerHTML = FIELDS.map(function (g) {
      return '<fieldset><legend>' + esc(g[0]) + '</legend>' + g[1].map(function (f) {
        var v = d.fields[f[0]] || {};
        return '<label><span>' + esc(f[1]) + (v.fromEnv ? ' <small class="hint">(서버 설정값 사용 중)</small>' : '') + '</span><input name="' + f[0] + '" value="' + esc(v.value) + '" autocomplete="off" spellcheck="false"' + (v.fromEnv ? " disabled" : "") + (v.secret ? ' placeholder="입력하면 바뀜"' : "") + '>' + (f[2] ? '<small class="hint">' + esc(f[2]) + '</small>' : '') + '</label>';
      }).join("") + '</fieldset>';
    }).join("");
  }
  function loadIg() { api("/api/admin/integrations").then(render).catch(function () {}); }
  $("#igSave").addEventListener("click", function () {
    var body = {}; [].forEach.call($("#igForm").querySelectorAll("input:not([disabled])"), function (i) { body[i.name] = i.value.trim(); });
    api("/api/admin/integrations", { method: "PUT", json: body }).then(function (d) { render(d); toast("연동 설정을 저장했습니다"); }).catch(function (e) { alert(e.message); });
  });
  function toast(m) { var t = document.getElementById("vmToast"); if (!t) return; t.textContent = m; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2200); }

  var mb = { q: "", page: 1 };
  function loadMembers() {
    api("/api/admin/members?page=" + mb.page + (mb.q ? "&q=" + encodeURIComponent(mb.q) : "")).then(function (r) {
      $("#mbTotal").textContent = "총 " + r.total + "명";
      $("#mbTable").innerHTML = '<tr><th>#</th><th>가입</th><th>이름</th><th>연락처</th><th>가입 수단</th><th>마케팅 수신</th><th class="num">문의</th><th>최근 로그인</th></tr>' + (r.rows.length ? r.rows.map(function (m) {
        return '<tr><td>' + m.id + '</td><td>' + dt(m.created_at) + '</td><td>' + esc(m.name || m.nickname || "-") + '</td><td>' + (m.phone ? '<a href="tel:' + esc(m.phone.replace(/\D/g, "")) + '">' + esc(m.phone) + '</a>' : '<span class="hint">번호 없음</span>') + '</td><td>' + (m.kakao ? "카카오" : "휴대폰") + '</td><td>' + (m.marketing_agreed_at ? "동의" : "-") + '</td><td class="num">' + m.inquiries + '</td><td>' + dt(m.last_login_at) + '</td></tr>';
      }).join("") : '<tr><td colspan="8" class="hint">회원이 없습니다</td></tr>');
      var pages = Math.ceil(r.total / r.size);
      $("#mbPager").innerHTML = pages > 1 ? Array.from({ length: Math.min(pages, 20) }, function (_, i) { return '<button class="btn sm' + (i + 1 === r.page ? " primary" : "") + '" data-page="' + (i + 1) + '">' + (i + 1) + '</button>'; }).join("") : "";
    }).catch(function () {});
  }
  $("#mbPager").addEventListener("click", function (e) { var p = e.target.getAttribute("data-page"); if (p) { mb.page = +p; loadMembers(); } });
  var t = null; $("#mbSearch").addEventListener("input", function (e) { clearTimeout(t); t = setTimeout(function () { mb.q = e.target.value.trim(); mb.page = 1; loadMembers(); }, 300); });
  document.addEventListener("chaq:tab", function (e) { if (e.detail === "members") { loadIg(); loadMembers(); } });
})();
