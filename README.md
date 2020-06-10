# Scriptable OCPP Chargepoint Simulator

This simulator supports:

* OCPP 1.6 with JSON
* REST API with HTML Frontend
* File based batch mode
* Fully scriptable in JavaScript

Key development considerations:

* This tool should help you in learning and understanding the [Open Charge Point Protocol (OCPP)](https://www.openchargealliance.org), therefore it doesn't hide any details, but make them easier to grasp
* It's an all [ECMAScript](https://en.wikipedia.org/wiki/ECMAScript) based project
* [NodeJs](https://nodejs.org) based server with server-side [TypeScript](https://www.typescriptlang.org) support
* [Vue](https://vuejs.org) + [Vuex](https://vuex.vuejs.org) + [bulma](https://bulma.io) + [axios](https://github.com/axios/axios) + [vue-axios](https://github.com/imcvampire/vue-axios) based HTML client with super simple [requirejs](https://requirejs.org/) no-transpiler setup 
* TODO: OCPP code should run inside a browser too

# license

This software is licensed under [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0). See [LICENSE](LICENSE).

## install & build

Make sure you've node installed (macOS: `brew install node`).

```
# install dependencies
npm i
# transpile TypeScript into ECMAScript
npm run build
```

## batch operation

Put the logic using JavaScript into a file (e.g. custom.js). Your file needs to export an async function with one
parameter. This parameter will pass the `connect(url: string): Chargepoint` function to obtain a Chargepoint class object.

Example:

```
module.exports = async (connect) => {
  let cp;
  try {
    cp = await connect('ws://localhost:8100/xyz');
    await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});
    await cp.sendHeartbeat();
    await cp.sendStatusNotification({connectorId: 0, errorCode: "NoError", status: "Available"});
    await cp.sendStatusNotification({connectorId: 1, errorCode: "NoError", status: "Available"});
    cp.answerGetDiagnostics( async (request) => {
        cp.sendResponse(request.uniqueId, {fileName: "foo.tar.gz"});
        await cp.sleep(1000);
        await cp.sendDiagnosticsStatusNotification({status: "Uploading"});
        await cp.sleep(1000);
        await cp.sendDiagnosticsStatusNotification({status: "Uploaded"});
    });
  } catch (err) {
    console.log(err);
  } finally {
    cp.close();
  }
}
```

Start it:

```
DEBUG='ocpp-chargepoint-simulator:chargepoint' node build/src/main.js ./custom.js
```

'ocpp-chargepoint-simulator:chargepoint' will just print OCPP messages.
Use 'ocpp-chargepoint-simulator:*' instead for full debugging. 

## server operation

Default port for HTML is 3000. Change via env variable `PORT`. The WebSocket based Server to Client communication is using `PORT+1`.

```
DEBUG='ocpp-chargepoint-simulator:*' node build/src/main.js
```

Open http://localhost:3000/?cp=$chargePointName where chargePointName defines the ID of your chargepoint.

## server operation - DEV mode

Run those 2 in parallel:

```
npm run build:watch
DEBUG='ocpp-chargepoint-simulator:*' nodemon build/src/main.js
```

## OCPP Operations

### Supported

* BootNotification
* HeartBeat
* StatusNotification
* Authorize
* StartTransaction
* StopTransaction
* MeterValues
* Get Diagnostics
* Diagnostics Status Notification

### Not supported (yet)

* Data Transfer
* Firmware Status Notification

* Cancel Reservation
* Change Availability
* Change Configuration
* Clear Cache
* Clear Charging Profile
* Data Transfer
* Get Composite Schedule
* Get Configuration
* Get Local List Version
* Remote Start Transaction
* Remote Stop Transaction
* Reserve Now
* Reset
* Send Local List
* Set Charging Profile
* Trigger Message
* Unlock Connector
* Update Firmware
