const { getApp } = require('../server-dist/server/index.js');

module.exports = async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
};
