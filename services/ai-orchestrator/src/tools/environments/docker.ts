import { UnsupportedEnvironment, type UnsupportedEnvironmentOptions } from "./base";

/** Docker isolation is reserved for a later phase; this boundary never falls back to local. */
export class DockerEnvironment extends UnsupportedEnvironment {
  constructor(options: UnsupportedEnvironmentOptions = {}) {
    super("docker", options);
  }
}
