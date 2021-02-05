import {WSConCentralSystem} from "./websocket-connection-centralsystem";
import {ChargepointOcpp16Json} from "./chargepoint";
import {OcppRequest, OcppResponse, Payload} from "./ocpp1_6";
import * as WebSocket from "ws";
import {log} from "./log";
import {Config} from "./config";


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

/**
 * Handles queuing and re-submitting ocpp commands in case of connection drops.
 */
export class QueueSubmitLayer {
  /**
   * Defines the time in milli seconds for the request-response timeout of OCPP messages.
   */
  private readonly RESPONSE_TIMEOUT = process.env.RESPONSE_TIMEOUT ? parseInt(process.env.RESPONSE_TIMEOUT) : 15000;

  /** Holds the requests currently not answered with a response. */
  private registeredOpenRequest: Map<string, MessageListenerElement<Payload>>;

  private _wsConCentralSystem: WSConCentralSystem;

  constructor(private readonly _chargepointOcpp16Json: ChargepointOcpp16Json, private readonly _config: Config) {
    this.registeredOpenRequest = new Map();
  }

  public get chargepointOcpp16Json() {
    return this._chargepointOcpp16Json;
  }

  public get wsConCentralSystem() {
    return this._wsConCentralSystem;
  }

  public get readyState() {
    return this._wsConCentralSystem?.ws?.readyState;
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
    this.registeredOpenRequest.clear();
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
    if (!this.registeredOpenRequest.has(resp.uniqueId)) {
      throw Error(`Received response with id ${resp.uniqueId} but not result was registered for this uniqueId.`);
    }
    const openRequestToTrigger = this.registeredOpenRequest.get(resp.uniqueId);
    this.registeredOpenRequest.delete(resp.uniqueId);
    openRequestToTrigger.next(resp.payload); // this might register a new Request, thus it needs to be set to null before
  }

  /**
   * After submitting an OCPP request, register the request so we can match an upcoming response with a previous request.
   *
   * @param req OCPP request
   * @param next callback function to call when the response arrived
   */
  private registerRequest<T>(req: OcppRequest<T>, next: (resp: Payload) => void): void {
    if (this.registeredOpenRequest.has(req.uniqueId)) {
      throw Error(`Tried to register request with id ${req.uniqueId} but this uniqueId is already registered.`);
    }
    this.registeredOpenRequest.set(req.uniqueId, {
      request: req,
      next: next
    });
  }

  /**
   * Tries to send a message (data) via the WebSocket to the central system. It might defer this, if an OCPP message is currently in progress.
   *
   * @param data string to be sent. Must be a stringified OCPP request array.
   */
  public trySendMessageOrDefer<T, U>(req: OcppRequest<U>): Promise<T> {
    return new Promise((resolve: (T) => void, reject: (string) => void) => {
      /*
       * Function to send an OCPP request to the underlaying websocket layer and monitor it's success withing a given timeout
       */
      const startResponseHandling = () => {
        // timeout handling
        const timeoutRef = setTimeout(() => {
          reject(`Timeout waiting for ${JSON.stringify(req)}`)
        }, this.RESPONSE_TIMEOUT);
        // response handling
        this.registerRequest(req, (resp) => {
          clearTimeout(timeoutRef);
          resolve(resp);
        });
        // actual request
        this.sendRequest(ocppReqToArray(req));
      }
      /* END */
      if (!this._wsConCentralSystem || this._wsConCentralSystem.ws.readyState !== WebSocket.OPEN) {
        log.debug(LOG_NAME, this._config.cpName, `Connection not open. Unable to send message ${JSON.stringify(req)}`);
      } else {
        startResponseHandling();
      }
    })
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
