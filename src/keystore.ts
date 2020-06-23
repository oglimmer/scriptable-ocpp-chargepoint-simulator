import * as fs from 'fs';

/**
 * KeyStoreElement, Holds id (usually the cp-name), key filename, cert filename.
 */
export interface KeyStoreElement {
  id: string,
  key: string,
  cert: string
}

/**
 * Holds all key/certs for all charge points. Takes the initial data from the environment variable SSL_CLIENT_KEYSTORE
 * (JSON).
 */
export class KeyStore {
  private data: Array<KeyStoreElement>;

  constructor(readonly cpName: string) {
    if(process.env.SSL_CLIENT_KEYSTORE) {
      this.data = JSON.parse(process.env.SSL_CLIENT_KEYSTORE);
    } else {
      this.data = [];
    }
  }

  get(): KeyStoreElement {
    const element = this.data.filter(e => e.id == this.cpName);
    if (element) {
      return element[0];
    }
    return undefined;
  }

  set(key: string, cert: string): void {
    this.setKey(key);
    this.setCert(cert);
  }

  private setKey(key: string): void {
    const element = this.data.filter(e => e.id == this.cpName);
    if (element) {
      element[0].key = key;
    } else {
      const newElement = {} as KeyStoreElement;
      newElement.id = this.cpName;
      newElement.key = key;
      this.data.push(newElement);
    }
  }

  private setCert(cert: string): void {
    const element = this.data.filter(e => e.id == this.cpName);
    if (element) {
      element[0].cert = cert;
    } else {
      const newElement = {} as KeyStoreElement;
      newElement.id = this.cpName;
      newElement.cert = cert;
      this.data.push(newElement);
    }
  }

  save(namePostfix: string): void {
    const element = this.data.filter(e => e.id == this.cpName);
    if (element) {
      fs.writeFileSync(`/tmp/${this.cpName}${namePostfix}.key`, element[0].key);
      fs.writeFileSync(`/tmp/${this.cpName}${namePostfix}.cert`, element[0].cert);
    }
  }
}
