-- 관리자 멤버·탭별 접근권한 (#46): 기존 관리자 = owner(모든 탭 + 계정 관리), 추가 멤버 = member(탭별 없음/보기/수정)
-- 초대: 비밀번호 없이 만들고 초대 링크(72시간)로 본인이 설정. 삭제하지 않고 중지(작업 이력 created_by 보존)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS perms JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES admins(id);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS invite_hash TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS pw_changed_at TIMESTAMPTZ;
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('owner','member'));
CREATE UNIQUE INDEX IF NOT EXISTS admins_invite_hash_uq ON admins (invite_hash) WHERE invite_hash IS NOT NULL;
-- 새로 만드는 행의 기본값은 member (기존 행은 위에서 owner 로 채워짐)
ALTER TABLE admins ALTER COLUMN role SET DEFAULT 'member';
