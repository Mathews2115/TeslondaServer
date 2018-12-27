const express = require('express'), path = require('path');
let webserver = express();
webserver.use(express.static(path.join(__dirname, '/public/dist'))); //  "public" off of current is root
webserver.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, '/public/dist/index.html')); // load the single view file (angular will handle the page changes on the front-end)
});

module.exports = webserver;
