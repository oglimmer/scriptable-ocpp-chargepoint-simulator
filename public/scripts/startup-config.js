define(function() {
  return `
const bootResp = await cp.sendBootnotification({ chargePointVendor: 'vendor', chargePointModel: '1' });
if(bootResp.interval < 30) {
  console.log("Heartbeat interval might be too low. Current value in seconds: ", bootResp.interval);
}

// give the chargepoint initial state

cp.sendRecurringHeartbeats = true;
cp.sendRecurringMeterValues = false;
cp.currentMeterValue = 0;
cp.connectorIdForTx = 1;
cp.incrementAndGetCurrentMeterValue = (amount) => {
  cp.currentMeterValue += amount;
  return String(cp.currentMeterValue);
};

// Activate sending periodic Heartbeats

const heartbeatFunction = async () => {
  try {
    if(cp.sendRecurringHeartbeats) {
      await cp.sendHeartbeat();
    }
  } catch (e) {
    console.log(e);
  }
  heartbeatInterval = setTimeout(heartbeatFunction, bootResp.interval * 1000);
}
let heartbeatInterval = setTimeout(heartbeatFunction, 1000);

// Activate sending periodic MeterValues (during active transaction)

const meterValueFunction = async () => {
  try {
    if(cp.transaction != null && cp.sendRecurringMeterValues) {
      await cp.meterValues({connectorId: cp.connectorIdForTx, transactionId: cp.transaction.transactionId, meterValue: [{ timestamp: new Date().toISOString() , sampledValue: [{value: String(cp.incrementAndGetCurrentMeterValue(10)) }] }]});
    }
  } catch (e) {
    console.log(e);
  }
  meterValueInterval = setTimeout(meterValueFunction, bootResp.interval * 1000);
}
let meterValueInterval = setTimeout(meterValueFunction, 1000);
cp.onClose(() => {clearInterval(heartbeatInterval); clearInterval(meterValueInterval);});

// Send 'Available' on all possible connectors

await cp.sendStatusNotification({ connectorId: 0, errorCode: 'NoError', status: 'Available' });
await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Available' });

// Define CP functionality

cp.answerGetDiagnostics(async (request) => {
  const fileName = 'foo.' + new Date().toISOString() + '.txt';
  cp.sendResponse(request.uniqueId, { fileName });
  await cp.sendDiagnosticsStatusNotification({ status: 'Idle' });
  await cp.sleep(5000);
  await cp.sendDiagnosticsStatusNotification({ status: 'Uploading' });
  await cp.ftpUploadDummyFile(request.payload.location, fileName);
  await cp.sendDiagnosticsStatusNotification({ status: 'Uploaded' });
});
cp.answerUpdateFirmware(async (request) => {
  cp.sendResponse(request.uniqueId, {});
  await cp.sendFirmwareStatusNotification({ status: 'Idle' });
  await cp.sleep(5000);
  await cp.sendFirmwareStatusNotification({ status: 'Downloading' });
  const file = await cp.ftpDownload(request.payload.location);
  cp.log('file downloaded to: ' + file);
  await cp.sendFirmwareStatusNotification({ status: 'Downloaded' });
  await cp.sleep(5000);
  await cp.sendFirmwareStatusNotification({ status: 'Installing' });
  await cp.sleep(5000);
  await cp.sendFirmwareStatusNotification({ status: 'Installed' });
});
cp.answerReset(async (request) => {
  cp.sendResponse(request.uniqueId, { status: 'Accepted' });
  await cp.reConnect();
  cp.log('RESET ***boing-boing-boing*** ' + request.payload.type);
  await cp.sendBootnotification({ chargePointVendor: 'vendor', chargePointModel: '1' });
});
const configurationStore = [];
configurationStore.push({ key: 'foobar.1', readonly: false, value: 'test' });
configurationStore.push({ key: 'foobar.2', readonly: true, value: 'just a word' });
configurationStore.push({ key: 'barfoo.1', readonly: false, value: '100' });
cp.answerGetConfiguration(async (request) => {
  cp.sendResponse(request.uniqueId, { configurationKey: configurationStore });
});
cp.answerChangeConfiguration(async (request) => {
  const element = configurationStore.find(e => e.key === request.payload.key);
  if (!element) {
    cp.sendResponse(request.uniqueId, { status: 'NotSupported' });
  } else if (element.readonly) {
    cp.sendResponse(request.uniqueId, { status: 'Rejected' });
  } else {
    element.value = request.payload.value;
    if (element.key === 'barfoo.1') {
      cp.sendResponse(request.uniqueId, { status: 'RebootRequired' });
    } else {
      cp.sendResponse(request.uniqueId, { status: 'Accepted' });
    }
  }
});
cp.answerChangeAvailability(async (request) => {
  cp.sendResponse(request.uniqueId, { status: 'Accepted' });
  if (request.payload.type.toUpperCase() === 'INOPERATIVE') {
    await cp.sendStatusNotification({ connectorId: 0, errorCode: 'NoError', status: 'Unavailable' });
    await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Unavailable' });
  } else if (request.payload.type.toUpperCase() === 'OPERATIVE') {
    await cp.sendStatusNotification({ connectorId: 0, errorCode: 'NoError', status: 'Available' });
    await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Available' });
  }
});
cp.answerRemoteStartTransaction(async (request) => {
  await cp.sendResponse(request.uniqueId, { status: 'Accepted' });
  const statusResponse = await cp.sendAuthorize({ idTag: request.payload['idTag'] });
  if (statusResponse.idTagInfo.status === 'Accepted') {
    cp.connectorIdForTx = 1;
    await cp.sendStatusNotification({ connectorId: cp.connectorIdForTx, errorCode: 'NoError', status: 'Preparing' });
    cp.transaction = await cp.startTransaction({
      connectorId: cp.connectorIdForTx,
      idTag: request.payload['idTag'],
      meterStart: cp.incrementAndGetCurrentMeterValue(0),
      timestamp: new Date().toISOString(),
    });
    await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Charging' });
    await cp.meterValues({
      connectorId: cp.connectorIdForTx,
      transactionId: cp.transaction.transactionId,
      meterValue: [{
        timestamp: new Date().toISOString(),
        sampledValue: [{ value: cp.incrementAndGetCurrentMeterValue(10) }],
      }],
    });
  }
});
cp.answerRemoteStopTransaction(async (request) => {
  await cp.sendResponse(request.uniqueId, { status: 'Accepted' });
  await cp.stopTransaction({
    transactionId: cp.transaction.transactionId,
    meterStop: cp.incrementAndGetCurrentMeterValue(10),
    timestamp: new Date().toISOString(),
  });
  cp.transaction = null;
  await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Finishing' });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Available' });
});
cp.answerDataTransfer(async (request) => {
  await cp.sendResponse(request.uniqueId, { status: 'Accepted' });
});
`;
});
