import * as WebSocket from 'ws';
import * as fs from 'fs';
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

  constructor(readonly id: number, readonly url: string, readonly api: ChargepointOcpp16Json, readonly cpName?: string) {
    if (!this.cpName) {
      this.cpName = this.url.substr(this.url.lastIndexOf('/') + 1);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {} as WebSocket.ClientOptions;
      if (this.url.startsWith('wss://')) {
        debug(`Secure connection detected: ${this.url}`);
        const keyStoreElement = this.api.keyStore.get();
        debug(`Using files: ${JSON.stringify(keyStoreElement)}`);
        if (keyStoreElement) {
          options.key = fs.readFileSync(keyStoreElement.key);
          options.cert = fs.readFileSync(keyStoreElement.cert);
        }
      }
      this.ws = new WebSocket(this.url, "ocpp1.6", options);
      let promiseResolved = false;
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.cpName);
      this.ws.on('open', () => {
        debug(`Backend WS open. ${this.url}`);
        wsConRemoteConsoleArr.forEach(wsConRemoteConsole => {
          wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_STATUS, {
            id: this.id,
            description: `open (${this.url})`
          });
        });
        resolve();
        promiseResolved = true;
      })
      this.ws.on('message', (data: string) => {
        const ocppMessage = JSON.parse(data);
        this.api.onMessage(ocppMessage);
      });
      this.ws.on('close', () => {
        debug(`Backend WS closed. ${this.url}`);
        if (this.api.onCloseCb) {
          this.api.onCloseCb();
        }
        wsConRemoteConsoleArr.forEach(wsConRemoteConsole => {
          wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_STATUS, {
            id: this.id,
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
