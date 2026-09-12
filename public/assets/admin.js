// admin.js - 管理后台。登录、三个内容模块的增删改、图库、站点设置。
//
// 地址规则同前台：**一律相对路径**。后台同时能从
//   https://todoo.top/admin.html  和  https://todoo.top/site/admin.html  打开。
//
// atoken 存 sessionStorage：服务端本来就是内存态 token（进程重启即失效），
// 存 localStorage 只会让人拿着一个早就失效的串反复困惑。
'use strict';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const TOKEN_KEY = 'site-atoken';
let atoken = sessionStorage.getItem(TOKEN_KEY) || '';

// 本地实例和线上实例长得一模一样，但它们是**两套独立的库和密码**：
//   本地 http://127.0.0.1:8083  数据在 ./data/，没有 ADMIN_PASSWORD_HASH 就回落明文 admin
//   线上 https://todoo.top      数据在 /var/lib/site，密码是部署时设的哈希
// 不标出来就会拿线上密码登本地（"密码错误"），或者更糟——以为在本地试，其实在改生产内容。
const IS_LOCAL = ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
const ENV_LABEL = IS_LOCAL ? '本地' : '线上';

const KINDS = [
  { key: 'works', label: '游戏作品', coverLabel: '封面', linkLabelHint: '下载 / 试玩' },
  { key: 'apps', label: 'App', coverLabel: '图标', linkLabelHint: '下载入口' },
  { key: 'news', label: '资讯', coverLabel: '封面', linkLabelHint: '相关链接' },
];
const kindOf = (k) => KINDS.find((x) => x.key === k);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function day(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1024))}K`);
const imgUrl = (id) => `api/image?id=${encodeURIComponent(id)}`;

/** 带鉴权的请求。401 一律踢回登录页——token 失效就别在页面上装作还在线 */
async function call(method, path, body, rawContentType) {
  const headers = {};
  if (atoken) headers.Authorization = 'Bearer ' + atoken;
  let payload;
  if (rawContentType) {
    headers['Content-Type'] = rawContentType;
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { /* 非 JSON */ }
  if (res.status === 401) { signOut('登录已失效，请重新登录。'); throw new Error('未登录'); }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function signOut(msg) {
  atoken = '';
  sessionStorage.removeItem(TOKEN_KEY);
  renderLogin(msg);
}

// ---------- 提示 ----------
function flash(msg, bad) {
  const host = $('#flash');
  if (!host) return;
  host.innerHTML = msg ? `<div class="note${bad ? ' bad' : ''}">${esc(msg)}</div>` : '';
  if (msg && !bad) setTimeout(() => { if ($('#flash')) $('#flash').innerHTML = ''; }, 3200);
}

// ---------- 登录 ----------
function renderLogin(msg) {
  document.body.innerHTML = `
    <div class="login">
      <h1>官网管理后台 <span class="env ${IS_LOCAL ? 'local' : 'live'}">${ENV_LABEL}</span></h1>
      <p>${IS_LOCAL
    ? '这是本地实例，数据在 <code>site/data/</code>。没设 ADMIN_PASSWORD_HASH 时默认密码是 <code>admin</code>——线上密码在这里登不进去。'
    : '这是线上实例，改动会直接影响 <code>todoo.top</code> 的公开内容。'}</p>
      <div id="loginFlash">${msg ? `<div class="note bad">${esc(msg)}</div>` : ''}</div>
      <label><span class="lab">密码</span>
        <input type="password" id="pw" autocomplete="current-password" autofocus>
      </label>
      <button class="primary" id="go">登录</button>
      <p class="muted" style="margin-top:1rem"><a href="./">← 回站点首页</a></p>
    </div>`;
  const submit = async () => {
    const pw = $('#pw').value;
    $('#go').disabled = true;
    try {
      const r = await fetch('api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '登录失败');
      atoken = d.atoken;
      sessionStorage.setItem(TOKEN_KEY, atoken);
      renderShell();
      showTab('works');
    } catch (e) {
      $('#loginFlash').innerHTML = `<div class="note bad">${esc(e.message)}</div>`;
      $('#go').disabled = false;
      $('#pw').select();
    }
  };
  $('#go').addEventListener('click', submit);
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ---------- 外壳 ----------
function renderShell() {
  document.body.innerHTML = `
    <div class="wrap">
      <div class="top">
        <h1>官网管理后台</h1>
        <span class="env ${IS_LOCAL ? 'local' : 'live'}">${ENV_LABEL}</span>
        <span class="who">${esc(location.host || 'site')}</span>
        <div class="right">
          <a class="btn" href="./" target="_blank" rel="noreferrer">看站点 ↗</a>
          <button id="out">退出</button>
        </div>
      </div>
      <div class="tabs" id="tabs">
        ${KINDS.map((k) => `<button data-tab="${k.key}" aria-selected="false">${k.label}</button>`).join('')}
        <button data-tab="images" aria-selected="false">图库</button>
        <button data-tab="settings" aria-selected="false">站点设置</button>
      </div>
      <div class="panel"><div id="flash"></div><div id="view"></div></div>
    </div>`;
  $('#out').addEventListener('click', () => signOut());
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
}

function markTab(tab) {
  $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}

async function showTab(tab) {
  markTab(tab);
  flash('');
  try {
    if (tab === 'images') await viewImages();
    else if (tab === 'settings') await viewSettings();
    else await viewList(tab);
  } catch (e) {
    flash(e.message, true);
  }
}

// ---------- 内容列表 ----------
async function viewList(kind) {
  const k = kindOf(kind);
  const { items } = await call('GET', `api/admin/content?kind=${kind}`);
  $('#view').innerHTML = `
    <div class="panel-head">
      <h2>${k.label}</h2>
      <span class="hint">共 ${items.length} 条，其中 ${items.filter((i) => i.status === 'published').length} 条已发布</span>
      <div class="right"><button class="primary" id="new">新建${k.label}</button></div>
    </div>
    ${items.length ? `<table>
      <thead><tr>
        <th class="num">排序</th><th>标题</th><th>标签</th><th class="date">日期</th>
        <th>状态</th><th class="ops"></th>
      </tr></thead>
      <tbody>${items.map((i) => `<tr>
        <td class="num">${i.sort}</td>
        <td><strong>${esc(i.title)}</strong>${i.subtitle ? `<div class="muted">${esc(i.subtitle)}</div>` : ''}</td>
        <td>${esc(i.tag || '—')}</td>
        <td class="date">${esc(i.dateline || day(i.created_at))}</td>
        <td><span class="badge ${i.status}">${i.status === 'published' ? '已发布' : '草稿'}</span></td>
        <td class="ops">
          <button class="link" data-edit="${i.id}">编辑</button>
          <button class="link" data-toggle="${i.id}" data-status="${i.status}">${i.status === 'published' ? '下架' : '发布'}</button>
          <button class="link danger" data-del="${i.id}" data-title="${esc(i.title)}">删除</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>` : `<p class="muted">还没有${k.label}。点右上角新建第一条。</p>`}`;

  $('#new').addEventListener('click', () => viewForm(kind, null));
  $('#view').addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.dataset.edit) return viewForm(kind, Number(t.dataset.edit));
      if (t.dataset.toggle) {
        const next = t.dataset.status === 'published' ? 'draft' : 'published';
        await call('POST', 'api/admin/content/status', { kind, id: Number(t.dataset.toggle), status: next });
        flash(next === 'published' ? '已发布' : '已下架');
        return viewList(kind);
      }
      if (t.dataset.del) {
        if (!confirm(`删除「${t.dataset.title}」？删掉就找不回来了。`)) return undefined;
        await call('POST', 'api/admin/content/delete', { kind, id: Number(t.dataset.del) });
        flash('已删除');
        return viewList(kind);
      }
    } catch (err) { flash(err.message, true); }
    return undefined;
  });
}

