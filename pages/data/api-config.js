/* 차큐 API·채널톡 설정 — 여기 두 값만 채우면 사이트가 서버와 연결됩니다 (비워두면 지금처럼 사이트 파일만 사용)
   base             : 차큐 API 주소 (예: "https://api.chaq.kr") — 견적 데이터(관리자에서 올린 엑셀)를 여기서 읽고, 상담 문의를 여기에 저장
   channelPluginKey : 채널톡 플러그인 키 (채널톡 관리자 > 설정 > 일반 설정 > 채널 버튼 설치 > 플러그인 키)
   channelButton    : 채널톡 기본 떠 있는 버튼 표시 여부 (false = 숨김, 사이트의 상담 버튼으로만 열림)
   gtmId            : 구글 태그 관리자 컨테이너 ID (예: "GTM-XXXXXXX") — GA4·구글/메타/네이버/카카오 광고 태그를 GTM 에서 관리 (data/analytics.js) */
window.CHAQ_API = {
  base: "",
  channelPluginKey: "",
  channelButton: false,
  gtmId: ""
};
