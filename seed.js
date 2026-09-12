#!/usr/bin/env node
//
// seed.js - 往**本地开发**数据目录塞几条示例内容，好让前台一眼看出长什么样。
//
// 用法：npm run seed
//
// 只对本地开发库动手：它拿的是 config.DATA_DIR，线上那份是 /var/lib/site，
// 而线上根本不会执行这个脚本（deploy/pack.sh 的清单里没有它）。
// 已经有内容时直接退出，不会覆盖你写的东西。
'use strict';

const store = require('./src/store');

const WORKS = [
  {
    title: '灯塔守夜人',
    subtitle: '一个人、一座塔、十二个夜晚',
    tag: 'Windows · 单机',
    dateline: '2026-06',
    summary: '在雾里辨认船的灯语，把它们一艘艘领进港。',
    body: '一座建在礁石上的灯塔，一本交接班留下的手写日志。\n\n每个夜晚你要根据风向、雾浓度和不完整的灯语判断该不该开灯——开错了会把船引向礁石，不开则可能错过求救。\n\n十二个夜晚过后，日志会被交给下一个人。',
    link_label: '下载试玩版',
  },
  {
    title: '方格里的城',
    subtitle: '在一张稿纸上养一座城市',
    tag: 'Windows · Android',
    dateline: '2025-11',
    summary: '格子是有限的，想清楚再落笔。',
    body: '没有拆除按钮。每一格画下去就留在那儿，城市只能顺着已有的形状长。\n\n玩到后期你会开始为二十步之前的自己感到抱歉，这正是它想让你体会的事。',
    link_label: '前往下载',
  },
];

const APPS = [
  {
    title: '轻笔记',
    subtitle: '看着像记事本的记事本',
    tag: 'Android · Windows',
    dateline: '2026-08',
    summary: '本体就是个能用的纯文本记事本，同步与多端在后面。',
    body: '起因是想要一个打开就能写、不弹广告、不要登录的记事本。\n\n后来加了多端同步，于是它也成了我自己每天用的那个。',
    link_label: '打开轻笔记',
    link_url: 'https://todoo.top/harmony/',
  },
];

const NEWS = [
  {
    title: '官网上线了',
    tag: '公告',
    dateline: '2026-09',
    summary: 'todoo.top 备案通过，作品和 App 都搬到这里。',
    body: 'ICP 备案下来了，于是有了这个站。\n\n以后作品更新、App 版本发布都会记在「资讯」里。站点只做展示，不开评论——有事发邮件。',
  },
  {
    title: '轻笔记 加入 PC 端',
    tag: '更新',
    dateline: '2026-08',
    summary: 'Windows 客户端与手机端同步同一份笔记。',
    body: 'PC 端和 Android 端用的是同一套内容，改哪边都会同步过去。',
  },
];

function main() {
  const already = ['works', 'apps', 'news'].some((k) => store.content.listAll(k).length > 0);
  if (already) {
    console.log('库里已经有内容了，seed 不覆盖。想重来就删掉本地 data/ 再跑。');
    console.log(`（本地数据目录：${store.DATA_DIR}）`);
    return;
  }

  let n = 0;
  for (const [kind, rows] of [['works', WORKS], ['apps', APPS], ['news', NEWS]]) {
    rows.forEach((row, i) => {
      store.content.save(kind, { ...row, sort: i, status: 'published' });
      n++;
    });
  }
  store.settings.update({
    site_title: 'todoo',
    site_tagline: '一个人做的游戏，和顺手写出来的工具',
    site_intro: '这里放我做的游戏、写的 App，以及它们的更新记录。全部只读——想聊的话，邮件更合适。',
    about_body: '一个人做游戏和小工具，在福建。\n\n游戏偏小、偏慢，通常只有一个核心机制，能在一两个晚上玩完。工具都是先给自己用，用顺了才放出来。\n\n作品与 App 在上面几栏，更新会发在「资讯」。',
    contact_note: '合作、反馈、报 bug 都可以发邮件，一般一两天内回。',
  });

  console.log(`已写入 ${n} 条示例内容与站点设置 -> ${store.DATA_DIR}`);
  console.log('接着跑：npm start  然后浏览 http://127.0.0.1:8083/');
  store.close();
}

main();
