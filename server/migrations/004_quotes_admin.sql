-- 견적 데이터 관리 개편
--  · source 'EDIT' = 관리자 화면에서 직접 고친 작업본 (현재 사이트 데이터를 복사해 시작)
--  · strict_master = 차량 데이터(마스터) 기준 모드: 브랜드·모델·등급명은 연결된 트림 기준으로 맞추고, 트림 미연결 행은 사이트에 내보내지 않음
--    (이번 개편 이전에 올라간 데이터는 false — 지금 사이트 모습 그대로 유지)
ALTER TABLE quote_batches DROP CONSTRAINT IF EXISTS quote_batches_source_check;
ALTER TABLE quote_batches ADD CONSTRAINT quote_batches_source_check CHECK (source IN ('UPLOAD','SEED','EDIT'));
ALTER TABLE quote_batches ADD COLUMN IF NOT EXISTS strict_master BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quote_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
