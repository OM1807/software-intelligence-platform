import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Compile only the module under test, so tests also run with the existing
// Node 20 Docker image. The full typecheck remains a separate required check.
const temporary = await mkdtemp(join(tmpdir(), 'sip-oauth-tests-'));
try {
  const source = await readFile(new URL('../src/auth/githubOAuth.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  await writeFile(join(temporary, 'githubOAuth.mjs'), compiled.outputText);
  const tests = await readFile(new URL('../tests/githubOAuth.test.mjs', import.meta.url), 'utf8');
  await writeFile(join(temporary, 'githubOAuth.test.mjs'), tests.replace('../src/auth/githubOAuth.ts', './githubOAuth.mjs'));
  const result = spawnSync(process.execPath, ['--test', join(temporary, 'githubOAuth.test.mjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
