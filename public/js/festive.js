/* ================================================================
   喜庆氛围层：灯笼 / 祥云 / 上浮金粉 + 撒花
   用法：页面里放 <div class="fx-layer"></div>，引入本文件即可自动挂载
   ================================================================ */
(function () {
  'use strict';

  /* ---------------- 图形 ---------------- */

  var LANTERN_SVG =
    '<svg viewBox="0 0 80 120" width="100%" aria-hidden="true">' +
    '<line x1="40" y1="0" x2="40" y2="14" stroke="#d4a843" stroke-width="2.5"/>' +
    '<rect x="28" y="14" width="24" height="7" rx="2.5" fill="#d4a843"/>' +
    '<ellipse cx="40" cy="52" rx="30" ry="32" fill="#e03131"/>' +
    '<ellipse cx="40" cy="52" rx="30" ry="32" fill="url(#lg)"/>' +
    [18, 30, 50, 62]
      .map(function (x) {
        return (
          '<path d="M ' + x + ' 24 Q ' + (x < 40 ? x - 7 : x + 7) + ' 52 ' + x + ' 80" ' +
          'stroke="#f6d47c" stroke-width="1.4" fill="none" opacity="0.75"/>'
        );
      })
      .join('') +
    '<ellipse cx="40" cy="52" rx="30" ry="32" fill="none" stroke="#f6d47c" stroke-width="1.6"/>' +
    '<rect x="30" y="81" width="20" height="6" rx="2.5" fill="#d4a843"/>' +
    '<line x1="40" y1="87" x2="40" y2="98" stroke="#d4a843" stroke-width="2"/>' +
    '<path d="M34 98 h12 l-2 18 h-8 z" fill="#f0c75e"/>' +
    '<defs><radialGradient id="lg" cx="0.38" cy="0.35" r="0.85">' +
    '<stop offset="0%" stop-color="#ff8a5c" stop-opacity="0.85"/>' +
    '<stop offset="55%" stop-color="#e03131" stop-opacity="0"/>' +
    '<stop offset="100%" stop-color="#8f1212" stop-opacity="0.6"/>' +
    '</radialGradient></defs></svg>';

  var CLOUDS_SVG =
    '<svg viewBox="0 0 200 60" fill="none" width="100%" aria-hidden="true">' +
    '<path d="M10 45 q10 -22 30 -14 q6 -16 24 -12 q18 -6 24 10 q20 -6 22 12 q14 2 10 14" ' +
    'stroke="rgba(246,212,124,0.35)" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M120 30 q8 -16 24 -10 q6 -12 20 -8 q14 -4 18 8 q14 -4 16 10" ' +
    'stroke="rgba(246,212,124,0.22)" stroke-width="2" stroke-linecap="round"/></svg>';

  /* ---------------- 挂载 ---------------- */

  function mount() {
    var layer = document.querySelector('.fx-layer');
    if (!layer || layer.dataset.ready) return;
    layer.dataset.ready = '1';

    var html = '';
    html += '<div class="fx-lantern l">' + LANTERN_SVG + '</div>';
    html += '<div class="fx-lantern r">' + LANTERN_SVG + '</div>';
    html += '<div class="fx-cloud a">' + CLOUDS_SVG + '</div>';
    html += '<div class="fx-cloud b">' + CLOUDS_SVG + '</div>';
    html += '<div class="fx-cloud c">' + CLOUDS_SVG + '</div>';

    // 16 颗金粉，位置/大小/时长按固定公式错开，保证每次一致
    for (var i = 0; i < 16; i++) {
      var left = (i * 61) % 100;
      var size = 5 + ((i * 37) % 10);
      var dur = 9 + ((i * 53) % 12);
      var delay = -((i * 29) % 14);
      html +=
        '<span class="gold-particle" style="left:' + left + '%;width:' + size + 'px;height:' +
        size + 'px;animation-duration:' + dur + 's;animation-delay:' + delay + 's"></span>';
    }
    layer.innerHTML = html;
  }

  /* ---------------- 撒花 ---------------- */

  var COLORS = ['#f6d47c', '#ffe9a8', '#e03131', '#ffffff', '#f0c75e'];

  function confetti(count) {
    var box = document.getElementById('confetti');
    if (!box) {
      box = document.createElement('div');
      box.className = 'confetti';
      box.id = 'confetti';
      document.body.appendChild(box);
    }
    count = count || 90;
    for (var i = 0; i < count; i++) {
      (function () {
        var el = document.createElement('i');
        el.style.left = Math.floor(Math.random() * 100) + 'vw';
        el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
        el.style.width = 6 + Math.floor(Math.random() * 7) + 'px';
        el.style.height = 10 + Math.floor(Math.random() * 10) + 'px';
        el.style.animationDuration = 2.2 + Math.random() * 2.2 + 's';
        el.style.animationDelay = Math.random() * 0.5 + 's';
        box.appendChild(el);
        setTimeout(function () {
          el.remove();
        }, 5400);
      })();
    }
  }

  /* ---------------- 导出 ---------------- */

  window.Festive = { mount: mount, confetti: confetti };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
