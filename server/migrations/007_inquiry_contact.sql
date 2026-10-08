-- 사이트 상담 신청 양식(채널톡 없이): 이름·연락처·연락 희망 시간·문의 내용·개인정보 동의 시각
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS contact_time TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ;
