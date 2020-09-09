import * as https from 'https';
import {httpPostLoggerConfig} from './http-post-logger-config';

const logConfig = httpPostLoggerConfig();

class HttpPostLogger {

  private collectedLogs: Array<string> = [];

  log(loggerName: string, cpName: string, log: string | object): void {
    if (!logConfig.enabled && !logConfig.debug) {
      return;
    }
    this.collectedLogs.push(this.formatLog(loggerName, cpName, log));
    if (this.collectedLogs.length >= logConfig.batchSize) {
      this.sendLogs();
      this.collectedLogs = [];
    }
  }

  // log is actually string | object | Error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatLog(loggerName: string, cpName: string, log: any): string {
    const message = log.stack || JSON.stringify(log);
    return JSON.stringify({
      time: new Date().toISOString(),
      loggerName,
      cpName,
      message
    });
  }

  private sendLogs(): void {
    if (logConfig.debug) {
      this.collectedLogs.forEach(e => console.log(e));
    }
    if (logConfig.enabled) {
      this.sendLogsToRemote();
    }
  }

  private sendLogsToRemote(): void {
    const req = https.request(logConfig.options, (res): void => {
      if (res.statusCode !== 200) {
        console.log(`Failed to sendLogs. http status = ${res.statusCode}, headers: ${JSON.stringify(res.headers)}`);
      }
      res.on('data', (data) => {
        console.log(`Got response from log (should not happen). ${data}`);
      });
    });
    req.on('error', (e) => {
      console.log(`Error while sending logs. error = ${e}`);
    });
    this.collectedLogs.forEach(e => {
      req.write(e);
      req.write('\n');
    });
    req.end();
  }

}

export const logger = new HttpPostLogger();
