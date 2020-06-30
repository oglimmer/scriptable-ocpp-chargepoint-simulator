
export const httpPostLoggerConfig = () => ({
  enabled: false,
  batchSize: 100,
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
