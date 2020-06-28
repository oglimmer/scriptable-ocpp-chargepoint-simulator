#!/bin/bash

rm -rf dist
npm run build:browser

rm -rf public/scripts/ws
cp -r dist public/scripts/ws
rm -rf public/scripts/ws/http
rm -rf public/scripts/ws/remote-console-connection.js*
rm -rf public/scripts/ws/main.js*
rm -rf public/scripts/ws/ftp.js*
rm -rf public/scripts/ws/cert-management.js*
rm -rf public/scripts/ws/http-post-logger.js*
rm -rf public/scripts/ws/http-post-logger-config.js*
rm -rf public/scripts/ws/keystore.js*


cat >public/scripts/ws/remote-console-connection.js <<EOF
define([], function () {
});
EOF

cat >public/scripts/ws/main.js <<EOF
define([], function () {
});
EOF


cat >public/scripts/ws/ftp.js <<EOF
define([], function () {
});
EOF


cat >public/scripts/ws/cert-management.js <<EOF
define([], function () {
});
EOF


cat >public/scripts/ws/http-post-logger.js <<EOF
define(["exports"], function (exports) {
  exports.logger = {
    log: function(text) {
      console.log(text);
    }
  }
});
EOF


cat >public/scripts/ws/http-post-logger-config.js <<EOF
define([], function () {
});
EOF


cat >public/scripts/ws/keystore.js <<EOF
define(["exports"], function (exports) {
  exports.KeyStore = function (name) {
    console.log('Created KeyStore: ' + name);
    return {
    };
  }
});
EOF

cat >public/scripts/fs.js <<EOF
define([], function () {
});
EOF

cat >public/scripts/debug.js <<EOF
define(["exports"], function (exports) {
  exports.default = function (loggerName) {
    console.log('Created logger: ' + loggerName);
    return function (str) {
      console.log(loggerName + ": " + str);
    }
  }
});
EOF

cat >public/scripts/isomorphic-ws.js <<EOF
define(["exports"], function (exports) {
  var ws = null
  if (typeof WebSocket !== 'undefined') {
    ws = WebSocket
  } else if (typeof MozWebSocket !== 'undefined') {
    ws = MozWebSocket
  } else if (typeof global !== 'undefined') {
    ws = global.WebSocket || global.MozWebSocket
  } else if (typeof window !== 'undefined') {
    ws = window.WebSocket || window.MozWebSocket
  } else if (typeof self !== 'undefined') {
    ws = self.WebSocket || self.MozWebSocket
  }
  exports.default = ws;
});
EOF
