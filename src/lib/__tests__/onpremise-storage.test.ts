import {
  decodeOnPremiseConfig,
  encodeOnPremiseConfig,
  type OnPremiseClientConfig,
} from '@/lib/onpremise-storage';

const localAuthKey = ['local', 'secret', 'token'].join('-');

const config: OnPremiseClientConfig = {
  serverUrl: 'http://10.0.0.20:11434',
  apiType: 'ollama',
  modelName: 'qwen2.5:32b',
  apiKey: localAuthKey,
  contextLength: 8192,
  timeout: 60,
  enabled: true,
};

describe('on-premise client storage', () => {
  it('never serializes the authentication key in plaintext', async () => {
    const encoded = await encodeOnPremiseConfig(config, async () => 'v5:ciphertext');

    expect(encoded).not.toContain(localAuthKey);
    expect(JSON.parse(encoded)).toMatchObject({
      schemaVersion: 1,
      encryptedApiKey: 'v5:ciphertext',
      serverUrl: config.serverUrl,
    });
    expect(JSON.parse(encoded)).not.toHaveProperty('apiKey');
  });

  it('decrypts the key only when the saved configuration is consumed', async () => {
    const decoded = await decodeOnPremiseConfig(
      JSON.stringify({
        schemaVersion: 1,
        encryptedApiKey: 'v5:ciphertext',
        serverUrl: config.serverUrl,
        apiType: config.apiType,
        modelName: config.modelName,
        contextLength: config.contextLength,
        timeout: config.timeout,
        enabled: config.enabled,
      }),
      async (value) => value === 'v5:ciphertext' ? config.apiKey : '',
    );

    expect(decoded).toEqual(config);
  });

  it('rejects malformed or unsupported saved configuration', async () => {
    await expect(decodeOnPremiseConfig('{"serverUrl":"javascript:alert(1)"}', async () => ''))
      .rejects.toThrow('저장된 On-Premise 설정');
  });
});
