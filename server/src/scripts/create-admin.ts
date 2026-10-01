// 관리자 계정 만들기/비밀번호 바꾸기: npm run create-admin -- 이메일 비밀번호 [이름]
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { migrate } from "./migrate.js";

const [email, password, name = "관리자"] = process.argv.slice(2);
if (!email || !password || password.length < 10) { console.error("사용: npm run create-admin -- 이메일 비밀번호(10자 이상) [이름]"); process.exit(1); }
(async () => {
  await migrate();
  const hash = await bcrypt.hash(password, 12);
  await pool.query(`INSERT INTO admins (email, name, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`, [email.trim().toLowerCase(), name, hash]);
  console.log("관리자 저장:", email);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
