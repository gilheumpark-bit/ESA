/**
 * Process-local persistence is a development/test convenience only.
 *
 * `NODE_ENV` is read through a computed key so test runners and bundlers do not
 * replace the value at transform time. An explicit false always fails closed;
 * an explicit true is an operator-controlled escape hatch for local sandboxes.
 */
const NODE_ENV_KEY = ['NODE', 'ENV'].join('_');

interface StorageEnvironment {
  nodeEnv?: string;
  allowEphemeral?: string;
}

function readStorageEnvironment(): StorageEnvironment {
  return {
    nodeEnv: process.env[NODE_ENV_KEY],
    allowEphemeral: process.env.ESVA_ALLOW_EPHEMERAL_STORAGE,
  };
}

export function allowEphemeralStorage(env = readStorageEnvironment()): boolean {
  const explicit = env.allowEphemeral;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return env.nodeEnv !== 'production';
}
