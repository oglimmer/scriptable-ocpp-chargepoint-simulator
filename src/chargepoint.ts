import Debug from 'debug';
import * as WebSocket from 'ws';
import {RemoteConsoleTransmissionType, WSConRemoteConsole} from "./remote-console-connection";
import {WSConCentralSystem} from "./websocket-connection-centralsystem";
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
  ResetPayload,
  SignCertificatePayload,
  StartTransactionPayload,
  StartTransactionResponse,
  StatusNotificationPayload,
  StopTransactionPayload,
  StopTransactionResponse,
  TriggerMessagePayload,
  UpdateFirmwarePayload
} from "./ocpp1_6";
import {CertManagement, Csr} from "./cert-management";
import {KeyStore} from "./keystore";
import {logger} from './http-post-logger';
import * as http from "http";
import * as express from "express";
import {IRouter} from "express";
import {createHttpTerminator} from 'http-terminator';
import * as expressBasicAuth from "express-basic-auth";

/**
 * Logger defintion
 */
const debug = Debug('ocpp-chargepoint-simulator:simulator:ChargepointOcpp16Json');

/** Counter to give each instance of ChargepointOcpp16Json a unique ID */
// this is needed as the front-end knows only one (and only exactly one) instance, so the FE need to find the
// latest instance (using the highest ID)
let connectCounter = 0;

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
 * Converts an object of type OcppRequest (TypeScript) into an OCPP request (protocol) array.
 *
 * @param req an Array representing an OCPP Request as [message-type-id, unique-id, action, payload]
 */
