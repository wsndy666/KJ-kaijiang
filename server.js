/**
 * 抽奖系统 · 后端服务
 * 零依赖（只用 Node 原生模块），数据存 data/db.json
 * 启动：node server.js   （默认端口 8080，可用环境变量 PORT 覆盖）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

/* ------------------------------------------------------------------ */
/* 数据层                                                              */
/* ------------------------------------------------------------------ */

function defaultDb() {
  return {
    config: {
      activityTitle: '幸运时刻',
      activitySubTitle: '扫码参与 · 好礼相送',
      activityDesc:
        '为回馈新老客户长期以来的支持，本公司特举办本次幸运抽奖活动。本次奖品为「物联家用直饮机 T941」——RO 反渗透过滤，出水健康直饮，75% 超高水效。\n\n参与方式：扫描活动二维码，填写您的姓名与手机号并提交，即可进入开奖现场。\n开奖规则：开奖时间到达后系统自动开奖，中奖名单现场公布，全程公开透明。\n领奖方式：中奖后请凭中奖手机号，于 7 日内联系工作人员领取，逾期视为自动放弃。',

      prizeName: '物联家用直饮机 T941',
      prizeCount: 1,
      prizeImage: 'img/prize-t941-full.jpg',
      // 奖品页顶部的高亮标签
      prizeBadge: '75% 超高水效 · 超越国家一级水效标准',
      // 参与页弹层里显示的简短介绍
      prizeDesc:
        'RO 反渗透过滤，出水健康直饮，小通量更节水。中奖后请凭中奖手机号，于 7 日内联系工作人员领取，逾期视为自动放弃。',
      // 奖品页「核心卖点」，一行一条
      prizeHighlights:
        'RO 反渗透过滤，出水健康直饮\n' +
        '外置压力桶设计，停水用水不担忧\n' +
        '后置平口滤芯，3 步换芯，简单便捷\n' +
        '高效能、低耗水设计，有效减少水耗\n' +
        '小通量、高节水，75% 超高水效，超越国家一级水效标准',
      // 奖品页「产品参数」，每行「参数名|参数值」
      prizeSpecs:
        '产品名称|物联家用直饮机 T941\n' +
        '电　　源|220V~50Hz\n' +
        '过滤精度|0.0001 微米\n' +
        '净水流量|15.6L/h\n' +
        '额定功率|28W\n' +
        '产品尺寸|380×170×410（mm）\n' +
        '适用场景|家庭使用\n' +
        '适用水质|市政自来水\n' +
        '适用水压|0.1~0.4MPa\n' +
        '适用水温|5-38℃\n' +
        '滤芯配置|PP+CTO+RO+T33',

      // 开奖方式：fixed=固定时间自动开奖；instant=临时开奖（到点后由管理员手动开启）
      drawMode: 'fixed',
      // 开奖时间，格式 'YYYY-MM-DDTHH:mm' 或 'YYYY-MM-DD HH:mm:ss'
      drawTime: '',

      limitOnePerPhone: true, // 一个手机号只能参与一次
      noRepeatWin: true, // 一人最多中一个奖
      allowJoinAfterDraw: true, // 开奖后是否还允许提交信息
      showRolling: true, // 是否开启滚动动画

      adminPassword: 'admin123',
    },
    participants: [], // {id,name,phone,ip,createdAt}
    winners: [], // {id,name,phone,prizeName,drawnAt}
    drawn: false,
    drawnAt: null,
    // 已经触发过自动开奖的那个「开奖时间」值。
    // 作用：重置开奖后不会因为时间已经过去而被立刻重新开一次。
    autoDrawnFor: '',
    sessions: {}, // token -> expireTs
  };
}

let db;

function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const base = defaultDb();
      // 浅合并，保证新增字段有默认值
      db = {
        ...base,
        ...parsed,
        config: { ...base.config, ...(parsed.config || {}) },
        participants: parsed.participants || [],
        winners: parsed.winners || [],
        sessions: parsed.sessions || {},
      };
      console.log('[db] 已加载数据文件：' + DB_FILE);
      console.log(
        '[db] 参与者 ' + db.participants.length + ' 人，中奖 ' + db.winners.length + ' 人'
      );
      return;
    }
  } catch (e) {
    console.error('[db] 读取失败，将使用全新数据：', e.message);
  }
  db = defaultDb();
  console.log('[db] 首次运行，已创建默认数据');
}

