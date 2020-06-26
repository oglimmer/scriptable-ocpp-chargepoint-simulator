import * as util from 'util';
import * as execLib from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

const exec = util.promisify(execLib.exec);

/**
 *
 */
export interface Csr {
  key: string,
  csr: string
}

export class CertManagement {

  async generateCsr(subject: string): Promise<Csr> {
    // generate a key
    const key = await exec('openssl ecparam -name secp256r1 -genkey').then(e => e.stdout);
    // create a UNIX named pipe in the tmp directory
    const tmpNamedUnixPipe = os.tmpdir() + '/socps-' + Math.random().toString(36).substring(7);
    await exec(`mkfifo ${tmpNamedUnixPipe}`);
    // create the CSR, use a Unix Named pipe to read the key (usig /dev/stdin doesn't work on Ubuntu, so we need a named pipe)
    return new Promise<Csr>((resolve, reject) => {
      execLib.exec(`openssl req -new -key ${tmpNamedUnixPipe} -subj "${subject}"`, ((error, stdout, stderr) => {
        fs.unlink(tmpNamedUnixPipe, err => { if (err) {console.error(err)}});
        if (error) {
          reject(error);
        } else if (stderr) {
          reject(stderr);
        } else {
          resolve({key: key, csr: stdout});
        }
      }));
      const wstream = fs.createWriteStream(tmpNamedUnixPipe);
      wstream.write(key);
      wstream.end();
    });
  }

  /**
   * Returns a PEM encoded certificate.
   *
   * @param derHexEncodedCert hex encoded DER certificate
   */
  async convertDerToPem(derHexEncodedCert: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = execLib.exec(`openssl x509 -inform DER -outform PEM`, ((error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else if (stderr) {
          reject(stderr);
        } else {
          resolve(stdout);
        }
      }));
      child.stdin.write(Buffer.from(derHexEncodedCert, 'hex'));
    });
  }

}

