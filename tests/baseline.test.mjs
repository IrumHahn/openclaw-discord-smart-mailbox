import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('initialization never processes older mail beyond the first page', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-mailbox-test-'))
  try {
    const bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    const ids = path.join(dir, 'ids.json')
    fs.writeFileSync(ids, JSON.stringify(Array.from({ length: 150 }, (_, i) => i + 1)))
    const himalaya = path.join(bin, 'himalaya')
    fs.writeFileSync(himalaya, `#!/usr/bin/env node
const fs=require('fs');const args=process.argv.slice(2);if(args[0]==='--version'){console.log('himalaya v2.2.1');process.exit(0)}if(args[0]!=='--json'||!args.includes('-m')||args.includes('-f')||args.includes('-o')){process.stderr.write('unexpected argument');process.exit(2)}const page=Number(args[args.indexOf('-p')+1]);const size=Number(args[args.indexOf('-s')+1]);const ids=JSON.parse(fs.readFileSync(process.env.MOCK_MAIL_IDS_FILE,'utf8')).toReversed();const data=ids.slice((page-1)*size,page*size).map(id=>({id:String(id),from:[{name:null,email:'sender@example.com'}],subject:'Old mail',date:'2026-01-01T00:00:00Z'}));process.stdout.write(JSON.stringify({queued:0,envelopes:data}));`)
    fs.chmodSync(himalaya, 0o700)
    const openclaw = path.join(bin, 'openclaw')
    fs.writeFileSync(openclaw, '#!/bin/sh\nif [ "$1" = config ]; then printf "[\\"*\\"]\\n"; else exit 12; fi\n')
    fs.chmodSync(openclaw, 0o700)
    const config = path.join(dir, 'config.json')
    fs.writeFileSync(config, JSON.stringify({ discordChannelId: '123456789012345678', ownerDiscordId: '123456789012345679', stateDir: path.join(dir, 'state'), accounts: [{ id: 'test', address: 'test@example.com', from: 'Tester <test@example.com>', sentFolder: 'Sent', trashFolder: 'Trash' }] }))
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_MAIL_IDS_FILE: ids, SMART_MAILBOX_CONFIG: config, SMART_MAILBOX_TRIAGE_AGENT: 'mail-triage', DISCORD_BOT_TOKEN: 'test-only' }
    const script = path.resolve(import.meta.dirname, '../scripts/mailbox.mjs')
    const init = spawnSync(process.execPath, [script, '--init'], { env, encoding: 'utf8' })
    assert.equal(init.status, 0, init.stderr)
    const check = spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
    assert.equal(check.status, 0, check.stderr)
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'state/mailbox.json'), 'utf8'))
    assert.equal(state.highWater.test, '150')
    assert.equal(Object.keys(state.records).length, 0)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
