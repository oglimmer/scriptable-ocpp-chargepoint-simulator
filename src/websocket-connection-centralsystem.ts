import * as WebSocket from 'ws';
import Debug from 'debug';
import {wsConRemoteConsoleRepository} from "./state-service";
import {RemoteConsoleTransmissionType} from "./remote-console-connection";
import {ChargepointOcpp16Json} from "./chargepoint";

const debug = Debug('ocpp-chargepoint-simulator:simulator:WSConCentralSystem');

/**
 * Holds and manages the WS communication to the central system
 */
export class WSConCentralSystem{

  ws: WebSocket;
  readonly cpName: string;

  constructor(readonly url: string, readonly api: ChargepointOcpp16Json) {
    this.cpName = url.substr(url.lastIndexOf('/') + 1);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      let promiseResolved = false;
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.cpName);
      this.ws.on('open', () => {
        debug(`Backend WS open. ${this.url}`);
        wsConRemoteConsoleArr.forEach(wsConRemoteConsole => {
          wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_STATUS, {
            id: this.api.id,
            description: `open (${this.url})`
          });
        });
        resolve();
        promiseResolved = true;
      })
      this.ws.on('message', (data: string) => this.api.onMessage(data));
      this.ws.on('close', () => {
        debug(`Backend WS closed. ${this.url}`);
        wsConRemoteConsoleArr.forEach(wsConRemoteConsole => {
          wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_STATUS, {
            id: this.api.id,
            description: "closed."
          });
        })
      })
      this.ws.on('error', (event) => {
        debug(`Backend WS got error: ${event}`);
        if(!promiseResolved) {
          reject(event);
        } else {
          wsConRemoteConsoleArr.forEach(wsConRemoteConsole => {
            wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_ERROR, event);
          });
        }
      })
    })
  }

  send(data: string): void {
    debug(`send: ${data}`);
    this.ws.send(data);
  }

  close(): void {
    this.ws.close();
  }

}
