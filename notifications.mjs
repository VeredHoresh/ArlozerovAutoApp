import webpush from 'web-push';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const deviceHash = token => createHash('sha256').update(token).digest('hex');
export function loadPushKeys(dir) {
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'push-vapid.json');
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600, flag: 'wx' });
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function validateSubscription(value) {
  const endpoint = new URL(value?.endpoint);
  const host = endpoint.hostname;
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || endpoint.hash || !(host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com'))) throw new Error('כתובת שירות ההתראות אינה נתמכת.');
  const { p256dh, auth } = value.keys || {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[\w-]+={0,2}$/.test(p256dh) || !/^[\w-]+={0,2}$/.test(auth) || Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length !== 16 || value.endpoint.length > 2048) throw new Error('פרטי ההתראות אינם תקינים.');
  return { endpoint: endpoint.href, keys: { p256dh, auth } };
}
export function notificationPayload(job) {
  const titles = { registered: 'ההרשמה לחוג אושרה', waitlisted: 'הצטרפת לרשימת ההמתנה', failed: 'ההרשמה האוטומטית לא הושלמה', missed: 'מועד ההרשמה האוטומטית חלף' };
  const a = JSON.parse(job.data);
  const date = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(job.startsAt));
  return { title: titles[job.status], body: `${String(a.name).slice(0,120)} · ${date}`, tag: `booking-${deviceHash(job.key)}-${job.status}`, url: '/?view=upcoming' };
}
export class PushNotifications {
  constructor(store, { keys, deviceActive = () => true, now = Date.now, send = webpush.sendNotification.bind(webpush) } = {}) {
    this.store = store; this.keys = keys; this.deviceActive = deviceActive; this.now = now; this.send = send; this.busy = false;
    store.db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY, deviceHash TEXT UNIQUE NOT NULL, data TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS push_deliveries(subscriptionId TEXT NOT NULL,jobKey TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,nextAt INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(subscriptionId,jobKey,status));`);
  }
  subscribe(value, device) {
    const subscription = validateSubscription(value), id = deviceHash(subscription.endpoint);
    // One subscription per phone; switching devices or re-enabling never replays old results.
    this.unsubscribeDevice(device, id);
    this.store.db.prepare('INSERT INTO push_subscriptions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET deviceHash=excluded.deviceHash,data=excluded.data').run(id, device, this.store.encrypt(subscription), this.now());
  }
  remove(id) { this.store.db.prepare('DELETE FROM push_deliveries WHERE subscriptionId=?').run(id); this.store.db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(id); }
  unsubscribeDevice(device, except = '') { for (const s of this.store.db.prepare('SELECT id FROM push_subscriptions WHERE deviceHash=? AND id!=?').all(device, except)) this.remove(s.id); }
  clear() { this.store.db.exec('DELETE FROM push_deliveries; DELETE FROM push_subscriptions;'); }
  async flush() {
    if (this.busy || !this.keys) return;
    this.busy = true;
    try {
      for (const s of this.store.db.prepare('SELECT * FROM push_subscriptions').all()) {
        if (!this.deviceActive(s.deviceHash)) { this.remove(s.id); continue; }
        // Only new, final automatic outcomes. Saving a rule or retrying is not a confirmation.
        const jobs = this.store.db.prepare("SELECT * FROM jobs WHERE updatedAt>=? AND ruleId!='manual' AND (attempts>0 OR (status='missed' AND ruleId='one-time')) AND status IN ('registered','waitlisted','failed','missed') ORDER BY updatedAt DESC LIMIT 100").all(s.createdAt);
        for (const job of jobs) {
          const resultKey = job.key + ":" + job.updatedAt;
          this.store.db.prepare('INSERT OR IGNORE INTO push_deliveries(subscriptionId,jobKey,status,nextAt) VALUES (?,?,?,?)').run(s.id,resultKey,job.status,this.now());
          const delivery = this.store.db.prepare('SELECT * FROM push_deliveries WHERE subscriptionId=? AND jobKey=? AND status=?').get(s.id,resultKey,job.status);
          if (delivery.sent || delivery.attempts>=5 || delivery.nextAt>this.now()) continue;
          try {
            await this.send(this.store.decrypt(s.data),JSON.stringify(notificationPayload(job)),{ TTL:86400, timeout:10000, vapidDetails:{subject:process.env.PUBLIC_URL || 'https://gym-web-production-d348.up.railway.app',...this.keys} });
            this.store.db.prepare('UPDATE push_deliveries SET sent=1 WHERE subscriptionId=? AND jobKey=? AND status=?').run(s.id,resultKey,job.status);
          } catch (e) {
            if ([404,410].includes(e.statusCode)) { this.remove(s.id); break; }
            this.store.db.prepare('UPDATE push_deliveries SET attempts=attempts+1,nextAt=? WHERE subscriptionId=? AND jobKey=? AND status=?').run(this.now()+Math.min(30000*2**delivery.attempts,600000),s.id,resultKey,job.status);
          }
        }
      }
    } finally { this.busy = false; }
  }
  start() { this.timer = setInterval(() => { this.flush().catch(() => {}); }, 10000); this.timer.unref(); }
  stop() { clearInterval(this.timer); }
}
