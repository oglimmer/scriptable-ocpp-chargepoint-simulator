define(function (require) {
  let Vue = require('libs/vue');
  let Vuex = require('libs/vuex');
  let axios = require('libs/axios');

  Vue.use(Vuex);

  return new Vuex.Store({
    state: {
      inputText: '',
      wsStatus: '',
      wsStatusLastId: -1,
      wsError: [],
      cpName: '',
      ocppMessages: []
    },
    mutations: {
      updateInputText(state, value) {
        state.inputText = value;
      },
      startup(state) {
        let text = '';
        if(state.wsStatus.startsWith('closed')) {
          text += `cp = await connect(\'ws://localhost:8100/cpoc/PAG/${state.cpName}\');\n`;
        }
        text += 'const bootResp = await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n' +
          'await cp.sendHeartbeat(); setInterval(() => cp.sendHeartbeat(), bootResp.interval * 1000);\n' +
          'await cp.sendStatusNotification({connectorId: 0, errorCode: "NoError", status: "Available"});\n' +
          'await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});\n' +
          'cp.answerGetDiagnostics( async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {fileName: "foo.tar.gz"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendDiagnosticsStatusNotification({status: "Uploading"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendDiagnosticsStatusNotification({status: "Uploaded"});\n' +
          '});' +
          'cp.answerUpdateFirmware( async (request) => {\n' +
          '    cp.sendResponse(request.uniqueId, {});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Idle"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Downloading"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Downloaded"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Installing"});\n' +
          '    await cp.sleep(5000);\n' +
          '    await cp.sendFirmwareStatusNotification({status: "Installed"});\n' +
          '});\n';
        state.inputText = text;
      },
      bootnotification(state) {
        state.inputText += 'await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n';
      },
      heartbeat(state) {
        state.inputText += 'await cp.sendHeartbeat(); setInterval(() => cp.sendHeartbeat(), 60000);\n';
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
            state.inputText = `cp = await connect(\'ws://localhost:8100/cpoc/PAG/${state.cpName}\');\n`;
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
      }
    },
    actions: {
      async sendToServer(context) {
        try {
          await axios.post(`/cp/${context.state.cpName}`, context.state.inputText, {headers: {'content-type': 'application/javascript'}});
          context.commit('updateInputText', '');
        } catch (err) {
          context.commit('updateInputText', '');
          context.commit('updateWsError', err);
        }
      }
    }
  });
});
