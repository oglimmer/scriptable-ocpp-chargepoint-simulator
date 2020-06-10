import Debug from 'debug';
import * as WebSocket from 'ws';
import {RemoteConsoleTransmissionType, WSConRemoteConsole} from "./remote-console-connection";
import {WSConCentralSystem} from "./websocket-connection-centralsystem";
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from "./state-service";

const debug = Debug('ocpp-chargepoint-simulator:simulator:ChargepointOcpp16Json');

interface MessageListenerElement {
  request: OcppRequest;

  next(resp: object): void;
}

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

function ocppReqToArray(req: OcppRequest): Array<string | number | Payload> {
  return [req.messageTypeId, req.uniqueId, req.action, req.payload];
}

interface OcppRequest {
  messageTypeId: MessageType;
  uniqueId: string;
  action: string;
  payload?: object;
}

interface OcppResponse {
  messageTypeId: MessageType;
  uniqueId: string;
  payload?: object;
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

/**
 * Implements an OCPP 1.6 JSON speaking Chargepoint. Provides API for a Chargepoint.
 * Should not access WebSocket-API directly.
 */
export class ChargepointOcpp16Json {

  private readonly RESPONSE_TIMEOUT = 15000;

  private openRequests: Array<MessageListenerElement> = [];
  private wsConCentralSystem: WSConCentralSystem;

  constructor(readonly id: number) {
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
    debug('sendStopTransaction')
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'StopTransaction',
      payload
    });
  }

  meterValues(payload: MeterValuesPayload): Promise<void> {
    debug('sendMeterValues')
    return this.sendOcpp({
      messageTypeId: MessageType.CALL,
      uniqueId: uuidv4(),
      action: 'MeterValues',
      payload
    });
  }

  onMessage(rawOcppMessage: string): void {
    debug(`received: ${rawOcppMessage}`);
    const ocppMessage = JSON.parse(rawOcppMessage);
    const ocppResponse = {
      messageTypeId: ocppMessage[0],
      uniqueId: ocppMessage[1],
      payload: ocppMessage[2],
    }
    const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName) as Array<WSConRemoteConsole>;
    wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, ocppResponse))
    if (ocppResponse.messageTypeId == MessageType.CALLRESULT || ocppResponse.messageTypeId == MessageType.CALLERROR) {
      this.triggerRequestResult(ocppResponse);
    } else {
      console.error("not implemented yet");
    }
  }

  sendOcpp<T>(req: OcppRequest): Promise<T> {
    debug(`send: ${JSON.stringify(req)}`);
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      const timeoutHandle = setTimeout(() => {
        reject(`Timeout waiting for ${JSON.stringify(req)}`)
      }, this.RESPONSE_TIMEOUT);
      this.registerRequest(req, (resp) => {
        clearTimeout(timeoutHandle);
        resolve(resp);
      });
      const wsConRemoteConsoleArr = wsConRemoteConsoleRepository.get(this.wsConCentralSystem.cpName) as Array<WSConRemoteConsole>;
      wsConRemoteConsoleArr.forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.LOG, req))
      this.wsConCentralSystem.send(JSON.stringify(ocppReqToArray(req)));
    })
  }

  close(): void {
    this.wsConCentralSystem.close();
    this.wsConCentralSystem = null;
  }

  triggerRequestResult(resp: OcppResponse): void {
    this.openRequests.filter(e => resp.uniqueId === e.request.uniqueId).forEach(e => e.next(resp.payload));
    this.openRequests = this.openRequests.filter(e => resp.uniqueId !== e.request.uniqueId);
  }

  registerRequest(req: OcppRequest, next: (resp: OcppResponse) => void): void {
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
