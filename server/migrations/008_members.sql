-- 회원(카카오 로그인 · 휴대폰 인증) + 인증번호 + 문의의 회원·견적서 스냅샷
CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  kakao_id TEXT UNIQUE,                         -- 카카오 회원번호 (카카오로 가입·연결 시)
  phone TEXT UNIQUE,                            -- 휴대폰 숫자만 (01012345678) — 인증된 번호만 저장
  name TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  terms_agreed_at TIMESTAMPTZ,
  privacy_agreed_at TIMESTAMPTZ,
  marketing_agreed_at TIMESTAMPTZ,              -- 선택 동의 (철회 시 NULL)
  status TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE · WITHDRAWN
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS members_created ON members (created_at DESC);

CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_codes_phone ON auth_codes (phone, created_at DESC);

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS member_id BIGINT REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS report_token TEXT UNIQUE;     -- 견적서 보기 주소용 (추측 불가)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;   -- 문의 당시 견적 그대로 (차량·조건·월 납입금·옵션·색상·이미지)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS kakao_sent_at TIMESTAMPTZ;    -- 채널톡에 견적 전달(알림톡 발송 계기) 시각
CREATE INDEX IF NOT EXISTS inquiries_member ON inquiries (member_id, created_at DESC);