function saveDb() {
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('[db] 保存失败：', e.message);
  }
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

const rid = () => crypto.randomBytes(8).toString('hex');

/** 手机号脱敏：13800001111 -> 138****1111 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length < 7) return s.replace(/./g, '*');
  const head = s.slice(0, 3);
  const tail = s.slice(-4);
  return head + '*'.repeat(Math.max(4, s.length - 7)) + tail;
}

/** 姓名脱敏：张三 -> 张*；张小三 -> 张*三 */
function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '**';
  const arr = Array.from(s);
  if (arr.length === 1) return arr[0] + '*';
  if (arr.length === 2) return arr[0] + '*';
  return arr[0] + '*'.repeat(arr.length - 2) + arr[arr.length - 1];
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 多行文本 -> 字符串数组（去掉空行、首尾空格） */
function toLines(v) {
  return String(v == null ? '' : v)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 「参数名|参数值」多行文本 -> [{k, v}] */
function toSpecs(v) {
  return toLines(v).map((line) => {
    const i = line.indexOf('|');
    if (i < 0) return { k: '', v: line };
    return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
  });
}

/** 宽松解析时间字符串（兼容 'YYYY-MM-DDTHH:mm' 和 'YYYY-MM-DD HH:mm:ss'） */
function parseTime(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace('T', ' ');
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) {
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0)
  );
  return d.getTime();
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    ' ' +
    p(d.getHours()) +
    ':' +
    p(d.getMinutes()) +
    ':' +
    p(d.getSeconds())
  );
}

/* ------------------------------------------------------------------ */
/* 业务逻辑                                                            */
/* ------------------------------------------------------------------ */

/** 执行开奖。开出奖返回中奖数组；没有可开奖的人返回 false（并且不改变开奖状态） */
function performDraw(reason) {
  const cfg = db.config;

  if (!db.participants.length) {
    console.log('[draw] 跳过开奖（' + reason + '）：当前没有任何参与者');
    return false;
  }

  let pool = db.participants.slice();

  if (cfg.noRepeatWin && db.winners.length) {
    const wonPhones = new Set(db.winners.map((w) => w.phone));
    pool = pool.filter((p) => !wonPhones.has(p.phone));
  }

  if (!pool.length) {
    console.log('[draw] 跳过开奖（' + reason + '）：参与的人都已中过奖（可关闭「一人最多中一个奖」）');
    return false;
  }

  pool = shuffle(pool);
  const need = Math.max(1, parseInt(cfg.prizeCount, 10) || 1);
  const picked = pool.slice(0, need);

  db.winners = picked.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    prizeName: cfg.prizeName,
    drawnAt: Date.now(),
  }));
  db.drawn = true;
  db.drawnAt = Date.now();
  saveDb();
  console.log(
    '[draw] 开奖完成（' +
      reason +
      '），参与池 ' +
      pool.length +
      ' 人，抽出 ' +
      db.winners.length +
      ' 人'
  );
  return db.winners;
}

/**
 * 固定时间模式下，到点自动开奖。
 * 关键：同一个「开奖时间」只自动开一次（记录在 db.autoDrawnFor）。
 *  - 到点自动开过一次后，管理员点「重置开奖」不会再被立刻重开（要重开请点「立即开奖」）
 *  - 想重新启用自动开奖，在后台把开奖时间改成另一个新的时间即可
 */
let autoDrawRetryAt = 0; // 内存态，避免条件不满足时每秒刷日志

function checkAutoDraw() {
  const cfg = db.config;
  if (db.drawn) return;
  if (cfg.drawMode !== 'fixed') return;

  const ts = parseTime(cfg.drawTime);
  if (!ts || Date.now() < ts) return;

  const key = String(cfg.drawTime || '');
  if (db.autoDrawnFor === key) return; // 这个时间点已经自动开过了

  if (Date.now() - autoDrawRetryAt < 10000) return; // 最多每 10 秒尝试一次
  autoDrawRetryAt = Date.now();

  if (performDraw('固定时间自动开奖')) db.autoDrawnFor = key;
}

