import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, join, basename } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

export const runtime = resolve(process.env.AEGIS_DSH_RUNTIME || '../../work/desktop-runtime');
export const requireRuntime = createRequire(join(runtime, 'package.json'));
export const load = name => import(pathToFileURL(requireRuntime.resolve(name)).href);
export const yaml = requireRuntime('js-yaml');
export const entrySchema = yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', construct: value => ({ __jsExpr: value }),
  predicate: value => value && typeof value.__jsExpr === 'string', represent: value => value.__jsExpr
}));
export const bundleRoot = process.env.AEGIS_TEST_BUNDLE ? resolve(process.env.AEGIS_TEST_BUNDLE) : fileURLToPath(new URL('../../', import.meta.url));
export const manifest = JSON.parse(readFileSync(join(bundleRoot, 'package.json')));
export function declarations() {
  return manifest.dsh.bundle.patch.flatMap(file => yaml.load(readFileSync(join(bundleRoot, file), 'utf8'), { schema: entrySchema }).flatMap(patch => patch.insert));
}
export async function host(directory, maxActiveSubagents = 2) {
  mkdirSync(directory, { recursive: true });
  const { boot } = await load('@deepseek-ai/dsh-app-boot');
  const row = (name, config) => ({ name: '@deepseek-ai/dsh-' + name, ...(config ? { config } : {}) });
  const entries = [
    { name: '@deepseek-ai/cordis-plugin-timer' },
    ...['llm', 'session', 'session-projection', 'system-prompt', 'tools', 'agent', 'working-directory', 'tool-working-directory', 'fs-local', 'subprocess-local', 'bash-local', 'shell-env', 'user-questions'].map(name => row(name)),
    row('session-persistence-jsonl', { root: join(directory, 'sessions'), compression: 'none' }),
    row('session-query-sqlite', { path: join(directory, 'search.sqlite'), openAt: 'never' }),
    row('agent-loop', { agents: [] }),
    row('agent-preset-registry', { default: 'standard' }),
    row('agent-preset', { id: 'standard', plugins: [] }),
    row('subagent', { maxActiveSubagents }), row('subagent-spawn-in-process'),
    ...declarations()
  ];
  // Keep the Loader's nested preset resolution beneath the copied runtime.
  const configDir = join(runtime, 'aegis-test-configs', basename(directory));
  mkdirSync(configDir, { recursive: true });
  const config = join(configDir, 'host.yml');
  writeFileSync(config, yaml.dump(entries, { schema: entrySchema }));
  return boot('aegis-test', config, [], undefined, pathToFileURL(join(runtime, 'package.json')).href);
}
export async function parent(ctx, cwd, id = 'aegis-lead') {
  return ctx.agents.create({ sessionId: id, meta: { cwd, agentPreset: 'reliable-dev' }, agentOptions: { provider: 'aegis-test', model: 'scripted' }, setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'reliable-dev'); } });
}
export async function settle(ctx, agent) {
  for (;;) {
    await agent.whenIdle();
    const seq = agent.session.seq;
    if (!await ctx.subagents.waitForChildren(agent) && agent.status === 'idle' && agent.session.seq === seq) break;
  }
  await ctx.sessions.flush(agent.session);
}
