-- 차큐 API 초기 스키마
-- 관리자
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- 견적 데이터 업로드 묶음 (엑셀 1회 업로드 = 1 batch). DRAFT → PUBLISHED(사이트 반영) | DISCARDED
CREATE TABLE IF NOT EXISTS quote_batches (
  id           SERIAL PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','DISCARDED')),
  source       TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (source IN ('UPLOAD','SEED')),
  file_name    TEXT NOT NULL DEFAULT '',
  kinds        TEXT[] NOT NULL DEFAULT '{}',
  summary      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   INTEGER REFERENCES admins(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- 견적 레코드 (사이트 window.CHAQ 레코드와 같은 모양을 data 에 그대로 보관)
CREATE TABLE IF NOT EXISTS quote_rows (
  batch_id    INTEGER NOT NULL REFERENCES quote_batches(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('stock','fast','estimate')),
  rec_id      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  trim_id     TEXT,
  link_status TEXT NOT NULL DEFAULT 'UNLINKED' CHECK (link_status IN ('LINKED','AUTO','MANUAL','UNLINKED')),
  data        JSONB NOT NULL,
  PRIMARY KEY (batch_id, kind, rec_id)
);
CREATE INDEX IF NOT EXISTS quote_rows_batch_kind ON quote_rows (batch_id, kind, sort_order);

-- 종류(재고특가·빠른인도·견적조회)별 현재 사이트에 나가는 batch
CREATE TABLE IF NOT EXISTS published_sets (
  kind         TEXT PRIMARY KEY CHECK (kind IN ('stock','fast','estimate')),
  batch_id     INTEGER NOT NULL REFERENCES quote_batches(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by INTEGER REFERENCES admins(id)
);

-- 상담 문의 ('이 조건 그대로 문의하기' 등 → 채널톡 상담으로 이어짐)
CREATE TABLE IF NOT EXISTS inquiries (
  id            SERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PROGRESS','CONTRACTED','CLOSED','SPAM')),
  source        TEXT NOT NULL DEFAULT 'DETAIL',     -- DETAIL(상세 문의) | GUIDE(일반 상담) | ETC
  kind          TEXT,                                -- stock | fast | estimate | null
  rec_id        TEXT,
  trim_id       TEXT,
  car_name      TEXT NOT NULL DEFAULT '',
  spec          TEXT NOT NULL DEFAULT '',
  trim_name     TEXT NOT NULL DEFAULT '',
  conditions    JSONB NOT NULL DEFAULT '{}'::jsonb, -- {product, term, plan, dist}
  monthly       INTEGER,
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  color         TEXT NOT NULL DEFAULT '',
  page_url      TEXT NOT NULL DEFAULT '',
  channel_member_id TEXT,
  memo          TEXT NOT NULL DEFAULT '',
  assignee      TEXT NOT NULL DEFAULT '',
  ip_hash       TEXT,
  user_agent    TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_status ON inquiries (status, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