function publicState() {
  const cfg = db.config;
  const sample = db.participants
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt) // 最新参与的排前面，顺序稳定
    .slice(0, 200)
    .map((p) => maskPhone(p.phone));

  return {
    serverNow: Date.now(),
    activity: {
      title: cfg.activityTitle,
      subTitle: cfg.activitySubTitle,
      desc: cfg.activityDesc,
      prize: {
        name: cfg.prizeName,
        count: parseInt(cfg.prizeCount, 10) || 1,
        image: cfg.prizeImage,
        badge: cfg.prizeBadge || '',
        desc: cfg.prizeDesc,
        highlights: toLines(cfg.prizeHighlights),
        specs: toSpecs(cfg.prizeSpecs),
      },
    },
    drawMode: cfg.drawMode,
    drawTime: cfg.drawTime,
    drawTs: parseTime(cfg.drawTime),
    drawn: db.drawn,
    drawnAt: db.drawnAt,
    drawnAtText: fmtTime(db.drawnAt),
    showRolling: cfg.showRolling,
    allowJoinAfterDraw: cfg.allowJoinAfterDraw,
    limitOnePerPhone: cfg.limitOnePerPhone,
    participantCount: db.participants.length,
    samplePhones: sample,
    winners: db.winners.map((w) => ({
      id: w.id,
      name: maskName(w.name),
      phone: maskPhone(w.phone),
      prizeName: w.prizeName,
    })),
  };
}

function adminData() {
  const cfg = { ...db.config };
  const hasPwd = !!cfg.adminPassword;
  delete cfg.adminPassword; // 不回传密码明文
  return {
    config: cfg,
    hasPassword: hasPwd,
    participants: db.participants
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        phoneMask: maskPhone(p.phone),
        createdAt: p.createdAt,
        createdAtText: fmtTime(p.createdAt),
        won: db.winners.some((w) => w.phone === p.phone),
      })),
    winners: db.winners.map((w) => ({
      ...w,
      phoneMask: maskPhone(w.phone),
      drawnAtText: fmtTime(w.drawnAt),
    })),
    drawn: db.drawn,
    drawnAt: db.drawnAt,
    drawnAtText: fmtTime(db.drawnAt),
    participantCount: db.participants.length,
  };
}

/* ------------------------------------------------------------------ */
/* 后台鉴权                                                            */
/* ------------------------------------------------------------------ */

const TOKEN_TTL = 12 * 3600 * 1000; // 12 小时

function newToken() {
  const t = crypto.randomBytes(24).toString('hex');
  db.sessions[t] = Date.now() + TOKEN_TTL;
  // 清理过期 token
  const now = Date.now();
  Object.keys(db.sessions).forEach((k) => {
    if (db.sessions[k] < now) delete db.sessions[k];
  });
  saveDb();
  return t;
}

function isAuthed(req) {
  const t = req.headers['x-admin-token'];
  if (!t || !db.sessions[t]) return false;
  if (db.sessions[t] < Date.now()) {
    delete db.sessions[t];
    return false;
  }
  return true;
}

/* ---------------- 登录防暴力破解 ---------------- */
const loginThrottle = {
  fails: 0, // 连续失败次数
  firstFailAt: 0, // 第一次失败的时间
  lockUntil: 0, // 锁定到的时间戳
};
function loginThrottleCheck() {
  const now = Date.now();
  // 锁定期内直接拒绝
  if (now < loginThrottle.lockUntil) {
    return { locked: true, wait: Math.ceil((loginThrottle.lockUntil - now) / 1000) };
  }
  return { locked: false };
}
function loginThrottleFail() {
  const now = Date.now();
  if (now - loginThrottle.firstFailAt > 5 * 60 * 1000) {
    // 距第一次失败超过 5 分钟，重新计数
    loginThrottle.fails = 1;
    loginThrottle.firstFailAt = now;
    return;
  }
  loginThrottle.fails++;
  if (loginThrottle.fails >= 5) {
    // 5 分钟内失败 5 次 → 锁 10 分钟
    loginThrottle.lockUntil = now + 10 * 60 * 1000;
    loginThrottle.fails = 0;
    console.log('[auth] 后台登录失败次数过多，已锁定 10 分钟');
  }
}
function loginThrottleReset() {
  loginThrottle.fails = 0;
  loginThrottle.firstFailAt = 0;
  loginThrottle.lockUntil = 0;
}

