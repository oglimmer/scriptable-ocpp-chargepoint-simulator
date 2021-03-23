import * as WebSocket from 'ws';
import {RemoteConsoleTransmissionType, WSConRemoteConsole} from "./remote-console-connection";
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from "./state-service";
import {FtpSupport} from "./ftp";
import {
  AuthorizePayload,
  AuthorizeResponse,
  BootNotificationPayload,
  BootNotificationResponse,
  CertificateSignedPayload,
  ChangeAvailabilityPayload,
  ChangeConfigurationPayload,
  DataTransferPayload,
  DiagnosticsStatusNotificationPayload,
  ExtendedTriggerMessagePayload,
  FirmwareStatusNotificationPayload,
  GetConfigurationPayload,
  GetDiagnosticsPayload,
  MessageType,
  MeterValuesPayload,
  OcppRequest,
  OcppResponse,
  Payload,
  RemoteStartTransactionPayload,
  ResetPayload,
  SignCertificatePayload,
  StartTransactionPayload,
  StartTransactionResponse,
  StatusNotificationPayload,
  StopTransactionPayload,
  StopTransactionResponse,
  TriggerMessagePayload,
  UpdateFirmwarePayload,
} from './ocpp1_6';
import {CertManagement, Csr} from "./cert-management";
import {KeyStore} from "./keystore";
import * as http from "http";
import * as express from "express";
import {IRouter} from "express";
import {createHttpTerminator} from 'http-terminator';
import * as expressBasicAuth from "express-basic-auth";
import {QueueSubmitLayer} from "./queue-submit-layer";
import {log} from "./log";
import {Config} from "./config";


const LOG_NAME = 'ocpp-chargepoint-simulator:simulator:ChargepointOcpp16Json';
const LOG_NAME_OCPP = 'ocpp-chargepoint-simulator:simulator:ChargepointOcpp16Json:OCPP';

/**
 * Generates a UUID v4 - e.g. 550e8400-e29b-11d4-a716-446655440000
 * Needed for the unique-id of a OCPP request
 */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Converts an object of type OcppResponse (TypeScript) into an OCPP response (protocol) array.
 *
 * @param resp an Array representing an OCPP Response as [message-type-id, unique-id, payload]
 */
function ocppResToArray<T>(resp: OcppResponse<T>): Array<string | number | Payload> {
  return [resp.messageTypeId, resp.uniqueId, resp.payload];
}

/**
 * Defines options used when registering OCPP answers
 */
interface AnswerOptions<T> {
  requestConverter(resp: OcppRequest<T>): Promise<OcppRequest<T>>;
}

/**
 * Stores a function called when a OCPP requested asked to be answered by the simulator. Also stores options for this.
 */
interface OcppRequestWithOptions<T> {
  cb: (request: OcppRequest<T>) => void,
  options?: AnswerOptions<T>
}

/**
 * Implements an OCPP 1.6 JSON speaking Chargepoint. This is the main API for a Chargepoint.
 */
export class ChargepointOcpp16Json {

  private config: Config = new Config();

  /** Reference to the class handling the WebSocket connection to the central system  */
  private wsConCentralSystem: QueueSubmitLayer = new QueueSubmitLayer(this, this.config);

  /**
   * OCPP requests started from the central system need to be answered by code from this call.
   * This map stores all ocpp message names (action) to the callback function (with options) implementing this OCPP message.
   * */
  private registeredCallbacks: Map<string, OcppRequestWithOptions<Payload>> = new Map();
  /**
   * Special cases: "TriggerMessage", to make the implementation easier, a user can register just the code for a type of
   * trigger-message and not the whole trigger message logic
   */
  private registeredCallbacksTriggerMessage: Map<string, (OcppRequest) => void> = new Map();
  private registeredCallbacksExtendedTriggerMessage: Map<string, (OcppRequest) => void> = new Map();

  /** holds a callback for onClose, may be null */
  onCloseCb: () => void;

  constructor() {
    this.buildTriggerMessage();
    this.buildExtendedTriggerMessage();
  }

  /**
   * If connected to the CS, outputs a string or object to the remote console. If not remote console is connected, sends the output into the
   * logging backend.
   *
   * @param output string or object send to the log output console
   * @return true if log was successfully sent to remote-console, false if logged locally
   */
  log(output: (string | object)): boolean {
    if (this.areAnyRemoteConsolesConnected()) {
      this.sendMsgRemoteConsole(RemoteConsoleTransmissionType.WS_ERROR, output);
      return true;
    } else {
      log.debug(LOG_NAME, this.config.cpName ? this.config.cpName : "-", output);
      return false;
    }
  }

