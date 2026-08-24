/* Bundles the TypeScript tests with esbuild, then hands them to node --test. */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(mkdtempSync(join(tmpdir(), 'ombak-tests-')), 'pay.test.mjs')

await build({
  entryPoints: ['tests/pay.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
})

const child = spawn(process.execPath, ['--test', out], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
