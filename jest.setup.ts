import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for jsdom + @solana/web3.js
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Polyfill fetch for jsdom test environment
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response)
  );
}
