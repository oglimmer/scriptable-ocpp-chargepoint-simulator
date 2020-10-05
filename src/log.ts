import Debug from 'debug';
import {logger} from './http-post-logger';

function refReplacer() {
  let m = new Map(), v= new Map(), init = null;

  return function(field, value) {
    let p= m.get(this) + (Array.isArray(this) ? `[${field}]` : '.' + field);
    let isComplex= value===Object(value)

    if (isComplex) m.set(value, p);

    let pp = v.get(value)||'';
    let path = p.replace(/undefined\.\.?/,'');
    let val = pp ? `#REF:${pp[0]=='[' ? '$':'$.'}${pp}` : value;

    !init ? (init=value) : (val===init ? val="#REF:$" : 0);
    if(!pp && isComplex) v.set(value, path);

    return val;
  }
}

const format = (log: string | object): string => {
  if (typeof log === 'string') {
    return log;
  } else {
    return JSON.stringify(log, refReplacer());
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
