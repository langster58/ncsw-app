const { proxyDirectus } = require('./proxy')

module.exports = async function handler(req, res) {
  await proxyDirectus(req, res, req.query.collection)
}
