// What this phone's location sharing is doing right now, kept only in memory so the Diagnostics screen
// can show it. Nothing here is stored or sent anywhere.
export const gpsDebug = {
  watching: false,
  geo: 'not started',
  lastFixAt: 0,
  publish: 'nothing sent yet',
  lastSentAt: 0,
};
