import { createApp } from "./app";
import { SessionStore } from "./session";
import { CaseStore } from "./store";
const port = Number(process.env.PORT || 3001);
const cases = new CaseStore(Date.now);
const sessions = new SessionStore(Date.now);
setInterval(() => {
  cases.sweep();
  sessions.sweep();
}, 60_000).unref();
createApp(undefined, { cases, sessions }).listen(port, "127.0.0.1", () =>
  console.log(
    `LabelBridge fixture server: http://127.0.0.1:${port} (in-memory demo state is lost on restart)`,
  ),
);
