-- 광고 유입·전환 추적 + 여러 서버(ECS 여러 대)에서 견적 캐시 버전 공유
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS first_touch  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 처음 들어온 광고/유입 {source, medium, campaign, term, content, gclid, fbclid, ...,landing, referrer, at}
  ADD COLUMN IF NOT EXISTS last_touch   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 문의 직전 유입
  ADD COLUMN IF NOT EXISTS ga_client_id TEXT,                                 -- GA4 _ga 쿠키 (서버 전환 전송용)
  ADD COLUMN IF NOT EXISTS fbp          TEXT,                                 -- Meta _fbp
  ADD COLUMN IF NOT EXISTS fbc          TEXT,                                 -- Meta _fbc (fbclid)
  ADD COLUMN IF NOT EXISTS conv_log     JSONB NOT NULL DEFAULT '[]'::jsonb;   -- 서버 전환 전송 기록
CREATE INDEX IF NOT EXISTS inquiries_utm_source ON inquiries ((last_touch->>'source'));

CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO app_state (key, value) VALUES ('quotes_version', '1') ON CONFLICT DO NOTHING;
