/* jshint node: true */
//'use strict';
// FIXME: need jshint config to exclude modelLoader

var MC = require(__dirname + '/../model');

module.exports = modelLoader = function(req, res, next) {
  req.model = res.model = new MC();
  next();
};
