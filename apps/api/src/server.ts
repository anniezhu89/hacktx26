import { createApp } from "./app";
const port = Number(process.env.PORT || 3001);
createApp().listen(port, "127.0.0.1", () =>
  console.log(`LabelBridge fixture server: http://127.0.0.1:${port}`),
);
