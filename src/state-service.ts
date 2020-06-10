import {WSConRemoteConsole} from "./remote-console-connection";
import {WSConCentralSystem} from "./websocket-connection-centralsystem";

/**
 * Holds WebSocket connections to 1...n remote-consoles per cp-name
 */
class StateServiceWsConRemoteConsole {

  private store: Map<string, Array<WSConRemoteConsole>> = new Map();

  public add(cpName: string, wsConRemoteConsole: WSConRemoteConsole): void {
    let arr = this.store.get(cpName);
    if (!arr) {
      arr = new Array();
      this.store.set(cpName, arr);
    }
    arr.push(wsConRemoteConsole);
  }

  public get(cpName: string): Array<WSConRemoteConsole> {
    const arr = this.store.get(cpName);
    if(!arr) {
      return [];
    }
    return arr;
  }

  public remove(cpName: string, wsConRemoteConsole: WSConRemoteConsole) {
    const arr = this.store.get(cpName);
    if (arr) {
      const newArr = arr.filter(e => e !== wsConRemoteConsole);
      if (newArr.length == 0) {
        this.store.delete(cpName);
      } else {
        this.store.set(cpName, newArr);
      }
    }
  }
}

export const wsConRemoteConsoleRepository = new StateServiceWsConRemoteConsole();

/**
 * Holds WebSocket connections to 1 central system per cp-name
 */
class StateServiceWsConCentralSystem {

  private store: Map<string, WSConCentralSystem> = new Map();

  public set(cpName: string, value: WSConCentralSystem): void {
    this.store.set(cpName, value);
  }

  public get(cpName: string): WSConCentralSystem {
    return this.store.get(cpName);
  }

  public remove(cpName: string) {
    return this.store.delete(cpName);
  }

}

export const wsConCentralSystemRepository = new StateServiceWsConCentralSystem();
