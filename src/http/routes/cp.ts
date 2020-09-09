import * as express from 'express';
import {chargepointFactory, ChargepointOcpp16Json} from "../../chargepoint";
import * as _eval from 'eval';
import {RemoteConsoleTransmissionType, WSConRemoteConsole} from "../../remote-console-connection";
import {wsConCentralSystemRepository, wsConRemoteConsoleRepository} from '../../state-service';
import * as util from 'util';
import {QueueSubmitLayer} from "../../queue-submit-layer";
import {log} from '../../log';

const LOG_NAME = 'ocpp-chargepoint-simulator:simulator:cp-route';

const cpRouter = express.Router();
/**
 * use JavaScript coming from req.body and execute it.
 *
 * @param body: string - JavaScript using a variable connect with the signature (url: string): Promise<ChargepointOcpp16Json> or
 *                       a variable cp: ChargepointOcpp16Json
 * @param route.cpName: string - chargepoint name
 * @return exception or "ok" for success
 */
cpRouter.post('/:cpName?', async (req, res) => {
  const javaScript = "module.exports = async function(connect, cp) {\n" +
    req.body + "\n" +
    "  return cp;\n" +
    "};"
  const cpName = req.params.cpName;
  log.debug(LOG_NAME, cpName, javaScript);
  if(!cpName) {
    res.status(400);
    return;
  }
  try {
    const enhChargepointFactory = (url: string): Promise<ChargepointOcpp16Json> => chargepointFactory(url, cpName);
    const evalResp = _eval(javaScript, 'request-body', {}, true);
    const wsConCentralSystem = wsConCentralSystemRepository.get(cpName) as QueueSubmitLayer;
    const chargepointOcpp16Json = wsConCentralSystem ? wsConCentralSystem.chargepointOcpp16Json : undefined;
    const returningChargepointOcpp16Json = await evalResp(enhChargepointFactory, chargepointOcpp16Json);
    if (returningChargepointOcpp16Json) {
      wsConCentralSystemRepository.set(cpName, returningChargepointOcpp16Json.wsConCentralSystem);
    }
    res.send('ok');
  } catch (err) {
    log.debug(LOG_NAME, cpName, err);
    wsConRemoteConsoleRepository.get(cpName).forEach((wsConRemoteConsole: WSConRemoteConsole) => wsConRemoteConsole.add(RemoteConsoleTransmissionType.WS_ERROR, util.inspect(err)));
    res.status(500).send(util.inspect(err));
  }
});

export {
  cpRouter
};
