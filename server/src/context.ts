import type { UserRow, TokenRow } from "./db.js";
import type { Service } from "./service.js";
import type { Executor } from "./executor.js";
import type { Config } from "./config.js";

export type AuthCtx =
  | { kind: "user"; user: UserRow }
  | { kind: "token"; token: TokenRow };

export type AppVariables = {
  auth?: AuthCtx;
  remoteIp?: string;
  service?: Service;
  executor?: Executor;
  config?: Config;
};