/* ------------------------------------------------------------------ */
/* HTTP 工具                                                           */
/* ------------------------------------------------------------------ */

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    // 非法百分号编码：直接 400，避免 decodeURIComponent 抛异常导致进程崩溃
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('400 Bad Request');
  }
  if (rel === '/' || rel === '') rel = '/index.html';

  // 规范化后校验真实落在 public 目录内，杜绝路径遍历（用 path.resolve + 精确前缀）
  const resolved = path.resolve(PUBLIC_DIR, '.' + rel);
  const publicResolved = path.resolve(PUBLIC_DIR);
  if (resolved !== publicResolved && !resolved.startsWith(publicResolved + path.sep)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  fs.stat(resolved, (err, st) => {
    if (err) {
      // 尝试加 .html
      const alt = resolved + '.html';
      if (fs.existsSync(alt)) return serveFile(res, alt);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    if (st.isDirectory()) {
      const idx = path.join(resolved, 'index.html');
      if (fs.existsSync(idx)) return serveFile(res, idx);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    serveFile(res, resolved);
  });
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    ''
  );
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') return sendJson(res, 200, { ok: true });

  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  /* ---------------- 公开接口 ---------------- */

  if (pathname === '/api/state' && method === 'GET') {
    checkAutoDraw();
    return sendJson(res, 200, publicState());
  }

  // 校验某个手机号是否仍在参与名单里（供前端校验本地缓存的报名标记用）
  if (pathname === '/api/check' && method === 'POST') {
    const body = await readBody(req);
    const phone = String(body.phone || '').replace(/\s|-/g, '');
    if (!/^1\d{10}$/.test(phone)) {
      return sendJson(res, 400, { ok: false, msg: '手机号格式不正确' });
    }
    const exist = db.participants.find((p) => p.phone === phone);
    return sendJson(res, 200, {
      ok: true,
      registered: !!exist,
      // 只有确实在名单里才回传脱敏信息
      participant: exist
        ? { id: exist.id, name: maskName(exist.name), phone: maskPhone(exist.phone) }
        : null,
    });
  }

  if (pathname === '/api/join' && method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').replace(/\s|-/g, '');

    if (!name || name.length > 20) {
      return sendJson(res, 400, { ok: false, msg: '请填写正确的姓名（1-20个字符）' });
    }
    if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
      return sendJson(res, 400, { ok: false, msg: '姓名只能填写中文汉字' });
    }
    if (!/^1\d{10}$/.test(phone)) {
      return sendJson(res, 400, { ok: false, msg: '请填写正确的11位手机号' });
    }
    if (db.drawn && !db.config.allowJoinAfterDraw) {
      return sendJson(res, 403, { ok: false, msg: '活动已开奖，报名通道已关闭' });
    }

    const exist = db.participants.find((p) => p.phone === phone);
    if (exist) {
      if (db.config.limitOnePerPhone) {
        return sendJson(res, 409, {
          ok: false,
          msg: '该手机号已参与过本次活动',
          duplicate: true,
          participant: {
            id: exist.id,
            name: maskName(exist.name),
            phone: maskPhone(exist.phone),
            phoneRaw: exist.phone,
          },
        });
      }
      // 允许重复参与
      const p = {
        id: rid(),
        name,
        phone,
        ip: clientIp(req),
        createdAt: Date.now(),
      };
      db.participants.push(p);
      saveDb();
      return sendJson(res, 200, {
        ok: true,
        participant: { id: p.id, name: maskName(p.name), phone: maskPhone(p.phone), phoneRaw: p.phone },
      });
    }

    const p = { id: rid(), name, phone, ip: clientIp(req), createdAt: Date.now() };
    db.participants.push(p);
    saveDb();
    console.log('[join] ' + maskName(name) + ' / ' + maskPhone(phone) + ' 共 ' + db.participants.length + ' 人');
    return sendJson(res, 200, {
      ok: true,
      participant: { id: p.id, name: maskName(p.name), phone: maskPhone(p.phone), phoneRaw: p.phone },
    });
  }

  /* ---------------- 后台接口 ---------------- */

  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const th = loginThrottleCheck();
    if (th.locked) {
      return sendJson(res, 429, { ok: false, msg: '登录失败次数过多，请 ' + th.wait + ' 秒后再试' });
    }
    if (String(body.password || '') !== String(db.config.adminPassword || '')) {
      loginThrottleFail();
      return sendJson(res, 401, { ok: false, msg: '密码错误' });
    }
    loginThrottleReset();
    return sendJson(res, 200, { ok: true, token: newToken() });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!isAuthed(req)) return sendJson(res, 401, { ok: false, msg: '登录已过期，请重新登录' });

    if (pathname === '/api/admin/data' && method === 'GET') {
      return sendJson(res, 200, { ok: true, data: adminData() });
    }

    if (pathname === '/api/admin/config' && method === 'POST') {
      const body = await readBody(req);
      const c = db.config;
      const b = body || {};
      const s = (v, d) => (v === undefined || v === null ? d : String(v));
      const n = (v, d) => {
        const x = parseInt(v, 10);
        return isNaN(x) ? d : x;
      };
      const bool = (v, d) => (typeof v === 'boolean' ? v : d);

      const oldDrawTime = String(c.drawTime || '');
      const oldMode = c.drawMode;
      c.activityTitle = s(b.activityTitle, c.activityTitle);
      c.activitySubTitle = s(b.activitySubTitle, c.activitySubTitle);
      c.activityDesc = s(b.activityDesc, c.activityDesc);
      c.prizeName = s(b.prizeName, c.prizeName);
      c.prizeCount = Math.max(1, n(b.prizeCount, c.prizeCount));
      c.prizeImage = s(b.prizeImage, c.prizeImage);
      c.prizeDesc = s(b.prizeDesc, c.prizeDesc);
      c.prizeBadge = s(b.prizeBadge, c.prizeBadge);
      c.prizeHighlights = s(b.prizeHighlights, c.prizeHighlights);
      c.prizeSpecs = s(b.prizeSpecs, c.prizeSpecs);
      c.drawMode = b.drawMode === 'instant' ? 'instant' : b.drawMode === 'fixed' ? 'fixed' : c.drawMode;
      c.drawTime = s(b.drawTime, c.drawTime);
      c.limitOnePerPhone = bool(b.limitOnePerPhone, c.limitOnePerPhone);
      c.noRepeatWin = bool(b.noRepeatWin, c.noRepeatWin);
      c.allowJoinAfterDraw = bool(b.allowJoinAfterDraw, c.allowJoinAfterDraw);
      c.showRolling = bool(b.showRolling, c.showRolling);
      if (b.adminPassword) c.adminPassword = String(b.adminPassword);

      // 开奖时间 / 开奖方式变了 = 重新安排一轮：
      // 自动清掉上一轮结果，回到「未开奖」，让扫码的人重新看到倒计时
      let extraMsg = '';
      const newDrawTime = String(c.drawTime || '');
      if (newDrawTime !== oldDrawTime || c.drawMode !== oldMode) {
        const ts = parseTime(newDrawTime);
        if (ts && Date.now() < ts) {
          db.drawn = false;
          db.drawnAt = null;
          db.winners = [];
          db.autoDrawnFor = '';
          extraMsg = '；开奖时间已更新，上一轮结果已清空，重新进入倒计时';
        } else if (c.drawMode === 'fixed' && ts && Date.now() >= ts) {
          extraMsg = '；注意：开奖时间已经是过去的时间，保存后会立即自动开奖';
        } else if (c.drawMode === 'instant') {
          extraMsg = '；临时开奖模式：到点后请在后台点「立即开奖」';
        }
      }

      saveDb();
      return sendJson(res, 200, { ok: true, msg: '保存成功' + extraMsg });
    }

    if (pathname === '/api/admin/draw' && method === 'POST') {
      const winners = performDraw('管理员手动开奖');
      if (!winners) {
        return sendJson(res, 400, {
          ok: false,
          msg: db.participants.length
            ? '没有可开奖的人了：所有人都已中过奖。可先「重置开奖」，或关掉「一人最多中一个奖」'
            : '当前还没有参与者，无法开奖',
        });
      }
      return sendJson(res, 200, { ok: true, msg: '开奖完成', winners: winners.length });
    }

    if (pathname === '/api/admin/reset' && method === 'POST') {
      db.drawn = false;
      db.drawnAt = null;
      db.winners = [];
      saveDb();
      const ts = parseTime(db.config.drawTime);
      const passed = ts && Date.now() >= ts;
      return sendJson(res, 200, {
        ok: true,
        msg:
          passed && db.config.drawMode === 'fixed'
            ? '已重置为未开奖状态（参与者保留）。开奖时间已过，不会再自动开奖，可点「立即开奖」'
            : '已重置为未开奖状态（参与者保留）',
      });
    }

    if (pathname === '/api/admin/clear' && method === 'POST') {
      const body = await readBody(req);
      if (body.confirm !== 'CLEAR') {
        return sendJson(res, 400, { ok: false, msg: '请二次确认' });
      }
      db.participants = [];
      db.winners = [];
      db.drawn = false;
      db.drawnAt = null;
      saveDb();
      return sendJson(res, 200, { ok: true, msg: '已清空所有数据' });
    }

    if (pathname === '/api/admin/participant/delete' && method === 'POST') {
      const body = await readBody(req);
      const id = String(body.id || '');
      const before = db.participants.length;
      db.participants = db.participants.filter((p) => p.id !== id);
      const removed = db.participants.find((p) => p.id === id);
      db.winners = db.winners.filter((w) => w.id !== id);
      if (removed) console.log('[admin] 删除参与者 ' + maskPhone(removed.phone));
      saveDb();
      return sendJson(res, 200, { ok: true, removed: before - db.participants.length });
    }

    if (pathname === '/api/admin/participant/add' && method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').replace(/\s|-/g, '');
      if (!name || !/^[\u4e00-\u9fa5]+$/.test(name)) {
        return sendJson(res, 400, { ok: false, msg: '姓名只能填写中文汉字' });
      }
      if (!/^1\d{10}$/.test(phone)) {
        return sendJson(res, 400, { ok: false, msg: '手机号格式不正确' });
      }
      if (db.participants.some((p) => p.phone === phone)) {
        return sendJson(res, 409, { ok: false, msg: '该手机号已存在' });
      }
      db.participants.push({ id: rid(), name, phone, ip: 'admin', createdAt: Date.now() });
      saveDb();
      return sendJson(res, 200, { ok: true, msg: '已添加' });
    }

    if (pathname === '/api/admin/export' && method === 'GET') {
      const rows = [['序号', '姓名', '手机号', '参与时间', '是否中奖']];
      db.participants
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach((p, i) => {
          rows.push([
            i + 1,
            p.name,
            p.phone,
            fmtTime(p.createdAt),
            db.winners.some((w) => w.phone === p.phone) ? '是' : '否',
          ]);
        });
      const csv = rows
        .map((r) =>
          r
            .map((v) => {
              let s = String(v);
              // CSV 公式注入防护：以 = + - @ 开头的单元格，前面加单引号，避免 Excel 当公式执行
              if (/^[=+\-@]/.test(s)) s = "'" + s;
              return '"' + s.replace(/"/g, '""') + '"';
            })
            .join(',')
        )
        .join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="participants_' + Date.now() + '.csv"',
      });
      return res.end('\uFEFF' + csv);
    }

    return sendJson(res, 404, { ok: false, msg: '接口不存在' });
  }

  return sendJson(res, 404, { ok: false, msg: 'Not Found' });
});

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

loadDb();
saveDb(); // 保证数据文件存在，方便随时备份
checkAutoDraw();
setInterval(checkAutoDraw, 1000);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🎉 抽奖系统已启动');
  console.log('  ─────────────────────────────────────────');
  console.log('  参与页（二维码指向这个地址）: http://localhost:' + PORT + '/');
  console.log('  管理后台                     : http://localhost:' + PORT + '/admin');
  console.log('  默认后台密码                 : ' + db.config.adminPassword);
  console.log('  ─────────────────────────────────────────');
  console.log('  数据文件: ' + DB_FILE);
  console.log('  按 Ctrl + C 停止服务');
  console.log('');
});