// ---------- 内容表单 ----------
async function viewForm(kind, id) {
  const k = kindOf(kind);
  let item = { title: '', subtitle: '', tag: '', summary: '', body: '', link_url: '', link_label: '', dateline: '', sort: 0, status: 'draft', cover_id: null };
  let shots = [];
  if (id) {
    const d = await call('GET', `api/admin/content/item?kind=${kind}&id=${id}`);
    item = d.item; shots = d.shots;
  }
  const { images } = await call('GET', 'api/admin/images?limit=500');

  const field = (name, label, help, attrs) => `
    <label><span class="lab">${label}</span>
      <input type="text" name="${name}" value="${esc(item[name])}" ${attrs || ''}>
      ${help ? `<span class="help">${help}</span>` : ''}
    </label>`;

  $('#view').innerHTML = `
    <div class="panel-head">
      <h2>${id ? '编辑' : '新建'}${k.label}</h2>
      <span class="hint">${id ? `#${id}` : '保存后才能加截图'}</span>
      <div class="right"><button id="back">← 返回列表</button></div>
    </div>
    <form class="form" id="f">
      ${field('title', '标题')}
      ${field('subtitle', '副标题', '一句话卖点，列表和详情页都会显示')}
      ${field('tag', kind === 'news' ? '分类' : '平台/标签', kind === 'news' ? '更新 / 公告 / 幕后…' : 'Windows · Steam 这种自由文本')}
      ${field('dateline', '展示日期', '给人看的，2026-09 这种粒度就够；留空则用创建日期')}
      <label class="wide"><span class="lab">列表摘要</span>
        <textarea name="summary" style="min-height:4.5rem">${esc(item.summary)}</textarea>
        <span class="help">列表页显示这一句。详情页正文写在下面。</span>
      </label>
      <label class="wide"><span class="lab">详情正文</span>
        <textarea name="body" class="tall">${esc(item.body)}</textarea>
        <span class="help">纯文本。空一行分段，单个换行保留为折行。不解析 HTML。</span>
      </label>
      ${field('link_url', '外链地址', k.linkLabelHint + '的 URL，留空则不显示按钮')}
      ${field('link_label', '按钮文案', '留空用默认文案')}
      <label><span class="lab">排序</span>
        <input type="number" name="sort" value="${Number(item.sort) || 0}">
        <span class="help">数字越小越靠前，同数字按创建时间倒序</span>
      </label>
      <label><span class="lab">状态</span>
        <select name="status">
          <option value="draft"${item.status === 'draft' ? ' selected' : ''}>草稿（前台看不到）</option>
          <option value="published"${item.status === 'published' ? ' selected' : ''}>已发布</option>
        </select>
      </label>
      <div class="wide">
        <span class="lab">${k.coverLabel}</span>
        <div class="cover-pick">
          <img id="coverPreview" src="${item.cover_id ? imgUrl(item.cover_id) : ''}" alt=""
               style="${item.cover_id ? '' : 'visibility:hidden'}">
          <div style="flex:1">
            <select name="cover_id" id="coverSel">
              <option value="">（不设${k.coverLabel}）</option>
              ${images.map((im) => `<option value="${im.id}"${Number(item.cover_id) === im.id ? ' selected' : ''}>#${im.id} · ${esc(im.alt || im.mime)} · ${kb(im.size)}</option>`).join('')}
            </select>
            <span class="help">图片先在「图库」里上传，这里选。</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button type="submit" class="primary">保存</button>
        <span class="muted" id="saveHint"></span>
      </div>
    </form>
    <div id="shotsBox" style="margin-top:1.4rem"></div>`;

  $('#back').addEventListener('click', () => viewList(kind));
  $('#coverSel').addEventListener('change', (e) => {
    const v = e.target.value;
    const img = $('#coverPreview');
    img.src = v ? imgUrl(v) : '';
    img.style.visibility = v ? 'visible' : 'hidden';
  });

  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patch = Object.fromEntries(fd.entries());
    patch.kind = kind;
    if (id) patch.id = id;
    patch.sort = Number(patch.sort) || 0;
    patch.cover_id = patch.cover_id ? Number(patch.cover_id) : null;
    try {
      const d = await call('POST', 'api/admin/content/save', patch);
      flash(`已保存「${d.item.title}」`);
      // 新建完直接进编辑态：截图要有 id 才能挂
      if (!id) return viewForm(kind, d.item.id);
      return renderShots(kind, id, shots, images);
    } catch (err) { flash(err.message, true); return undefined; }
  });

  if (id) renderShots(kind, id, shots, images);
}

// ---------- 截图 ----------
function renderShots(kind, id, shots, images) {
  const host = $('#shotsBox');
  if (!host) return;
  host.innerHTML = `
    <div class="panel-head">
      <h2>截图</h2>
      <span class="hint">显示在详情页正文下面，按排序号升序</span>
    </div>
    ${shots.length ? `<div class="gallery">${shots.map((s) => `
      <div class="pic">
        <img src="${imgUrl(s.image_id)}" alt="">
        <div class="cap"><span class="id">#${s.sort}</span>
          <span>${esc(s.caption || '无说明')}</span>
          <button class="link danger grow" data-rmshot="${s.id}">移除</button>
        </div>
      </div>`).join('')}</div>` : '<p class="muted">还没有截图。</p>'}
    <form class="form" id="sf" style="margin-top:1rem">
      <label><span class="lab">选一张图</span>
        <select name="image_id" required>
          <option value="">（请选择）</option>
          ${images.map((im) => `<option value="${im.id}">#${im.id} · ${esc(im.alt || im.mime)} · ${kb(im.size)}</option>`).join('')}
        </select>
      </label>
      <label><span class="lab">图下说明</span><input type="text" name="caption" placeholder="可留空"></label>
      <label><span class="lab">排序</span><input type="number" name="sort" value="${shots.length}"></label>
      <div class="actions"><button type="submit">加进截图</button></div>
    </form>`;

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-rmshot]');
    if (!b) return;
    try {
      await call('POST', 'api/admin/shots/delete', { id: Number(b.dataset.rmshot) });
      const d = await call('GET', `api/admin/shots?kind=${kind}&id=${id}`);
      flash('已移除截图');
      renderShots(kind, id, d.shots, images);
    } catch (err) { flash(err.message, true); }
  });

  $('#sf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = Object.fromEntries(new FormData(e.target).entries());
    try {
      await call('POST', 'api/admin/shots/add', {
        kind, id, image_id: Number(p.image_id), caption: p.caption, sort: Number(p.sort) || 0,
      });
      const d = await call('GET', `api/admin/shots?kind=${kind}&id=${id}`);
      flash('已加入截图');
      renderShots(kind, id, d.shots, images);
    } catch (err) { flash(err.message, true); }
  });
}

// ---------- 图库 ----------
async function viewImages() {
  const { images } = await call('GET', 'api/admin/images?limit=500');
  $('#view').innerHTML = `
    <div class="panel-head">
      <h2>图库</h2>
      <span class="hint">共 ${images.length} 张。封面和截图都从这里选图。</span>
    </div>
    <form class="form" id="up" style="margin-bottom:1.2rem">
      <label><span class="lab">选图片</span>
        <input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" required>
        <span class="help">支持 png / jpeg / webp / gif / svg，单张不超过 8M</span>
      </label>
      <label><span class="lab">图片说明</span>
        <input type="text" id="alt" placeholder="给自己认的备注，也用作无障碍文本">
      </label>
      <div class="actions"><button type="submit" class="primary" id="upBtn">上传</button></div>
    </form>
    ${images.length ? `<div class="gallery">${images.map((im) => `
      <div class="pic">
        <img src="${imgUrl(im.id)}" alt="${esc(im.alt)}" loading="lazy">
        <div class="cap"><span class="id">#${im.id}</span><span>${kb(im.size)}</span>
          <button class="link danger grow" data-rm="${im.id}">删除</button>
        </div>
      </div>`).join('')}</div>` : '<p class="muted">图库还是空的。</p>'}`;

  $('#up').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('#file').files[0];
    if (!f) return;
    const alt = $('#alt').value;
    $('#upBtn').disabled = true;
    try {
      // 直接把 File 当请求体发原始字节，Content-Type 就是图片类型——
      // 服务端按 Content-Type 过白名单，不用 multipart 解析。
      const buf = await f.arrayBuffer();
      const d = await call('POST', `api/admin/images/upload?alt=${encodeURIComponent(alt)}`, buf, f.type);
      flash(`已上传 #${d.id}`);
      await viewImages();
    } catch (err) { flash(err.message, true); $('#upBtn').disabled = false; }
  });

  $('#view').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-rm]');
    if (!b) return;
    if (!confirm(`删除图片 #${b.dataset.rm}？引用它的封面会变成空，截图会一并移除。`)) return;
    try {
      await call('POST', 'api/admin/images/delete', { id: Number(b.dataset.rm) });
      flash('已删除');
      await viewImages();
    } catch (err) { flash(err.message, true); }
  });
}

