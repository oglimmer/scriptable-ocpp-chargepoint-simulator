import {WSConCentralSystem} from "./websocket-connection-centralsystem";
import {ChargepointOcpp16Json} from "./chargepoint";
import {OcppRequest, OcppResponse, Payload} from "./ocpp1_6";
import * as WebSocket from "ws";
import {log} from "./log";
import {Config} from "./config";
import Timeout = NodeJS.Timeout;

const LOG_NAME = 'ocpp-chargepoint-simulator:simulator:FailSafeConnection';

/** Counter to give each instance of ChargepointOcpp16Json a unique ID */
// this is needed as the front-end knows only one (and only exactly one) instance, so the FE need to find the
// latest instance (using the highest ID)
let connectCounter = 0;

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
 * Handles queuing and re-submitting ocpp commands in case of connection drops.
 */
export class QueueSubmitLayer {
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

  constructor(private readonly _chargepointOcpp16Json: ChargepointOcpp16Json, private readonly _config: Config) {
  }

  public get chargepointOcpp16Json() {
    return this._chargepointOcpp16Json;
  }

  public get wsConCentralSystem() {
    return this._wsConCentralSystem;
  }

  public get readyState() {
    return this._wsConCentralSystem.ws?.readyState;
  }

  public get config() {
    return this._config;
  }

  public connect(): Promise<void> {
    this._wsConCentralSystem = new WSConCentralSystem(connectCounter++, this, this._config);
    return this._wsConCentralSystem.connect();
  }

  public close(): void {
    this._wsConCentralSystem.close();
    this._wsConCentralSystem = null;
  }

  /**
   * Called from the underlaying WebSocket layer in case the connections closes / gets closed.
   */
  public onClose(): void {
    if (this.isCurrentlyRequestNotAnswered) {
      clearTimeout(this.timeoutHandle);
      this.deferredMessageQueue.unshift({startResponseHandling: this.currentStartResponseHandling});
    }
    this.registeredOpenRequest = null;
    this.isCurrentlyRequestNotAnswered = false;
    if (this._chargepointOcpp16Json.onCloseCb) {
      this._chargepointOcpp16Json.onCloseCb();
    }
  }

  public onMessage(ocppMessage: Array<number | string | object>): void {
    this._chargepointOcpp16Json.onMessage(ocppMessage);
  }

  /**
   * Match an OCPP response with a previously registered OCPP request
   *
   * @param resp OCPP response
   */
  public triggerRequestResult<T>(resp: OcppResponse<T>): void {
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
  public registerRequest<T>(req: OcppRequest<T>, next: (resp: Payload) => void): void {
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
  public trySendMessageOrDeferr<T, U>(req: OcppRequest<U>): Promise<T> {
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      /*
       * Function to send an OCPP request to the underlaying websocket layer and monitor it's success withing a given timeout
       */
      const startResponseHandling = () => {
        // timeout handling
        this.timeoutHandle = setTimeout(() => {
          this.processDeferredMessages(); // Not sure, if we should proceed sending messages, if we just got a timeout and not an actual response.
          reject(`Timeout waiting for ${JSON.stringify(req)}`)
        }, this.RESPONSE_TIMEOUT);
        // response handling
        this.registerRequest(req, (resp) => {
          this.processDeferredMessages();
          clearTimeout(this.timeoutHandle);
          resolve(resp);
        });
        // actual request
        this.sendRequest(ocppReqToArray(req));
      }
      /* END */
      if (this.isCurrentlyRequestNotAnswered === true || this._wsConCentralSystem.ws.readyState !== WebSocket.OPEN) {
        log.debug(LOG_NAME, this._config.cpName, `sendToWebsocket, queueSize=${this.deferredMessageQueue.length}`);
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
  public processDeferredMessages(): void {
    if (this._wsConCentralSystem.ws.readyState === WebSocket.OPEN) {
      this.isCurrentlyRequestNotAnswered = this.deferredMessageQueue.length > 0;
      if (this.isCurrentlyRequestNotAnswered === true) {
        log.debug(LOG_NAME, this._config.cpName, `processDeferredMessages, queueSize=${this.deferredMessageQueue.length}`);
        const data = this.deferredMessageQueue.pop();
        this.currentStartResponseHandling = data.startResponseHandling;
        data.startResponseHandling();
      }
    }
  }

  /**
   * Send a OCPP request to the underlaying websocket connection to the central system.
   *
   * @param data OcppRequest array
   */
  private sendRequest(data: Array<number | string | object>): void {
    this._wsConCentralSystem.send(JSON.stringify(data));
  }

  /**
   * Send a OCPP response to the underlaying websocket connection to the central system.
   *
   * @param data OcppRequest array
   */
  public sendResponse(data: Array<number | string | object>): void {
    if (this._wsConCentralSystem.ws.readyState !== WebSocket.OPEN) {
      throw Error(`WebSocket connection not open.`);
    }
    this._wsConCentralSystem.send(JSON.stringify(data));
  }
}
