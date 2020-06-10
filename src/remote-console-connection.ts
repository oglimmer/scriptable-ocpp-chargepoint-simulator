import * as WebSocket from 'ws';
import http from "http";
import Debug from 'debug';
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from './state-service';

/**
 * WebSocket Server for server to client communication with Remote-Console
 */
class WSServerRemoteConsole {

  private readonly wss: WebSocket.Server;

  debug = Debug('ocpp-chargepoint-simulator:simulator:WSServerRemoteConsole');

  constructor() {
    const port = parseInt(process.env.PORT) + 1 || 3001;
    this.wss = new WebSocket.Server({port});
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      this.onNewConnection(ws, req);
    });
    this.debug(`WSServerRemoteConsole listening on ${port}`);
  };

  onNewConnection(ws: WebSocket, req: http.IncomingMessage) {
    const cpName = req.url.substr(1); // removing leading /
    let wsConRemoteConsole = new WSConRemoteConsole(ws, cpName);
    wsConRemoteConsoleRepository.add(cpName, wsConRemoteConsole);
    const wsConCentralSystem = wsConCentralSystemRepository.get(cpName);
    const wsStatus = wsConCentralSystem && wsConCentralSystem.ws.readyState == WebSocket.OPEN ? `open (${wsConCentralSystem.url})` : 'closed.';
    const wsStatusId = wsConCentralSystem ? wsConCentralSystem.api.id : -1;
    ws.send(JSON.stringify({type: RemoteConsoleTransmissionType.WS_STATUS, payload: {
        id: wsStatusId,
        description: wsStatus
    }}));
  }
}

/**
 * Holds and manages the WS communication to the remote-console (usually a browser)
 */
export class WSConRemoteConsole {

  debug = Debug('ocpp-chargepoint-simulator:simulator:WSConRemoteConsole');

  constructor(private readonly ws: WebSocket, private readonly cpName: string) {
    ws.on('message', (message) => {
      this.onMessage(message);
    });
    ws.on('close', (message) => {
      this.onClose(message);
    });
    this.debug(`Registered ${cpName}`);
  }

  onMessage(message) {
    this.debug('received: %s', message);
  };

  onClose(message) {
    this.debug('close: %s', this.cpName);
    wsConRemoteConsoleRepository.remove(this.cpName, this);
  };

  add(type: RemoteConsoleTransmissionType, payload: any) {
    const connectedClients = wsConRemoteConsoleRepository.get(this.cpName);
    if (!connectedClients) {
      this.debug(`Trying to send msg to ${this.cpName} but no connected client.`);
      return;
    }
    connectedClients.forEach((e: WSConRemoteConsole) => {
      e.ws.send(JSON.stringify({
        type,
        payload
      }));
    });
  }

}

export enum RemoteConsoleTransmissionType {
  LOG,
  WS_STATUS,
  WS_ERROR
}

export default function createWSServerRemoteConsole() {
  new WSServerRemoteConsole();
}
