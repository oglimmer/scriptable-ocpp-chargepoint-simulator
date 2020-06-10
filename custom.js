/**
 * PURE JAVASCRIPT
 */

module.exports = async (connect) => {
  let cp;
  try {
    cp = await connect('ws://localhost:8100/cpoc/PAG/DE9110001779_CPN01');
    await cp.sendBootnotification();
    await cp.sendHeartbeat();
    await cp.sendStatusNotification(0);
    await cp.sendStatusNotification(1);
  } catch (err) {
    console.log(err);
  } finally {
    cp.close();
  }
}
