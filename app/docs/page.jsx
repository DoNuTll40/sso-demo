import Link from "next/link";
import spec from "@/docs/openapi.json";
import styles from "./docs.module.css";
export const metadata={title:'SSO Core · Developer Handbook',description:'คู่มือเชื่อมต่อ OAuth, PKCE, Mobile 2FA และ API Reference ของ SSO Core'};
const sections=[['start','เริ่มต้นใช้งาน'],['oauth','OAuth & PKCE'],['mobile','Mobile Push 2FA'],['recovery','Recovery Codes'],['sessions','Sessions & Logout'],['admin','จัดการระบบ'],['errors','แก้ปัญหา'],['reference','API Reference']];
function Code({children}){return <pre className={styles.code}><code>{children}</code></pre>;}
function Section({id,kicker,title,children}){return <section id={id} className={styles.section}><p className={styles.eyebrow}>{kicker}</p><h2>{title}</h2>{children}</section>;}
export default function Docs(){const count=Object.values(spec.paths).reduce((n,p)=>n+Object.keys(p).length,0);return <div className={styles.root}>
 <header className={styles.top}><Link href="/docs" className={styles.brand}>◈ <span>SSO Core</span><small>DEVELOPER HANDBOOK</small></Link><div><Link href="/docs/scalar">Scalar ↗</Link><Link href="/docs/swagger">Swagger ↗</Link><Link href="/">Console →</Link></div></header>
 <div className={styles.layout}><aside className={styles.sidebar}><p>คู่มือระบบ</p>{sections.map(([id,label],i)=><a key={id} href={'#'+id}><span>{String(i+1).padStart(2,'0')}</span>{label}</a>)}<div className={styles.sideNote}><strong>Contract v{spec.info.version}</strong><br/>{count} operations · OpenAPI 3.0.3<br/>เอกสารอ้างอิงจาก route handlers<br/>ตัวอย่างไม่มีข้อมูลรับรองจริง</div></aside>
 <main className={styles.main}><div className={styles.hero}><p className={styles.eyebrow}>IDENTITY INFRASTRUCTURE / INTEGRATION GUIDE</p><h1>เชื่อมทุกระบบ<br/><em>ด้วยตัวตนเดียว</em></h1><p className={styles.lead}>คู่มือสำหรับนักพัฒนาและผู้ดูแลระบบ ตั้งแต่ลงทะเบียนแอป เข้าสู่ระบบด้วย OAuth ไปจนถึงการยืนยันผ่านมือถือและจัดการเซสชัน</p><div className={styles.actions}><Link className={styles.primary} href="/docs/scalar">เปิด Interactive API Reference ↗</Link><a href="/docs/downloads/collection.json">ดาวน์โหลด Postman ↓</a></div><div className={styles.stats}><div><b>{count}</b><span>API operations</span></div><div><b>S256</b><span>PKCE challenge</span></div><div><b>Ed25519</b><span>Mobile device proof</span></div></div></div>
 <Section id="start" kicker="01 / QUICK START" title="เริ่มจากแอปที่ลงทะเบียนไว้"><ol><li>เข้า Console ด้วยบัญชี ADMIN → แอปพลิเคชันของฉัน → สร้างแอป ระบุชื่อและ Redirect URI ที่ตรงกับ callback ของแอป</li><li>เลือก Public client สำหรับแอปที่เก็บ secret ไม่ได้ ใช้ PKCE ทุกครั้ง ส่วน Confidential client เก็บ client secret เฉพาะเซิร์ฟเวอร์</li><li>บันทึก client_id และ secret ที่แสดงครั้งเดียว ตั้งค่า issuer URL และ redirect URI ในแอปปลายทาง</li><li>เริ่ม login จากแอปปลายทาง เพื่อสร้าง state และ code_verifier ที่ใช้ตรวจ callback</li></ol><div className={styles.note}>Base URL ในตัวอย่างคือ <code>http://localhost:3000</code> เมื่อ deploy ให้ใช้ HTTPS และเปลี่ยน origin ให้ตรงทุกจุด ผู้ดูแลเห็นและแก้ไขได้เฉพาะ OAuth clients ที่ตนเป็นเจ้าของ</div><Code>{`SSO_ISSUER_URL=http://localhost:3000
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<server-only-secret>
SSO_REDIRECT_URI=http://localhost:3001/api/auth/callback`}</Code><p>Postman: import ทั้ง Collection และ Environment แล้วใส่ค่าของบัญชีทดสอบเอง ค่า password, secret และ token เริ่มต้นว่างทั้งหมด ห้าม Run All เพราะมี request ลบข้อมูลและเพิกถอนสิทธิ์</p></Section>
 <Section id="oauth" kicker="02 / BROWSER AUTHORIZATION" title="OAuth 2.0 Authorization Code + PKCE"><div className={styles.flow}>{['แอปสร้าง state + verifier','SSO ตรวจรหัสผ่าน / 2FA','ผู้ใช้ยืนยัน Consent','Callback รับ code + state','แอปแลก token'].map((x,i)=><div key={x}><small>0{i+1}</small>{x}</div>)}</div><h3>1. สร้างคำขอในแต่ละรอบ</h3><p>state ต้องสุ่มและผูกกับเบราว์เซอร์ที่เริ่ม login ส่วน verifier เก็บฝั่งแอปชั่วคราว แล้วส่งเฉพาะ SHA-256 challenge ไป SSO คำขอใหม่ต้องใช้ค่าชุดใหม่ รีเฟรชหน้าเดิมไม่ควรสร้างค่าใหม่ทับรอบเดิม</p><Code>{`import crypto from 'node:crypto';
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(32).toString('hex');
// Store verifier and state in secure HttpOnly cookies (or server session).
const url = new URL('/api/v1/oauth/authorize', issuer);
url.search = new URLSearchParams({
  client_id: clientId, redirect_uri: redirectUri,
  response_type: 'code', scope: 'openid profile email',
  state, code_challenge: challenge, code_challenge_method: 'S256'
}).toString();
// Redirect browser to url.`}</Code><h3>2. ตรวจ callback ก่อนแลก code</h3><p>ปฏิเสธเมื่อ state ไม่ตรงหรือ cookie หาย ใช้ redirect_uri เดิมทุกตัวอักษรและ verifier ของรอบนั้น แลก code ได้ครั้งเดียว แล้วลบค่าชั่วคราวหลังสำเร็จ</p><Code>{`POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<code>&client_id=<client-id>
&redirect_uri=<encoded-callback>&code_verifier=<original-verifier>
# Confidential client: add client_secret or use HTTP Basic.`}</Code><h3>3. เก็บ token และอ่านโปรไฟล์</h3><p>เก็บ token ฝั่งเซิร์ฟเวอร์หรือ HttpOnly cookie เรียก userinfo ด้วย Bearer token ที่ยังไม่หมดอายุ เมื่อ refresh สำเร็จต้องแทนที่ refresh token เก่าด้วยค่าใหม่</p><Code>{`GET /api/v1/oauth/userinfo
Authorization: Bearer <access_token>

POST /api/v1/oauth/token
Content-Type: application/json
{"grant_type":"refresh_token","refresh_token":"<current-refresh-token>",
 "client_id":"<client-id>","client_secret":"<confidential-client-secret>"}`}</Code><div className={styles.warning}>ข้อจำกัดปัจจุบัน: ID token ลงลายเซ็น HS256 ขณะที่ JWKS ส่งออกได้เฉพาะ RSA key ที่ตั้งค่าไว้ อย่าสมมติว่า JWKS จะตรวจ ID token นี้ได้ การเชื่อมต่อทั่วไปให้อ่านโปรไฟล์จาก userinfo และตรวจสอบข้อมูลตาม scope</div><p>หน้า Consent ใช้ประวัติการอนุญาตแยกตามบัญชี แอป callback และ scope ถ้าเคยให้สิทธิ์ครบแล้วจะแสดงยืนยันเข้าใช้งานอีกครั้ง หากขอเพิ่มจะแสดงรายการขอสิทธิ์เต็ม คำขอมี expiresAt และตัวนับเวลา</p></Section>
 <Section id="mobile" kicker="03 / DEVICE TRUST" title="ผูกมือถือและยืนยัน Push 2FA"><ol><li>ผู้ใช้ล็อกอินเว็บ → อุปกรณ์และ 2FA → ผูกอุปกรณ์ใหม่ เว็บเรียก GET /devices/pair เพื่อรับ QR token อายุ 10 นาที</li><li>แอปสร้าง Ed25519 key pair เก็บ private key ใน secure storage ส่ง public key ในรูป ed25519:&lt;64 hex&gt; กับ pairingToken ไป POST /devices/pair</li><li>หลังผ่านรหัสผ่าน เว็บรับ challengeId และ cookie sso_challenge มือถือรับ Push หรือ signed polling เพื่อดึง nonce และตัวเลือกตัวเลข</li><li>ผู้ใช้เลือกเลขตรงกับเว็บ แอปเซ็น payload และส่ง approve/reject เว็บ poll GET /auth/challenge-status ทุก 2 วินาทีจนได้ redirectUrl</li></ol><Code>{`// Sign the exact UTF-8 bytes of JSON.stringify(array), not an object.
// Poll (timestamp is Unix milliseconds, valid within 60 seconds):
["sso-poll-v1", deviceId, timestamp]
// Account overview:
["sso-account-v1", deviceId, timestamp]
// Unpair:
["sso-unpair-v1", deviceId, timestamp]
// Approve / reject (selectedCode is always a string):
["sso-2fa-v1", challengeId, nonce, deviceId, "APPROVE", "58"]
["sso-2fa-v1", challengeId, nonce, deviceId, "REJECT", ""]
// signature: 128 lowercase hex characters, Ed25519.`}</Code><p>nonce ต้องมาจาก challenge จริง ห้ามเซ็น nonce จากรอบอื่น เลข 2 หลักอย่างเดียวไม่ใช่หลักฐานอนุมัติ challenge การไม่มี Expo push token ที่ใช้ได้อาจทำให้ส่ง Push ไม่ได้ แม้รายการอุปกรณ์ยังผูกอยู่</p><div className={styles.note}>สถานะ “ผูกอยู่” หมายถึงอุปกรณ์มีสิทธิ์ยืนยัน ไม่ได้หมายความว่าออนไลน์อยู่ “ยกเลิกการผูก” ปิดสิทธิ์และเก็บรายการไว้ ส่วน “ลบออกจากรายการ” ใช้กับเครื่องที่ยกเลิกแล้ว</div></Section>
 <Section id="recovery" kicker="04 / ACCOUNT RECOVERY" title="มือถือใช้ไม่ได้ ก็ยังมีทางกลับ"><p>สร้าง Recovery Code ในหน้าอุปกรณ์และ 2FA โดยยืนยันรหัสผ่าน จะได้ 10 รหัส รหัสละ 20 ตัวอักษร hex แสดงครั้งเดียว ดาวน์โหลดเก็บในที่ปลอดภัย ระบบเก็บเฉพาะ hash และยกเลิกชุดเก่าทันทีที่สร้างใหม่</p><Code>{`// Authenticated browser, with sso_session cookie:
POST /api/v1/auth/recovery
{"action":"generate","password":"<current-password>"}

// After password verification, with sso_challenge cookie:
POST /api/v1/auth/recovery
{"challengeId":"<pending-challenge>","code":"<unused-recovery-code>"}
// Then poll challenge-status to receive sso_session and redirectUrl.`}</Code><p>แต่ละรหัสใช้ได้ครั้งเดียว รวมถึงเมื่อส่งพร้อมกัน หากกรอกผิดครบ 5 ครั้งใน 15 นาทีจะได้ HTTP 429 ไม่มี API สร้างรหัสสำรองจากแค่รหัสผ่านขณะติดหน้า 2FA บัญชีที่ไม่มีรหัสเก็บไว้ต้องผ่านกระบวนการช่วยกู้คืนของผู้ดูแล</p></Section>
 <Section id="sessions" kicker="05 / SESSION LIFECYCLE" title="รู้ว่าเข้าอะไร และตัดสิทธิ์ให้ถูกจุด"><p>หน้าเซสชันของฉันแสดง 100 รายการล่าสุด พร้อม browser, OS, ประเภทอุปกรณ์, IP, เวลาเริ่ม/หมดอายุ, สถานะ MFA และแอปที่มีข้อมูลเชื่อมโยง ไม่ส่ง session token กลับมาบนหน้ารายการ</p><Code>{`GET /api/v1/sessions
DELETE /api/v1/sessions
{"id":"<own-session-id>"}
// Or revoke all other sessions while retaining the current one:
{"others":true}`}</Code><p>การเพิกถอนผ่านหน้าเซสชันจะปิด SSO session และ OAuth token ที่เชื่อมโยงจากประวัติ Consent ส่วน Dashboard ตัวอย่างตรวจ userinfo ตอนเข้าและทุก 15 วินาที ข้อมูลเก่าที่ไม่มีการเชื่อมโยงอาจตัด token แอปผ่าน session ไม่ได้</p><div className={styles.warning}>ยังไม่ใช่ OIDC Back-Channel Logout และไม่รับประกันว่าแอปอื่นจะออกทันที ทุกแอปต้องตรวจสถานะ/เพิกถอน token ตามรูปแบบที่ตกลงกัน ส่วน POST /auth/logout ปัจจุบันปิด SSO cookie/session เท่านั้น</div><p>IP ::1 / 127.0.0.1 คือ localhost จึงระบุตำแหน่งเมืองไม่ได้ User-Agent เป็นข้อมูลจาก client จึงใช้บอกลักษณะอุปกรณ์โดยประมาณ ไม่ใช่ตัวระบุอุปกรณ์ที่เชื่อถือได้ และ lastActiveAt ไม่ใช่ online heartbeat</p></Section>
 <Section id="admin" kicker="06 / OPERATIONS" title="จัดการบัญชี แอป และนโยบาย"><div className={styles.cards}><article><h3>User Directory</h3><p>ADMIN สร้าง แก้ไข ลบบัญชี และ reset password ได้ ดูอุปกรณ์ทั้งหมดแต่ใช้ isVerified เพื่อนับการผูก 2FA ห้ามนำจำนวนรายการมาแปลว่าเครื่องออนไลน์</p></article><article><h3>OAuth Clients</h3><p>ADMIN จัดการเฉพาะแอปที่ตัวเองเป็นเจ้าของ ค่า secret แสดงครั้งเดียว เก็บเป็น hash สามารถหมุน secret ได้ Public client ไม่ใช้ secret</p></article><article><h3>Audit & Preferences</h3><p>GET /activity ครั้งละ 25 รายการ ผู้ใช้ดูของตนเอง ADMIN เลือก scope=all ได้ Settings แยกตามบัญชี TTL token 300–3600 วินาที และ challenge 30–300 วินาที</p></article></div></Section>
 <Section id="errors" kicker="07 / TROUBLESHOOTING" title="เริ่มตรวจจากจุดที่ข้อมูลขาด"><div className={styles.tableWrap}><table><thead><tr><th>อาการ</th><th>ตรวจอะไร</th></tr></thead><tbody>{[['Invalid state / missing code','เริ่มรอบใหม่จากแอปต้นทาง ตรวจ cookie state/verifier, อายุคำขอ, hostname และหลายแท็บที่อาจเขียน cookie ทับกัน ห้ามข้ามการตรวจ state'],['invalid_grant','code ใช้แล้ว/หมดอายุ, redirect_uri ไม่ตรง, verifier ผิด หรือ refresh token ถูกหมุน/เพิกถอน'],['401 Unauthorized','cookie ไม่ได้ส่ง, session หมดอายุ, token ถูกเพิกถอน หรือ device signature/timestamp ไม่ถูกต้อง'],['403 / 404','บทบาทไม่พอ, session ไม่ใช่ของบัญชีนี้ หรือ client ไม่ใช่แอปที่ตนเป็นเจ้าของ'],['429 Recovery','ลอง recovery ผิดหลายครั้ง รอให้พ้นหน้าต่าง 15 นาที'],['Push ไม่เข้า','เช็ก Expo token, เครือข่ายมือถือ, pairing และเวลาหมดอายุ challenge การผูกอยู่ไม่ใช่สถานะออนไลน์'],['เหลือเวลาแต่ callback ใช้ไม่ได้','SSO request กับ cookie ของแอปต้นทางต้องมีอายุสอดคล้องกัน และต้องเป็น state/verifier จากคำขอเดียวกัน']].map(([a,b])=><tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table></div></Section>
 <Section id="reference" kicker="08 / API EXPLORER" title="หนึ่ง contract ใช้ได้สามรูปแบบ"><div className={styles.cards}><Link href="/docs/scalar"><strong>Scalar ↗</strong><p>ค้นหา endpoint ดู schema และตัวอย่าง request</p></Link><Link href="/docs/swagger"><strong>Swagger UI ↗</strong><p>สำรวจ operation และทดลองเรียก API</p></Link><a href="/openapi.json"><strong>OpenAPI JSON ↓</strong><p>ใช้สร้าง SDK, import เครื่องมือ หรือ review contract</p></a></div><div className={styles.actions}><a href="/docs/downloads/collection.json">Postman Collection ↓</a><a href="/docs/downloads/environment.json">Local Environment ↓</a></div><p>API ที่ใช้ HttpOnly cookie ทดสอบบน origin เดียวกันหลัง login ได้ ส่วน Postman ใช้ cookie jar ของตนเอง ลายเซ็นมือถือยังต้องสร้างจาก private key จริง เอกสารไม่ติดตั้งทางลัดข้าม 2FA</p><div className={styles.inventory}>{spec.tags.map(tag=>{const entries=Object.entries(spec.paths).flatMap(([p,methods])=>Object.entries(methods).filter(([,o])=>o.tags.includes(tag.name)).map(([method,o])=>({p,method,o})));return <details key={tag.name}><summary>{tag.name}<span>{entries.length} operations</span></summary>{entries.map(({p,method,o})=><div key={method+p}><b>{method.toUpperCase()}</b><code>{p}</code><small>{o.summary}</small></div>)}</details>;})}</div></Section>
 <footer className={styles.footer}>SSO Core · Developer Handbook / Contract v{spec.info.version}<br/>ข้อมูลอ้างอิงจาก implementation ปัจจุบัน ไม่ใช่การรับรองว่า production hardening เสร็จครบแล้ว</footer></main></div></div>;}
