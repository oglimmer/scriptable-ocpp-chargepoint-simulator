import {WSConRemoteConsole} from "./remote-console-connection";
import {QueueSubmitLayer} from "./queue-submit-layer";

/**
 * Holds WebSocket connections to 1...n remote-consoles per cp-name
 */
class StateServiceWsConRemoteConsole {

  private store: Map<string, Array<WSConRemoteConsole>> = new Map();

  public add(cpName: string, wsConRemoteConsole: WSConRemoteConsole): void {
    let arr = this.store.get(cpName);
    if (!arr) {
      arr = [];
      this.store.set(cpName, arr);
    }
    arr.push(wsConRemoteConsole);
  }

  public get(cpName: string): Array<WSConRemoteConsole> {
    const arr = this.store.get(cpName);
    if (!arr) {
      return [];
    }
    return arr;
  }

  public getAll(): Array<Array<WSConRemoteConsole>> {
    return Array.from(this.store.values());
  }

  public remove(cpName: string, wsConRemoteConsole: WSConRemoteConsole): void {
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

  private store: Map<string, QueueSubmitLayer> = new Map();

  public set(cpName: string, value: QueueSubmitLayer): void {
    this.store.set(cpName, value);
  }

  public get(cpName: string): QueueSubmitLayer {
    return this.store.get(cpName);
  }

  public getAll(): Array<QueueSubmitLayer> {
    return Array.from(this.store.values());
  }

  public remove(cpName: string): void {
    this.store.delete(cpName);
  }

}

export const wsConCentralSystemRepository = new StateServiceWsConCentralSystem();
