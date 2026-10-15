-- 회원 후기·이벤트 참여·상담 상태 확장 (대표 261015)
--  · 상태: CONTRACTED = 계약완료(후기 작성 가능) · CLOSED = 종료(계약 못 하고 상담 종료) · CUSTOMER_STOP = 고객중지(마이페이지에서 고객이 상담 중지)
--  · 출고일: 계약완료 건의 후기 작성 시 '계약 선택'에 차량명과 함께 표시
--  · 삭제 = 휴지통(숨김, 복원 가능) — 관리자 권한 '상담 문의 삭제'가 있는 계정만
ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_status_check CHECK (status IN ('NEW','IN_PROGRESS','CONTRACTED','CLOSED','CUSTOMER_STOP','SPAM'));
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS delivered_on DATE;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES admins(id);
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ;   -- 고객이 마이페이지에서 상담 중지한 시각

-- 회원 후기: content_items(kind='review')에 visible=false 로 들어가고 관리자가 노출을 켜면 게시. 계약 1건당 후기 1개
CREATE UNIQUE INDEX IF NOT EXISTS content_items_review_inquiry ON content_items ((data->>'inquiryId')) WHERE kind = 'review' AND data ? 'inquiryId';
CREATE INDEX IF NOT EXISTS content_items_review_member ON content_items ((data->>'memberId')) WHERE kind = 'review' AND data ? 'memberId';

-- 이벤트 참여 (회원 1명당 이벤트 1회)
CREATE TABLE IF NOT EXISTS event_entries (
  event_id   TEXT NOT NULL,
  member_id  BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS event_entries_member ON event_entries (member_id, created_at DESC);
