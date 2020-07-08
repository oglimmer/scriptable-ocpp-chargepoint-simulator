import Debug from 'debug';
import * as path from 'path';
import * as fs from 'fs';
import * as _eval from 'eval';
import {chargepointFactory} from './chargepoint';
import http from './http/http';
import {logger} from "./http-post-logger";

const debug = Debug('ocpp-chargepoint-simulator:main');

logger.log("ChargepointOcpp16Json:main", null, 'app started');

process.on('uncaughtException', function (err) {
  console.error((err && err.stack) ? err.stack : err);
  logger.log("ChargepointOcpp16Json:main", null, err);
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
  debug('Batch mode.');

  let javaScript : string;
  if (process.argv[2] == '--stdin') {
    javaScript = fs.readFileSync(0, 'utf-8');
  } else {
    const filename = process.argv[2];
    javaScript = fs.readFileSync(path.join(process.cwd(), filename), 'utf-8');
  }
  if (javaScript.indexOf('module.exports') == -1) {
    javaScript = "module.exports = async function(connect, logger) {\n" +
    javaScript + "\n" +
    "};"
  }
  debug(javaScript);

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  (async () => {
    try {
      const evalResp = _eval(javaScript, 'execute', {}, true);
      await evalResp(chargepointFactory, logger);
    } catch (e) {
      debug(e);
      if (!debug.enabled) {
        console.error(e);
      }
    }
  })();

} else {
  debug('Server mode.');

  http(normalizeHost(process.env.BIND), normalizePort(process.env.PORT));
}
