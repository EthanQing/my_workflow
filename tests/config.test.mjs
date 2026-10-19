import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { declarations, manifest, load, requireRuntime, yaml } from './helpers/runtime.mjs';

test('bundle declares seven unique independent presets using current API', () => {
  const rows = declarations();
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map(row => row.config.id)).size, 7);
  assert.equal(manifest.engines.dsh, '0.2.1-rc.2');
  assert(!Object.keys(manifest.scripts).some(key => /install|prepare/.test(key)));
  const lead = rows.find(row => row.config.id === 'reliable-dev');
  assert.equal(lead.config.name, 'Aegis Engineering');
  const delegates = lead.config.plugins.filter(p => p.name === '@deepseek-ai/dsh-tool-subagent');
  assert.equal(delegates.length, 6);
  for (const entry of delegates) {
    assert.equal(entry.config.provider, 'spawn');
    assert(rows.some(row => row.config.id === entry.config.agentPreset));
    for (const obsolete of ['backgroundMode', 'persona', 'toolFilter']) assert(!(obsolete in entry.config));
  }
});

test('official desktop/web composition disables host-global mutation and delegation tools', async () => {
  const { composeEntries } = await load('@deepseek-ai/dsh-app-boot');
  const { entryListSchema } = await load('@deepseek-ai/cordis-plugin-include');
  const layers = [];
  for (const name of ['dsh-base', 'dsh-web-app']) {
    const file = requireRuntime.resolve('@deepseek-ai/' + name + '/package.json');
    const metadata = JSON.parse(readFileSync(file));
    for (const patch of [metadata.dsh.bundle.patch].flat()) layers.push(yaml.load(readFileSync(join(dirname(file), patch), 'utf8'), { schema: entryListSchema }));
  }
  const entries = composeEntries(layers);
  for (const id of ['tool-fs','tool-fs-search','tool-bash','tool-pwsh','tool-subagent','tool-subagent-control','tool-subagent-list-agents']) assert.equal(entries.find(row => row.id === id)?.disabled, true, id);
  assert(entries.some(row => row.config?.id === 'standard'));
});

test('read-only presets have no shell or file-write surfaces; writers remain separate', () => {
  for (const row of declarations()) {
    const plugins = row.config.plugins;
    if (['aegis-planner','aegis-reviewer','aegis-project-mentor','reliable-dev','aegis-git-operator'].includes(row.config.id)) {
      const fs = plugins.find(p => p.name === '@deepseek-ai/dsh-tool-fs').config;
      assert.equal(fs.write, false);
      assert.equal(fs.edit, false);
    }
    if (['aegis-planner','aegis-reviewer','aegis-project-mentor','aegis-knowledge-curator'].includes(row.config.id)) assert(!plugins.some(p => /tool-(bash|pwsh)/.test(p.name)));
    if (row.config.id !== 'reliable-dev') assert(!plugins.some(p => /tool-subagent/.test(p.name)));
  }
});
