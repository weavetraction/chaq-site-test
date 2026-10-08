-- 카카오 로그인 선택 동의항목: 출생 연도(운전자 연령 조건 맞춤 견적) · 배송지(계약 후 차량 탁송 안내)
ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_year TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS ship_address JSONB;
