-- 인증문자 준비 전(연휴) 임시 운영: 카카오 회원이 직접 입력한 휴대폰 번호(미인증) — 인증된 번호(phone, 중복 불가)와 따로 보관
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_unverified TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT true;
