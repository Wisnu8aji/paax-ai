import { UnsupportedEnvironment, type UnsupportedEnvironmentOptions } from "./base";

/** SSH isolation is reserved for a later phase; this boundary never falls back to local. */
export class SSHEnvironment extends UnsupportedEnvironment {
  constructor(options: UnsupportedEnvironmentOptions = {}) {
    super("ssh", options);
  }
}
