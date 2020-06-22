import * as util from 'util';
import * as execLib from 'child_process';
import * as stream from 'stream';

const exec = util.promisify(execLib.exec);


/**
 *
 */
export interface Csr {
  key: string,
  csr: string
}

export class CertManagement {

  async generateCsr(cpName: string): Promise<Csr> {
    const key = await exec('openssl genrsa').then(e => e.stdout);
    return new Promise<any>((resolve, reject) => {
      const child = execLib.exec(`openssl req -new -key /dev/stdin -subj "/C=DE/ST=Hessen/L=Frankfurt/O=Ocpp-Simulator/OU=Ocpp-Simulator/CN=${cpName}"`, ((error, stdout, stderr) => {
        if (error) {
          reject(error);
        }
        resolve({key: key, csr: stderr ? stderr : stdout});
      }));
      const stdinStream = new stream.Readable();
      stdinStream.push(key);
      stdinStream.push(null);
      stdinStream.pipe(child.stdin);
    })
  }
}

