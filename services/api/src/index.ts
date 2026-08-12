import { createApp } from "./app.js";

createApp().listen(
  Number(process.env.PORT ?? 4000),
  process.env.HOST ?? "127.0.0.1",
);
