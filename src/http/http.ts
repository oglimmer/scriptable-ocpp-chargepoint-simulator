import * as http from "http";
import Debug from 'debug';
import {expressInit} from "./express-init";
import createWSServerRemoteConsole from "../remote-console-connection";

const debug = Debug('ocpp-chargepoint-simulator:express:http');

export default (port: any) => {

  const server = http.createServer(expressInit);

  expressInit.set('port', port);

  server.listen(port);
  server.on('error', onError);
  server.on('listening', onListening);

  createWSServerRemoteConsole();

  function onError(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof port === 'string'
      ? 'Pipe ' + port
      : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  }

  function onListening() {
    const addr = server.address();
    const bind = typeof addr === 'string'
      ? 'pipe ' + addr
      : 'port ' + addr.port;
    debug('Listening on ' + bind);
  }

}
