import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.join(root,'public/vendor/ocr');
await fs.mkdir(destination,{recursive:true});
const sources={
  'tesseract.esm.min.js':'tesseract.js/dist/tesseract.esm.min.js',
  'worker.min.js':'tesseract.js/dist/worker.min.js',
  'worker.min.js.LICENSE.txt':'tesseract.js/dist/worker.min.js.LICENSE.txt',
  'tesseract.min.js.LICENSE.txt':'tesseract.js/dist/tesseract.min.js.LICENSE.txt',
  'TESSERACT-LICENSE.txt':'tesseract.js/LICENSE.md',
  'CORE-LICENSE.txt':'tesseract.js-core/LICENSE',
  'eng.traineddata.gz':'@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};
// LSTM-only recognition automatically chooses the supported CPU variant.
for(const variant of ['lstm','simd-lstm','relaxedsimd-lstm'])sources[`tesseract-core-${variant}.wasm.js`]=`tesseract.js-core/tesseract-core-${variant}.wasm.js`;
for(const [name,source] of Object.entries(sources))await fs.copyFile(path.join(root,'node_modules',source),path.join(destination,name));
await fs.writeFile(path.join(destination,'README.txt'),'Local bet-slip OCR: Tesseract.js 7.0.0, tesseract.js-core 7.0.0, @tesseract.js-data/eng 1.0.0 (4.0.0_best_int).\nSource: https://github.com/naptha/tesseract.js and https://github.com/naptha/tessdata\nThe engine is Apache-2.0. The English package declares MIT; its upstream trained data is Apache-2.0. See the accompanying license files. Regenerate with node scripts/vendor-bet-ocr.mjs.\n');
console.log('Copied self-hosted OCR engine, English language data and licenses.');
