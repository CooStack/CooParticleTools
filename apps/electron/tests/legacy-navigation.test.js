'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { mapLegacyUrlToAppUrl } = require('../src/legacy-navigation');

const backendUrl = 'http://127.0.0.1:43123/';

test('legacy builder URLs return to the matching SPA route', () => {
  assert.equal(
    mapLegacyUrlToAppUrl(
      `${backendUrl}legacy/composition_pointsbuilder.html?card=card-1&target=root`,
      backendUrl
    ),
    `${backendUrl}composition-pointsbuilder?card=card-1&target=root`
  );
  assert.equal(
    mapLegacyUrlToAppUrl(`${backendUrl}legacy/composition_builder.html`, backendUrl),
    `${backendUrl}composition`
  );
});

test('legacy navigation preserves query and hash for all known tools', () => {
  const result = mapLegacyUrlToAppUrl(
    `${backendUrl}legacy/pointsbuilder.html?pointsBuilderContext=generator#preview`,
    backendUrl
  );
  assert.equal(result, `${backendUrl}pointsbuilder?pointsBuilderContext=generator#preview`);
});

test('external and unknown URLs are left unchanged', () => {
  const external = 'https://example.com/legacy/composition_builder.html';
  assert.equal(mapLegacyUrlToAppUrl(external, backendUrl), external);

  const localFile = 'file:///C:/tmp/composition_builder.html';
  assert.equal(mapLegacyUrlToAppUrl(localFile, backendUrl), localFile);

  const unknown = `${backendUrl}legacy/not-a-tool.html`;
  assert.equal(mapLegacyUrlToAppUrl(unknown, backendUrl), unknown);
});
