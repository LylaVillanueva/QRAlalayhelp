const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '../services/qrCardExport.js');
const exportSource = fs.readFileSync(sourcePath, 'utf8');

async function loadExporter(platform) {
  const fixtureKey = `__qralalayQrExportFixture_${platform}_${Math.random().toString(36).slice(2)}`;
  const fixture = {
    Platform: { OS: platform },
    printCalls: [],
    shareCalls: [],
    async printToFileAsync(options) {
      this.printCalls.push(['file', options]);
      return { uri: 'file:///app/cache/Print/card.pdf' };
    },
    async printAsync(options) { this.printCalls.push(['print', options]); },
    async isAvailableAsync() { return true; },
    async shareAsync(...args) { this.shareCalls.push(args); },
    buildQrCardHtml(image) { return `<html>${image}</html>`; },
  };
  globalThis[fixtureKey] = fixture;
  const injected = exportSource
    .replace("import { Platform } from 'react-native';", `const { Platform } = globalThis.${fixtureKey};`)
    .replace("import * as Print from 'expo-print';", `const Print = globalThis.${fixtureKey};`)
    .replace("import * as Sharing from 'expo-sharing';", `const Sharing = globalThis.${fixtureKey};`)
    .replace("import { buildQrCardHtml } from '../utils/qrCardHtml';", `const { buildQrCardHtml } = globalThis.${fixtureKey};`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
  return { ...fixture, exportQrCard: module.exportQrCard, fixtureKey };
}

test('Android QR PDF export opens the generated PDF in the system print/save flow', async () => {
  const fixture = await loadExporter('android');
  const qrRef = { current: { toDataURL: (callback) => callback('SGVsbG8=') } };
  await fixture.exportQrCard(qrRef);
  assert.deepEqual(fixture.printCalls, [
    ['file', { html: '<html>data:image/png;base64,SGVsbG8=</html>' }],
    ['print', { uri: 'file:///app/cache/Print/card.pdf' }],
  ]);
  assert.deepEqual(fixture.shareCalls, []);
  delete globalThis[fixture.fixtureKey];
});

test('an invalid or inaccessible PDF URI is rejected before opening Android print', async () => {
  const fixture = await loadExporter('android');
  globalThis[fixture.fixtureKey].printToFileAsync = async () => ({ uri: 'content://not-a-print-file' });
  const qrRef = { current: { toDataURL: (callback) => callback('SGVsbG8=') } };
  await assert.rejects(() => fixture.exportQrCard(qrRef), /could not be saved on this device/);
  delete globalThis[fixture.fixtureKey];
});

test('iOS continues to share the generated QR PDF', async () => {
  const fixture = await loadExporter('ios');
  const qrRef = { current: { toDataURL: (callback) => callback('SGVsbG8=') } };
  await fixture.exportQrCard(qrRef);
  assert.equal(fixture.shareCalls.length, 1);
  assert.equal(fixture.shareCalls[0][0], 'file:///app/cache/Print/card.pdf');
  delete globalThis[fixture.fixtureKey];
});
