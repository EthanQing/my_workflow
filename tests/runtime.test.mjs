import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { host, load, parent, settle, declarations } from './helpers/runtime.mjs';
import { adapterClass } from './fixtures/scripted-llm.mjs';

test('official desktop loader and six continuable roles', { timeout: 120000 }, async t => {
  const base = resolve(process.env.AEGIS_TEST_HOME || '../../work/runtime-test-home');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'run-'));
  const cwd = join(directory, 'project');
  mkdirSync(cwd);
  const ctx = await host(directory);
  t.after(() => ctx.fiber.dispose());
  const { LlmAdapter, createUserMessage } = await load('@deepseek-ai/dsh-llm');
  const adapter = new (adapterClass(LlmAdapter))();
  ctx.llm.registerAdapter(['aegis-test'], adapter);
  const roster = await ctx.agentPresets.list();
  assert.equal(roster.length, 8); // includes untouched built-in stand-in
  assert(roster.every(row => !row.broken), JSON.stringify(roster));
  await assert.rejects(ctx.agentPresets.register({ id: 'reliable-dev', plugins: [] }), /already|duplicate/i);
  const handle = await parent(ctx, cwd);
  const lead = handle.agent;
  const ids = [];
  const records = [];
  for (const row of declarations().filter(row => row.config.id !== 'reliable-dev')) {
    const marker = randomUUID();
    const result = await ctx.subagents.startActivation({ provider: 'spawn', label: row.config.id, signal: new AbortController().signal, delivery: 'caller', request: { parent: lead, prompt: [{ type: 'text', text: marker }], agentPreset: row.config.id, maxDepth: 1 } });
    ids.push(result.childId);
    await settle(ctx, lead);
    const outcome = await result.result;
    assert.equal(outcome.stopReason, 'completed', JSON.stringify(outcome));
    assert.equal(ctx.agents.get(result.childId), undefined, 'completed activation releases its live instance');
    assert(adapter.requests.some(request => JSON.stringify(request).includes(marker)));
    const request = adapter.requests.at(-1);
    const toolNames = request.tools?.map(tool => tool.name) || [];
    if (['aegis-planner','aegis-reviewer','aegis-project-mentor'].includes(row.config.id)) {
      assert(!toolNames.some(name => /write|edit|bash|pwsh/.test(name)), JSON.stringify(toolNames));
      assert(toolNames.length > 0);
    }
    assert(toolNames.includes('working_directory'), 'desktop enabled global working-directory tool is retained');
    if (['aegis-coder','aegis-knowledge-curator'].includes(row.config.id)) assert(toolNames.includes('write') && toolNames.includes('edit'));
    else assert(!toolNames.includes('write') && !toolNames.includes('edit'));
    if (['aegis-coder','aegis-git-operator'].includes(row.config.id)) assert(toolNames.includes(process.platform === 'win32' ? 'pwsh' : 'bash'));
    else assert(!toolNames.includes('bash') && !toolNames.includes('pwsh'));
    const before = adapter.requests.length;
    await ctx.subagents.sendMessage(lead, result.childId, [{ type: 'text', text: 'Second legal read-only assignment. Recall the first marker.' }], { signal: new AbortController().signal });
    await settle(ctx, lead);
    assert(adapter.requests.length > before);
    assert(adapter.requests.slice(before).some(request => JSON.stringify(request).includes(marker)), 'first-round history survives');
    let answer = outcome.output[0].text;
    if (row.config.id === 'aegis-planner') {
      // Build realistic investigation history before the final plan; recovery must page beyond 50 events.
      for (let step = 0; step < 5; step++) {
        if (step === 4) adapter.actions.push('AEGIS complete Planner plan ' + marker);
        await ctx.subagents.sendMessage(lead, result.childId, [{ type: 'text', text: 'Continue planning investigation step ' + step }], { signal: new AbortController().signal });
        await settle(ctx, lead);
      }
      answer = 'AEGIS complete Planner plan ' + marker;
    }
    records.push({ id: result.childId, preset: row.config.id, marker, answer });
    console.log('two rounds same ID', row.config.id, result.childId);
  }
  assert.equal(ids.length, 6);
  const catalog = await ctx.subagents.listChildren(lead.id);
  assert.equal(catalog.length, 6);
  assert.deepEqual(catalog.map(row => row.id), ids);
  assert(catalog.every(row => row.mode === 'continuable'));
  const drive = async (text, actions = []) => {
    adapter.actions.push(...actions);
    lead.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
    await settle(ctx, lead);
  };
  const beforeList = adapter.requests.length;
  await drive('Inspect existing children', [{ name: 'list_agents', args: {} }]);
  const listed = JSON.stringify(adapter.requests.slice(beforeList));
  for (const id of ids) assert(listed.includes(id), 'list_agents exposes original ID');
  assert(listed.includes('inactive'), 'list_agents reports settled state');
  adapter.failNext = true;
  await drive('Receive the already completed Planner result');
  const beforeRecovery = adapter.requests.length;
  await drive('Recover original Planner evidence', [{ name: 'session_event_search', args: { session_id: records[0].id, query: records[0].answer } }]);
  const searchMessage = adapter.requests.at(-1).messages.at(-1);
  assert.equal(searchMessage.role, 'tool');
  assert.equal(searchMessage.isError, true);
  assert.equal(searchMessage.content[0].text, 'Error: session search is disabled in this deployment');
  let cursor = 0;
  let seq;
  let pages = 0;
  for (;;) {
    await drive('Recover without an index', [{ name: 'session_event_read', args: { session_id: records[0].id, seq: cursor, after: 50 } }]);
    const page = adapter.requests.at(-1).messages.at(-1);
    assert.equal(page.isError, false);
    pages++;
    const text = page.content[0].text;
    const eventLines = text.split('\n');
    for (let i = 0; i < eventLines.length; i++) {
      if (/\| assistant\/message \|/.test(eventLines[i]) && eventLines[i + 1]?.includes(records[0].answer)) seq = Number(eventLines[i].match(/seq (\d+)/)[1]);
    }
    if (seq !== undefined) break;
    const returned = [...text.matchAll(/(?:Target event seq |^- seq )(\d+)/gm)].map(match => Number(match[1]));
    const last = Math.max(...returned);
    assert(last > cursor, 'original plan must be found before reaching end of history');
    cursor = last;
  }
  assert(pages > 1, 'recovery must traverse multiple event windows');
  assert(seq > 50, 'completed Planner result is beyond the first window');
  await drive('Read recovered original result', [{ name: 'session_event_read', args: { session_id: records[0].id, seq } }]);
  const readMessage = adapter.requests.at(-1).messages.at(-1);
  assert.equal(readMessage.isError, false);
  assert(JSON.stringify(readMessage.content).includes(records[0].answer));
  const beforeContinue = adapter.requests.length;
  await drive('Continue original Planner', [{ name: 'send_message', args: { agent_id: records[0].id, message: 'Supplement the same plan without writing.' } }]);
  assert(adapter.requests.slice(beforeContinue).some(request => JSON.stringify(request).includes(records[0].marker)));
  assert.equal((await ctx.subagents.listChildren(lead.id)).length, 6);
  console.log('Lead failure: search disabled; paginated raw reads recovered Planner result at seq', seq, 'in', pages, 'windows');
  await ctx.sessions.flush(lead.session);
  await ctx.fiber.dispose();
  const cold = await host(directory);
  t.after(() => cold.fiber.dispose());
  const coldAdapter = new (adapterClass(LlmAdapter))();
  cold.llm.registerAdapter(['aegis-test'], coldAdapter);
  const resumed = await cold.agents.resume({ resumeSessionId: lead.id, agentOptions: { provider: 'aegis-test', model: 'scripted' }, setup: async agentCtx => { await cold.agentPresets.mount(agentCtx, 'reliable-dev'); } });
  for (const record of records) {
    const before = coldAdapter.requests.length;
    await cold.subagents.sendMessage(resumed.agent, record.id, [{ type: 'text', text: 'Cold recovery: recall the original marker.' }], { signal: new AbortController().signal });
    await settle(cold, resumed.agent);
    assert(coldAdapter.requests.slice(before).some(request => JSON.stringify(request).includes(record.marker)));
    console.log('cold recovery same ID', record.preset, record.id);
  }
  assert.equal((await cold.subagents.listChildren(lead.id)).length, 6);
});

