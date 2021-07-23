import {KeyStore, KeyStoreElement} from "./keystore";

export class Config {

  keyStore: KeyStore;
  url: string;
  cpName?: string;

  init(url: string, cpName?: string, keyStoreElement?: KeyStoreElement) {
    this.url = url;
    if (cpName) {
      this.cpName = cpName;
    } else {
      this.cpName = this.url.substr(this.url.lastIndexOf('/') + 1);
    }
    this.keyStore = new KeyStore(this.cpName);
    if (keyStoreElement) {
      this.keyStore.add(keyStoreElement);
    }
  }

}
