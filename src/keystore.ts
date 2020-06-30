import * as fs from 'fs';
import * as path from 'path';

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
    if (element && element[0]) {
      return element[0];
    }
    return undefined;
  }

  private setKey(key: string): void {
    const element = this.data.filter(e => e.id == this.cpName);
    if (element && element[0]) {
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
    if (element && element[0]) {
      element[0].cert = cert;
    } else {
      const newElement = {} as KeyStoreElement;
      newElement.id = this.cpName;
      newElement.cert = cert;
      this.data.push(newElement);
    }
  }

  save(namePostfix: string | boolean, key: string, cert: string): Array<string> {
    let basePath: string;
    if (process.env.SSL_CLIENT_KEYSTORE_ROOT) {
      basePath = process.env.SSL_CLIENT_KEYSTORE_ROOT;
    } else {
      basePath = path.join(__dirname, '../');
    }
    let certFilename, keyFilename;
    if (namePostfix === false) {
      const element = this.data.filter(e => e.id == this.cpName);
      if (element && element[0]) {
        keyFilename = path.join(element[0].key);
        certFilename = path.join(element[0].cert);
      }
    }
    if (!keyFilename) {
      keyFilename = path.join(basePath, `${this.cpName}${namePostfix}.key`);
    }
    if (!certFilename) {
      certFilename = path.join(basePath, `${this.cpName}${namePostfix}.cert`);
    }
    fs.writeFileSync(keyFilename, key);
    fs.writeFileSync(certFilename, cert);
    this.setKey(keyFilename);
    this.setCert(certFilename);
    return [keyFilename, certFilename];
  }
}
