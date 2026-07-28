#!/usr/bin/env node
import { runServer } from './mcp-server.js';
import { loadWallet } from './wallet.js';

const cmd = process.argv[2];
if (cmd === 'mcp' || cmd === undefined) {
  runServer().catch(err => { console.error('[lp-copilot] fatal:', err); process.exit(1); });
} else if (cmd === 'address') {
  console.log(loadWallet().address);
} else {
  console.log('Usage: lp-copilot-mcp [mcp|address]\n  mcp      run the MCP server on stdio (default)\n  address  print the wallet address');
  process.exit(cmd === 'help' || cmd === '--help' ? 0 : 1);
}