// ---------- 站点设置 ----------
const SETTING_FIELDS = [
  ['site_title', '站点名', '显示在首页大标题、页脚与浏览器标签上', 'text'],
  ['site_tagline', '一句话简介', '首页大标题下面那行', 'text'],
  ['site_intro', '首页引言', '再补一小段，留空则不显示', 'area'],
  ['about_body', '关于页正文', '空一行分段', 'area-tall'],
  ['contact_email', '联系邮箱', '显示在页脚与关于页，留空则不显示', 'text'],
  ['contact_note', '其他联系方式', '比如某个平台的主页，留空则不显示', 'text'],
  ['icp', 'ICP 备案号', '法定展示项，页脚会带上并链到工信部查询页。别留空', 'text'],
  ['footer_note', '页脚补充', '可留空', 'text'],
];

async function viewSettings() {
  const { site } = await call('GET', 'api/admin/settings');
  $('#view').innerHTML = `
    <div class="panel-head">
      <h2>站点设置</h2>
      <span class="hint">改完保存，前台刷新即生效</span>
    </div>
    <form class="form" id="sform">
      ${SETTING_FIELDS.map(([name, label, help, type]) => {
    const inner = type === 'text'
      ? `<input type="text" name="${name}" value="${esc(site[name])}">`
      : `<textarea name="${name}" class="${type === 'area-tall' ? 'tall' : ''}">${esc(site[name])}</textarea>`;
    return `<label class="${type === 'text' ? '' : 'wide'}">
          <span class="lab">${label}</span>${inner}
          <span class="help">${help}</span>
        </label>`;
  }).join('')}
      <div class="actions"><button type="submit" class="primary">保存设置</button></div>
    </form>`;

  $('#sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = Object.fromEntries(new FormData(e.target).entries());
    try {
      await call('POST', 'api/admin/settings', p);
      flash('设置已保存');
    } catch (err) { flash(err.message, true); }
  });
}

// ---------- 启动 ----------
(async function boot() {
  if (!atoken) { renderLogin(); return; }
  // 拿一个要鉴权的接口验票：过期就会被 call() 踢回登录页
  try {
    await call('GET', 'api/admin/settings');
    renderShell();
    showTab('works');
  } catch (_) { /* call() 已处理 401 */ }
})();
