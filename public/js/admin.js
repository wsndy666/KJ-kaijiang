/* ================================================================
   抽奖系统 · 后台管理逻辑
   ================================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN_KEY = 'lottery_admin_token';
  var URL_KEY = 'lottery_public_url';
  var token = '';

  var data = null;          // /api/admin/data
  var localCfg = {          // 本地待保存的配置副本
    drawMode: 'fixed',
    limitOnePerPhone: true,
    noRepeatWin: true,
    allowJoinAfterDraw: true,
    showRolling: true,
    adminPassword: '',
  };

  /* ---------------- 基础请求 ---------------- */

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {},
      { 'x-admin-token': token }
    );
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401) {
          handleLogout(true);
          throw new Error(j.msg || '登录已过期');
        }
        return j;
      });
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

  /* ---------------- 模态框 ---------------- */

  function confirmModal(title, text, okText, danger) {
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML =
        '<div class="modal">' +
        '<h3>' + title + '</h3>' +
        '<p>' + text + '</p>' +
        '<div class="acts">' +
        '<button class="btn gray" data-x="0">取消</button>' +
        '<button class="btn ' + (danger ? 'danger' : '') + '" data-x="1">' + (okText || '确定') + '</button>' +
        '</div></div>';
      document.body.appendChild(mask);
      mask.addEventListener('click', function (e) {
        var x = e.target.getAttribute && e.target.getAttribute('data-x');
        if (x === null) return;
        mask.remove();
        resolve(x === '1');
      });
    });
  }

  function formModal(title, fields) {
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'modal-mask';
      var html = '<div class="modal"><h3>' + title + '</h3>';
      fields.forEach(function (f) {
        html +=
          '<div class="field" style="margin-bottom:12px"><label>' + f.label + '</label>' +
          '<input type="' + (f.type || 'text') + '" id="fm_' + f.key + '" placeholder="' + (f.ph || '') + '" value="' + (f.value || '') + '" /></div>';
      });
      html +=
        '<div class="acts"><button class="btn gray" data-x="0">取消</button>' +
        '<button class="btn" data-x="1">确定</button></div></div>';
      mask.innerHTML = html;
      document.body.appendChild(mask);
      mask.addEventListener('click', function (e) {
        var x = e.target.getAttribute && e.target.getAttribute('data-x');
        if (x === null) return;
        var out = null;
        if (x === '1') {
          out = {};
          fields.forEach(function (f) {
            out[f.key] = (document.getElementById('fm_' + f.key) || {}).value || '';
          });
        }
        mask.remove();
        resolve(out);
      });
    });
  }

  /* ---------------- 登录 ---------------- */

  function doLogin() {
    var pwd = $('pwd').value;
    if (!pwd) return toast('请输入密码', 'err');
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) return toast(d.msg || '密码错误', 'err');
        token = d.token;
        try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
        enterApp();
      })
      .catch(function () { toast('网络异常', 'err'); });
  }

  function handleLogout(silent) {
    token = '';
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $('app').classList.add('hidden');
    $('loginWrap').classList.remove('hidden');
    $('pwd').value = '';
    if (!silent) toast('已退出登录');
  }

  function enterApp() {
    $('loginWrap').classList.add('hidden');
    $('app').classList.remove('hidden');
    loadData();
  }

  /* ---------------- 数据 ---------------- */

  function loadData() {
    return api('/api/admin/data')
      .then(function (d) {
        if (!d.ok) throw new Error(d.msg);
        data = d.data;
        render();
        return d.data;
      })
      .catch(function (e) { if (e.message !== '登录已过期') toast(e.message, 'err'); });
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    var c = data.config;
    localCfg.drawMode = c.drawMode;
    localCfg.limitOnePerPhone = c.limitOnePerPhone;
    localCfg.noRepeatWin = c.noRepeatWin;
    localCfg.allowJoinAfterDraw = c.allowJoinAfterDraw;
    localCfg.showRolling = c.showRolling;

    // 概览
    $('stTotal').textContent = data.participantCount;
    $('stWin').textContent = data.winners.length;
    $('stDraw').textContent = data.drawn ? '已开奖' : '未开奖';
    $('stMode').textContent = c.drawMode === 'fixed' ? '固定时间' : '临时开奖';
    $('drawStateText').textContent = data.drawn ? '已开奖' : '未开奖';
    $('drawStateTime').textContent = data.drawn ? '（' + (data.drawnAtText || '') + '）' : '';

    // 活动设置
    $('cfActivityTitle').value = c.activityTitle || '';
    $('cfActivitySubTitle').value = c.activitySubTitle || '';
    $('cfActivityDesc').value = c.activityDesc || '';
    $('cfPrizeName').value = c.prizeName || '';
    $('cfPrizeCount').value = c.prizeCount || 1;
    $('cfPrizeImage').value = c.prizeImage || '';
    $('cfPrizeDesc').value = c.prizeDesc || '';
    $('cfPrizeBadge').value = c.prizeBadge || '';
    $('cfPrizeHighlights').value = c.prizeHighlights || '';
    $('cfPrizeSpecs').value = c.prizeSpecs || '';

    // 开奖设置
    $('cfDrawTime').value = normalizeDT(c.drawTime);
    $('modeRow').querySelectorAll('.radio-card').forEach(function (el) {
      var on = el.getAttribute('data-mode') === c.drawMode;
      el.classList.toggle('on', on);
      el.querySelector('input').checked = on;
    });
    setSwitch('swLimit', c.limitOnePerPhone);
    setSwitch('swNoRepeat', c.noRepeatWin);
    setSwitch('swAllowJoin', c.allowJoinAfterDraw);
    setSwitch('swRolling', c.showRolling);

    $('brandTitle').textContent = (c.activityTitle || '抽奖系统') + ' · 管理后台';

    renderUsers();
    renderWinners();
    if (!$('qrUrl').value) $('qrUrl').value = defaultPublicUrl();
  }

  function normalizeDT(v) {
    if (!v) return '';
    var s = String(v).trim().replace(' ', 'T');
    return s.slice(0, 16);
  }

  function defaultPublicUrl() {
    var saved = '';
    try { saved = localStorage.getItem(URL_KEY) || ''; } catch (e) {}
    return saved || (location.origin + '/');
  }

  function setSwitch(id, on) {
    $(id).classList.toggle('on', !!on);
  }
  function getSwitch(id) {
    return $(id).classList.contains('on');
  }

  function renderUsers() {
    var kw = ($('userSearch').value || '').trim();
    var list = data.participants.filter(function (p) {
      if (!kw) return true;
      return p.name.indexOf(kw) >= 0 || p.phone.indexOf(kw) >= 0;
    });
    var tb = $('userTbody');
    tb.innerHTML = '';
    if (!list.length) {
      $('userEmpty').classList.remove('hidden');
      $('userEmpty').textContent = kw ? '没有匹配的记录' : '还没有人参与';
      return;
    }
    $('userEmpty').classList.add('hidden');
    list.forEach(function (p, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td class="mono">' + esc(p.phone) + '</td>' +
        '<td>' + esc(p.createdAtText) + '</td>' +
        '<td>' + (p.won ? '<span class="badge win">已中奖</span>' : '<span class="badge no">未中奖</span>') + '</td>' +
        '<td><button class="btn sm gray" data-del="' + p.id + '">删除</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        confirmModal('删除这条参与记录？', '删除后该用户将不再参与抽奖，且无法恢复。', '确认删除', true).then(function (ok) {
          if (!ok) return;
          api('/api/admin/participant/delete', { method: 'POST', body: { id: id } }).then(function () {
            toast('已删除', 'ok');
            loadData();
          });
        });
      });
    });
  }

  function renderWinners() {
    var tb = $('winTbody');
    tb.innerHTML = '';
    if (!data.winners.length) {
      $('winEmpty').classList.remove('hidden');
      return;
    }
    $('winEmpty').classList.add('hidden');
    data.winners.forEach(function (w, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(w.name) + '</td>' +
        '<td class="mono">' + esc(w.phone) + '</td>' +
        '<td>' + esc(w.prizeName || '') + '</td>' +
        '<td>' + esc(w.drawnAtText) + '</td>';
      tb.appendChild(tr);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* ---------------- 保存 ---------------- */

  function saveConfig(patch, tip) {
    return api('/api/admin/config', { method: 'POST', body: patch }).then(function (d) {
      toast(d.ok ? (tip || d.msg || '保存成功') : (d.msg || '保存失败'), d.ok ? 'ok' : 'err');
      if (d.ok) loadData();
    });
  }

  function saveActivity() {
    saveConfig(
      {
        activityTitle: $('cfActivityTitle').value.trim(),
        activitySubTitle: $('cfActivitySubTitle').value.trim(),
        activityDesc: $('cfActivityDesc').value,
        prizeName: $('cfPrizeName').value.trim(),
        prizeCount: Number($('cfPrizeCount').value) || 1,
        prizeImage: $('cfPrizeImage').value.trim(),
        prizeDesc: $('cfPrizeDesc').value,
        prizeBadge: $('cfPrizeBadge').value.trim(),
        prizeHighlights: $('cfPrizeHighlights').value,
        prizeSpecs: $('cfPrizeSpecs').value,
      },
      '活动设置已保存'
    );
  }

  function saveDraw() {
    var t = $('cfDrawTime').value;
    if (!t) return toast('请选择开奖时间', 'err');
    saveConfig({ drawMode: localCfg.drawMode, drawTime: t }, '开奖设置已保存');
  }

  function saveRules() {
    saveConfig(
      {
        limitOnePerPhone: localCfg.limitOnePerPhone,
        noRepeatWin: localCfg.noRepeatWin,
        allowJoinAfterDraw: localCfg.allowJoinAfterDraw,
        showRolling: localCfg.showRolling,
      },
      '规则已保存'
    );
  }

  /* ---------------- 导出 ---------------- */

  function exportCsv() {
    fetch('/api/admin/export', { headers: { 'x-admin-token': token } })
      .then(function (r) {
        if (!r.ok) throw new Error('导出失败');
        return r.blob();
      })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '参与名单_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      })
      .catch(function (e) { toast(e.message, 'err'); });
  }

  /* ---------------- 二维码 ---------------- */

  function genQr() {
    var url = $('qrUrl').value.trim();
    if (!url) return toast('请先填写活动地址', 'err');
    try { localStorage.setItem(URL_KEY, url); } catch (e) {}

    var box = $('qrImg');
    box.innerHTML = '正在生成…';
    var enc = encodeURIComponent(url);
    var img = new Image();
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.alt = '活动二维码';
    var tried = false;
    img.onerror = function () {
      if (!tried) {
        tried = true;
        img.src = 'https://api.pwmqr.com/qrcode/create/?url=' + enc;
      } else {
        box.innerHTML =
          '<div style="color:#9aa0b2;line-height:1.9">二维码服务暂时不可用<br/>请复制上方链接到任意二维码工具生成</div>';
        toast('在线二维码服务不可用，请手动生成', 'err');
      }
    };
    img.onload = function () { box.innerHTML = ''; box.appendChild(img); };
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=16&data=' + enc;
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    $('btnLogin').addEventListener('click', doLogin);
    $('pwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

    $('btnLogout').addEventListener('click', function () { handleLogout(); });
    $('btnRefresh').addEventListener('click', function () { loadData().then(function () { toast('已刷新'); }); });
    $('openPage').addEventListener('click', function () { window.open('/', '_blank'); });
    $('btnOpenPage').addEventListener('click', function () { window.open($('qrUrl').value || '/', '_blank'); });

    // 标签页
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var key = t.getAttribute('data-tab');
        document.querySelectorAll('.panel').forEach(function (p) { p.classList.add('hidden'); });
        $('panel-' + key).classList.remove('hidden');
        if (key === 'qr' && !$('qrImg').querySelector('img')) genQr(); // 打开二维码页自动生成
      });
    });

    // 保存
    $('btnSaveAct').addEventListener('click', saveActivity);
    $('btnPreviewPrize').addEventListener('click', function () {
      window.open('/prize?preview=1', '_blank');
    });
    $('btnSaveDraw').addEventListener('click', saveDraw);
    $('btnSaveRules').addEventListener('click', saveRules);
    $('btnSavePwd').addEventListener('click', function () {
      var v = $('cfAdminPassword').value;
      if (!v) return toast('请输入新密码', 'err');
      saveConfig({ adminPassword: v }, '密码已修改').then(function () {
        $('cfAdminPassword').value = '';
      });
    });

    // 开奖方式
    $('modeRow').addEventListener('click', function (e) {
      var card = e.target.closest('.radio-card');
      if (!card) return;
      localCfg.drawMode = card.getAttribute('data-mode');
      $('modeRow').querySelectorAll('.radio-card').forEach(function (el) {
        var on = el === card;
        el.classList.toggle('on', on);
        el.querySelector('input').checked = on;
      });
    });

    // 开关
    [['swLimit', 'limitOnePerPhone'], ['swNoRepeat', 'noRepeatWin'],
     ['swAllowJoin', 'allowJoinAfterDraw'], ['swRolling', 'showRolling']].forEach(function (pair) {
      $(pair[0]).addEventListener('click', function () {
        var on = !getSwitch(pair[0]);
        setSwitch(pair[0], on);
        localCfg[pair[1]] = on;
      });
    });

    // 开奖操作
    $('btnDrawNow').addEventListener('click', function () {
      if (data && !data.participantCount) return toast('还没有参与者，无法开奖', 'err');
      confirmModal(
        '立即开奖？',
        '将从当前 ' + (data ? data.participantCount : 0) + ' 位参与者中抽取 ' +
          (data ? data.config.prizeCount : 1) + ' 名中奖用户，开奖后会在参与页实时公布。',
        '开始开奖'
      ).then(function (ok) {
        if (!ok) return;
        api('/api/admin/draw', { method: 'POST', body: {} }).then(function (d) {
          toast(d.ok ? '开奖完成，已公布 ' + d.winners + ' 名中奖者' : (d.msg || '开奖失败'), d.ok ? 'ok' : 'err');
          loadData();
        });
      });
    });

    $('btnResetDraw').addEventListener('click', function () {
      confirmModal('重置开奖？', '将清除中奖名单并把状态恢复为「未开奖」，参与人员会保留。', '确认重置', true).then(function (ok) {
        if (!ok) return;
        api('/api/admin/reset', { method: 'POST', body: {} }).then(function (d) {
          toast(d.msg || '已重置', d.ok ? 'ok' : 'err');
          loadData();
        });
      });
    });

    $('btnClearAll').addEventListener('click', function () {
      confirmModal(
        '清空全部数据？',
        '将删除 <b>所有参与者、中奖记录与开奖状态</b>，此操作不可恢复！请确认已导出备份。',
        '我确定，清空',
        true
      ).then(function (ok) {
        if (!ok) return;
        confirmModal('最后确认', '真的要清空所有数据吗？', '清空', true).then(function (ok2) {
          if (!ok2) return;
          api('/api/admin/clear', { method: 'POST', body: { confirm: 'CLEAR' } }).then(function (d) {
            toast(d.msg || '已清空', d.ok ? 'ok' : 'err');
            loadData();
          });
        });
      });
    });

    // 名单
    $('userSearch').addEventListener('input', renderUsers);
    $('btnExport').addEventListener('click', exportCsv);
    $('btnExportWin').addEventListener('click', exportCsv);
    $('btnAddUser').addEventListener('click', function () {
      formModal('手动添加参与者', [
        { key: 'name', label: '姓名', ph: '请输入姓名（仅汉字）' },
        { key: 'phone', label: '手机号', ph: '11 位手机号' },
      ]).then(function (v) {
        if (!v) return;
        api('/api/admin/participant/add', { method: 'POST', body: v }).then(function (d) {
          toast(d.ok ? '已添加' : (d.msg || '添加失败'), d.ok ? 'ok' : 'err');
          if (d.ok) loadData();
        });
      });
    });

    // 二维码
    $('btnGenQr').addEventListener('click', genQr);
    $('btnCopyUrl').addEventListener('click', function () {
      var url = $('qrUrl').value;
      try { localStorage.setItem(URL_KEY, url); } catch (e) {}
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { toast('链接已复制', 'ok'); });
      } else {
        $('qrUrl').select();
        document.execCommand('copy');
        toast('链接已复制', 'ok');
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    bind();
    $('qrUrl').value = defaultPublicUrl();

    // 支持 #draw / #users / #wins / #qr 直达对应标签页
    var hash = (location.hash || '').replace('#', '');
    if (hash) {
      var target = document.querySelector('.tab[data-tab="' + hash + '"]');
      if (target) target.click();
    }

    var saved = '';
    try { saved = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}
    if (saved) {
      token = saved;
      // 验证 token 是否还有效
      api('/api/admin/data')
        .then(function (d) {
          if (d && d.ok) { enterApp(); }
          else handleLogout(true);
        })
        .catch(function () { handleLogout(true); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
