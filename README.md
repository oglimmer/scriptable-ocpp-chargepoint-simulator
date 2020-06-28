# pick up

* npm run build:watch
* npm run build:browser
* edit public/scripts/ws/websocket-connection-centralsystem.js and make `new Websocket.default(...`
* ./start.sh --d --v1
* open browser at http://localhost:3000

```
(async () => {
cp = await connect('....');
})();
```

# notes

* Works in general
* doesn't work on second (or more) calls of http://localhost:3000
