export enum MessageType {
  CALL = 2,
  CALLRESULT = 3,
  CALLERROR = 4
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Payload {

}

export interface OcppRequest<T> {
  messageTypeId: MessageType;
  uniqueId: string;
  action: string;
  payload?: T;
}

export interface OcppResponse<T> {
  messageTypeId: MessageType;
  uniqueId: string;
  payload?: T;
}

export interface BootNotificationPayload extends Payload {
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

export interface BootNotificationResponse {
  status: string,
  currentTime: string,
  interval: number
}

export interface StatusNotificationPayload extends Payload {
  connectorId: number,
  errorCode: string,
  info?: string,
  status: string,
  timestamp?: string,
  vendorId?: string,
  vendorErrorCode?: string
}

export interface AuthorizePayload extends Payload {
  idTag: string
}

export interface IdTagInfo {
  expiryDate?: string,
  parentIdTag?: string,
  status: string
}

export interface AuthorizeResponse {
  idTagInfo?: IdTagInfo
}

export interface StartTransactionPayload extends Payload {
  connectorId: number,
  idTag: string,
  meterStart: number,
  reservationId?: number,
  timestamp: string
}

export interface StartTransactionResponse {
  idTagInfo: IdTagInfo,
  transactionId: number
}

export interface SampledValue {
  value: string,
  context?: string,
  format?: string,
  measurand?: string,
  phase?: string,
  location?: string,
  unit?: string
}

export interface TransactionData {
  timestamp: string,
  sampledValue: Array<SampledValue>
}

export interface StopTransactionPayload extends Payload {
  idTag?: string,
  meterStop: number,
  timestamp: string,
  transactionId: number,
  reason?: string,
  transactionData?: Array<TransactionData>
}

export interface StopTransactionResponse {
  idTagInfo?: IdTagInfo
}

export interface MeterValuesPayload extends Payload {
  connectorId: number,
  transactionId?: number,
  meterValue: Array<TransactionData>
}


export interface GetDiagnosticsPayload extends Payload {
  location: string,
  retries?: number,
  retryInterval?: number,
  startTime?: string,
  stopTime?: string
}

export interface GetDiagnosticsResponse {
  fileName?: string
}

export interface DiagnosticsStatusNotificationPayload {
  status: string
}

export interface UpdateFirmwarePayload extends Payload {
  location: string,
  retries?: number,
  retrieveDate: string,
  retryInterval?: number
}

export interface FirmwareStatusNotificationPayload extends Payload {
  status: string
}

export interface TriggerMessagePayload extends Payload {
  requestedMessage: string,
  connectorId?: number
}

export interface ResetPayload extends Payload {
  type: string
}

export interface ResetResponse {
  status: string
}

export interface GetConfigurationPayload extends Payload {
  key: Array<string>
}

export interface ConfigurationKey {
  key: string,
  readonly: boolean,
  value?: string
}

export interface GetConfigurationResponse {
  configurationKey: Array<ConfigurationKey>,
  unknownKey: Array<string>
}

export interface ChangeConfigurationPayload extends Payload {
  key: string,
  value: string
}

export interface ChangeConfigurationResponse {
  status: string // "Accepted","Rejected","RebootRequired","NotSupported"
}

export interface ChangeAvailabilityPayload extends Payload {
  connectorId: number,
  type: string // "Inoperative", "Operative"
}

export interface ChangeAvailabilityResponse {
  status: string // "Accepted","Rejected","Scheduled"
}

export interface ExtendedTriggerMessagePayload {
  requestedMessage: string, // "BootNotification","LogStatusNotification","FirmwareStatusNotification","Heartbeat","MeterValues","SignChargePointCertificate","StatusNotification"
  connectorId?: number
}

export interface SignCertificatePayload {
  csr: string
}

export interface SignCertificateResponse {
  status: string // "Accepted","Rejected"
}

export interface CertificateSignedPayload {
  cert: Array<string>
}

export interface CertificateSignedResponse {
  status: string // "Accepted","Rejected"
}

export interface ChargingSchedulePeriod {
  startPeriod: number,
  limit: number,
  numberPhases?: number
}

export interface ChargingSchedule {
  duration?: number,
  startSchedule?: string,
  chargingRateUnit: string,
  chargingSchedulePeriod: Array<ChargingSchedulePeriod>
}

export interface ChargingProfile {
  chargingProfileId: number,
  transactionId?: number,
  stackLevel: number,
  chargingProfilePurpose: string,
  chargingProfileKind: string,
  recurrencyKind?: string,
  validFrom?: string,
  validTo?: string,
  chargingSchedule: ChargingSchedule
}

export interface RemoteStartTransactionPayload {
  connectorId?: number,
  idTag: string,
  chargingProfile?: ChargingProfile
}

export interface DataTransferPayload {
  globalId: string,
  vendorId: string,
  data?: any
}

export interface RemoteStartTransactionResponse {
  status: string
}
