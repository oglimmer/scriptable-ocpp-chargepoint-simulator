define(function (require) {
  let Vue = require('libs/vue');
  let Vuex = require('libs/vuex');
  let axios = require('libs/axios');

  Vue.use(Vuex);

  const baseUrl = 'ws://localhost:8100/cpoc/PAG';
  
  return new Vuex.Store({
    state: {
      inputText: '',
      wsStatus: '',
      wsStatusLastId: -1,
      wsError: [],
      cpName: '',
      ocppMessages: [],
      hideHeartbeats: false,
      commandInProgress: false
    },
    mutations: {
      updateInputText(state, value) {
        state.inputText = value;
      },
      startup(state) {
        let text = '';
        if(state.wsStatus.startsWith('closed')) {
          text += `cp = await connect('${baseUrl}/${state.cpName}');\n`;
        }
        text += 'const bootResp = await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n' +
          'await cp.sendHeartbeat();\n' +
          'const heartbeatInterval = setInterval(() => cp.sendHeartbeat(), bootResp.interval * 1000); cp.onClose(() => clearInterval(heartbeatInterval));\n' +
          'await cp.sendStatusNotification({connectorId: 0, errorCode: "NoError", status: "Available"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});\n' +
          'cp.answerGetDiagnostics( async (request) => {\n' +
          '    const fileName = "foo." + new Date().toISOString() + ".txt";\n' +
          '    cp.sendResponse(request.uniqueId, {fileName});\n' +
          '    await cp.sendDiagnosticsStatusNotification({status: "Idle"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendDiagnosticsStatusNotification({status: "Uploading"});\n' +
          '    await cp.ftpUploadDummyFile(request.payload.location, fileName);\n' +
          '    await cp.sendDiagnosticsStatusNotification({status: "Uploaded"});\n' +
          '});\n' +
          'cp.answerUpdateFirmware( async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {});\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Idle"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Downloading"});\n' +
          '    const file = await cp.ftpDownload(request.payload.location);\n' +
          '    cp.log("file downloaded to: " + file);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Downloaded"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Installing"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Installed"});\n' +
          '});\n' +
          'cp.answerReset(async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {status: "Accepted"});\n' +
          '    cp.log("RESET ***boing-boing-boing*** " + request.payload.type);\n' +
          '    await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n' +
          '});\n' +
          'const configurationStore = [];\n' +
          'configurationStore.push({key: "foobar.1", readonly: false, value: "test"});\n' +
          'configurationStore.push({key: "foobar.2", readonly: true, value: "just a word"});\n' +
          'configurationStore.push({key: "barfoo.1", readonly: false, value: "100"});\n' +
          'cp.answerGetConfiguration( async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {configurationKey: configurationStore});\n' +
          '});\n' +
          'cp.answerChangeConfiguration( async (request) => {\n' +
          '    const element = configurationStore.find(e => e.key == request.payload.key);\n' +
          '    if(!element) {\n' +
          '        cp.sendResponse(request.uniqueId, {status: "NotSupported"});\n' +
          '    } else if (element.readonly) {\n' +
          '        cp.sendResponse(request.uniqueId, {status: "Rejected"});\n' +
          '    } else {\n' +
          '        element.value = request.payload.value;\n' +
          '        if(element.key == \'barfoo.1\') {\n' +
          '            cp.sendResponse(request.uniqueId, {status: "RebootRequired"});\n' +
          '        } else {\n' +
          '            cp.sendResponse(request.uniqueId, {status: "Accepted"});\n' +
          '        }\n' +
          '    }\n' +
          '});\n' +
          'cp.answerChangeAvailability( async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {status: "Accepted"});\n' +
          '});\n';
        state.inputText = text;
      },
      bootnotification(state) {
        state.inputText += 'await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n';
      },
      heartbeat(state) {
        state.inputText += 'await cp.sendHeartbeat(); const heartbeatInterval = setInterval(() => cp.sendHeartbeat(), 60000); cp.onClose(() => clearInterval(heartbeatInterval));\n';
      },
      statusNotification(state) {
        state.inputText += 'await cp.sendStatusNotification({connectorId: 0, errorCode: "NoError", status: "Available"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});\n';
      },
      authorize(state) {
        state.inputText += 'await cp.sendAuthorize({idTag: "ccc"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Preparing"});\n';
      },
      startTransaction(state) {
        state.inputText += 'cp.transaction = await cp.startTransaction({connectorId: 1, idTag: "ccc", meterStart: 1377, timestamp: "' + new Date().toISOString() + '"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Charging"});\n';
      },
      stopTransaction(state) {
        state.inputText += 'await cp.stopTransaction({transactionId: cp.transaction.transactionId, meterStop: 1399, timestamp: "' + new Date().toISOString() + '"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Finishing"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});\n';
      },
      meterValues(state) {
        state.inputText += 'await cp.meterValues({connectorId: 1, transactionId: cp.transaction.transactionId, meterValue: [{ timestamp: "' + new Date().toISOString() + '", sampledValue: [{value: 1387}] }]});\n';
      },
      updateWsStatus(state, value) {
        if (state.wsStatusLastId <= value.id) {
          if(state.wsStatus === '' && value.description.startsWith('closed')) {
            state.inputText = `cp = await connect('${baseUrl}/${state.cpName}');\n`;
          }
          state.wsStatus = value.description;
          state.wsStatusLastId = value.id;
        }
      },
      updateWsError(state, value) {
        state.wsError.push(value);
      },
      setCpName(state, value) {
        state.cpName = value;
      },
      ocppMessages(state, value) {
        const {messageTypeId, uniqueId, action} = value;
        const index = state.ocppMessages.findIndex(e => e.uniqueId == uniqueId);
        let element;
        if (index === -1) {
          element = {
            uniqueId,
            action,
            request: 'undefined',
            answer: 'undefined'
          };
          state.ocppMessages.splice(0, 0, element);
        } else {
          element = state.ocppMessages[index];
          if (action) {
            element.action = action;
          }
          Vue.set(state.ocppMessages, index, element);
        }
        if (messageTypeId == 2) {
          element.request = value;
        }
        if (messageTypeId == 3) {
          element.answer = value;
        }
      },
      hideHeartbeats(state, value) {
        state.hideHeartbeats = value;
      },
      clearOcppMessages(state, value) {
        state.ocppMessages = [];
      },
      commandInProgress(state, value) {
        state.commandInProgress = value;
      }
    },
    actions: {
      async sendToServer(context) {
        try {
          context.commit('commandInProgress', true);
          await axios.post(`/cp/${context.state.cpName}`, context.state.inputText, {headers: {'content-type': 'application/javascript'}});
          context.commit('updateInputText', '');
          context.commit('commandInProgress', false);
        } catch (err) {
          context.commit('updateInputText', '');
          context.commit('updateWsError', err);
          context.commit('commandInProgress', false);
        }
      }
    }
  });
});
