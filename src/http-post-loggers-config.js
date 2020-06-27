// fs is like: const fs = require('fs');
module.exports = fs => ({
  enabled: false,
  options: {
    hostname: '...',
    port: 443,
    path: '...',
    method: 'POST',
    // key: fs.readFileSync('....'),
    // cert: fs.readFileSync('...'),
    headers: {
      'Content-Type': 'application/json'
    }
  }
});
