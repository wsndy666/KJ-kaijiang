#!/usr/bin/env node
/**
 * 演示数据脚本 —— 一键灌入一批演示参与者，方便预览效果 / 活动前彩排
 *
 * 用法：
 *   node tools/seed-demo.js                     20 人，开奖时间 = 当前时间 +10 分钟
 *   node tools/seed-demo.js 50 5                50 人，开奖时间 = 当前时间 +5 分钟
 *   node tools/seed-demo.js 30 10 --instant     开奖方式改为「临时开奖」
 *   node tools/seed-demo.js --password=xxx      指定后台密码（默认读取 data/db.json）
 *   node tools/seed-demo.js --clear             只清空参与者与中奖记录，不灌数据
 *   PORT=9000 node tools/seed-demo.js           指定端口（默认 8080）
 *
 * 说明：服务正在运行时通过后台 API 写入；服务没启动则直接写 data/db.json（之后需重启服务）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT) || 8080;
const BASE = 'http://127.0.0.1:' + PORT;

/* ---------------- 参数解析 ---------------- */
const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const nums = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const COUNT = nums[0] || 20;
const MINUTES = nums.length > 1 ? nums[1] : 10;
const INSTANT = flags.includes('--instant');
const ONLY_CLEAR = flags.includes('--clear');
const pwdFlag = flags.find((f) => f.startsWith('--password='));
const PASSWORD = pwdFlag ? pwdFlag.split('=')[1] : '';

/* ---------------- 造数据 ---------------- */
const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
const GIVEN = ['伟', '芳', '娜', '静', '磊', '强', '军', '洋', '勇', '艳', '杰', '娟', '敏', '涛', '明',
  '超', '秀英', '霞', '平', '刚', '桂英', '文', '辉', '玲', '鹏', '宇', '晨', '萌', '琳', '昊'];
const PREFIX = ['137', '138', '139', '150', '151', '158', '159', '186', '188', '199'];

function buildParticipants(n) {
  const list = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const name = SURNAMES[(i * 7) % SURNAMES.length] + GIVEN[(i * 11) % GIVEN.length];
    let phone;
    do {
      // 生成 13702111109 这种样式的号码，保证不重复
      phone =
        PREFIX[(i * 3) % PREFIX.length] +
        String(20000000 + ((i * 1234567) % 79999999)).slice(0, 8);
    } while (used.has(phone));
    used.add(phone);
    list.push({ name, phone });
  }
  return list;
}

function localDrawTime(minutesLater) {
  const d = new Date(Date.now() + minutesLater * 60000);
  const p = (x) => String(x).padStart(2, '0');
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes())
  );
}

/* ---------------- 直连文件（服务未启动时） ---------------- */
function readDbPassword() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return (db.config && db.config.adminPassword) || '';
  } catch (e) {
    return '';
  }
}

function writeDbDirectly(participants, drawTime, drawMode) {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.participants = participants.map((p, i) => ({
    id: (Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 16),
    name: p.name,
    phone: p.phone,
    ip: 'demo',
    createdAt: Date.now() - (participants.length - i) * 30000,
  }));
  db.winners = [];
  db.drawn = false;
  db.drawnAt = null;
  db.config.drawTime = drawTime;
  db.config.drawMode = drawMode;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function clearDbDirectly() {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.participants = [];
  db.winners = [];
  db.drawn = false;
  db.drawnAt = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- 走 API（服务运行时） ---------------- */
async function api(pathname, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-admin-token'] = token;
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = { ok: false, msg: 'HTTP ' + res.status };
  }
  return json;
}

async function serverAlive() {
  try {
    const res = await fetch(BASE + '/api/state', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/* ---------------- 主流程 ---------------- */
(async function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('× 找不到 data/db.json，请先启动一次服务（node server.js）生成数据文件');
    process.exit(1);
  }

  const password = PASSWORD || readDbPassword();
  const participants = buildParticipants(COUNT);
  const drawTime = localDrawTime(MINUTES);
  const drawMode = INSTANT ? 'instant' : 'fixed';

  const alive = await serverAlive();

  if (!alive) {
    console.log('· 服务未启动，直接写入 data/db.json');
    if (ONLY_CLEAR) {
      clearDbDirectly();
      console.log('√ 已清空参与者与中奖记录');
    } else {
      writeDbDirectly(participants, drawTime, drawMode);
      console.log('√ 已写入 ' + participants.length + ' 位演示参与者，开奖时间 ' + drawTime);
    }
    console.log('！请重新启动服务让数据生效：node server.js');
    return;
  }

  console.log('· 服务在线（' + BASE + '），通过后台接口写入');
  const login = await api('/api/admin/login', { password });
  if (!login.ok || !login.token) {
    console.error('× 后台登录失败：' + (login.msg || '密码不正确'));
    console.error('  （用 --password=你的后台密码 指定密码，或先改 data/db.json 里的 adminPassword）');
    process.exit(1);
  }
  const token = login.token;

  const cleared = await api('/api/admin/clear', { confirm: 'CLEAR' }, token);
  if (!cleared.ok) {
    console.error('× 清空失败：' + cleared.msg);
    process.exit(1);
  }
  const reset = await api('/api/admin/reset', {}, token);
  if (!reset.ok) console.warn('· 重置开奖状态失败：' + reset.msg);

  if (ONLY_CLEAR) {
    console.log('√ 已清空参与者与中奖记录（活动/奖品配置保留）');
    return;
  }

  let added = 0;
  for (const p of participants) {
    const r = await api('/api/admin/participant/add', p, token);
    if (r.ok) added++;
  }

  const cfg = await api('/api/admin/config', { drawTime, drawMode }, token);
  if (!cfg.ok) console.warn('· 开奖时间设置失败：' + cfg.msg);

  console.log('√ 已添加 ' + added + '/' + participants.length + ' 位演示参与者');
  console.log('√ 开奖方式 ' + (INSTANT ? '临时开奖' : '固定时间开奖') + '，开奖时间 ' + drawTime);
  console.log('→ 打开 ' + BASE + '/?preview=1 预览开奖现场，' + BASE + '/admin 进入后台');
})().catch((e) => {
  console.error('× 执行出错：' + e.message);
  process.exit(1);
});
