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
  readonly cpName: string;
  onCloseCb: () => void;

  constructor(readonly url: string, readonly api: ChargepointOcpp16Json) {
    this.cpName = url.substr(url.lastIndexOf('/') + 1);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {} as WebSocket.ClientOptions;
      if (this.url.startsWith('wss://')) {
        if (process.env.SSL_CLIENT_KEY_FILE) {
          options.key = fs.readFileSync(process.env.SSL_CLIENT_KEY_FILE);
        }
        if (process.env.SSL_CLIENT_CERT_FILE) {
          options.cert = fs.readFileSync(process.env.SSL_CLIENT_CERT_FILE);
        }
      }
      this.ws = new WebSocket(this.url, "ocpp1.6", options);
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
        if (this.onCloseCb) {
          this.onCloseCb();
        }
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

  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

}
