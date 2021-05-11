import {KeyStore} from "./keystore";

export class Config {

  keyStore: KeyStore;
  url: string;
  cpName?: string;
  sendRecurringHeartbeats: boolean;
  sendRecurringMeterValues: boolean;
  currentMeterValue: number;
  currentChargepointStatus: string;

  init(url: string, cpName?: string) {
    this.url = url;
    if (cpName) {
      this.cpName = cpName;
    } else {
      this.cpName = this.url.substr(this.url.lastIndexOf('/') + 1);
    }
    this.keyStore = new KeyStore(this.cpName);
    this.sendRecurringHeartbeats = true;
    this.sendRecurringMeterValues = false;
    this.currentMeterValue = 0;
  }

}
