// site.js - 前台脚本。一份文件带完所有页面，靠 <body data-page="..."> 分派。
//
// 只读：这里没有任何 POST/PUT/DELETE。访客能做的只有看和跳转。
//
// 地址规则（很重要）：所有接口与资源**一律相对路径**（api/works、assets/…）。
// 站点同时挂在两个入口上——
//   https://todoo.top/        根入口
//   https://todoo.top/site/   二级前缀入口
// 写成 /api/works 这种绝对路径，在第二个入口下会打到网关根上 404。
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);

/** GET JSON。失败抛出带中文消息的 Error，由各页面的 catch 落到页面上 */
async function api(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { /* 非 JSON，保持空对象 */ }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** ms 时间戳 -> 2026-09-11。dateline 有值时优先用它（人填的，粒度自己定） */
function day(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const shown = (item) => item.dateline || day(item.created_at);

const coverUrl = (id) => `api/image?id=${encodeURIComponent(id)}`;

/** 正文：纯文本按空行分段。不解析 HTML —— 后台内容也不给注入的机会 */
function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ---------- 抬头 / 导航 / 页脚 ----------

const NAV = [
  { href: './', label: '首页', page: 'home' },
  { href: 'works.html', label: '游戏作品', page: 'works', count: 'works' },
  { href: 'apps.html', label: 'App', page: 'apps', count: 'apps' },
  { href: 'news.html', label: '资讯', page: 'news', count: 'news' },
  { href: 'about.html', label: '关于', page: 'about' },
];

function renderNav(meta, current) {
  return `<nav class="nav" aria-label="站点导航">${NAV.map((n) => {
    const cur = n.page === current ? ' aria-current="page"' : '';
    const c = n.count && meta.counts ? `<span class="count">${meta.counts[n.count]}</span>` : '';
    return `<a href="${n.href}"${cur}>${esc(n.label)}${c}</a>`;
  }).join('')}</nav>`;
}

/** 稿纸抬头的字段行：字段名是印好的，值是真数据 */
function renderFields(meta) {
  const f = [
    ['站点', meta.site.site_title || 'todoo'],
    ['游戏作品', `${meta.counts.works} 件`],
    ['App', `${meta.counts.apps} 个`],
    ['资讯', `${meta.counts.news} 条`],
    ['最近更新', meta.updated ? day(meta.updated) : '—'],
  ];
  return `<div class="fields">${f.map(([k, v]) => (
    `<div class="field"><div class="field-k">${esc(k)}</div><div class="field-v">${esc(v)}</div></div>`
  )).join('')}</div>`;
}

function renderMasthead(meta, current) {
  const host = $('#masthead');
  if (!host) return;
  const s = meta.site;
  const body = current === 'home'
    ? `<div class="sheet-body">
         <h1 class="wordmark">${esc(s.site_title || 'todoo')}</h1>
         <p class="tagline">${esc(s.site_tagline || '')}</p>
         ${s.site_intro ? `<p class="intro">${esc(s.site_intro)}</p>` : ''}
       </div>`
    : '';
  host.innerHTML = `<div class="sheet">${renderFields(meta)}${body}${renderNav(meta, current)}</div>`;
}

function renderFoot(meta) {
  const host = $('#foot');
  if (!host) return;
  const s = meta.site;
  const bits = [`<span>© ${new Date().getFullYear()} ${esc(s.site_title || 'todoo')}</span>`];
  if (s.contact_email) {
    bits.push(`<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`);
  }
  if (s.footer_note) bits.push(`<span>${esc(s.footer_note)}</span>`);
  // ICP 备案号：工信部要求在首页底部展示并链回备案查询系统，别删
  if (s.icp) {
    bits.push(`<span class="spacer"></span><a class="icp" href="https://beian.miit.gov.cn/"`
      + ` target="_blank" rel="noreferrer noopener">${esc(s.icp)}</a>`);
  }
  host.innerHTML = `<footer class="foot">${bits.join('')}</footer>`;
}

// ---------- 列表片段 ----------

function cardWork(item, href) {
  const cover = item.cover_id
    ? `<img class="card-cover" src="${coverUrl(item.cover_id)}" alt="${esc(item.title)}封面" loading="lazy">`
    : '';
  const meta = [item.tag, shown(item)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  const link = item.link_url
    ? `<div class="card-foot"><a href="${esc(item.link_url)}" target="_blank" rel="noreferrer noopener">${esc(item.link_label || '查看')} →</a></div>`
    : '';
  return `<article class="card">
    ${cover}
    <div class="card-body">
      ${meta ? `<div class="card-meta">${meta}</div>` : ''}
      <h3 class="card-title"><a href="${href}">${esc(item.title)}</a></h3>
      ${item.summary ? `<p class="card-sub">${esc(item.summary)}</p>` : ''}
      ${link}
    </div>
  </article>`;
}

function cardApp(item, href) {
  const icon = item.cover_id
    ? `<img class="card-cover icon" src="${coverUrl(item.cover_id)}" alt="${esc(item.title)}图标" loading="lazy">`
    : '';
  const link = item.link_url
    ? `<div class="card-foot"><a href="${esc(item.link_url)}" target="_blank" rel="noreferrer noopener">${esc(item.link_label || '下载')} →</a></div>`
    : '';
  return `<article class="card">
    ${icon}
    <div class="card-body">
      ${item.tag ? `<div class="card-meta"><span>${esc(item.tag)}</span></div>` : ''}
      <h3 class="card-title"><a href="${href}">${esc(item.title)}</a></h3>
      ${item.subtitle ? `<p class="card-sub">${esc(item.subtitle)}</p>` : ''}
      ${item.summary ? `<p class="card-sub">${esc(item.summary)}</p>` : ''}
      ${link}
    </div>
  </article>`;
}

function rowNews(item, href) {
  return `<div class="row">
    <div class="row-date">${esc(shown(item))}</div>
    <div class="row-title"><a href="${href}">${esc(item.title)}</a>
      ${item.summary ? `<span class="row-sub">${esc(item.summary)}</span>` : ''}
    </div>
    ${item.tag ? `<div class="row-tag">${esc(item.tag)}</div>` : '<div></div>'}
  </div>`;
}

const DETAIL_PAGE = { works: 'work.html', apps: 'app.html', news: 'post.html' };
const detailHref = (kind, id) => `${DETAIL_PAGE[kind]}?id=${encodeURIComponent(id)}`;

function emptyBox(msg) { return `<p class="empty">${esc(msg)}</p>`; }

function renderList(host, kind, items, emptyMsg) {
  if (!items.length) { host.innerHTML = emptyBox(emptyMsg); return; }
  if (kind === 'news') {
    host.className = 'rows';
    host.innerHTML = items.map((i) => rowNews(i, detailHref('news', i.id))).join('');
    return;
  }
  host.className = kind === 'apps' ? 'grid' : 'grid wide';
  const card = kind === 'apps' ? cardApp : cardWork;
  host.innerHTML = items.map((i) => card(i, detailHref(kind, i.id))).join('');
}

// ---------- 页面 ----------

const LABEL = { works: '游戏作品', apps: 'App', news: '资讯' };
const EYEBROW = { works: 'works', apps: 'apps', news: 'journal' };

async function pageHome() {
  const [works, apps, news] = await Promise.all([
    api('api/works?limit=6'), api('api/apps?limit=6'), api('api/news?limit=5'),
  ]);
  const sections = [
    ['works', works.items, 'works.html', '还没有发布作品。到管理后台添加第一件。'],
    ['apps', apps.items, 'apps.html', '还没有发布 App。'],
    ['news', news.items, 'news.html', '还没有发布资讯。'],
  ];
  $('#main').innerHTML = sections.map(([kind]) => `
    <section class="section">
      <div class="section-head">
        <span class="eyebrow">${EYEBROW[kind]}</span>
        <h2 class="section-title">${LABEL[kind]}</h2>
        <a class="section-more" href="${kind}.html">全部 →</a>
      </div>
      <div id="list-${kind}"></div>
    </section>`).join('');
  for (const [kind, items, , msg] of sections) {
    renderList($(`#list-${kind}`), kind, items, msg);
  }
}

async function pageList(kind) {
  const { items } = await api(`api/${kind}?limit=200`);
  // 页面骨架只有 #main（见 works.html 等），列表容器得自己建——
  // 直接 $('#list') 会拿到 null，然后死在 innerHTML 上。
  $('#main').innerHTML = `
    <section class="section">
      <div class="section-head">
        <span class="eyebrow">${EYEBROW[kind]}</span>
        <h2 class="section-title">${LABEL[kind]}</h2>
        <span class="section-more">${items.length} 条</span>
      </div>
      <div id="list"></div>
    </section>`;
  renderList($('#list'), kind, items, `还没有发布${LABEL[kind]}。`);
}

async function pageDetail(kind) {
  const id = new URLSearchParams(location.search).get('id');
  const host = $('#main');
  if (!id) { host.innerHTML = emptyBox('地址里少了 id 参数。'); return; }

  const { item, shots, prev, next } = await api(`api/${kind}/item?id=${encodeURIComponent(id)}`);
  document.title = `${item.title} · ${LABEL[kind]}`;

  const metaLine = [item.tag, shown(item)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  const cover = item.cover_id
    ? `<img class="entry-cover" src="${coverUrl(item.cover_id)}" alt="${esc(item.title)}" />`
    : '';
  const action = item.link_url
    ? `<p><a class="btn" href="${esc(item.link_url)}" target="_blank" rel="noreferrer noopener">${esc(item.link_label || '前往')}</a></p>`
    : '';
  const gallery = shots.length
    ? `<div class="shots">${shots.map((s) => `<figure class="shot">
         <img src="${coverUrl(s.image_id)}" alt="${esc(s.caption || item.title + '截图')}" loading="lazy">
         ${s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ''}
       </figure>`).join('')}</div>`
    : '';
  const link = (it, dir) => (it
    ? `<a href="${detailHref(kind, it.id)}">${dir === 'prev' ? '← ' : ''}${esc(it.title)}${dir === 'next' ? ' →' : ''}</a>`
    : '<span></span>');

  host.innerHTML = `<article class="entry">
    <div class="section-head">
      <span class="eyebrow">${EYEBROW[kind]}</span>
      <a class="section-more" href="${kind}.html">全部${LABEL[kind]} →</a>
    </div>
    ${metaLine ? `<div class="card-meta">${metaLine}</div>` : ''}
    <h1 class="entry-title">${esc(item.title)}</h1>
    ${item.subtitle ? `<p class="entry-sub">${esc(item.subtitle)}</p>` : ''}
    ${cover}
    <div class="prose">${paragraphs(item.body) || `<p>${esc(item.summary || '')}</p>`}</div>
    ${action}
    ${gallery}
    <nav class="pager">${link(prev, 'prev')}${link(next, 'next')}</nav>
  </article>`;
}

async function pageAbout(meta) {
  const s = meta.site;
  const rows = [];
  if (s.contact_email) rows.push(['邮箱', `<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`]);
  if (s.contact_note) rows.push(['其他', esc(s.contact_note)]);
  if (s.icp) rows.push(['ICP 备案', `<span class="row-date">${esc(s.icp)}</span>`]);

  $('#main').innerHTML = `<section class="section">
    <div class="section-head">
      <span class="eyebrow">about</span>
      <h2 class="section-title">关于与联系</h2>
    </div>
    <div class="prose">${paragraphs(s.about_body) || emptyBox('还没写关于页的内容。')}</div>
    ${rows.length ? `<div class="rows" style="margin-top:var(--cell)">${rows.map(([k, v]) => (
      `<div class="row"><div class="row-date">${esc(k)}</div><div class="row-title">${v}</div><div></div></div>`
    )).join('')}</div>` : ''}
    <p class="empty" style="margin-top:var(--cell)">本站只做展示，不开放评论与留言。有事发邮件。</p>
  </section>`;
}

// ---------- 启动 ----------

(async function boot() {
  const page = document.body.dataset.page;
  try {
    const meta = await api('api/site');
    const navKey = { work: 'works', app: 'apps', post: 'news' }[page] || page;
    renderMasthead(meta, navKey);
    renderFoot(meta);
    if (meta.site.site_title) {
      document.title = page === 'home'
        ? `${meta.site.site_title} · ${meta.site.site_tagline || ''}`.trim()
        : document.title.replace('todoo', meta.site.site_title);
    }

    if (page === 'home') await pageHome();
    else if (page === 'about') await pageAbout(meta);
    else if (['works', 'apps', 'news'].includes(page)) await pageList(page);
    else if (page === 'work') await pageDetail('works');
    else if (page === 'app') await pageDetail('apps');
    else if (page === 'post') await pageDetail('news');
  } catch (e) {
    $('#main').innerHTML = `<p class="empty">${esc(e.message || '页面加载失败')}　`
      + '<a href="./">回首页</a></p>';
  }
})();
