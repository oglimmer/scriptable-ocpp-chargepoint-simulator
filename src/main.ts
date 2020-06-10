import Debug from 'debug';
import * as path from 'path';
import {chargepointFactory, ChargepointFactoryType} from './chargepoint';
import http from './http/http';

const debug = Debug('ocpp-chargepoint-simulator:main');

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

  interface EntryPoint {
    (chargepointFactory: ChargepointFactoryType): void;
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  (async () => {
    try {
      const filename = process.argv[2];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const entryPoint: EntryPoint = require(path.join(process.cwd(), filename));
      await entryPoint(chargepointFactory);
    } catch (e) {
      debug(e);
    }
  })();

} else {
  debug('Server mode.');

  http(normalizeHost(process.env.BIND), normalizePort(process.env.PORT));
}
