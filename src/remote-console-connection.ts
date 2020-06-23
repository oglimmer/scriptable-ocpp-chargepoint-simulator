import * as WebSocket from 'ws';
import http from "http";
import Debug from 'debug';
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from './state-service';

export enum RemoteConsoleTransmissionType {
  LOG,
  WS_STATUS,
  WS_ERROR
}

const debugWSConRemoteConsole = Debug('ocpp-chargepoint-simulator:simulator:WSConRemoteConsole');
const debugWSServerRemoteConsole = Debug('ocpp-chargepoint-simulator:simulator:WSServerRemoteConsole');

/**
 * Holds and manages the WS communication to the remote-console (usually a browser)
 */
export class WSConRemoteConsole {

  constructor(private readonly ws: WebSocket, private readonly cpName: string) {
    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));
    debugWSConRemoteConsole(`Registered ${cpName}`);
  }

  onMessage(message): void {
    debugWSConRemoteConsole('received: %s', message);
  };

  onClose(): void {
    debugWSConRemoteConsole('close: %s', this.cpName);
    wsConRemoteConsoleRepository.remove(this.cpName, this);
  };

  add(type: RemoteConsoleTransmissionType, payload: string | object): void {
    const connectedClients = wsConRemoteConsoleRepository.get(this.cpName);
    if (!connectedClients) {
      debugWSConRemoteConsole(`Trying to send msg to ${this.cpName} but no connected client.`);
      return;
    }
    connectedClients.forEach((e: WSConRemoteConsole) => {
      e.ws.send(JSON.stringify({
        type,
        payload
      }));
    });
  }

  updateCentralSystemConnectionStatus(): void {
    const wsConCentralSystem = wsConCentralSystemRepository.get(this.cpName);
    const wsStatus = wsConCentralSystem && wsConCentralSystem.ws.readyState == WebSocket.OPEN ? `open (${wsConCentralSystem.url})` : 'closed.';
    const wsStatusId = wsConCentralSystem ? wsConCentralSystem.id : -1;
    this.ws.send(JSON.stringify({
      type: RemoteConsoleTransmissionType.WS_STATUS, payload: {
        id: wsStatusId,
        description: wsStatus
      }
    }));
  }
}

/**
 * WebSocket Server for server to client communication with Remote-Console
 */
class WSServerRemoteConsole {

  private readonly wss: WebSocket.Server;

  constructor(host: string, port: number) {
    port++;
    this.wss = new WebSocket.Server({port, host});
    this.wss.on('connection', this.onNewConnection.bind(this));
    debugWSServerRemoteConsole(`WSServerRemoteConsole listening on ${host}:${port}`);
  };

  onNewConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const cpName = req.url.substr(1); // removing leading /
    this.createWSConRemoteConsole(ws, cpName);
  }

  private createWSConRemoteConsole(ws: WebSocket, cpName: string): void {
    const wsConRemoteConsole = new WSConRemoteConsole(ws, cpName);
    wsConRemoteConsoleRepository.add(cpName, wsConRemoteConsole);
    wsConRemoteConsole.updateCentralSystemConnectionStatus();
  }

}

export default function createWSServerRemoteConsole(host: string, port: number): void {
  new WSServerRemoteConsole(host, port);
}
