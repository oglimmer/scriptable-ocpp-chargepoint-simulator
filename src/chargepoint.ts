import Debug from 'debug';
import * as WebSocket from 'ws';
import {RemoteConsoleTransmissionType, WSConRemoteConsole} from "./remote-console-connection";
import {WSConCentralSystem} from "./websocket-connection-centralsystem";
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from "./state-service";

const debug = Debug('ocpp-chargepoint-simulator:simulator:ChargepointOcpp16Json');

enum MessageType {
  CALL = 2,
  CALLRESULT = 3,
  CALLERROR = 4
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Payload {

}

function ocppReqToArray<T>(req: OcppRequest<T>): Array<string | number | Payload> {
  return [req.messageTypeId, req.uniqueId, req.action, req.payload];
}

function ocppResToArray<T>(resp: OcppResponse<T>): Array<string | number | Payload> {
  return [resp.messageTypeId, resp.uniqueId, resp.payload];
}

interface OcppRequest<T> {
  messageTypeId: MessageType;
  uniqueId: string;
  action: string;
  payload?: T;
}

interface OcppResponse<T> {
  messageTypeId: MessageType;
  uniqueId: string;
  payload?: T;
}

interface MessageListenerElement<T> {
  request: OcppRequest<T>;

  next(resp: Payload): void;
}

interface BootNotificationPayload extends Payload {
  chargePointVendor: string;
  chargePointModel: string,
  chargePointSerialNumber?: string,
  chargeBoxSerialNumber?: string,
  firmwareVersion?: string,
  iccid?: string,
  imsi?: string,
  meterType?: string,
  meterSerialNumber?: string
}

interface BootNotificationResponse {
  status: string,
  currentTime: string,
  interval: number
}

interface StatusNotificationPayload extends Payload {
  connectorId: number,
  errorCode: string,
  info?: string,
  status: string,
  timestamp?: string,
  vendorId?: string,
  vendorErrorCode?: string
}

interface AuthorizePayload extends Payload {
  idTag: string
}

interface IdTagInfo {
  expiryDate?: string,
  parentIdTag?: string,
  status: string
}

interface AuthorizeResponse {
  idTagInfo?: IdTagInfo
}

interface StartTransactionPayload extends Payload {
  connectorId: number,
  idTag: string,
  meterStart: number,
  reservationId?: number,
  timestamp: string
}

interface StartTransactionResponse {
  idTagInfo: IdTagInfo,
  transactionId: number
}

interface SampledValue {
  value: string,
  context?: string,
  format?: string,
  measurand?: string,
  phase?: string,
  location?: string,
  unit?: string
}

interface TransactionData {
  timestamp: string,
  sampledValue: Array<SampledValue>
}

interface StopTransactionPayload extends Payload {
  idTag?: string,
  meterStop: number,
  timestamp: string,
  transactionId: number,
  reason?: string,
  transactionData?: Array<TransactionData>
}

interface StopTransactionResponse {
  idTagInfo?: IdTagInfo
}

interface MeterValuesPayload extends Payload {
  connectorId: number,
  transactionId?: number,
  meterValue: Array<TransactionData>
}


interface GetDiagnosticsPayload extends Payload {
  location: string,
  retries?: number,
  retryInterval?: number,
  startTime?: string,
  stopTime?: string
}
/*
interface GetDiagnosticsResponse {
  fileName?: string
}
*/

interface DiagnosticsStatusNotificationPayload {
  status: string
}

interface UpdateFirmwarePayload {
  location: string,
  retries?: number,
  retrieveDate: string,
  retryInterval?: number
}

interface FirmwareStatusNotificationPayload {
  status: string
}

interface TriggerMessagePayload {
  requestedMessage: string,
  connectorId?: number
}

/**
 * Implements an OCPP 1.6 JSON speaking Chargepoint. Provides API for a Chargepoint.
 * Should not access WebSocket-API directly.
 */
export class ChargepointOcpp16Json {

  private readonly RESPONSE_TIMEOUT = 15000;

  private openRequests: Array<MessageListenerElement<Payload>> = [];
  private wsConCentralSystem: WSConCentralSystem;

  private registeredCallbacks: Map<string, (OcppRequest) => void> = new Map();
  private registeredCallbacksTriggerMessage: Map<string, (OcppRequest) => void> = new Map();

  constructor(readonly id: number) {
    this.buildTriggerMessage();
  }

