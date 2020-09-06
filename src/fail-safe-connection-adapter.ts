import Debug from 'debug';
import {WSConCentralSystem} from "./websocket-connection-centralsystem";
import {ChargepointOcpp16Json} from "./chargepoint";
import {OcppRequest, OcppResponse, Payload} from "./ocpp1_6";
import * as WebSocket from "ws";
import {logger} from './http-post-logger';
import Timeout = NodeJS.Timeout;

const debug = Debug('ocpp-chargepoint-simulator:simulator:FailSafeConnection');

/**
 * Converts an object of type OcppRequest (TypeScript) into an OCPP request (protocol) array.
 *
 * @param req an Array representing an OCPP Request as [message-type-id, unique-id, action, payload]
 */
function ocppReqToArray<T>(req: OcppRequest<T>): Array<string | number | Payload> {
  return [req.messageTypeId, req.uniqueId, req.action, req.payload];
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

interface DefferedMessage<T> {
  startResponseHandling(): void;
}

/**
 *
 */
export class FailSafeConnectionAdapter {
  /**
   * Defines the time in milli seconds for the request-response timeout of OCPP messages.
   */
  private readonly RESPONSE_TIMEOUT = process.env.RESPONSE_TIMEOUT ? parseInt(process.env.RESPONSE_TIMEOUT) : 15000;

  /** OCPP doesn't allow to send more than 1 message at a time. This queues messages until the last is answered. */
  private readonly deferredMessageQueue: Array<DefferedMessage<Payload>> = [];
  /** Determines if a new message can be sent  */
  private isCurrentlyRequestNotAnswered = false;
  /** Holds the request currently not answered with a response. Within a tick this might be out of sync with isCurrentlyRequestNotAnswered  */
  private registeredOpenRequest: MessageListenerElement<Payload>;
  private timeoutHandle: Timeout;
  private currentStartResponseHandling;

  private _wsConCentralSystem: WSConCentralSystem;

  set wsConCentralSystem(wsConCentralSystem: WSConCentralSystem) {
    debug("wsConCentralSystem");
    this._wsConCentralSystem = wsConCentralSystem;
    this._wsConCentralSystem.failSafeConnectionAdapter = this;
  }

  get wsConCentralSystem(): WSConCentralSystem {
    return this._wsConCentralSystem;
  }

  get id(): number {
    return this.wsConCentralSystem.id;
  }

  get api(): ChargepointOcpp16Json {
    return this.wsConCentralSystem.api;
  }

  get readyState(): number {
    return this.wsConCentralSystem.ws.readyState;
  }

  get cpName(): string {
    return this.wsConCentralSystem.cpName;
  }

  get url(): string {
    return this.wsConCentralSystem.url;
  }

  connect(): Promise<void> {
    return this.wsConCentralSystem.connect();
  }

  send(data: string): void {
    this.wsConCentralSystem.send(data);
  }

  close(): void {
    this.wsConCentralSystem.close();
  }

  onClose(): void {
    if (this.isCurrentlyRequestNotAnswered) {
      clearTimeout(this.timeoutHandle);
      this.deferredMessageQueue.unshift({startResponseHandling: this.currentStartResponseHandling});
    }
    this.registeredOpenRequest = null;
    this.isCurrentlyRequestNotAnswered = false;
  }

  /**
   * Match an OCPP response with a previously registered OCPP request
   *
   * @param resp OCPP response
   */
  triggerRequestResult<T>(resp: OcppResponse<T>): void {
    if (!this.registeredOpenRequest) {
      throw Error(`Received response with id ${resp.uniqueId} but not result was registered.`);
    }
    if (resp.uniqueId !== this.registeredOpenRequest.request.uniqueId) {
      throw Error(`Received response with id ${resp.uniqueId} but expected id ${this.registeredOpenRequest.request.uniqueId}`);
    }
    const openRequestToTrigger = this.registeredOpenRequest;
    this.registeredOpenRequest = null;
    openRequestToTrigger.next(resp.payload); // this might register a new Request, thus it needs to be set to null before
  }

  /**
   * After submitting an OCPP request, register the request so we can match an upcoming response with a previous request.
   *
   * @param req OCPP request
   * @param next callback function to call when the response arrived
   */
  registerRequest<T>(req: OcppRequest<T>, next: (resp: Payload) => void): void {
    if (this.registeredOpenRequest) {
      throw Error(`Tried to register request with id ${req.uniqueId} but id ${this.registeredOpenRequest.request.uniqueId} is already registered.`);
    }
    this.registeredOpenRequest = {
      request: req,
      next: next
    };
  }

  /**
   * Tries to send a message (data) via the WebSocket to the central system. It might deferr this, if an OCPP message is currenlty in progress.
   *
   * @param data string to be sent. Must be a stringified OCPP request array.
   */
  trySendMessageOrDeferr<T, U>(req: OcppRequest<U>): Promise<T> {
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      const startResponseHandling = () => {
        this.timeoutHandle = setTimeout(() => {
          this.processDeferredMessages(); // Not sure, if we should proceed sending messages, if we just got a timeout and not an actual response.
          reject(`Timeout waiting for ${JSON.stringify(req)}`)
        }, this.RESPONSE_TIMEOUT);
        this.registerRequest(req, (resp) => {
          this.processDeferredMessages();
          clearTimeout(this.timeoutHandle);
          resolve(resp);
        });
        this.sendData(ocppReqToArray(req));
      }
      if (this.isCurrentlyRequestNotAnswered === true || this.readyState !== WebSocket.OPEN) {
        debug(`sendToWebsocket, queueSize=${this.deferredMessageQueue.length}`);
        this.deferredMessageQueue.unshift({startResponseHandling});
      } else {
        this.currentStartResponseHandling = startResponseHandling;
        startResponseHandling();
        this.isCurrentlyRequestNotAnswered = true;
      }
    })
  }

  /**
   * When a message was answered, this checks if there are deferred messages waiting to be sent.
   */
  processDeferredMessages(): void {
    if (this.readyState === WebSocket.OPEN) {
      this.isCurrentlyRequestNotAnswered = this.deferredMessageQueue.length > 0;
      if (this.isCurrentlyRequestNotAnswered === true) {
        debug(`processDeferredMessages, queueSize=${this.deferredMessageQueue.length}`);
        const data = this.deferredMessageQueue.pop();
        this.currentStartResponseHandling = data.startResponseHandling;
        data.startResponseHandling();
      }
    }
  }

  /**
   * Send the data to the underlaying websocket connection to the central system.
   *
   * @param data OcppRequest array
   */
  private sendData(data: Array<number | string | object>): void {
    this.wsConCentralSystem.send(JSON.stringify(data));
    logger.log("ChargepointOcpp16Json:sendData", this.wsConCentralSystem.cpName, {
      messageTypeId: data[0],
      uniqueId: data[1],
      action: data[2],
      payload: data[3]
    });
  }

}
