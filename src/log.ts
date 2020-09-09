import Debug from 'debug';
import {logger} from './http-post-logger';

const format = (log: string | object): string => {
  if (typeof log === 'string') {
    return log;
  } else {
    return JSON.stringify(log);
  }
}

export class Log {

  private logFunctions = [];

  configure({remote, stdoutLogger, stdout}) {
    if (remote) {
      this.logFunctions.push((loggerName: string, cpName: string, log: string | object) => {
        logger.log(loggerName, cpName, log);
      });
    }
    if (stdoutLogger) {
      this.logFunctions.push((loggerName: string, cpName: string, log: string | object) => {
        const debug = Debug(loggerName);
        debug(`${cpName}: ${format(log)}`);
      });
    }
    if (stdout) {
      this.logFunctions.push((loggerName: string, cpName: string, log: string | object) => {
        console.log(`${loggerName}: ${cpName}: ${format(log)}`);
      });
    }
  }

  debug(loggerName: string, cpName: string, log: string | object) {
    this.logFunctions.forEach(logFunction => logFunction(loggerName, cpName, log));
  }

}

export const log = new Log();