  /**
   * Waits the time "millies" until the Promise resolves. Will never reject.
   *
   * @param millis time to sleep in milli seconds
   */
  sleep(millis: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, millis);
    })
  }

  /**
   * Connects the WebSocket to the central system. No OCPP happening. DO NOT CALL THIS METHOD DIRECTLY.
   *
   * @param url to connect to. Must start with ws:// or ws://
   * @returns a Promise which resolves when the connection is established and rejects when the connection cannot be established.
   */
  connect(url: string, cpName?: string): Promise<void> {
    log.debug(LOG_NAME, cpName, 'connect');
    this.config.init(url, cpName);
    return this.wsConCentralSystem.connect();
  }

  /**
   * Re-connects the WebSocket to the central system. No OCPP happening.
   */
  reConnect(): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'reConnect');
    this.wsConCentralSystem.close();
    return new Promise<void>((resolve, reject) => {
      // wait before re-connect, as it takes a couple of millies until onClose() in queue-submit-layer is called
      setTimeout(async () => {
        try {
          await this.wsConCentralSystem.connect();
          resolve();
        } catch(err) {
          reject(err);
        }
      }, 1000);
    })
  }

  /**
   * Sends a OCPP heartbeat message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   */
  sendHeartbeat(): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendHeartbeat');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'Heartbeat',
      payload: {}
    });
  }

  /**
   * Sends a OCPP boot notification message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload boot notification payload object
   */
  sendBootnotification(payload: BootNotificationPayload): Promise<BootNotificationResponse> {
    log.debug(LOG_NAME, this.config.cpName, 'sendBootnotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'BootNotification',
      payload
    });
  }

  /**
   * Sends a OCPP status notification message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload status notification payload object
   */
  sendStatusNotification(payload: StatusNotificationPayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StatusNotification',
      payload
    });
  }

  /**
   * Sends a OCPP authorize message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload authorize payload object
   */
  sendAuthorize(payload: AuthorizePayload): Promise<AuthorizeResponse> {
    log.debug(LOG_NAME, this.config.cpName, 'sendAuthorize');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'Authorize',
      payload
    });
  }

  /**
   * Sends a OCPP start transaction message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload start transaction payload object
   */
  startTransaction(payload: StartTransactionPayload): Promise<StartTransactionResponse> {
    log.debug(LOG_NAME, this.config.cpName, 'sendStartTransaction');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StartTransaction',
      payload
    });
  }

  /**
   * Sends a OCPP stop transaction message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload stop transaction payload object
   */
  stopTransaction(payload: StopTransactionPayload): Promise<StopTransactionResponse> {
    log.debug(LOG_NAME, this.config.cpName, 'sendStopTransaction');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StopTransaction',
      payload
    });
  }

  /**
   * Sends a OCPP meter values message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload meter values payload object
   */
  meterValues(payload: MeterValuesPayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendMeterValues');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'MeterValues',
      payload
    });
  }

  /**
   * Sends a OCPP data transfer message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload data transfer payload object
   */
  sendDataTransfer(payload: DataTransferPayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendDataTransfer');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'DataTransfer',
      payload
    });
  }

  /**
   * Registers a function to implement logic for OCPP's Get Diagnostics message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {fileName}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<GetDiagnosticsPayload>) => void
   */
  answerGetDiagnostics<T>(cb: (request: OcppRequest<GetDiagnosticsPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerGetDiagnostics');
    this.registeredCallbacks.set("GetDiagnostics", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Update Firmware message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<UpdateFirmwarePayload>) => void
   */
  answerUpdateFirmware<T>(cb: (request: OcppRequest<UpdateFirmwarePayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerUpdateFirmware');
    this.registeredCallbacks.set("UpdateFirmware", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Reset message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {status}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ResetPayload>) => void
   */
  answerReset<T>(cb: (request: OcppRequest<ResetPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerReset');
    this.registeredCallbacks.set("Reset", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Get Configuration message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<GetConfigurationPayload>) => void
   */
  answerGetConfiguration<T>(cb: (request: OcppRequest<GetConfigurationPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerGetConfiguration');
    this.registeredCallbacks.set("GetConfiguration", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Change Configuration message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ChangeConfigurationPayload>) => void
   */
  answerChangeConfiguration<T>(cb: (request: OcppRequest<ChangeConfigurationPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerChangeConfiguration');
    this.registeredCallbacks.set("ChangeConfiguration", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Change Availability message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ChangeAvailabilityPayload>) => void
   */
  answerChangeAvailability<T>(cb: (request: OcppRequest<ChangeAvailabilityPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerChangeAvailability');
    this.registeredCallbacks.set("ChangeAvailability", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's 1.6 secured Certificate Signed message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<CertificateSignedPayload>) => void
   */
  answerCertificateSigned<T>(cb: (request: OcppRequest<CertificateSignedPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerCertificateSigned');
    this.registeredCallbacks.set("CertificateSigned", {cb, options});
  }

  /**
   * Registers a function to implement logic for start a remote transaction. The function provided must at least call
   * cp.sendResponse(request.uniqueID, {...}); to send the OCPP CALLRESULT message.
   *
   * @param cb cb callback with signature (request: OcppRequest<CertificateSignedPayload>) => void
   * @param options
   */
  answerRemoteStartTransaction<T>(cb: (request: OcppRequest<RemoteStartTransactionPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerRemoteStartTransaction');
    this.registeredCallbacks.set("RemoteStartTransaction", {cb, options});
  }

  /**
   * Registers a function to implement logic for stop a remote transaction. The function provided must at least call
   * cp.sendResponse(request.uniqueID, {...}); to send the OCPP CALLRESULT message.
   *
   * @param cb cb callback with signature (request: OcppRequest<CertificateSignedPayload>) => void
   * @param options
   */
  answerRemoteStopTransaction<T>(cb: (request: OcppRequest<RemoteStartTransactionPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerRemoteStopTransaction');
    this.registeredCallbacks.set("RemoteStopTransaction", {cb, options});
  }

  /**
   * Registers a function to implement logic for all the data tranfer operations in an lms
   *
   * @param cb
   * @param options
   */
  answerDataTransfer<T>(cb: (request: OcppRequest<DataTransferPayload>) => void, options?: AnswerOptions<T>): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerDataTransfer');
    this.registeredCallbacks.set("DataTransfer", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Trigger Message message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param requestedMessage name of trigger message
   * @param cb callback with signature (request: OcppRequest<TriggerMessagePayload>) => void
   */
  answerTriggerMessage<T>(requestedMessage: string, cb: (request: OcppRequest<TriggerMessagePayload>) => void): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerTriggerMessage');
    this.registeredCallbacksTriggerMessage.set(requestedMessage, cb);
    this.buildTriggerMessage();
  }

  /**
   * Registers a function to implement logic for OCPP's 1.6 secured Extended Trigger Message message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param requestedMessage name of trigger message
   * @param cb callback with signature (request: OcppRequest<TriggerMessagePayload>) => void
   */
  answerExtendedTriggerMessage<T>(requestedMessage: string, cb: (request: OcppRequest<ExtendedTriggerMessagePayload>) => void): void {
    log.debug(LOG_NAME, this.config.cpName, 'answerExtendedTriggerMessage');
    this.registeredCallbacksExtendedTriggerMessage.set(requestedMessage, cb);
    this.buildExtendedTriggerMessage();
  }

  /**
   * Builds the function put into this.registeredCallbacks
   */
  private buildTriggerMessage(): void {
    const cb = (request: OcppRequest<TriggerMessagePayload>): void => {
      let requestedMethodRegistered = false;
      this.registeredCallbacksTriggerMessage.forEach((cb, requestedMessage) => {
        if (request.payload.requestedMessage === requestedMessage) {
          requestedMethodRegistered = true;
          cb(request);
        }
      })
      if (!requestedMethodRegistered) {
        this.sendResponse(request.uniqueId, {status: "NotImplemented"});
      }
    };
    this.registeredCallbacks.set("TriggerMessage", {cb});
  }

  /**
   * Builds the function put into this.registeredCallbacks
   */
  private buildExtendedTriggerMessage(): void {
    const cb = (request: OcppRequest<ExtendedTriggerMessagePayload>): void => {
      let requestedMethodRegistered = false;
      this.registeredCallbacksExtendedTriggerMessage.forEach((cb, requestedMessage) => {
        if (request.payload.requestedMessage === requestedMessage) {
          requestedMethodRegistered = true;
          cb(request);
        }
      })
      if (!requestedMethodRegistered) {
        this.sendResponse(request.uniqueId, {status: "NotImplemented"});
      }
    };
    this.registeredCallbacks.set("ExtendedTriggerMessage", {cb});
  }

  /**
   * Sends a OCPP diagnostics status notification message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload diagnostics status notification payload object
   */
  sendDiagnosticsStatusNotification(payload: DiagnosticsStatusNotificationPayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendDiagnosticsStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'DiagnosticsStatusNotification',
      payload
    });
  }

  /**
   * Sends a OCPP firmware status notification message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload firmware status notification payload object
   */
  sendFirmwareStatusNotification(payload: FirmwareStatusNotificationPayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendFirmwareStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'FirmwareStatusNotification',
      payload
    });
  }

  /**
   * Sends a OCPP 1.6 secured sign certificate message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   *
   * @param payload sign certificate payload object
   */
  sendSignCertificate(payload: SignCertificatePayload): Promise<void> {
    log.debug(LOG_NAME, this.config.cpName, 'sendSignCertificate');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'SignCertificate',
      payload
    });
  }

  /**
   * Processes an incoming OCPP message
   *
   * @param ocppMessage of any messageTypeId. This is an array of either 2, 3 or 4 elements.
   */
  onMessage(ocppMessage: Array<number | string | object>): void {
    const messageTypeId = ocppMessage[0] as number;
    if (messageTypeId === MessageType.CALLRESULT || messageTypeId === MessageType.CALLERROR) {
      if (ocppMessage[1]) { // this protects against invalid messages
        this.onMessageResponse({
          messageTypeId,
          uniqueId: ocppMessage[1] as string,
          payload: ocppMessage[2] as object
        });
      }
    } else {
      this.onMessageRequest({
        messageTypeId,
        uniqueId: ocppMessage[1] as string,
        action: ocppMessage[2] as string,
        payload: ocppMessage[3] as object
      });
    }
  }

  onMessageResponse<T>(ocppResponse: OcppResponse<T>): void {
    log.debug(LOG_NAME_OCPP, this.config.cpName, ocppResponse);
    this.sendMsgRemoteConsole(RemoteConsoleTransmissionType.LOG, ocppResponse);
    this.wsConCentralSystem.triggerRequestResult(ocppResponse);
  }

  onMessageRequest<T>(ocppRequest: OcppRequest<T>): void {
    log.debug(LOG_NAME_OCPP, this.config.cpName, ocppRequest);
    this.sendMsgRemoteConsole(RemoteConsoleTransmissionType.LOG, ocppRequest);
    this.registeredCallbacks.forEach(async (ocppRequestWithOptions, action) => {
      if (action === ocppRequest.action) {
        let wrappedRequest = ocppRequest;
        if (ocppRequestWithOptions.options && ocppRequestWithOptions.options.requestConverter) {
          wrappedRequest = await ocppRequestWithOptions.options.requestConverter(ocppRequest) as OcppRequest<T>;
        }
        try {
          await ocppRequestWithOptions.cb(wrappedRequest);
        } catch (err) {
          log.debug(LOG_NAME, this.config.cpName, err);
        }
      }
    });
  }

  /**
   * Sends an OCPP message to the central system. The promise resolves when the central system sends a CALLRESULT. It rejects when the timeout is due.
   *
   * @param req OCPP request object
   */
  private sendOcpp<T, U>(req: OcppRequest<U>): Promise<T> {
    log.debug(LOG_NAME_OCPP, this.config.cpName, req);
    this.sendMsgRemoteConsole(RemoteConsoleTransmissionType.LOG, req);
    return this.wsConCentralSystem.trySendMessageOrDefer(req);
  }

  /**
   * Sends an OCPP response for a previous OCPP request
   *
   * @param uniqueId unique-id of the OCPP message
   * @param payload OCPP payload for this response
   */
  sendResponse(uniqueId: string, payload: object): void {
    log.debug(LOG_NAME, this.config.cpName, `send-back: ${uniqueId} => ${JSON.stringify(payload)}`);
    const response = {
      messageTypeId: MessageType.CALLRESULT,
      uniqueId,
      payload
    }
    this.sendMsgRemoteConsole(RemoteConsoleTransmissionType.LOG, response);
    this.wsConCentralSystem.sendResponse(ocppResToArray(response));
    log.debug(LOG_NAME_OCPP, this.config.cpName, response);
  }

  private sendMsgRemoteConsole(type: RemoteConsoleTransmissionType, payload: string | object) {
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.config.cpName);
    wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => {
      wsConRemoteConsole.add(type, payload)
    });
  }

  private areAnyRemoteConsolesConnected() {
    return wsConRemoteConsoleRepository.get(this.config.cpName).length > 0;
  }

  /**
   * Close the connection to the central system.
   */
  close(): void {
    this.wsConCentralSystem.close();
  }

  /**
   * Upload a dummy file to an FTP location. The promsie will resolve when the file is uploaded.
   *
   * @param fileLocation ftp host (and possibly user/password)
   * @param fileName ftp path and filename
   */
  ftpUploadDummyFile(fileLocation: string, fileName: string): Promise<void> {
    const ftpSupport = new FtpSupport();
    return ftpSupport.ftpUploadDummyFile(fileLocation, fileName);
  }

  /**
   * Download a file from a FTP location. The promise will resolve when the file is downloaded.
   *
   * @param fileLocation ftp host (and possibly user/password), path and filename
   */
  ftpDownload(fileLocation: string): Promise<string> {
    const ftpSupport = new FtpSupport();
    return ftpSupport.ftpDownload(fileLocation);
  }

  generateCsr(subject: string): Promise<Csr> {
    const certManagement = new CertManagement();
    return certManagement.generateCsr(subject);
  }

  convertDerToPem(derHexEncodedCert: string): Promise<string> {
    const certManagement = new CertManagement();
    return certManagement.convertDerToPem(derHexEncodedCert);
  }

  keystore(): KeyStore {
    return this.config.keyStore;
  }

  /**
   * Registers a callback function when the WebSocket to the central system is closed
   *
   * @param cb a callback function
   */
  onClose(cb: () => void): void {
    this.onCloseCb = cb;
  }

  /**
   * Starts a web listener (aka web server), usually used in batch mode only. Use the returned IRouter to add routes. Also the returned IRouter
   * instance has a method 'terminate()' to gracefully shutdown the web server.
   *
   * @param port to bind
   * @param bind address, default localhost
   * @param users when given basic authentication is enabled with user: password
   */
  startListener(port: number, bind?: string, users?: { [username: string]: string }): IRouter {
    const expressInit = express();
    expressInit.use(express.json());
    const server = http.createServer(expressInit);
    server.listen(port, bind);
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error(error);
    });
    server.on('listening', () => {
      const addr = server.address();
      log.debug(LOG_NAME, this.config.cpName, `Listening on ${JSON.stringify(addr)}`);
    });
    const httpTerminator = createHttpTerminator({server})
    expressInit['terminate'] = (): void => httpTerminator.terminate();
    if (users) {
      expressInit.use(expressBasicAuth({users}));
    }
    return expressInit;
  }

  /**
   * Gets AnswerOptions for CertificateSigned operation which converts the hex encoded DER certs to PEM encoding.
   */
  CERTIFICATE_SIGNED_OPTIONS_PEM_ENCODER(): AnswerOptions<CertificateSignedPayload> {
    return {
      async requestConverter(resp: OcppRequest<CertificateSignedPayload>): Promise<OcppRequest<CertificateSignedPayload>> {
        if (resp.payload.cert) {
          const promisesArr: Array<Promise<string>> = [];
          const certManagement = new CertManagement();
          for (let i = 0; i < resp.payload.cert.length; i++) {
            promisesArr.push(certManagement.convertDerToPem(resp.payload.cert[i]));
          }
          return Promise.all(promisesArr).then(pemEncodedCertsArray => {
            resp.payload.cert = pemEncodedCertsArray;
            return resp;
          });
        }
        else if (resp.payload.messageId == 'CertificateSigned') {
          const promisesArr: Array<Promise<string>> = [];
          const certManagement = new CertManagement();
          for (let i = 0; i < resp.payload.data.cert.length; i++) {
            promisesArr.push(certManagement.convertDerToPem(resp.payload.data.cert[i]));
          }
          return Promise.all(promisesArr).then(pemEncodedCertsArray => {
            resp.payload.data.cert = pemEncodedCertsArray;
            return resp;
          });
        }
        else {
          return Promise.resolve(resp);
        }
      }
    }
  }
}

/**
 * Returns a Promise which resolves into a new instance of ChargepointOcpp16Json. Rejects if the connection attempt fails.
 *
 * @param url WebSocket Url to connect to
 */
export function chargepointFactory(url: string, cpName?: string): Promise<ChargepointOcpp16Json> {
  const wsConCentralSystemFromRepository = wsConCentralSystemRepository.get(cpName);
  if (wsConCentralSystemFromRepository && wsConCentralSystemFromRepository.readyState === WebSocket.OPEN) {
    wsConCentralSystemFromRepository.close();
  }
  const cp = new ChargepointOcpp16Json();
  return cp.connect(url, cpName).then(() => cp);
}