test('Lead official six delegation tools route to independent child presets', { timeout: 120000 }, async t => {
  const base = resolve(process.env.AEGIS_TEST_HOME || '../../work/runtime-test-home');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'tools-'));
  const ctx = await host(directory, 1);
  t.after(() => ctx.fiber.dispose());
  const { LlmAdapter, createUserMessage } = await load('@deepseek-ai/dsh-llm');
  const adapter = new (adapterClass(LlmAdapter))();
  ctx.llm.registerAdapter(['aegis-test'], adapter);
  const cwd = join(directory, 'project');
  mkdirSync(cwd);
  const { agent } = await parent(ctx, cwd, 'tool-lead');
  const ids = [];
  for (const row of declarations().filter(row => row.config.id !== 'reliable-dev')) {
    const name = row.config.id.replace('aegis-', 'aegis_').replaceAll('-', '_');
    adapter.actions.push({ name, args: { description: row.config.id, prompt: 'Read-only lifecycle test: no file changes, no Git operation.' } });
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Exercise ' + name }], source: { kind: 'user' } }));
    await settle(ctx, agent);
    const catalog = await ctx.subagents.listChildren(agent.id);
    const child = catalog.find(child => child.label === row.config.id);
    assert(child, 'delegation tool must create its role');
    const observation = await ctx.sessionQuery.observeSession(child.id);
    assert.equal(observation.header.agentPreset, row.config.id);
    observation[Symbol.dispose]();
    ids.push(child.id);
    adapter.actions.push({ name: 'send_message', args: { agent_id: child.id, message: 'Second read-only task in the same child.' } });
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Reuse existing child' }], source: { kind: 'user' } }));
    await settle(ctx, agent);
    assert.equal((await ctx.subagents.listChildren(agent.id)).length, ids.length);
  }
  assert.equal(new Set(ids).size, 6);
  console.log('all six official delegation tools and send_message passed with maxActiveSubagents=1');
});
