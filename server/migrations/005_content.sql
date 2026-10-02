-- 2단계: 자주 묻는 질문 · 이용후기 · 이벤트 · 아티클 (관리자 화면에서 등록 → 저장하면 1분 안에 사이트 반영)
--  · data 는 사이트 파일(faq.js · reviews.js · content.js)과 같은 모양을 기준으로 보관, visible=false 면 사이트에 안 나감
--  · 처음 실행 때 DB 가 비어 있으면 사이트 파일 내용을 그대로 가져옴
CREATE TABLE IF NOT EXISTS content_items (
  kind        TEXT NOT NULL CHECK (kind IN ('faq','review','article','event')),
  id          TEXT NOT NULL,
  visible     BOOLEAN NOT NULL DEFAULT true,
  sort        INTEGER NOT NULL DEFAULT 0,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INTEGER REFERENCES admins(id),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS content_items_sort ON content_items (kind, sort);

-- 분류 (자주 묻는 질문 카테고리 · 아티클 분류)
CREATE TABLE IF NOT EXISTS content_cats (
  kind  TEXT NOT NULL CHECK (kind IN ('faq','article')),
  id    TEXT NOT NULL,
  name  TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
);
