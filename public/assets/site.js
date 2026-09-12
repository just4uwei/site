// site.js - 紫夜堂前台。一份文件带完所有页面，靠 <body data-page="..."> 分派。
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

const imgUrl = (id) => `api/image?id=${encodeURIComponent(id)}`;

/** 正文：纯文本按空行分段。不解析 HTML —— 后台内容也不给注入的机会 */
function paragraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const LABEL = { works: '游戏作品', apps: 'App', news: '资讯' };
const MARK = { works: 'works', apps: 'apps', news: 'journal' };
const DETAIL_PAGE = { works: 'work.html', apps: 'app.html', news: 'post.html' };
const detailHref = (kind, id) => `${DETAIL_PAGE[kind]}?id=${encodeURIComponent(id)}`;
const listHref = (kind) => `${kind}.html`;

const NAV = [
  { href: './', label: '首页', page: 'home' },
  { href: 'works.html', label: '游戏作品', page: 'works' },
  { href: 'apps.html', label: 'App', page: 'apps' },
  { href: 'news.html', label: '资讯', page: 'news' },
  { href: 'about.html', label: '关于', page: 'about' },
];

// ---------- 顶栏 / 页脚 ----------

function renderTopbar(meta, current) {
  const host = $('#topbar');
  if (!host) return;
  const title = meta.site.site_title || '紫夜堂';
  // 主 CTA 指向内容最多的那一栏——没作品时让人点"作品"是空的
  const best = ['works', 'apps', 'news']
    .map((k) => ({ k, n: meta.counts[k] }))
    .sort((a, b) => b.n - a.n)[0];
  host.innerHTML = `
    <div class="topbar">
      <a class="logo" href="./"><span class="glyph" aria-hidden="true"></span>${esc(title)}</a>
      <nav class="topnav" aria-label="站点导航">
        ${NAV.map((n) => `<a href="${n.href}"${n.page === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('')}
      </nav>
      <div class="cta">
        ${best && best.n ? `<a class="pill solid" href="${listHref(best.k)}">看${esc(LABEL[best.k])}</a>` : ''}
        ${meta.site.contact_email ? `<a class="pill" href="mailto:${esc(meta.site.contact_email)}">写邮件</a>` : ''}
      </div>
    </div>`;
}

function renderFoot(meta) {
  const host = $('#foot');
  if (!host) return;
  const s = meta.site;
  const bits = [`<span>© ${new Date().getFullYear()} ${esc(s.site_title || '紫夜堂')}</span>`];
  if (s.contact_email) bits.push(`<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`);
  if (s.footer_note) bits.push(`<span>${esc(s.footer_note)}</span>`);
  // ICP 备案号：工信部要求在首页底部展示并链回备案查询系统，别删
  if (s.icp) {
    bits.push(`<span class="spacer"></span><a class="icp" href="https://beian.miit.gov.cn/"`
      + ` target="_blank" rel="noreferrer noopener">${esc(s.icp)}</a>`);
  }
  host.innerHTML = `<footer class="foot">${bits.join('')}</footer>`;
}

// ---------- 首屏 ----------

function renderHero(meta) {
  const s = meta.site;
  const title = s.site_title || '紫夜堂';
  const hasArt = !!s.hero_image_id;

  // 三个模块入口。参考站那几个飘着的 pill 是纯装饰，这里换成带真实计数的入口——
  // 结构要编码信息。没有内容的栏目不出现，免得点进去是空的。
  const entries = ['works', 'apps', 'news']
    .filter((k) => meta.counts[k] > 0)
    .map((k, i) => `<a class="pill p${i + 1}" href="${listHref(k)}">${esc(LABEL[k])}<span class="n">${meta.counts[k]}</span></a>`);

  const tags = String(s.hero_tags || '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);

  const card = s.author_note ? `
    <div class="card-me">
      ${s.author_avatar_id ? `<img src="${imgUrl(s.author_avatar_id)}" alt="${esc(title)}">` : ''}
      <p><strong>${esc(title)}</strong>　${esc(s.author_note)}</p>
    </div>` : '';

  return `
    <header class="hero">
      <div class="hero-head">
        <div class="mark tag">${esc(s.site_tagline || '')}</div>
        <div class="mark">${esc(s.hero_since || '')}</div>
      </div>

      <div class="hero-stage">
        <h1 class="wordmark" style="--n:${title.length}">${esc(title)}</h1>
        ${hasArt ? `<img class="hero-art" src="${imgUrl(s.hero_image_id)}" alt="" aria-hidden="true">` : ''}
        ${entries.length ? `<div class="hero-pills${hasArt ? '' : ' inline'}">${entries.join('')}</div>` : ''}
      </div>

      <div class="hero-foot">
        <div>
          ${s.site_intro ? `<p class="hero-claim">${esc(s.site_intro)}</p>` : ''}
          ${tags.length ? `<div class="hero-tags">${tags.map((t) => `<span class="pill ghost">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        ${card}
      </div>
    </header>`;
}

// ---------- 列表片段 ----------

function cardWork(item, href) {
  const cover = item.cover_id
    ? `<img class="card-cover" src="${imgUrl(item.cover_id)}" alt="${esc(item.title)}封面" loading="lazy">`
    : '';
  const meta = [item.tag, shown(item)].filter(Boolean).map((x) => `<span class="mark">${esc(x)}</span>`).join('');
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
    ? `<img class="card-cover icon" src="${imgUrl(item.cover_id)}" alt="${esc(item.title)}图标" loading="lazy">`
    : '';
  const link = item.link_url
    ? `<div class="card-foot"><a href="${esc(item.link_url)}" target="_blank" rel="noreferrer noopener">${esc(item.link_label || '下载')} →</a></div>`
    : '';
  return `<article class="card">
    ${icon}
    <div class="card-body">
      ${item.tag ? `<div class="card-meta"><span class="mark">${esc(item.tag)}</span></div>` : ''}
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
    ${item.tag ? `<span class="mark">${esc(item.tag)}</span>` : '<span></span>'}
  </div>`;
}

function emptyBox(msg) { return `<p class="empty">${esc(msg)}</p>`; }

function listHtml(kind, items, emptyMsg) {
  if (!items.length) return emptyBox(emptyMsg);
  if (kind === 'news') return `<div class="rows">${items.map((i) => rowNews(i, detailHref('news', i.id))).join('')}</div>`;
  const card = kind === 'apps' ? cardApp : cardWork;
  return `<div class="grid">${items.map((i) => card(i, detailHref(kind, i.id))).join('')}</div>`;
}

function sectionHtml(kind, items, opts) {
  const o = opts || {};
  return `<section class="section">
    <div class="section-head">
      <span class="mark">${MARK[kind]}</span>
      <h2 class="section-title">${LABEL[kind]}</h2>
      ${o.more ? `<a class="section-more" href="${listHref(kind)}">全部 →</a>`
    : `<span class="section-more mark">${items.length} 条</span>`}
    </div>
    ${listHtml(kind, items, o.empty || `还没有发布${LABEL[kind]}。`)}
  </section>`;
}

// ---------- 页面 ----------

async function pageHome(meta) {
  const [works, apps, news] = await Promise.all([
    api('api/works?limit=6'), api('api/apps?limit=6'), api('api/news?limit=5'),
  ]);
  const sections = [
    ['works', works.items, '还没有发布作品。到管理后台添加第一件。'],
    ['apps', apps.items, '还没有发布 App。'],
    ['news', news.items, '还没有发布资讯。'],
  ];
  $('#main').innerHTML = renderHero(meta)
    + sections.map(([kind, items, empty]) => sectionHtml(kind, items, { more: true, empty })).join('');
}

async function pageList(kind) {
  const { items } = await api(`api/${kind}?limit=200`);
  // 页面骨架里只有 #main，栏目容器得自己建——曾经直接取 #list，拿到 null 后整页白屏
  $('#main').innerHTML = sectionHtml(kind, items);
}

async function pageDetail(kind) {
  const id = new URLSearchParams(location.search).get('id');
  const host = $('#main');
  if (!id) { host.innerHTML = emptyBox('地址里少了 id 参数。'); return; }

  const { item, shots, prev, next } = await api(`api/${kind}/item?id=${encodeURIComponent(id)}`);
  document.title = `${item.title} · ${LABEL[kind]}`;

  const metaLine = [item.tag, shown(item)].filter(Boolean).map((x) => `<span class="mark">${esc(x)}</span>`).join('');
  const cover = item.cover_id
    ? `<img class="entry-cover" src="${imgUrl(item.cover_id)}" alt="${esc(item.title)}">`
    : '';
  const action = item.link_url
    ? `<p style="margin-top:var(--gap)"><a class="pill solid" href="${esc(item.link_url)}" target="_blank" rel="noreferrer noopener">${esc(item.link_label || '前往')} →</a></p>`
    : '';
  const gallery = shots.length
    ? `<div class="shots">${shots.map((s) => `<figure class="shot">
         <img src="${imgUrl(s.image_id)}" alt="${esc(s.caption || item.title + '截图')}" loading="lazy">
         ${s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ''}
       </figure>`).join('')}</div>`
    : '';
  const link = (it, dir) => (it
    ? `<a href="${detailHref(kind, it.id)}">${dir === 'prev' ? '← ' : ''}${esc(it.title)}${dir === 'next' ? ' →' : ''}</a>`
    : '<span></span>');

  host.innerHTML = `<article class="entry">
    <div class="section-head">
      <span class="mark">${MARK[kind]}</span>
      <a class="section-more" href="${listHref(kind)}">全部${LABEL[kind]} →</a>
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
  if (s.icp) rows.push(['ICP 备案', esc(s.icp)]);

  $('#main').innerHTML = `<section class="section">
    <div class="section-head">
      <span class="mark">about</span>
      <h2 class="section-title">关于与联系</h2>
    </div>
    <div class="prose">${paragraphs(s.about_body) || emptyBox('还没写关于页的内容。')}</div>
    ${rows.length ? `<div class="rows" style="margin-top:var(--gap)">${rows.map(([k, v]) => (
    `<div class="row"><div class="row-date">${esc(k)}</div><div class="row-title">${v}</div><span></span></div>`
  )).join('')}</div>` : ''}
    <p class="empty" style="margin-top:var(--gap)">本站只做展示，不开放评论与留言。有事发邮件。</p>
  </section>`;
}

// ---------- 启动 ----------

(async function boot() {
  const page = document.body.dataset.page;
  try {
    const meta = await api('api/site');
    const navKey = { work: 'works', app: 'apps', post: 'news' }[page] || page;
    renderTopbar(meta, navKey);
    renderFoot(meta);
    const title = meta.site.site_title || '紫夜堂';
    document.title = page === 'home'
      ? `${title} · ${meta.site.site_tagline || ''}`.trim()
      : `${LABEL[navKey] || '关于'} · ${title}`;

    if (page === 'home') await pageHome(meta);
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
