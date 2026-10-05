// The transition provider's engine thread. Normalizing and pricing the full feed takes seconds of CPU; it
// runs here so the server's main thread keeps answering pages and other requests meanwhile. Requests come
// from providers.mjs (threadedProvider) with the market distribution controls the main thread read; the
// answer is the response JSON text.
import { parentPort } from 'node:worker_threads';
import { createTransitionProvider } from './providers.mjs';
import { OddsError } from '../../public/odds-contract.js';

const provider = createTransitionProvider();
parentPort.on('message', async ({ id, method, args, controls }) => {
  try {
    const text = await provider[method]({ loadControls: controls === null ? null : async () => controls }, args);
    parentPort.postMessage({ id, text });
  } catch (caught) {
    if (!(caught instanceof OddsError)) console.error('[odds] Engine thread request failed:', caught?.stack || caught);
    const error = caught instanceof OddsError ? caught : new OddsError('UNAVAILABLE');
    parentPort.postMessage({ id, error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds } });
  }
});
