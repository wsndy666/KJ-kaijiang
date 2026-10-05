/* ================================================================
   参与页逻辑：说明弹层 · 报名 · 开奖现场（倒计时 / 滚动名单 / 开奖动画）
   ================================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LS_KEY = 'lottery_participant_v3';

  /* ---------------- 状态 ---------------- */

  var state = null;
  var timeOffset = 0;          // 服务器时间 - 本地时间
  var pollTimer = null;
  var cdTimer = null;
  var me = null;
  var joinPending = false;
  var prizeImageUrl = '';
  var isPreview = false;
  var revealShown = false;
  var prevDrawn = null;
  var cdNodes = null;          // 倒计时节点缓存
  var cdMode = '';             // 倒计时当前形态，避免重复重建打断动画
  var sigPrize = '';           // 奖品区签名
  var sigWinners = '';         // 中奖名单签名
  var sigUsers = '';           // 参与用户签名

  /* ---------------- 工具 ---------------- */

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var rnd = function (n) { return Math.floor(Math.random() * n); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  var toastTimer = null;
  function toast(msg, type) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2400);
  }

  function confetti(n) {
    if (window.Festive && window.Festive.confetti) window.Festive.confetti(n);
  }

  /* ---------------- 数据 ---------------- */

  function loadState() {
    return fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        timeOffset = d.serverNow - Date.now();
        state = d;
        renderAll();
        return d;
      })
      .catch(function (e) {
        console.warn('state 请求失败', e);
        return null;
      });
  }

  function scheduleNextPoll() {
    clearTimeout(pollTimer);
    var delay = 2000;
    if (state && !state.drawn && state.drawTs) {
      if (Date.now() + timeOffset >= state.drawTs) delay = 700;
    }
    pollTimer = setTimeout(function () {
      loadState().then(scheduleNextPoll);
    }, delay);
  }

  /* ---------------- 渲染：说明弹层 ---------------- */

  function renderIntro() {
    var a = state.activity;

    $('introTitle').textContent = a.title;
    document.title = a.title;
    $('introSub').textContent = a.subTitle || '';
    $('introDesc').textContent = a.desc || '暂无活动说明';

    // 奖品行（数据没变就不重建，避免图片反复重载）
    var ul = $('prizeList');
    prizeImageUrl = a.prize.image || '';
    var pSig = a.prize.name + '|' + a.prize.count + '|' + prizeImageUrl;
    if (pSig !== sigPrize) {
      sigPrize = pSig;
      var thumbHtml = prizeImageUrl
        ? '<img src="' + esc(prizeImageUrl) + '" alt="奖品" />'
        : '🎁';
      ul.innerHTML =
        '<li class="prize-item">' +
        '<div class="prize-thumb' + (prizeImageUrl ? ' clickable' : '') + '" id="prizeThumb">' +
        thumbHtml +
        '</div>' +
        '<div class="prize-info">' +
        '<span class="prize-badge">奖品</span>' +
        '<div class="prize-name">' + esc(a.prize.name) + '</div>' +
        '</div>' +
        '<span class="prize-qty">' + a.prize.count + ' 名</span>' +
        '</li>';
      $('prizeThumb').addEventListener('click', goPrize);
    }

    $('prizeDesc').textContent = a.prize.desc || '';
    $('prizeMore').classList.remove('hidden');

    $('joinCount').textContent = state.participantCount;

    // 开奖后关闭报名
    if (state.drawn && !state.allowJoinAfterDraw) {
      $('btnJoin').disabled = true;
      $('btnJoin').textContent = '活动已开奖';
      $('joinTips').textContent = '本次活动已开奖，报名通道已关闭';
    } else {
      $('btnJoin').disabled = false;
      if ($('btnJoin').textContent !== '提交中…') {
        $('btnJoin').textContent = '提交并进入开奖现场';
      }
    }
  }

  /* ---------------- 渲染：开奖现场头部 ---------------- */

  function renderHeader() {
    var a = state.activity;
    $('heroTitle').textContent = '开奖现场';
    $('cntNum').textContent = state.participantCount;
    $('modeTag').textContent = state.drawMode === 'fixed' ? '固定时间开奖' : '临时开奖';
    $('drawTimeText').textContent = state.drawTime ? fmtTime(state.drawTs) : '待定';

    var pill = $('joinedPill');
    if (me) {
      pill.textContent = '报名成功 · ' + me.name + ' ' + me.phone;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }

  function fmtTime(ts) {
    if (!ts) return '待定';
    var d = new Date(ts);
    return (
      d.getFullYear() + '年' + pad(d.getMonth() + 1) + '月' + pad(d.getDate()) + '日 ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  }

  /* ---------------- 渲染：倒计时 ---------------- */

  function buildCountdownDom() {
    var area = $('cdArea');
    area.innerHTML =
      '<p class="cd-caption">开奖倒计时</p>' +
      '<div class="cd-row" id="cdRow">' +
      digitBox('cdD', '天', 'cdSepD') +
      digitBox('cdH', '时', 'cdSepH') +
      digitBox('cdM', '分', 'cdSepM') +
      digitBox('cdS', '秒', '') +
      '</div>';
    cdNodes = {
      row: $('cdRow'),
      d: $('cdD'),
      h: $('cdH'),
      m: $('cdM'),
      s: $('cdS'),
      boxD: $('cdD').closest('.cd-box'),
      sepD: $('cdSepD'),
    };
  }

  function digitBox(numId, label, sepId) {
    var html =
      '<div class="cd-box">' +
      '<div class="cd-num-wrap"><span class="cd-num" id="' + numId + '" data-v="">00</span></div>' +
      '<span class="cd-label">' + label + '</span>' +
      '</div>';
    if (sepId) html += '<span class="cd-sep" id="' + sepId + '">:</span>';
    return html;
  }

  function setDigit(el, val) {
    if (el.dataset.v === val) return;
    el.dataset.v = val;
    el.textContent = val;
    el.classList.remove('digit-pop');
    void el.offsetWidth; // 强制重排以重播动画
    el.classList.add('digit-pop');
  }

  function renderCountdown() {
    var area = $('cdArea');
    var mode;
    var ts = state.drawTs || 0;
    var remain = ts ? ts - (Date.now() + timeOffset) : 0;

    if (state.drawn) mode = 'drawn';
    else if (!ts) mode = 'wait';
    else if (remain <= 0) mode = state.drawMode === 'fixed' ? 'drawing' : 'wait-draw';
    else mode = 'count';

    // 形态变化时才重建 DOM，避免每 250ms 打断动画
    if (mode !== cdMode) {
      cdMode = mode;
      cdNodes = null;
      if (mode === 'drawn') {
        area.innerHTML = '<p class="festive-title cd-result">开奖结果已揭晓</p>';
      } else if (mode === 'wait') {
        area.innerHTML = '<p class="cd-hint">等待主持人开奖…</p>';
      } else if (mode === 'drawing') {
        area.innerHTML = '<p class="cd-hint">开奖中 · 请稍候</p>';
      } else if (mode === 'wait-draw') {
        area.innerHTML = '<p class="cd-hint">等待主持人开奖…</p>';
      } else {
        // mode === 'count'：清空，交给下面重建
        area.innerHTML = '';
      }
    }

    if (mode !== 'count') return;

    if (!cdNodes) buildCountdownDom();

    var total = Math.floor(remain / 1000);
    var days = Math.floor(total / 86400);
    setDigit(cdNodes.d, pad(days));
    setDigit(cdNodes.h, pad(Math.floor((total % 86400) / 3600)));
    setDigit(cdNodes.m, pad(Math.floor((total % 3600) / 60)));
    setDigit(cdNodes.s, pad(total % 60));

    var showDays = days > 0;
    cdNodes.boxD.classList.toggle('hidden', !showDays);
    cdNodes.sepD.classList.toggle('hidden', !showDays);

    cdNodes.row.classList.toggle('urgent', remain <= 10000);
  }

  /* ---------------- 通用滚动名单 ---------------- */

  /**
   * @param holder  容器
   * @param items   HTML 字符串数组
   * @param opts    { height, durationPerItem, empty }
   */
  function buildTicker(holder, items, opts) {
    opts = opts || {};
    var height = opts.height || 200;
    var empty = opts.empty || '暂无数据';

    if (!items.length) {
      holder.innerHTML =
        '<div class="ticker-empty" style="height:' + height + 'px">' +
        '<span class="ic">🎁</span><span>' + empty + '</span></div>';
      return;
    }

    // 条目太少时滚动效果差，直接静态展示
    if (items.length <= 3) {
      holder.innerHTML =
        '<div class="ticker-static" style="height:' + height + 'px">' +
        items.join('') +
        '</div>';
      return;
    }

    var duration = items.length * (opts.durationPerItem || 2.4);
    holder.innerHTML =
      '<div class="ticker-mask" style="height:' + height + 'px">' +
      '<div class="ticker-track" style="--ticker-duration:' + duration + 's">' +
      items.concat(items).join('') +
      '</div></div>';
  }

  function winnerItemHtml(w) {
    return (
      '<div class="ticker-item">' +
      '<span class="gold-btn sm rank">奖品</span>' +
      '<span class="nm">' + esc(w.name) + '</span>' +
      '<span class="ph">' + esc(w.phone) + '</span>' +
      '</div>'
    );
  }

  function phoneItemHtml(phone) {
    return (
      '<div class="ticker-item center">' +
      '<span class="dot"></span>' +
      '<span class="ph">' + esc(phone) + '</span>' +
      '</div>'
    );
  }

  /* ---------------- 渲染：中奖名单 / 参与用户 ---------------- */

  function renderWinners() {
    var holder = $('stage');
    var sig = state.drawn
      ? (state.winners || []).map(function (w) { return w.id; }).join(',')
      : 'pending';
    if (sig === sigWinners) return;   // 数据没变就不重建，否则滚动会重置
    sigWinners = sig;

    if (!state.drawn) {
      holder.innerHTML =
        '<div class="ticker-empty" style="height:150px">' +
        '<span class="ic">🎁</span><span>大奖花落谁家，敬请期待</span></div>';
      return;
    }
    var items = (state.winners || []).map(winnerItemHtml);
    buildTicker(holder, items, { height: 180, durationPerItem: 2.6, empty: '本轮无人中奖' });
  }

  function renderParticipants() {
    var holder = $('rollWrap');
    var phones = (state.samplePhones || []).slice(0, 30);
    var sig = phones.join(',');
    if (sig === sigUsers) return;
    sigUsers = sig;

    buildTicker(holder, phones.map(phoneItemHtml), {
      height: 216,
      durationPerItem: 2,
      empty: '还没有人参与，快叫小伙伴来报名吧',
    });
  }

  /* ---------------- 开奖动画 ---------------- */

  function playReveal() {
    var mask = $('revealMask');
    var roll = $('revealRoll');
    var card = $('revealCard');
    var num = $('revealNum');
    var winners = state.winners || [];
    var pool = state.samplePhones || [];

    mask.classList.remove('hidden');
    roll.classList.remove('hidden');
    card.classList.add('hidden');

    var started = Date.now();
    var ROLL_MS = 3800;
    var cancelled = false;

    function tick() {
      if (cancelled) return;
      var elapsed = Date.now() - started;
      if (elapsed >= ROLL_MS) {
        revealNow();
        return;
      }
      var progress = elapsed / ROLL_MS;
      num.classList.toggle('blur', progress <= 0.72);
      num.textContent = pool.length ? pool[rnd(pool.length)] : '138****8888';
      setTimeout(tick, 80 + progress * progress * 240);
    }

    function revealNow() {
      cancelled = true;
      confetti(120);

      // 名单
      var list = $('revealList');
      if (!winners.length) {
        list.innerHTML =
          '<p style="text-align:center;color:var(--cream-65);margin:22px 0">本轮无人中奖</p>';
      } else {
        var rows = winners
          .map(function (w, i) {
            return (
              '<div class="reveal-win slot-reveal" style="animation-delay:' +
              (0.15 + i * 0.08).toFixed(2) + 's">' +
              '<span class="nm">' + esc(w.name) + '</span>' +
              '<span class="ph">' + esc(w.phone) + '</span>' +
              '</div>'
            );
          })
          .join('');
        list.innerHTML =
          '<div class="reveal-group slot-reveal">' +
          '<div class="reveal-group-head">' +
          '<span class="rank">奖品</span>' +
          '<span class="pname">' + esc(state.activity.prize.name) + '</span>' +
          '</div>' +
          '<div class="reveal-list">' + rows + '</div>' +
          '</div>';
      }

      roll.classList.add('hidden');
      card.classList.remove('hidden');
      card.classList.add('slot-reveal');

      setTimeout(function () { confetti(80); }, 350);
      setTimeout(function () { confetti(60); }, 900);
    }

    tick();
  }

  /* ---------------- 总渲染 ---------------- */

  function renderAll() {
    renderIntro();
    renderHeader();
    renderCountdown();
    renderWinners();
    renderParticipants();

    if (state.drawn && !revealShown) {
      var now = Date.now() + timeOffset;
      var fresh = state.drawnAt && now - state.drawnAt < 180000; // 3 分钟内的开奖播完整动画
      var justNow = prevDrawn === false;
      if (fresh || justNow) playReveal();
      revealShown = true;
    }

    // 管理员重置了开奖：把还开着的「中奖名单」弹层收起来，回到待开奖状态
    if (!state.drawn && revealShown) {
      revealShown = false;
      var mask = $('revealMask');
      if (mask) mask.classList.add('hidden');
    }

    prevDrawn = state.drawn;
  }

  /* ---------------- 交互 ---------------- */

  function enterDraw() {
    $('loading').classList.add('hidden');
    $('overlayIntro').classList.add('hidden');
    $('appDraw').classList.remove('hidden');
    window.scrollTo(0, 0);
    loadState().then(scheduleNextPoll);
  }

  function goPrize(e) {
    if (e) e.stopPropagation();
    location.href = 'prize' + (isPreview ? '?preview=1' : '');
  }

  function doJoin(e) {
    if (e) e.preventDefault();
    if (joinPending) return;

    var name = $('inName').value.trim();
    var phone = $('inPhone').value.replace(/\D/g, '');
    var err = $('formError');

    err.classList.add('hidden');
    if (!name) {
      err.textContent = '请填写姓名';
      err.classList.remove('hidden');
      return;
    }
    if (!/^[\u4e00-\u9fa5]+$/.test(name)) {
      err.textContent = '姓名只能填写中文汉字';
      err.classList.remove('hidden');
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      err.textContent = '请填写正确的 11 位手机号';
      err.classList.remove('hidden');
      return;
    }

    joinPending = true;
    var btn = $('btnJoin');
    btn.disabled = true;
    btn.textContent = '提交中…';

    fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok || d.duplicate) {
          me = d.participant;
          try { localStorage.setItem(LS_KEY, JSON.stringify(me)); } catch (e) {}
          toast(d.duplicate ? '您已报名过，静候开奖' : '报名成功，静候开奖 🎉', 'ok');
          setTimeout(enterDraw, 320);
        } else {
          err.textContent = d.msg || '提交失败，请重试';
          err.classList.remove('hidden');
        }
      })
      .catch(function () {
        err.textContent = '网络异常，请检查网络后重试';
        err.classList.remove('hidden');
      })
      .then(function () {
        joinPending = false;
        btn.disabled = false;
        btn.textContent = '提交并进入开奖现场';
      });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    isPreview = /[?&]preview=1/.test(location.search);

    loadState().then(function () {
      if (!state) {
        // 服务不可用兜底，避免一直卡在「加载中」
        state = {
          serverNow: Date.now(),
          activity: {
            title: '幸运时刻',
            subTitle: '幸运时刻 · 好礼相送',
            desc: '暂时无法连接服务，请检查网络后刷新页面重试。',
            prize: { name: '奖品', count: 1, image: '', desc: '' },
          },
          drawMode: 'fixed',
          drawTime: '',
          drawTs: 0,
          drawn: false,
          drawnAt: null,
          allowJoinAfterDraw: true,
          participantCount: 0,
          samplePhones: [],
          winners: [],
        };
        renderAll();
        toast('无法连接服务，请检查网络', 'err');
      }

      try {
        var saved = localStorage.getItem(LS_KEY);
        if (saved) me = JSON.parse(saved);
      } catch (e) { me = null; }

      // 若本地存了报名标记，去服务器核实这个手机号是否真的还在名单里。
      // 关键：管理员清空数据库后，已报名的人不应该再看到虚假的「报名成功」，
      // 而应该回到报名页重新填写。核实失败（不在名单）就清除本地标记。
      function finishInit() {
        $('loading').classList.add('hidden');

        if (me || isPreview) {
          $('overlayIntro').classList.add('hidden');
          $('appDraw').classList.remove('hidden');
          prevDrawn = state.drawn;
        } else {
          $('overlayIntro').classList.remove('hidden');
        }

        scheduleNextPoll();
        clearInterval(cdTimer);
        cdTimer = setInterval(renderCountdown, 250);
      }

      if (me && me.phoneRaw) {
        var rawPhone = String(me.phoneRaw).replace(/[^\d]/g, '');
        if (/^1\d{10}$/.test(rawPhone)) {
          fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: rawPhone }),
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d.registered) {
                // 服务器名单里已经没有这个手机号：清本地标记，回到报名页
                me = null;
                try { localStorage.removeItem(LS_KEY); } catch (e) {}
              }
              finishInit();
            })
            .catch(function () {
              // 核实失败（如网络抖动）保守起见保留本地标记，避免误清
              finishInit();
            });
        } else {
          finishInit();
        }
      } else {
        // 没有 phoneRaw（旧版缓存或首次访问）：按原逻辑，不核实
        finishInit();
      }
    });

    // 表单
    $('joinForm').addEventListener('submit', doJoin);
    $('inPhone').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 11);
    });
    // 姓名输入实时过滤：只保留汉字（并去掉中间空格），限制 20 字
    $('inName').addEventListener('input', function () {
      this.value = this.value.replace(/[^\u4e00-\u9fa5]/g, '').slice(0, 20);
    });
    $('inName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('inPhone').focus(); }
    });

    // 奖品详情
    $('prizeMore').addEventListener('click', goPrize);
    $('linkPrize').addEventListener('click', goPrize);

    // 活动说明
    $('linkRules').addEventListener('click', function () {
      $('overlayIntro').classList.remove('hidden');
    });

    // 已报名用户点空白处可关闭说明弹层
    $('overlayIntro').addEventListener('click', function (e) {
      if (e.target === this && me) this.classList.add('hidden');
    });

    // 开奖动画关闭
    $('revealClose').addEventListener('click', function () {
      $('revealMask').classList.add('hidden');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
