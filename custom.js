/**
 * PURE JAVASCRIPT
 */

module.exports = async (connect) => {
  let cp, heartbeatTimer;
  try {
    // WebSocket Connect (no OCPP)
    cp = await connect('ws://localhost:8100/xyz');
    // typical startup OCPP
    const bootResp = await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});
    await cp.sendHeartbeat();
    heartbeatTimer = setInterval(() => cp.sendHeartbeat(), bootResp.interval * 1000);
    await cp.sendStatusNotification({connectorId: 0, errorCode: "NoError", status: "Available"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});
    // register code for GetDiagnostics, UpdateFirmware, Reset
    cp.answerGetDiagnostics( async (request) => {
      const fileName = "foo." + new Date().toISOString() + ".txt";
      cp.sendResponse(request.uniqueId, {fileName});
      await cp.sendDiagnosticsStatusNotification({status: "Idle"});
      await cp.sleep(5000);
      await cp.sendDiagnosticsStatusNotification({status: "Uploading"});
      await cp.ftpUploadDummyFile(request.payload.location, fileName);
      await cp.sendDiagnosticsStatusNotification({status: "Uploaded"});
    });
    cp.answerUpdateFirmware( async (request) => {
      cp.sendResponse(request.uniqueId, {});
      await cp.sendFirmwareStatusNotification({status: "Idle"});
      await cp.sleep(5000);
      await cp.sendFirmwareStatusNotification({status: "Downloading"});
      const file = await cp.ftpDownload(request.payload.location);
      cp.log("file downloaded to: " + file);
      await cp.sendFirmwareStatusNotification({status: "Downloaded"});
      await cp.sleep(5000);
      await cp.sendFirmwareStatusNotification({status: "Installing"});
      await cp.sleep(5000);
      await cp.sendFirmwareStatusNotification({status: "Installed"});
    });
    cp.answerReset(async (request) => {
      cp.sendResponse(request.uniqueId, {status: "Accepted"});
      cp.log("RESET ***boing-boing-boing*** " + request.payload.type);
      await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});
    });
    // Typical charging session
    await cp.sendAuthorize({idTag: "ccc"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Preparing"});
    cp.transaction = await cp.startTransaction({connectorId: 1, idTag: "ccc", meterStart: 1377, timestamp: "2020-06-11T10:50:58.333Z"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Charging"});
    await cp.meterValues({connectorId: 1, transactionId: cp.transaction.transactionId, meterValue: [{ timestamp: "2020-06-11T10:50:58.765Z", sampledValue: [{value: 1387}] }]});
    await cp.stopTransaction({transactionId: cp.transaction.transactionId, meterStop: 1399, timestamp: "2020-06-11T10:50:59.148Z"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Finishing"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});
  } catch (err) {
    console.log(err);
  } finally {
    clearInterval(heartbeatTimer);
    cp.close();
  }
}
