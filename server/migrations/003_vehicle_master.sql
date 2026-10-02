-- 차량 마스터데이터(Vehicle Master)를 DB 에서 관리
--  · vm_items: 사이트 window.CHAQ_VEHICLE_MASTER 의 각 컬렉션 항목을 그대로(data) 보관 — 관리자 화면·엑셀로 수정하는 '작업본'
--    kind = brands | models | lineups | trims | options | trimOptions | colors | trimColors | colorRules | vehicleImages | sources | vehicleSpecs
--    trimOptions·trimColors·colorRules 처럼 자체 id 가 없는 항목은 조합 id (예: 트림ID|옵션ID)
--  · vm_releases: '사이트 반영' 시점의 전체 데이터(gzip). 사이트는 현재 반영본만 읽고, 이전 반영본으로 되돌릴 수 있음
CREATE TABLE IF NOT EXISTS vm_items (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  parent_id  TEXT,                         -- models→브랜드, lineups→모델, trims→라인업, options→모델, trimOptions·trimColors·colorRules→트림, vehicleImages→라인업
  model_id   TEXT,                         -- 소속 모델 (모델별 상세본 묶음·검색용)
  sort       INTEGER NOT NULL DEFAULT 0,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES admins(id),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS vm_items_parent ON vm_items (kind, parent_id);
CREATE INDEX IF NOT EXISTS vm_items_model ON vm_items (kind, model_id);

CREATE TABLE IF NOT EXISTS vm_releases (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INTEGER REFERENCES admins(id),
  note        TEXT NOT NULL DEFAULT '',
  counts      JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload     BYTEA NOT NULL,              -- gzip(JSON 전체 데이터)
  is_current  BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS vm_releases_current ON vm_releases (is_current) WHERE is_current;

-- 작업본 변경 이력 (누가 무엇을 바꿨는지)
CREATE TABLE IF NOT EXISTS vm_changes (
  id         SERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_id   INTEGER REFERENCES admins(id),
  action     TEXT NOT NULL,                -- create | update | delete | import | publish | rollback
  kind       TEXT,
  item_id    TEXT,
  summary    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS vm_changes_at ON vm_changes (at DESC);

-- 차량 데이터 엑셀 올리기: 미리보기 → 적용 (서버가 여러 대여도 같은 미리보기를 적용하도록 DB 에 보관)
CREATE TABLE IF NOT EXISTS vm_imports (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ops         JSONB NOT NULL,
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors      JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_at  TIMESTAMPTZ,
  applied_by  INTEGER REFERENCES admins(id)
);

-- 관리자 화면에서 올린 이미지 (차량·배너·후기·이벤트 등) — DB 에 보관하고 /api/pub/media/<id>.<확장자> 로 제공 (CloudFront 가 오래 캐시)
--  · 올릴 때 webp 로 변환 (긴 변 최대 2000px) + 썸네일(480px)
CREATE TABLE IF NOT EXISTS media (
  id          TEXT PRIMARY KEY,               -- 무작위 (주소에 사용, 바뀌지 않음)
  purpose     TEXT NOT NULL DEFAULT 'etc',     -- vehicle | banner | review | event | article | etc
  file_name   TEXT NOT NULL DEFAULT '',
  mime        TEXT NOT NULL,
  width       INTEGER, height INTEGER,
  bytes       BYTEA NOT NULL,
  thumb       BYTEA,
  size        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INTEGER REFERENCES admins(id)
);
CREATE INDEX IF NOT EXISTS media_purpose ON media (purpose, created_at DESC);
