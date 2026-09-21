import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "token",
    "password",
    "secret",
    "*.token",
    "*.password",
    "*.secret",
    // P7.6.2 — explicit payment merchant secret paths
    "paymeKey",
    "clickSecret",
    "payme_key",
    "click_secret",
    "*.paymeKey",
    "*.clickSecret",
    "*.payme_key",
    "*.click_secret",
    "payme.key",
    "click.secret",
    "merchantSecret",
    "*.merchantSecret",
    "secretMaterial",
    "*.secretMaterial",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
