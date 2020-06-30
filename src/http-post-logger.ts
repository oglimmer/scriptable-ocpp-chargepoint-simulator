import * as https from 'https';
import * as httpPostLoggerConfig from './http-post-loggers-config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Debug from 'debug';

interface Config {
  enabled: boolean,
  batchSize: number,
  options: object
}

const debug = Debug('ocpp-chargepoint-simulator:simulator:HttpPostLogger');
const logConfig = httpPostLoggerConfig(fs, path, os) as Config;
debug(`Remote logging is ${logConfig.enabled}`);

class HttpPostLogger {

  private collectedLogs: Array<string> = [];

  log(loggerName: string, cpName: string, log: string | object): void {
    if (!logConfig.enabled) {
      return;
    }
    this.collectedLogs.push(this.formatLog(loggerName, cpName, log));
    if (this.collectedLogs.length >= logConfig.batchSize) {
      this.sendLogs();
      this.collectedLogs = [];
    }
  }

  private formatLog(loggerName: string, cpName: string, log: string | object): string {
    return JSON.stringify({
      time: new Date().toISOString(),
      loggerName,
      cpName,
      message: JSON.stringify(log)
    });
  }

  private sendLogs(): void {
    const req = https.request(logConfig.options, (res) => {
      if (res.statusCode !== 200) {
        debug(`Failed to sendLogs. http status = ${res.statusCode}, headers: ${JSON.stringify(res.headers)}`);
      }
      res.on('data', (data) => {
        debug(`Got response from log (should not happen). ${data}`);
      });
    });
    req.on('error', (e) => {
      debug(`Error while sending logs. error = ${e}`);
    });
    this.collectedLogs.forEach(e => {
      req.write(e);
      req.write('\n');
    });
    req.end();
  }

}

export const logger = new HttpPostLogger();
