// Zero-config wallet. First boot generates a BIP-39 mnemonic (MetaMask-compatible path
// m/44'/60'/0'/0/0) and stores it at ~/.pulsepay/wallet.json (0600). The address — and a
// loud "back up this phrase" message — go to STDERR only: stdout is the MCP JSON-RPC
// channel and must stay clean. Overrides: PULSEPAY_EVM_KEY (raw private key, nothing
// written to disk) or PULSEPAY_HOME (relocate the profile dir).
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { english, generateMnemonic, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import type { LocalAccount } from 'viem/accounts';

export const HOME = process.env.PULSEPAY_HOME ?? join(homedir(), '.pulsepay');

export function loadWallet(): LocalAccount {
  const rawKey = process.env.PULSEPAY_EVM_KEY;
  if (rawKey) {
    const account = privateKeyToAccount(rawKey.trim() as `0x${string}`);
    console.error(`[pulsenetwork] using wallet from PULSEPAY_EVM_KEY: ${account.address}`);
    return account;
  }
  mkdirSync(HOME, { recursive: true, mode: 0o700 });
  const file = join(HOME, 'wallet.json');
  if (existsSync(file)) {
    const { mnemonic } = JSON.parse(readFileSync(file, 'utf8')) as { mnemonic: string };
    const account = mnemonicToAccount(mnemonic);
    console.error(`[pulsenetwork] wallet: ${account.address} (Base USDC — fund this address to enable paid calls)`);
    return account;
  }
  const mnemonic = generateMnemonic(english);
  writeFileSync(file, JSON.stringify({ mnemonic, created: new Date().toISOString() }, null, 2));
  chmodSync(file, 0o600);
  const account = mnemonicToAccount(mnemonic);
  console.error(
    `[pulsenetwork] NEW wallet generated: ${account.address}\n` +
    `[pulsenetwork] Recovery phrase saved UNENCRYPTED at ${file} (mode 600). BACK IT UP —\n` +
    `[pulsenetwork] it is the only copy, and it imports into MetaMask/Rabby directly.\n` +
    `[pulsenetwork] Fund the address with USDC on Base to enable paid calls (a few dollars is plenty).`,
  );
  return account;
}
