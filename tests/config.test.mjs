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
  assert.equal(delegates.length, 1);
  const delegate = delegates[0].config;
  assert.equal(delegate.provider, 'spawn');
  assert.equal(delegate.toolName, 'aegis_delegate');
  assert.equal(delegate.agentPreset, 'aegis-planner');
  assert.deepEqual(delegate.allowedAgentPresets, ['aegis-planner','aegis-coder','aegis-knowledge-curator','aegis-reviewer','aegis-project-mentor','aegis-git-operator']);
  for (const id of delegate.allowedAgentPresets) assert(rows.some(row => row.config.id === id));
  for (const obsolete of ['backgroundMode', 'persona', 'toolFilter']) assert(!(obsolete in delegate));
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
    if (row.config.id !== 'reliable-dev') assert(!plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent'));
  }
});

test('only chat-capable children get send_message control; none get discovery or delegation', () => {
  const rows = declarations();
  const children = rows.filter(row => row.config.id !== 'reliable-dev');
  const chatRoles = new Set(['aegis-planner','aegis-coder','aegis-reviewer','aegis-git-operator']);
  assert.equal(children.length, 6);
  for (const row of children) {
    const plugins = row.config.plugins;
    const hasControl = plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent-control');
    assert.equal(hasControl, chatRoles.has(row.config.id), row.config.id);
    assert(!plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents'), row.config.id);
    assert(!plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent'), row.config.id);
  }
  const lead = rows.find(row => row.config.id === 'reliable-dev');
  assert(lead.config.plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent-control'));
  assert(lead.config.plugins.some(p => p.name === '@deepseek-ai/dsh-tool-subagent-control/list-agents'));
});
