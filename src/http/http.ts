import * as http from "http";
import {expressInit} from "./express-init";
import createWSServerRemoteConsole from "../remote-console-connection";
import {log} from "../log";

const LOG_NAME = 'ocpp-chargepoint-simulator:express:http';


export default (bind: string, port: (number | string)): void => {

  expressInit.set('port', port);
  expressInit.set('bind', bind);

  const server = http.createServer(expressInit);

  function onError(error: NodeJS.ErrnoException): void {
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

  function onListening(): void {
    const addr = server.address();
    const bind = typeof addr === 'string'
      ? 'pipe ' + addr
      : `(${addr.family}) ${addr.address}:${addr.port}`;
    log.debug(LOG_NAME, '-', 'Listening on ' + bind);
  }

  if (typeof port === 'string') {
    server.listen(port);
    log.debug(LOG_NAME, '-', 'Could not start WSServerRemoteConsole as server is using pipe bind');
  } else {
    server.listen(port, bind);
    createWSServerRemoteConsole(bind, port);
  }
  server.on('error', onError);
  server.on('listening', onListening);

}
