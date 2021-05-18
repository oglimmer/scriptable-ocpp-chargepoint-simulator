define(function(require) {
  let Vue = require('libs/vue');
  let Vuex = require('libs/vuex');
  let axios = require('libs/axios');

  Vue.use(Vuex);

  const baseUrl = 'ws://localhost:8100/cpoc/PAG';

  function mapInitiator(action) {
    switch (action) {
      case "Heartbeat":
      case "BootNotification":
      case "StatusNotification":
      case "StartTransaction":
      case "MeterValues":
      case "StopTransaction":
      case "Authorize":
      case "DiagnosticsStatusNotification":
      case "FirmwareStatusNotification":
      case "SignCertificate":
        return "CP";
      default:
        return "CS";
    }
  }

  return new Vuex.Store({
    state: {
      inputText: '',
      wsStatus: '',
      wsStatusLastId: -1,
      wsError: [],
      cpName: '',
      ocppMessages: [],
      hideHeartbeats: false,
      sendHeartbeatsRegularly: true,
      sendMeterValuesRegularly: false,
      commandInProgress: false,
    },
    mutations: {
      updateInputText(state, value) {
        state.inputText = value;
      },
      startup(state) {
        let text = '';
        if (state.wsStatus.startsWith('closed')) {
          text += `cp = await connect('${state.connectTemplate}/${state.cpName}');\n`;
        }
        text += require('./startup-config');
        state.inputText = text;
      },
      bootnotification(state) {
        state.inputText += 'await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});\n';
      },
      initialize(state) {
        state.inputText += 'cp.sendRecurringHeartbeats = true;\n'
        + 'cp.sendRecurringMeterValues = false;\n'
        + 'cp.currentMeterValue = 0;\n'
        + 'cp.connectorIdForTx = 1;\n'
        + 'cp.incrementAndGetCurrentMeterValue = (amount) => { cp.currentMeterValue += amount; return String(cp.currentMeterValue); };\n'
        + 'const heartbeatFunction = async () => { try { if(cp.sendRecurringHeartbeats) { await cp.sendHeartbeat(); } } catch (e) { console.log(e); } heartbeatInterval = setTimeout(heartbeatFunction, 60000); }\n'
        + 'let heartbeatInterval = setTimeout(heartbeatFunction, 60000);\n'
        + 'const meterValueFunction = async () => { try { if(cp.transaction != null && cp.sendRecurringMeterValues) { await cp.meterValues({connectorId: cp.connectorIdForTx, transactionId: cp.transaction.transactionId, meterValue: [{ timestamp: new Date().toISOString() , sampledValue: [{value: String(cp.incrementAndGetCurrentMeterValue(10)) }] }]}); } } catch (e) { console.log(e); } meterValueInterval = setTimeout(meterValueFunction, 60000); }\n'
        + 'let meterValueInterval = setTimeout(meterValueFunction, 60000);\n'
        + 'cp.onClose(() => {clearInterval(heartbeatInterval); clearInterval(meterValueInterval);});\n';

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
        state.inputText += 'cp.connectorIdForTx = 1;\n' +
          'cp.transaction = await cp.startTransaction({connectorId: cp.connectorIdForTx, idTag: "ccc", meterStart: cp.incrementAndGetCurrentMeterValue(0), timestamp: "' + new Date().toISOString() + '"});\n' +
          'await cp.sendStatusNotification({connectorId: cp.connectorIdForTx, errorCode: "NoError", status: "Charging"});\n';
      },
      stopTransaction(state) {
        state.inputText += 'await cp.stopTransaction({transactionId: cp.transaction.transactionId, meterStop: cp.incrementAndGetCurrentMeterValue(10), timestamp: "' + new Date().toISOString() + '"});\n' +
          'cp.transaction = null;\n' + 
          'await cp.sendStatusNotification({connectorId: cp.connectorIdForTx, errorCode: "NoError", status: "Finishing"});\n' +
          'await cp.sendStatusNotification({connectorId: cp.connectorIdForTx, errorCode: "NoError", status: "Available"});\n';
      },
      meterValues(state) {
        state.inputText += 'await cp.meterValues({connectorId: cp.connectorIdForTx, transactionId: cp.transaction.transactionId, meterValue: [{ timestamp: "' + new Date().toISOString() + '", sampledValue: [{value: cp.incrementAndGetCurrentMeterValue(10)}] }]});\n';
      },
      updateWsStatus(state, value) {
        if (state.wsStatusLastId <= value.id) {
          if (state.wsStatus === '' && value.description.startsWith('closed')) {
            state.inputText = `cp = await connect('${state.connectTemplate}/${state.cpName}');\n`;
          }
          state.wsStatus = value.description;
          state.wsStatusLastId = value.id;
        }
      },
      updateWsError(state, value) {
        state.wsError.push(value);
      },
      setUrlParams(state, value) {
        state.cpName = value.cpName;
        state.connectTemplate = value.connectTemplate ? value.connectTemplate : baseUrl;
      },
      ocppMessages(state, value) {
        const { messageTypeId, uniqueId, action } = value;
        const index = state.ocppMessages.findIndex(e => e.uniqueId == uniqueId);
        let element;
        const initiator = mapInitiator(action);
        if (index === -1) {
          element = {
            initiator,
            uniqueId,
            action,
            request: 'undefined',
            answer: 'undefined',
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
      updateSendHeartbeatsRegularly(state, value) {
        state.sendHeartbeatsRegularly = value;
        axios.post(`/cp/${state.cpName}`, 'cp.sendRecurringHeartbeats = ' + value + ';', { headers: { 'content-type': 'application/javascript' } });
      },
      updateSendMeterValuesRegularly(state, value) {
        state.sendMeterValuesRegularly = value;
        axios.post(`/cp/${state.cpName}`, 'cp.sendRecurringMeterValues = ' + value + ';', { headers: { 'content-type': 'application/javascript' } });
      },
      clearOcppMessages(state, value) {
        state.ocppMessages = [];
      },
      clearErrors(state, value) {
        state.wsError = [];
      },
      commandInProgress(state, value) {
        state.commandInProgress = value;
      },
    },
    actions: {
      async sendToServer(context) {
        try {
          context.commit('commandInProgress', true);
          await axios.post(`/cp/${context.state.cpName}`, context.state.inputText, { headers: { 'content-type': 'application/javascript' } });
          context.commit('updateInputText', '');
          context.commit('commandInProgress', false);
        } catch (err) {
          context.commit('updateInputText', '');
          context.commit('updateWsError', err);
          context.commit('commandInProgress', false);
        }
      }
    },
  });
});
