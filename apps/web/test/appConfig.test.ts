import { describe, expect, it } from 'vitest';
import { AppConfig } from '@/core/config/AppConfig';

const cfg = (apiUrl: string) =>
  new AppConfig({
    apiUrl,
    stellarRpcUrl: '',
    networkPassphrase: 'Test SDF Network ; September 2015',
    firebase: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    },
  });

const at = (url: string) => {
  const u = new URL(url);
  return { hostname: u.hostname, protocol: u.protocol, origin: u.origin };
};

describe('AppConfig.apiBaseUrl', () => {
  it('rewrites a loopback API URL to the LAN host the page was opened from', () => {
    expect(cfg('http://localhost:4000').apiBaseUrl(at('http://192.168.0.14:3000/market'))).toBe(
      'http://192.168.0.14:4000',
    );
  });

  it('keeps the configured URL on localhost and for real hosts', () => {
    expect(cfg('http://localhost:4000/').apiBaseUrl(at('http://localhost:3000/'))).toBe(
      'http://localhost:4000',
    );
    expect(cfg('https://api.fracta.example/v1').apiBaseUrl(at('https://app.fracta.example/'))).toBe(
      'https://api.fracta.example/v1',
    );
  });

  it('uses the page origin when the API is served by the same server', () => {
    expect(cfg('').apiBaseUrl(at('http://192.168.0.14:3000/market'))).toBe('http://192.168.0.14:3000');
    expect(cfg('').apiBaseUrl(null)).toBe('');
  });

  it('reports Firebase as configured only with the mandatory keys', () => {
    expect(cfg('http://localhost:4000').firebaseConfigured).toBe(false);
  });
});
