import Debug from 'debug';
import * as path from 'path';
import {chargepointFactory, ChargepointFactoryType} from './chargepoint';
import http from './http/http';

const debug = Debug('ocpp-chargepoint-simulator:main');

if(process.argv[2]) {
  debug('Batch mode.');

  interface EntryPoint {
    (chargepointFactory: ChargepointFactoryType): void;
  }

  (async () => {
    try {
      const filename = process.argv[2];
      const entryPoint: EntryPoint = require(path.join(process.cwd(), filename));
      await entryPoint(chargepointFactory);
    } catch (e) {
      debug(e);
    }
  })();

} else {
  debug('Server mode.');

  function normalizePort(val: any) {
    const port = parseInt(val, 10);
    if (isNaN(port)) {
      return val; // named pipe
    }
    if (port >= 0) {
      return port; // port number
    }
    return false;
  }

  http(normalizePort(process.env.PORT || '3000'));

}