function ocppReqToArray<T>(req: OcppRequest<T>): Array<string | number | Payload> {
  return [req.messageTypeId, req.uniqueId, req.action, req.payload];
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
 * Stores an origin request of type OcppRequest and a callback function of type Payload.
 * To sychronize the OCPP response with it's original request, we store object of this type when
 * a request is done. When the response comes eventually we use the callback to pass it back to the
 * caller of the request.
 */
interface MessageListenerElement<T> {
  request: OcppRequest<T>;

  next(resp: Payload): void;
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

  /**
   * Defines the time in milli seconds for the request-response timeout of OCPP messages.
   */
  private readonly RESPONSE_TIMEOUT = 15000;

  keyStore: KeyStore;

  /** Reference to the class handling the WebSocket connection to the central system  */
  private wsConCentralSystem: WSConCentralSystem;

  /** OCPP doesn't allow to send more than 1 message at a time. This queues messages until the last is answered. */
  private readonly deferredMessageQueue: Array<Array<number | string | object>> = [];
  /** Determines if a new message can be sent  */
  private isCurrentlyRequestNotAnswered = false;
  /** Holds all requests currently not answered with a response. Within a tick this might be out of sync with isCurrentlyRequestNotAnswered  */
  private registeredOpenRequests: Array<MessageListenerElement<Payload>> = [];

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
   * Outputs a string or object to the log console.
   *
   * @param output string or object send to the log output console
   */
  log(output: (string | object)): void {
    if (this.wsConCentralSystem) {
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_ERROR, output));
    } else {
      console.log('Failed to send log to remote-console');
      console.log(output);
    }
  }

  /**
   * Send the output to a remote logger (connected by http-post-logger) and the log console.
   *
   * @param output string or object send to the remote log and the console log
   */
  logRemote(output: (string | object)): void {
    this.log(output);
    logger.log("ChargepointOcpp16Json:logRemote", this.wsConCentralSystem ? this.wsConCentralSystem.cpName : null, output);
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
    debug('connect');
    this.wsConCentralSystem = new WSConCentralSystem(connectCounter++, url, this, cpName);
    this.keyStore = new KeyStore(this.wsConCentralSystem.cpName);
    return this.wsConCentralSystem.connect();
  }

  reConnect(): Promise<void> {
    debug('reConnect');
    this.wsConCentralSystem.close();
    this.wsConCentralSystem = new WSConCentralSystem(connectCounter++, this.wsConCentralSystem.url, this, this.wsConCentralSystem.cpName);
    return this.wsConCentralSystem.connect();
  }
  /**
   * Sends a OCPP heartbeat message. The Promise resolves when the related OCPP response is received and rejects when no response is
   * received within the timeout period.
   */
  sendHeartbeat(): Promise<void> {
    debug('sendHeartbeat');
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
    debug('sendBootnotification');
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
    debug('sendStatusNotification');
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
    debug('sendAuthorize');
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
    debug('sendStartTransaction');
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
    debug('sendStopTransaction');
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
    debug('sendMeterValues');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'MeterValues',
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
    debug('answerGetDiagnostics');
    this.registeredCallbacks.set("GetDiagnostics", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Update Firmware message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<UpdateFirmwarePayload>) => void
   */
  answerUpdateFirmware<T>(cb: (request: OcppRequest<UpdateFirmwarePayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerUpdateFirmware');
    this.registeredCallbacks.set("UpdateFirmware", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Reset message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {status}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ResetPayload>) => void
   */
  answerReset<T>(cb: (request: OcppRequest<ResetPayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerReset');
    this.registeredCallbacks.set("Reset", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Get Configuration message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<GetConfigurationPayload>) => void
   */
  answerGetConfiguration<T>(cb: (request: OcppRequest<GetConfigurationPayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerGetConfiguration');
    this.registeredCallbacks.set("GetConfiguration", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Change Configuration message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ChangeConfigurationPayload>) => void
   */
  answerChangeConfiguration<T>(cb: (request: OcppRequest<ChangeConfigurationPayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerChangeConfiguration');
    this.registeredCallbacks.set("ChangeConfiguration", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Change Availability message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<ChangeAvailabilityPayload>) => void
   */
  answerChangeAvailability<T>(cb: (request: OcppRequest<ChangeAvailabilityPayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerChangeAvailability');
    this.registeredCallbacks.set("ChangeAvailability", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's 1.6 secured Certificate Signed message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param cb callback with signature (request: OcppRequest<CertificateSignedPayload>) => void
   */
  answerCertificateSigned<T>(cb: (request: OcppRequest<CertificateSignedPayload>) => void, options?: AnswerOptions<T>): void {
    debug('answerCertificateSigned');
    this.registeredCallbacks.set("CertificateSigned", {cb, options});
  }

  /**
   * Registers a function to implement logic for OCPP's Trigger Message message. The function provided must at least call
   * cp.sendResponse(request.uniqueId, {...}); to send the a OCPP CALLRESULT message.
   *
   * @param requestedMessage name of trigger message
   * @param cb callback with signature (request: OcppRequest<TriggerMessagePayload>) => void
   */
  answerTriggerMessage<T>(requestedMessage: string, cb: (request: OcppRequest<TriggerMessagePayload>) => void): void {
    debug('answerTriggerMessage');
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
    debug('answerExtendedTriggerMessage');
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
    debug('sendDiagnosticsStatusNotification');
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
    debug('sendFirmwareStatusNotification');
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
    debug('sendSignCertificate');
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
  onMessage(ocppMessage: Array<number|string|object>): void {
    debug(`received: ${JSON.stringify(ocppMessage)}`);
    logger.log("ChargepointOcpp16Json:onMessage", this.wsConCentralSystem.cpName, ocppMessage);
    const messageTypeId = ocppMessage[0] as number;
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
    if (messageTypeId === MessageType.CALLRESULT || messageTypeId === MessageType.CALLERROR) {
      const ocppResponse = {
        messageTypeId: ocppMessage[0] as number,
        uniqueId: ocppMessage[1] as string,
        payload: ocppMessage[2] as object
      }
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, ocppResponse))
      this.triggerRequestResult(ocppResponse);
    } else {
      const ocppRequest = {
        messageTypeId: ocppMessage[0],
        uniqueId: ocppMessage[1],
        action: ocppMessage[2],
        payload: ocppMessage[3]
      } as OcppRequest<Payload>;
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, ocppRequest))
      this.registeredCallbacks.forEach(async (ocppRequestWithOptions, action) => {
        if (action === ocppRequest.action) {
          let wrappedRequest = ocppRequest;
          if (ocppRequestWithOptions.options && ocppRequestWithOptions.options.requestConverter) {
            wrappedRequest = await ocppRequestWithOptions.options.requestConverter(ocppRequest);
          }
          ocppRequestWithOptions.cb(wrappedRequest);
        }
      });
    }
  }

  /**
   * Tries to send a message (data) via the WebSocket to the central system. It might deferr this, if an OCPP message is currenlty in progress.
   *
   * @param data string to be sent. Must be a stringified OCPP request array.
   */
  private trySendMessageOrDeferr(data: Array<number | string | object>): void {
    if (this.isCurrentlyRequestNotAnswered === true) {
      debug(`sendToWebsocket, queueSize=${this.deferredMessageQueue.length}`);
      this.deferredMessageQueue.unshift(data);
    } else {
      this.isCurrentlyRequestNotAnswered = true;
      this.wsConCentralSystem.send(JSON.stringify(data));
      logger.log("ChargepointOcpp16Json:trySendMessageOrDeferr", this.wsConCentralSystem.cpName, data);
    }
  }

  /**
   * When a message was answered, this checks if there are deferred messages waiting to be sent.
   */
  private processDeferredMessages(): void {
    this.isCurrentlyRequestNotAnswered = this.deferredMessageQueue.length > 0;
    if (this.isCurrentlyRequestNotAnswered === true) {
      debug(`processDeferredMessages, queueSize=${this.deferredMessageQueue.length}`);
      const data = this.deferredMessageQueue.pop();
      this.wsConCentralSystem.send(JSON.stringify(data));
      logger.log("ChargepointOcpp16Json:trySendMessageOrDeferr", this.wsConCentralSystem.cpName, data);
    }
  }

  /**
   * Sends an OCPP message to the central system. The promise resolves when the central system sends a CALLRESULT. It rejects when the timeout is due.
   *
   * @param req OCPP request object
   */
  sendOcpp<T, U>(req: OcppRequest<U>): Promise<T> {
    debug(`send: ${JSON.stringify(req)}`);
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      const timeoutHandle = setTimeout(() => {
        this.processDeferredMessages(); // Not sure, if we should proceed sending messages, if we just got a timeout and not an actual response.
        reject(`Timeout waiting for ${JSON.stringify(req)}`)
      }, this.RESPONSE_TIMEOUT);
      this.registerRequest(req, (resp) => {
        this.processDeferredMessages();
        clearTimeout(timeoutHandle);
        resolve(resp);
      });
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, req))
      this.trySendMessageOrDeferr(ocppReqToArray(req));
    })
  }

  /**
   * Sends an OCPP response for a previous OCPP request
   *
   * @param uniqueId unique-id of the OCPP message
   * @param payload OCPP payload for this response
   */
  sendResponse(uniqueId: string, payload: object): void {
    debug(`send-back: ${uniqueId} => ${JSON.stringify(payload)}`);
    const response = {
      messageTypeId: MessageType.CALLRESULT,
      uniqueId,
      payload
    }
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
    wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, response))
    this.wsConCentralSystem.send(JSON.stringify(ocppResToArray(response)));
  }

  /**
   * Close the connection to the central system.
   */
  close(): void {
    this.wsConCentralSystem.close();
    this.wsConCentralSystem = null;
  }

  /**
   * Match an OCPP response with a previously registered OCPP request
   *
   * @param resp OCPP response
   */
  private triggerRequestResult<T>(resp: OcppResponse<T>): void {
    this.registeredOpenRequests.filter(e => resp.uniqueId === e.request.uniqueId).forEach(e => e.next(resp.payload));
    this.registeredOpenRequests = this.registeredOpenRequests.filter(e => resp.uniqueId !== e.request.uniqueId);
  }

  /**
   * After submitting an OCPP request, register the request so we can match an upcoming response with a previous request.
   *
   * @param req OCPP request
   * @param next callback function to call when the response arrived
   */
  private registerRequest<T>(req: OcppRequest<T>, next: (resp: Payload) => void): void {
    this.registeredOpenRequests.push({
      request: req,
      next: next
    });
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
    return this.keyStore;
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
      debug(`Listening on ${JSON.stringify(addr)}`);
    });
    const httpTerminator = createHttpTerminator({server})
    expressInit['terminate'] = () => httpTerminator.terminate();
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
  if (wsConCentralSystemFromRepository && wsConCentralSystemFromRepository.ws.readyState === WebSocket.OPEN) {
    wsConCentralSystemFromRepository.close();
  }
  const cp = new ChargepointOcpp16Json();
  return cp.connect(url, cpName).then(() => cp);
}