  log(output: (string | object)): void {
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
    wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_ERROR, output));
  }

  sleep(millis: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, millis);
    })
  }

  connect(url: string): Promise<ChargepointOcpp16Json> {
    debug('connect');
    this.wsConCentralSystem = new WSConCentralSystem(url, this);
    return this.wsConCentralSystem.connect().then(() => this);
  }

  sendHeartbeat(): Promise<void> {
    debug('sendHeartbeat');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'Heartbeat',
      payload: {}
    });
  }

  sendBootnotification(payload: BootNotificationPayload): Promise<BootNotificationResponse> {
    debug('sendBootnotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'BootNotification',
      payload
    });
  }

  sendStatusNotification(payload: StatusNotificationPayload): Promise<void> {
    debug('sendStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StatusNotification',
      payload
    });
  }

  sendAuthorize(payload: AuthorizePayload): Promise<AuthorizeResponse> {
    debug('sendAuthorize');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'Authorize',
      payload
    });
  }

  startTransaction(payload: StartTransactionPayload): Promise<StartTransactionResponse> {
    debug('sendStartTransaction');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StartTransaction',
      payload
    });
  }

  stopTransaction(payload: StopTransactionPayload): Promise<StopTransactionResponse> {
    debug('sendStopTransaction');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StopTransaction',
      payload
    });
  }

  meterValues(payload: MeterValuesPayload): Promise<void> {
    debug('sendMeterValues');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'MeterValues',
      payload
    });
  }

  answerGetDiagnostics<T>(cb: (request: OcppRequest<GetDiagnosticsPayload>) => void): void {
    debug('answerGetDiagnostics');
    this.registeredCallbacks.set("GetDiagnostics", cb);
  }

  answerUpdateFirmware<T>(cb: (request: OcppRequest<UpdateFirmwarePayload>) => void): void {
    debug('answerUpdateFirmware');
    this.registeredCallbacks.set("UpdateFirmware", cb);
  }

  answerTriggerMessage<T>(requestedMessage: string, cb: (request: OcppRequest<TriggerMessagePayload>) => void): void {
    debug('answerTriggerMessage');
    this.registeredCallbacksTriggerMessage.set(requestedMessage, cb);
    this.buildTriggerMessage();
  }

  buildTriggerMessage(): void {
    const triggerMessageCallBack = (request: OcppRequest<TriggerMessagePayload>): void => {
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
    this.registeredCallbacks.set("TriggerMessage", triggerMessageCallBack);
  }

  sendDiagnosticsStatusNotification(payload: DiagnosticsStatusNotificationPayload): Promise<void> {
    debug('sendDiagnosticsStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'DiagnosticsStatusNotification',
      payload
    });
  }

  sendFirmwareStatusNotification(payload: FirmwareStatusNotificationPayload): Promise<void> {
    debug('sendFirmwareStatusNotification');
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'FirmwareStatusNotification',
      payload
    });
  }

  onMessage(rawOcppMessage: string): void {
    debug(`received: ${rawOcppMessage}`);
    const ocppMessage = JSON.parse(rawOcppMessage);
    const messageTypeId = ocppMessage[0] as number;
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
    if (messageTypeId === MessageType.CALLRESULT || messageTypeId === MessageType.CALLERROR) {
      const ocppResponse = {
        messageTypeId: ocppMessage[0],
        uniqueId: ocppMessage[1],
        payload: ocppMessage[2]
      }
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, ocppResponse))
      this.triggerRequestResult(ocppResponse);
    } else {
      const ocppRequest = {
        messageTypeId: ocppMessage[0],
        uniqueId: ocppMessage[1],
        action: ocppMessage[2],
        payload: ocppMessage[3]
      }
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, ocppRequest))
      this.registeredCallbacks.forEach((cb, action) => {
        if (action === ocppRequest.action) {
          cb(ocppRequest);
        }
      });
    }
  }

  sendOcpp<T, U>(req: OcppRequest<U>): Promise<T> {
    debug(`send: ${JSON.stringify(req)}`);
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      const timeoutHandle = setTimeout(() => {
        reject(`Timeout waiting for ${JSON.stringify(req)}`)
      }, this.RESPONSE_TIMEOUT);
      this.registerRequest(req, (resp) => {
        clearTimeout(timeoutHandle);
        resolve(resp);
      });
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName);
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, req))
      this.wsConCentralSystem.send(JSON.stringify(ocppReqToArray(req)));
    })
  }

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

  close(): void {
    this.wsConCentralSystem.close();
    this.wsConCentralSystem = null;
  }

  triggerRequestResult<T>(resp: OcppResponse<T>): void {
    this.openRequests.filter(e => resp.uniqueId === e.request.uniqueId).forEach(e => e.next(resp.payload));
    this.openRequests = this.openRequests.filter(e => resp.uniqueId !== e.request.uniqueId);
  }

  registerRequest<T>(req: OcppRequest<T>, next: (resp: Payload) => void): void {
    this.openRequests.push({
      request: req,
      next: next
    });
  }

}

let connectCounter = 0;

export function chargepointFactory(url: string): Promise<ChargepointOcpp16Json> {
  const wsConCentralSystemFromRepository = wsConCentralSystemRepository.get(url.substr(url.lastIndexOf('/') + 1));
  if (wsConCentralSystemFromRepository && wsConCentralSystemFromRepository.ws.readyState === WebSocket.OPEN) {
    wsConCentralSystemFromRepository.close();
  }
  connectCounter++;
  const cp = new ChargepointOcpp16Json(connectCounter);
  return cp.connect(url);
}

export interface ChargepointFactoryType {
  (url: string): Promise<ChargepointOcpp16Json>;
}
