import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const home = resolve(process.env.AEGIS_TEST_HOME || '../../work/runtime-test-home');
const result = spawnSync(process.execPath, ['--expose-internals', '--test', 'tests/runtime.test.mjs'], {
  stdio: 'inherit', env: { ...process.env, DSH_HOME: home, AEGIS_TEST_HOME: home }
});
process.exit(result.status ?? 1);
