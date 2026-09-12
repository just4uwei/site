// store/index.js - 数据层门面。上层只 require('../store')，不直接碰 db.js。
'use strict';

const { DATA_DIR, DB_PATH, IMAGES_DIR, close } = require('./db');

module.exports = {
  DATA_DIR,
  DB_PATH,
  IMAGES_DIR,
  close,
  content: require('./content'),    // works / apps / news 三个同构模块 + 截图
  settings: require('./settings'),  // 站点设置（含 ICP 备案号）
  images: require('./images'),      // 图片元数据 + 字节
  ...require('./auth'),             // hashPw / verifyPw（管理台密码校验）
};
