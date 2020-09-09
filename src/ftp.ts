import * as PromiseFtp from "promise-ftp";
import * as fs from 'fs';
import {log} from "./log";

const LOG_NAME = 'ocpp-chargepoint-simulator:simulator:ftp-support';

interface FtpParameters {
  user: string;
  password: string;
  host: string;
  localPath: string;
  remotePath: string;
  fileName: string;
}

export class FtpSupport {

  ftpUploadDummyFile(fileLocation: string, fileName: string): Promise<void> {
    const {user, password, host, remotePath, localPath} = this.extracted(fileLocation, false);
    fs.writeFileSync(localPath + "/" + fileName, "Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.");
    const ftp = new PromiseFtp();
    return ftp.connect({host, user, password})
      .then(() => ftp.put(localPath + "/" + fileName, remotePath + "/" + fileName))
      .then(() => {
        ftp.end(); // if we return this Promise, (at least locally) it will never resolve/reject
      });
  }

  ftpDownload(fileLocation: string): Promise<string> {
    const {user, password, host, localPath, remotePath, fileName} = this.extracted(fileLocation, true);
    const ftp = new PromiseFtp();
    return ftp.connect({host, user, password})
      .then(() => ftp.get(remotePath + "/" + fileName))
      .then((stream) => {
        return new Promise((resolve, reject) => {
          stream.once('close', resolve);
          stream.once('error', reject);
          stream.pipe(fs.createWriteStream(localPath + "/" + fileName));
        });
      })
      .then(() => {
        ftp.end();
      })
      .then(() => localPath + "/" + fileName);
  }

  private extracted(fileLocation: string, withFilename: boolean): FtpParameters {
    let fileLocTmp = fileLocation.substr("ftp://".length);
    const user = fileLocTmp.substr(0, fileLocTmp.indexOf(':'));
    fileLocTmp = fileLocTmp.substr(fileLocTmp.indexOf(':') + 1);
    const password = fileLocTmp.substr(0, fileLocTmp.indexOf('@'));
    fileLocTmp = fileLocTmp.substr(fileLocTmp.indexOf('@') + 1);
    let fileName = '';
    let remotePath = '';
    let host;
    if (fileLocTmp.indexOf('/') > -1) {
      host = fileLocTmp.substr(0, fileLocTmp.indexOf('/'));
      fileLocTmp = fileLocTmp.substr(fileLocTmp.indexOf('/') + 1);
      if (withFilename) {
        if (fileLocTmp.indexOf('/') > -1) {
          remotePath = fileLocTmp.substr(0, fileLocTmp.lastIndexOf('/'));
          fileLocTmp = fileLocTmp.substr(fileLocTmp.lastIndexOf('/') + 1);
          fileName = fileLocTmp;
        } else {
          fileName = fileLocTmp;
        }
      } else {
        remotePath = fileLocTmp;
      }
    } else {
      host = fileLocTmp;
    }
    const localPath = fs.mkdtempSync('ocpp-simulator') + '/' + remotePath;
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, {recursive: true});
    }
    log.debug(LOG_NAME, '-', `ftp credentials: user=${user}, password.length=${password.length}, host=${host}, fileName=${fileName}, remotePath=${remotePath}, localPath=${localPath}`);
    return {user, password, host, localPath, fileName, remotePath};
  }

}
