// Exposes the local backend (port 3000) on a public URL via @expo/ngrok so a
// phone off the LAN can reach the API. Prints BACKEND_TUNNEL_URL=<url> and stays
// alive. Stop it to close the tunnel. Only run when you intend to expose the
// local backend to the internet.
const ngrok = require('@expo/ngrok');

(async () => {
  try {
    const url = await ngrok.connect({ addr: 3000, proto: 'http' });
    console.log('BACKEND_TUNNEL_URL=' + url);
    setInterval(() => {}, 1 << 30); // keep process alive
  } catch (e) {
    console.log('TUNNEL_ERROR: ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
})();
