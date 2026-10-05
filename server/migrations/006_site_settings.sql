-- 3단계: 메인 화면 설정(섹션별 노출 선택·상단 배너·중간 띠배너) 등 사이트 설정값 — key 별 JSON 1개
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INTEGER REFERENCES admins(id)
);
