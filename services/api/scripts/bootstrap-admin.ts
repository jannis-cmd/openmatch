import { randomBytes } from "node:crypto";
import { Accounts, AccountError } from "../src/accounts.js";

const email = process.env.OPENMATCH_ADMIN_EMAIL ?? "admin@openmatch.local";
const generated = process.env.OPENMATCH_ADMIN_PASSWORD === undefined;
const password =
  process.env.OPENMATCH_ADMIN_PASSWORD ??
  `OM-${randomBytes(24).toString("base64url")}`;
const accounts = new Accounts();

try {
  const result = accounts.bootstrapAdmin(email, password);
  console.log(
    JSON.stringify(
      {
        created: true,
        email: result.email,
        ...(generated ? { password } : {}),
        passwordShownOnce: generated,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof AccountError) {
    console.error(JSON.stringify({ created: false, error: error.code }));
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  accounts.close();
}
