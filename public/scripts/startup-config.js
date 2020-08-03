define(function() {
  return `
const bootResp = await cp.sendBootnotification({ chargePointVendor: 'vendor', chargePointModel: '1' });
await cp.sendHeartbeat();
const heartbeatInterval = setInterval(() => cp.sendHeartbeat(), bootResp.interval * 1000);
cp.onClose(() => clearInterval(heartbeatInterval));
await cp.sendStatusNotification({ connectorId: 0, errorCode: 'NoError', status: 'Available' });
await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Available' });
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
    await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Preparing' });
    cp.transaction = await cp.startTransaction({
      connectorId: 1,
      idTag: request.payload['idTag'],
      meterStart: 1377,
      timestamp: '2020-06-30T12:26:57.167Z',
    });
    await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Charging' });
    await cp.meterValues({
      connectorId: 1,
      transactionId: cp.transaction.transactionId,
      meterValue: [{
        timestamp: '2020-06-30T12:27:03.198Z',
        sampledValue: [{ value: '1387' }],
      }],
    });
  }
});
cp.answerRemoteStopTransaction(async (request) => {
  await cp.sendResponse(request.uniqueId, { status: 'Accepted' });
  await cp.stopTransaction({
    transactionId: cp.transaction.transactionId,
    meterStop: 1399,
    timestamp: new Date().toISOString(),
  });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Finishing' });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: 'NoError', status: 'Available' });
});
cp.answerDataTransfer(async (request) => {
  let data;
  switch (request.payload.messageId) {
    case '2':
      // get measurement
      data = [ { globalId: request.payload.globalId, idents: [{"name":"Meas_Super_Cluster_Topology","unit":"","value":"None"},{"name":"Meas_Target_Cooling_Temperature ","unit":"","value":"32"},{"name":"Meas_Door_Status","unit":"","value":"Open"},{"name":"Meas_Fluid_Detection_Sensor_1","unit":"","value":"FluidDetected"},{"name":"Meas_Fluid_Detection_Sensor_2","unit":"","value":"FluidNotDetected"},{"name":"Meas_Inlet_Cooling_Temperature","unit":"","value":"44"},{"name":"Meas_Outlet_Cooling_Temperature","unit":"","value":"42"}] } ];
      break;
    case '9':
      // get configuration
      data = [ { globalId: request.payload.globalId, idents: [{"name":"CP_ChargePointIdentity","value":"LMS1"},{"name":"CP_ChargePointModel","value":"Awesome ChargePoint"},{"name":"CP_ChargePointVendor","value":"PES"},{"name":"CP_ChargePointSerialNumber","value":"22.33.41.62.As.3d"},{"name":"CP_ChargeParkOperator","value":"MHP"},{"name":"CP_UTC_Time_Offset","value":"2"},{"name":"CP_Daylight_Saving_Usage","value":"Off"},{"name":"CP_Backend_Address","value":"wss://ws.cpoc-poc.de/DE911*0000000*0000000*9110911"},{"name":"CP_Park_Prefix","value":"000000000000000"},{"name":"CP_ICCID","value":"Some number"},{"name":"CP_Coding_Complete","value":"1"},{"name":"CP_Clustering","value":"1, 1, 8197509, 91829384"},{"name":"CP_Diagnostic_Mode","value":"activated"},{"name":"CP_BZ_Mon_Activation","value":"On"},{"name":"CP_CRC_Mon_Activation","value":"On"},{"name":"CP_DLC_Mon_Activation","value":"Off"},{"name":"CP_Encoding_Activation","value":"On"}] } ];
      break;
    case '30':
      // get topology
      data = [ { "globalId":"DE91110000100001010F", "clusterData": [1, 4, 6] }, { "globalId":"DE91110000100002010F", "clusterData": [2, 3]}, { "globalId":"DE91110000100003010B", "clusterData": []}, { "globalId":"DE91110000100003010A", "clusterData": []}, { "globalId":"DE91110000100002020F", "clusterData": [5]}, { "globalId":"DE91110000100003020A", "clusterData": []}, { "globalId":"DE91110000100004010F", "clusterData": []}, ];
      break;
  }
  await cp.sendResponse(request.uniqueId, { status: 'Accepted', ...request.payload, data });
});
`;
});
