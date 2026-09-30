/* 차큐 Vehicle Master — FINAL 스키마 샘플 (final-1.0)
   실데이터 발췌: 현대 쏘나타 디 엣지 2026 공식 가격표 (차량가격 없음). 구조 참고용이며 실제 서비스 데이터는 vehicle-master.js 로 교체한다.
   전역: window.CHAQ_VEHICLE_MASTER  / Helper: window.CHAQ_VM */
window.CHAQ_VEHICLE_MASTER = {
 "meta": {
  "schemaVersion": "final-1.0",
  "schemaStatus": "FINAL",
  "generatedAt": "2026-09-23",
  "description": "FINAL 스키마 샘플 — 현대 쏘나타 디 엣지 2026 공식 가격표 기반 실데이터 발췌(트림 3, 차량가격 없음). 구조 참고용."
 },
 "brands": [
  {
   "id": "hyundai",
   "nameKo": "현대",
   "nameEn": "Hyundai",
   "country": "KR",
   "domesticImport": "DOMESTIC",
   "officialSite": "https://www.hyundai.com/kr/ko/e",
   "status": "ACTIVE",
   "sortOrder": 1,
   "sourceIds": [
    "src-hyundai-site-202609"
   ]
  }
 ],
 "models": [
  {
   "id": "hyundai-sonata",
   "brandId": "hyundai",
   "nameKo": "쏘나타",
   "nameEn": "Sonata",
   "bodyType": "SEDAN",
   "familyKey": "hyundai-sonata",
   "status": "ACTIVE",
   "sortOrder": 20,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026",
    "src-hyundai-pricelist-sonata-the-edge-hybrid-2026"
   ]
  },
  {
   "id": "hyundai-sonata-hybrid",
   "brandId": "hyundai",
   "nameKo": "쏘나타 하이브리드",
   "nameEn": "Sonata Hybrid",
   "bodyType": "SEDAN",
   "familyKey": "hyundai-sonata",
   "status": "ACTIVE",
   "sortOrder": 21,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026",
    "src-hyundai-pricelist-sonata-the-edge-hybrid-2026"
   ]
  }
 ],
 "lineups": [
  {
   "id": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "modelId": "hyundai-sonata",
   "displayName": "2026 쏘나타 디 엣지 가솔린 1.6 터보",
   "shortLabel": "가솔린 1.6 터보",
   "generationName": "쏘나타 디 엣지",
   "generationCode": "DN8",
   "generationCodeVerified": false,
   "modelYear": 2026,
   "fuelType": "GASOLINE",
   "engineSummary": "스마트스트림 가솔린 1.6 터보",
   "salesChannel": "GENERAL",
   "status": "ACTIVE",
   "imageStatus": "VERIFIED",
   "sortOrder": 34,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026",
    "src-chaq-gencode-202609"
   ]
  },
  {
   "id": "hyundai-sonata-dn8-2026-hev",
   "modelId": "hyundai-sonata-hybrid",
   "displayName": "2026 쏘나타 디 엣지 하이브리드 2.0",
   "shortLabel": "하이브리드 2.0",
   "generationName": "쏘나타 디 엣지",
   "generationCode": "DN8",
   "generationCodeVerified": false,
   "modelYear": 2026,
   "fuelType": "HEV",
   "engineSummary": "스마트스트림 가솔린 2.0 하이브리드",
   "salesChannel": "GENERAL",
   "status": "ACTIVE",
   "imageStatus": "VERIFIED",
   "sortOrder": 39,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-hybrid-2026",
    "src-chaq-gencode-202609"
   ]
  }
 ],
 "trims": [
  {
   "id": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "name": "익스클루시브",
   "nameEn": "Exclusive",
   "drivetrain": null,
   "seatCount": null,
   "variantNote": null,
   "standardItems": [
    "(S 기본품목 외)",
    "[지능형 안전 기술] 후방 주차 충돌방지 보조",
    "[내장] 앰비언트 무드램프, 크롬 인사이드 도어 핸들, 멜란지 니트 내장재(헤드라이닝/필라)",
    "[시트] 천연가죽 시트, 운전석 자세 메모리 시스템, 동승석 전동시트(4way, 릴렉션 컴포트, 워크인 디바이스)",
    "[편의] 스마트 파워 트렁크, 스마트폰 무선충전, 원격 스마트 주차 보조, 서라운드 뷰 모니터, 후측방 모니터, 측방 주차거리 경고"
   ],
   "status": "ACTIVE",
   "sortOrder": 3,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026"
   ]
  },
  {
   "id": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "name": "인스퍼레이션",
   "nameEn": "Inspiration",
   "drivetrain": null,
   "seatCount": null,
   "variantNote": null,
   "standardItems": [
    "(익스클루시브 기본품목 외)",
    "[지능형 안전 기술] 2열 승객 알림",
    "[외관] Full LED 헤드램프(프로젝션 타입), 다이내믹 웰컴 라이트(앞/뒤), 순차 점등 방향지시등(앞), 18인치 알로이 휠 & 피렐리 타이어, 자외선 차단유리(윈드실드), 터치타입 아웃사이드 도어 핸들",
    "[내장] 인조가죽 적용 내장(크래쉬패드), 메탈 페달",
    "[시트] 나파가죽 시트(카멜/그레이지/네이비), 2열 열선시트, 2열 6:4 분할 폴딩, 2열 암레스트",
    "[편의] 헤드업 디스플레이, 2열 수동식 도어커튼, 뒷면 전동식 커튼, 디지털 키 2, 실내 지문 인증 시스템(시동/결제)"
   ],
   "status": "ACTIVE",
   "sortOrder": 4,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026"
   ]
  },
  {
   "id": "hyundai-sonata-dn8-2026-hev--inspiration",
   "lineupId": "hyundai-sonata-dn8-2026-hev",
   "name": "인스퍼레이션",
   "nameEn": "Inspiration",
   "drivetrain": null,
   "seatCount": null,
   "variantNote": null,
   "standardItems": [
    "(익스클루시브 기본품목 외)",
    "[지능형 안전 기술] 2열 승객 알림",
    "[외관] Full LED 헤드램프(프로젝션 타입), 다이내믹 웰컴 라이트(앞/뒤), 순차 점등 방향지시등(앞), 18인치 알로이 휠 & 피렐리 타이어, 자외선 차단유리(윈드실드), 터치타입 아웃사이드 도어 핸들",
    "[내장] 인조가죽 적용 내장(크래쉬패드), 메탈 페달",
    "[시트] 나파가죽 시트(카멜/그레이지/네이비), 2열 열선시트, 2열 6:4 분할 폴딩, 2열 암레스트",
    "[편의] 헤드업 디스플레이, 2열 수동식 도어커튼, 뒷면 전동식 커튼, 디지털 키 2, 실내 지문 인증 시스템(시동/결제)"
   ],
   "status": "ACTIVE",
   "sortOrder": 4,
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-hybrid-2026"
   ]
  }
 ],
 "trimOptions": [
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "optionId": "hyundai-opt-sonata-1-d32a59",
   "price": 1300000,
   "type": "SELECTABLE",
   "condition": null,
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "optionId": "hyundai-opt-sonata-2-2-7b1556",
   "price": 670000,
   "type": "SELECTABLE",
   "condition": null,
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "optionId": "hyundai-opt-sonata-1-1fab0a",
   "price": 640000,
   "type": "SELECTABLE",
   "condition": null,
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "optionId": "hyundai-opt-sonata-tf47665",
   "price": 1190000,
   "type": "SELECTABLE",
   "condition": "파노라마 선루프 선택 시 2열 퍼스널램프 LED 적용",
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "optionId": "hyundai-opt-sonata-2-ab1660",
   "price": 450000,
   "type": "SELECTABLE",
   "condition": "내비게이션 선택 시 가능, 주행/주차 중 녹화 지원",
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "optionId": "hyundai-opt-sonata-tf47665",
   "price": 1190000,
   "type": "SELECTABLE",
   "condition": "파노라마 선루프 선택 시 2열 퍼스널램프 LED 적용",
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "optionId": "hyundai-opt-sonata-bose-75b735",
   "price": 640000,
   "type": "SELECTABLE",
   "condition": null,
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "optionId": "hyundai-opt-sonata-2-ab1660",
   "price": 450000,
   "type": "SELECTABLE",
   "condition": "내비게이션 선택 시 가능, 주행/주차 중 녹화 지원",
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "optionId": "hyundai-opt-sonata-tf47665",
   "price": 1190000,
   "type": "SELECTABLE",
   "condition": "파노라마 선루프 선택 시 2열 퍼스널램프 LED 적용",
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "optionId": "hyundai-opt-sonata-bose-75b735-2",
   "price": 640000,
   "type": "SELECTABLE",
   "condition": null,
   "dependency": [],
   "exclusionRule": [],
   "dependencyNote": null,
   "exclusionNote": null
  }
 ],
 "options": [
  {
   "id": "hyundai-opt-sonata-2-2-7b1556",
   "modelId": "hyundai-sonata-hybrid",
   "name": "컴포트Ⅱ(2열 편의)",
   "nameEn": null,
   "category": "PACKAGE",
   "description": "2열 열선시트, 2열 수동식 도어커튼, 뒷면 전동식 커튼, 2열 승객 알림, 2열 6:4 분할 폴딩, 2열 암레스트",
   "items": [
    "2열 열선시트",
    "2열 수동식 도어커튼",
    "뒷면 전동식 커튼",
    "2열 승객 알림",
    "2열 6:4 분할 폴딩",
    "2열 암레스트"
   ]
  },
  {
   "id": "hyundai-opt-sonata-1-1fab0a",
   "modelId": "hyundai-sonata-hybrid",
   "name": "익스테리어 디자인Ⅰ",
   "nameEn": null,
   "category": "PACKAGE",
   "description": "18인치 알로이 휠 & 피렐리 타이어, Full LED 헤드램프(프로젝션 타입), 다이내믹 웰컴 라이트(앞/뒤), 순차 점등 방향지시등(앞)",
   "items": [
    "18인치 알로이 휠 & 피렐리 타이어",
    "Full LED 헤드램프(프로젝션 타입)",
    "다이내믹 웰컴 라이트(앞/뒤)",
    "순차 점등 방향지시등(앞)"
   ]
  },
  {
   "id": "hyundai-opt-sonata-2-ab1660",
   "modelId": "hyundai-sonata-hybrid",
   "name": "빌트인 캠 2, 증강현실 내비게이션",
   "nameEn": null,
   "category": "ITEM",
   "description": "",
   "items": []
  },
  {
   "id": "hyundai-opt-sonata-1-d32a59",
   "modelId": "hyundai-sonata-hybrid",
   "name": "플래티넘Ⅰ",
   "nameEn": null,
   "category": "PACKAGE",
   "description": "헤드업 디스플레이, 디지털 키 2, 실내 지문 인증 시스템(시동/결제), 터치타입 아웃사이드 도어 핸들, 인조가죽 적용 내장(크래쉬 패드)",
   "items": [
    "헤드업 디스플레이",
    "디지털 키 2",
    "실내 지문 인증 시스템(시동/결제)",
    "터치타입 아웃사이드 도어 핸들",
    "인조가죽 적용 내장(크래쉬 패드)"
   ]
  },
  {
   "id": "hyundai-opt-sonata-tf47665",
   "modelId": "hyundai-sonata-hybrid",
   "name": "파노라마 선루프",
   "nameEn": null,
   "category": "ITEM",
   "description": "",
   "items": []
  },
  {
   "id": "hyundai-opt-sonata-bose-75b735",
   "modelId": "hyundai-sonata",
   "name": "BOSE 프리미엄 사운드",
   "nameEn": null,
   "category": "PACKAGE",
   "description": "12스피커, 외장앰프",
   "items": [
    "12스피커",
    "외장앰프"
   ]
  },
  {
   "id": "hyundai-opt-sonata-bose-75b735-2",
   "modelId": "hyundai-sonata-hybrid",
   "name": "BOSE 프리미엄 사운드",
   "nameEn": null,
   "category": "PACKAGE",
   "description": "12스피커, 외장앰프 (센터 스피커(1개), 미드레인지 스피커(4개), 프론트 도어 스피커(2개), 리어 도어 스피커(2개), 트위터(2개), 서브 우퍼(1개), 외장앰프)",
   "items": [
    "12스피커",
    "외장앰프 (센터 스피커(1개)",
    "미드레인지 스피커(4개)",
    "프론트 도어 스피커(2개)",
    "리어 도어 스피커(2개)",
    "트위터(2개)",
    "서브 우퍼(1개)",
    "외장앰프)"
   ]
  }
 ],
 "trimColors": [
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-w6h",
   "type": "EXTERIOR",
   "extraPrice": 80000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-w6h",
   "type": "EXTERIOR",
   "extraPrice": 80000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-t4m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-t4m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-t2g",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-t2g",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-xb9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-xb9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-r2p",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-r2p",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-t9m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-t9m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-a2b",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-a2b",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--exclusive",
   "colorId": "hyundai-color-ny9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-ny9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-t6f4e35",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-t409644",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "colorId": "hyundai-color-ted895c",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-w6h",
   "type": "EXTERIOR",
   "extraPrice": 80000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-t4m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-t2g",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-xb9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-r2p",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-t9m",
   "type": "EXTERIOR",
   "extraPrice": 200000,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-a2b",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-ny9",
   "type": "EXTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-t6f4e35",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-t409644",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  },
  {
   "trimId": "hyundai-sonata-dn8-2026-hev--inspiration",
   "colorId": "hyundai-color-ted895c",
   "type": "INTERIOR",
   "extraPrice": 0,
   "note": null
  }
 ],
 "colors": [
  {
   "id": "hyundai-color-a2b",
   "brandId": "hyundai",
   "name": "어비스 블랙 펄",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "A2B",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-r2p",
   "brandId": "hyundai",
   "name": "얼티메이트 레드 메탈릭",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "R2P",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-w6h",
   "brandId": "hyundai",
   "name": "세레니티 화이트 펄",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "W6H",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-xb9",
   "brandId": "hyundai",
   "name": "바이오필릭 블루 펄",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "XB9",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-t2g",
   "brandId": "hyundai",
   "name": "녹턴 그레이 메탈릭",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "T2G",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-ny9",
   "brandId": "hyundai",
   "name": "트랜스미션 블루 펄",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "NY9",
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-t9m",
   "brandId": "hyundai",
   "name": "녹턴 그레이 매트",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "T9M",
   "kind": "MATTE"
  },
  {
   "id": "hyundai-color-t4m",
   "brandId": "hyundai",
   "name": "에어로 실버 매트",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": "T4M",
   "kind": "MATTE"
  },
  {
   "id": "hyundai-color-t6f4e35",
   "brandId": "hyundai",
   "name": "카멜",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": null,
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-t409644",
   "brandId": "hyundai",
   "name": "그레이지",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": null,
   "kind": "SOLID"
  },
  {
   "id": "hyundai-color-ted895c",
   "brandId": "hyundai",
   "name": "네이비",
   "nameEn": null,
   "hex": null,
   "manufacturerCode": null,
   "kind": "SOLID"
  }
 ],
 "colorRules": [
  {
   "trimId": "hyundai-sonata-dn8-2026-gasoline-1-6t--inspiration",
   "interiorColorId": "hyundai-color-ted895c",
   "allowedExteriorColorIds": [],
   "excludedExteriorColorIds": [
    "hyundai-color-r2p"
   ],
   "note": "가격표 각주: 얼티메이트 레드 메탈릭 선택 시 네이비 내장 컬러 선택 불가"
  }
 ],
 "vehicleSpecs": [
  {
   "id": "spec-l-hyundai-sonata-dn8-2026-gasoline-1-6t-1",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "trimIds": [],
   "variant": {
    "wheelInch": 17,
    "builtInCam": null,
    "seatCount": null,
    "drivetrain": null,
    "transmission": "8단 자동변속기"
   },
   "engine": "스마트스트림 가솔린 1.6 터보",
   "displacementCc": 1598,
   "drivetrain": null,
   "transmission": "8단 자동변속기",
   "seatCount": null,
   "maxPowerPs": null,
   "maxPowerRpm": null,
   "maxPowerText": null,
   "maxTorqueKgfm": null,
   "maxTorqueRpm": null,
   "maxTorqueText": null,
   "combinedEfficiency": 13.5,
   "efficiencyUnit": "km/ℓ",
   "efficiencyCity": null,
   "efficiencyHighway": null,
   "efficiencyGrade": null,
   "co2GPerKm": null,
   "curbWeightKg": 1490,
   "dimensions": {
    "lengthMm": null,
    "widthMm": null,
    "heightMm": null,
    "wheelbaseMm": null
   },
   "hev": {
    "motorPowerKw": null,
    "systemPowerPs": null
   },
   "ev": {
    "batteryCapacityKwh": null,
    "batteryVoltage": null,
    "batteryAh": null,
    "electricRangeKm": null,
    "electricRangeCityKm": null,
    "electricRangeHighwayKm": null,
    "motorPowerKw": null,
    "motorPowerFrontKw": null,
    "motorPowerRearKw": null,
    "electricEfficiency": null,
    "electricEfficiencyCity": null,
    "electricEfficiencyHighway": null
   },
   "fcev": {
    "hydrogenTankKg": null,
    "fuelCellStackPowerKw": null,
    "motorPowerKw": null,
    "rangeKm": null,
    "efficiencyKmPerKg": null
   },
   "note": "도심 11.9 / 고속도로 15.9 km/ℓ, CO2 123 g/km; 에너지소비효율 3등급",
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026"
   ]
  },
  {
   "id": "spec-l-hyundai-sonata-dn8-2026-gasoline-1-6t-2",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "trimIds": [],
   "variant": {
    "wheelInch": 18,
    "builtInCam": null,
    "seatCount": null,
    "drivetrain": null,
    "transmission": "8단 자동변속기"
   },
   "engine": "스마트스트림 가솔린 1.6 터보",
   "displacementCc": 1598,
   "drivetrain": null,
   "transmission": "8단 자동변속기",
   "seatCount": null,
   "maxPowerPs": null,
   "maxPowerRpm": null,
   "maxPowerText": null,
   "maxTorqueKgfm": null,
   "maxTorqueRpm": null,
   "maxTorqueText": null,
   "combinedEfficiency": 13,
   "efficiencyUnit": "km/ℓ",
   "efficiencyCity": null,
   "efficiencyHighway": null,
   "efficiencyGrade": null,
   "co2GPerKm": null,
   "curbWeightKg": 1510,
   "dimensions": {
    "lengthMm": null,
    "widthMm": null,
    "heightMm": null,
    "wheelbaseMm": null
   },
   "hev": {
    "motorPowerKw": null,
    "systemPowerPs": null
   },
   "ev": {
    "batteryCapacityKwh": null,
    "batteryVoltage": null,
    "batteryAh": null,
    "electricRangeKm": null,
    "electricRangeCityKm": null,
    "electricRangeHighwayKm": null,
    "motorPowerKw": null,
    "motorPowerFrontKw": null,
    "motorPowerRearKw": null,
    "electricEfficiency": null,
    "electricEfficiencyCity": null,
    "electricEfficiencyHighway": null
   },
   "fcev": {
    "hydrogenTankKg": null,
    "fuelCellStackPowerKw": null,
    "motorPowerKw": null,
    "rangeKm": null,
    "efficiencyKmPerKg": null
   },
   "note": "도심 11.4 / 고속도로 15.5 km/ℓ, CO2 128 g/km; 에너지소비효율 3등급",
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026"
   ]
  },
  {
   "id": "spec-l-hyundai-sonata-dn8-2026-gasoline-1-6t-3",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "trimIds": [],
   "variant": {
    "wheelInch": 17,
    "builtInCam": true,
    "seatCount": null,
    "drivetrain": null,
    "transmission": "8단 자동변속기"
   },
   "engine": "스마트스트림 가솔린 1.6 터보",
   "displacementCc": 1598,
   "drivetrain": null,
   "transmission": "8단 자동변속기",
   "seatCount": null,
   "maxPowerPs": null,
   "maxPowerRpm": null,
   "maxPowerText": null,
   "maxTorqueKgfm": null,
   "maxTorqueRpm": null,
   "maxTorqueText": null,
   "combinedEfficiency": 13.2,
   "efficiencyUnit": "km/ℓ",
   "efficiencyCity": null,
   "efficiencyHighway": null,
   "efficiencyGrade": null,
   "co2GPerKm": null,
   "curbWeightKg": 1490,
   "dimensions": {
    "lengthMm": null,
    "widthMm": null,
    "heightMm": null,
    "wheelbaseMm": null
   },
   "hev": {
    "motorPowerKw": null,
    "systemPowerPs": null
   },
   "ev": {
    "batteryCapacityKwh": null,
    "batteryVoltage": null,
    "batteryAh": null,
    "electricRangeKm": null,
    "electricRangeCityKm": null,
    "electricRangeHighwayKm": null,
    "motorPowerKw": null,
    "motorPowerFrontKw": null,
    "motorPowerRearKw": null,
    "electricEfficiency": null,
    "electricEfficiencyCity": null,
    "electricEfficiencyHighway": null
   },
   "fcev": {
    "hydrogenTankKg": null,
    "fuelCellStackPowerKw": null,
    "motorPowerKw": null,
    "rangeKm": null,
    "efficiencyKmPerKg": null
   },
   "note": "도심 11.6 / 고속도로 15.7 km/ℓ, CO2 126 g/km; 에너지소비효율 3등급; 열 헤더 원문 '스마트스트림 가솔린 1.6 터보 엔진(17\") + 빌트인 캠'",
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-2026"
   ]
  },
  {
   "id": "spec-l-hyundai-sonata-dn8-2026-hev-1",
   "lineupId": "hyundai-sonata-dn8-2026-hev",
   "trimIds": [],
   "variant": {
    "wheelInch": 16,
    "builtInCam": null,
    "seatCount": null,
    "drivetrain": null,
    "transmission": "6단 자동변속기"
   },
   "engine": "스마트스트림 가솔린 2.0 하이브리드",
   "displacementCc": 1999,
   "drivetrain": null,
   "transmission": "6단 자동변속기",
   "seatCount": null,
   "maxPowerPs": null,
   "maxPowerRpm": null,
   "maxPowerText": null,
   "maxTorqueKgfm": null,
   "maxTorqueRpm": null,
   "maxTorqueText": null,
   "combinedEfficiency": 19.4,
   "efficiencyUnit": "km/ℓ",
   "efficiencyCity": null,
   "efficiencyHighway": null,
   "efficiencyGrade": null,
   "co2GPerKm": null,
   "curbWeightKg": 1550,
   "dimensions": {
    "lengthMm": null,
    "widthMm": null,
    "heightMm": null,
    "wheelbaseMm": null
   },
   "hev": {
    "motorPowerKw": null,
    "systemPowerPs": null
   },
   "ev": {
    "batteryCapacityKwh": null,
    "batteryVoltage": null,
    "batteryAh": null,
    "electricRangeKm": null,
    "electricRangeCityKm": null,
    "electricRangeHighwayKm": null,
    "motorPowerKw": null,
    "motorPowerFrontKw": null,
    "motorPowerRearKw": null,
    "electricEfficiency": null,
    "electricEfficiencyCity": null,
    "electricEfficiencyHighway": null
   },
   "fcev": {
    "hydrogenTankKg": null,
    "fuelCellStackPowerKw": null,
    "motorPowerKw": null,
    "rangeKm": null,
    "efficiencyKmPerKg": null
   },
   "note": "도심 19.8 / 고속도로 18.9 km/ℓ, CO2 81 g/km; 에너지소비효율 1등급",
   "sourceIds": [
    "src-hyundai-pricelist-sonata-the-edge-hybrid-2026"
   ]
  }
 ],
 "vehicleImages": [
  {
   "id": "img-hyundai-sonata-dn8-2026-gasoline-1-6t-1",
   "lineupId": "hyundai-sonata-dn8-2026-gasoline-1-6t",
   "trimId": null,
   "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/9b/0_Hyundai_Sonata_%28DN8%29_fl_1.jpg",
   "thumbnailUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/0_Hyundai_Sonata_%28DN8%29_fl_1.jpg/960px-0_Hyundai_Sonata_%28DN8%29_fl_1.jpg",
   "source": "WIKIMEDIA_COMMONS",
   "sourceUrl": "https://commons.wikimedia.org/wiki/File:0_Hyundai_Sonata_(DN8)_fl_1.jpg",
   "filename": "0 Hyundai Sonata (DN8) fl 1.jpg",
   "author": "Benespit",
   "license": "CC BY-SA 4.0",
   "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
   "attribution": "Benespit / CC BY-SA 4.0",
   "verified": true,
   "sortOrder": 1,
   "matchConfidence": "HIGH",
   "reviewNote": null
  },
  {
   "id": "img-hyundai-sonata-dn8-2026-hev-1",
   "lineupId": "hyundai-sonata-dn8-2026-hev",
   "trimId": null,
   "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/9b/0_Hyundai_Sonata_%28DN8%29_fl_1.jpg",
   "thumbnailUrl": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/0_Hyundai_Sonata_%28DN8%29_fl_1.jpg/960px-0_Hyundai_Sonata_%28DN8%29_fl_1.jpg",
   "source": "WIKIMEDIA_COMMONS",
   "sourceUrl": "https://commons.wikimedia.org/wiki/File:0_Hyundai_Sonata_(DN8)_fl_1.jpg",
   "filename": "0 Hyundai Sonata (DN8) fl 1.jpg",
   "author": "Benespit",
   "license": "CC BY-SA 4.0",
   "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
   "attribution": "Benespit / CC BY-SA 4.0",
   "verified": true,
   "sortOrder": 1,
   "matchConfidence": "HIGH",
   "reviewNote": null
  }
 ],
 "sources": [
  {
   "id": "src-hyundai-site-202609",
   "type": "OFFICIAL_SITE",
   "title": "현대자동차 대한민국 공식 홈페이지",
   "url": "https://www.hyundai.com/kr/ko/e",
   "publisher": "현대자동차",
   "retrievedAt": "2026-09-23",
   "note": "차량 라인업 확인용"
  },
  {
   "id": "src-chaq-gencode-202609",
   "type": "CHAQ_INTERNAL",
   "title": "세대명/세대코드 보조 매핑 (가격표 미표기 항목)",
   "url": "",
   "publisher": "차큐",
   "retrievedAt": "2026-09-23",
   "note": "generationCode 는 공식 가격표에 인쇄되지 않아 차큐 내부 매핑값(미검증). 이미지 검색키 용도. STEP 3에서 검증 필요"
  },
  {
   "id": "src-hyundai-pricelist-sonata-the-edge-2026",
   "type": "OFFICIAL_PRICE_LIST",
   "title": "2026 SONATA The Edge 가격표",
   "url": "https://www.hyundai.com/contents/repn-car/catalog/sonata-the-edge2026-price.pdf",
   "publisher": "현대자동차",
   "retrievedAt": "2026-09-23",
   "note": "현 모델 출시일 : 25년 9월 29일"
  },
  {
   "id": "src-hyundai-pricelist-sonata-the-edge-hybrid-2026",
   "type": "OFFICIAL_PRICE_LIST",
   "title": "2026 SONATA THE EDGE HYBRID 가격표",
   "url": "https://www.hyundai.com/contents/repn-car/catalog/sonata-the-edge-hybrid2026-price.pdf",
   "publisher": "현대자동차",
   "retrievedAt": "2026-09-23",
   "note": "현 모델 출시일 : 25년 9월 29일"
  }
 ]
};
