
interface Config {
  enabled: boolean,
  batchSize: number,
  debug: boolean,
  options: object
}

export const httpPostLoggerConfig = (): Config => ({
  enabled: false,
  batchSize: 1,
  debug: false,
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
