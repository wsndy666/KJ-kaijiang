/* ================================================================
   奖品展示页逻辑
   ================================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var prizeImageUrl = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function toast(msg, type) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2400);
  }

  /* ---------------- 渲染 ---------------- */

  function render(state) {
    var a = state.activity;
    var p = a.prize;

    document.title = p.name + ' · 奖品详情';
    $('pName').textContent = p.name;
    $('pSub').textContent = a.subTitle || '';
    $('pCount').textContent = p.count;

    if (p.badge) {
      $('pBadge').textContent = p.badge;
      $('pBadge').classList.remove('hidden');
    } else {
      $('pBadge').classList.add('hidden');
    }

    // 奖品主图
    var frame = $('visualFrame');
    prizeImageUrl = p.image || '';
    var old = frame.querySelector('img');
    if (old) old.remove();
    if (prizeImageUrl) {
      var img = document.createElement('img');
      img.alt = p.name;
      img.onerror = function () {
        frame.classList.remove('has-img');
        frame.querySelectorAll('img').forEach(function (n) { n.remove(); });
        if (!frame.querySelector('.visual-icon')) {
          frame.insertAdjacentHTML('afterbegin', '<span class="visual-icon">🎁</span>');
        }
        prizeImageUrl = '';
      };
      img.onload = function () {
        var ic = frame.querySelector('.visual-icon');
        if (ic) ic.remove();
      };
      img.src = prizeImageUrl;
      frame.appendChild(img);
      frame.classList.add('has-img');
      frame.style.cursor = 'zoom-in';
    } else {
      frame.classList.remove('has-img');
      frame.insertAdjacentHTML('afterbegin', '<span class="visual-icon">🎁</span>');
      frame.style.cursor = 'default';
    }

    // 核心卖点
    var hl = $('hlList');
    hl.innerHTML = '';
    (p.highlights || []).forEach(function (t, i) {
      var li = document.createElement('li');
      li.className = 'hl-item';
      li.style.animationDelay = 60 * i + 'ms';
      li.innerHTML = '<span class="hl-ico">' + (i + 1) + '</span><span class="hl-txt">' + esc(t) + '</span>';
      hl.appendChild(li);
    });
    if (!p.highlights || !p.highlights.length) {
      hl.innerHTML = '<li class="hl-item"><span class="hl-txt">暂无卖点介绍</span></li>';
    }

    // 产品参数
    var tb = $('specBody');
    tb.innerHTML = '';
    (p.specs || []).forEach(function (s) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="k">' + esc(s.k) + '</td><td class="v">' + esc(s.v) + '</td>';
      tb.appendChild(tr);
    });
    if (!p.specs || !p.specs.length) {
      tb.innerHTML = '<tr><td class="k">说明</td><td class="v">暂无参数</td></tr>';
    }

    $('pNote').textContent = p.desc || '';
  }

  /* ---------------- 交互 ---------------- */

  function goBack() {
    location.href = './';
  }

  function openLightbox() {
    if (!prizeImageUrl) return;
    $('lightboxImg').src = prizeImageUrl;
    $('lightbox').classList.remove('hidden');
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    var preview = /[?&]preview=1/.test(location.search);

    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (state) {
        render(state);
        $('loading').classList.add('hidden');
      })
      .catch(function () {
        $('loading').classList.add('hidden');
        toast('无法连接服务，请检查网络后重试', 'err');
      });

    // 点主图看原图
    $('visualFrame').addEventListener('click', openLightbox);
    $('lightbox').addEventListener('click', function () {
      this.classList.add('hidden');
      $('lightboxImg').src = '';
    });

    // 返回 / 参与
    $('btnBack').addEventListener('click', goBack);
    $('btnJoin').addEventListener('click', function () {
      location.href = './' + (preview ? '?preview=1' : '');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
