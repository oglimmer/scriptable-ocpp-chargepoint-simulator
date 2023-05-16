import * as path from 'path';
import * as fs from 'fs';
import * as _eval from 'eval';
import {chargepointFactory} from './chargepoint';
import http from './http/http';
import axios from 'axios';
import * as FormData from 'form-data';
import {log} from "./log";

const LOG_NAME = 'ocpp-chargepoint-simulator:main';

process.on('uncaughtException', function (err) {
  console.error((err && err.stack) ? err.stack : err);
  log.debug(LOG_NAME, '-', err);
});

function normalizeHost(val = 'localhost'): string {
  return val;
}

function normalizePort(val = '3000'): number | string {
  const port = parseInt(val, 10);
  if (isNaN(port)) {
    return val; // named pipe
  }
  if (port >= 0) {
    return port; // port number
  }
  throw Error(`Failed to normalizePort ${val}`);
}

if (process.argv[2]) {
  log.configure({
    remote: true,
    stdout: true,
    stdoutLogger: false
  });
  log.debug(LOG_NAME, '-', 'Batch mode.');

  let javaScript: string;
  if (process.argv[2] == '--stdin') {
    javaScript = fs.readFileSync(0, 'utf-8');
  } else {
    const filename = process.argv[2];
    javaScript = fs.readFileSync(path.join(process.cwd(), filename), 'utf-8');
  }
  if (javaScript.indexOf('module.exports') == -1) {
    javaScript = "module.exports = async function(connect, logger, axios) {\n" +
    javaScript + "\n" +
    "};"
  }
  log.debug(LOG_NAME, '-', javaScript);

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  (async () => {
    try {
      const evalResp = _eval(javaScript, 'execute', {}, true);
      axios["FormData"] = FormData; // to post multipart/form-data FormData lib is needed, make it easy to access here
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      await evalResp(chargepointFactory, log, axios);
    } catch (e) {
      console.log(e);
      log.debug(LOG_NAME, '-', e);
    }
  })();

} else {
  log.configure({
    remote: false,
    stdout: false,
    stdoutLogger: true
  });
  log.debug(LOG_NAME, '-', 'Server mode.');

  http(normalizeHost(process.env.BIND), normalizePort(process.env.PORT));
}
