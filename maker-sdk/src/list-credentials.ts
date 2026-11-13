import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const BACKEND_HTTP_URL = process.env.BACKEND_HTTP_URL ?? 'https://hyperdex-testnet.onrender.com';
const credDir = path.join(__dirname, '../credentials');

interface MakerInfo {
  name: string;
  stellarAddress: string;
  connectionStatus?: string;
}

async function fetchIdentity(apiKey: string): Promise<MakerInfo | null> {
  try {
    const res = await axios.post(`${BACKEND_HTTP_URL}/api/makers/verify-key`, { apiKey }, { timeout: 3000 });
    if (res.data.success) return res.data.maker;
  } catch {}
  return null;
}

function parseCredFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

async function main() {
  console.log();
  console.log(chalk.hex('#7c3aed')('  HyperDEX Maker SDK — Saved Credentials'));
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log();

  if (!fs.existsSync(credDir)) {
    console.log(chalk.gray('  No credentials folder found.'));
    console.log(chalk.gray('  Run npm run setup to create credentials.\n'));
    return;
  }

  const files = fs.readdirSync(credDir).filter((f: string) => f.endsWith('.cred'));

  if (files.length === 0) {
    console.log(chalk.gray('  No credentials found.'));
    console.log(chalk.gray('  Run npm run setup to create credentials.\n'));
    return;
  }

  for (const file of files) {
    const name = file.replace('.cred', '');
    const content = fs.readFileSync(path.join(credDir, file), 'utf8');
    const parsed = parseCredFile(content);
    const apiKey = parsed.MAKER_API_KEY ?? '';

    let statusStr = chalk.gray('○ Offline');
    let makerName = name;
    let address = '—';

    if (apiKey) {
      const info = await fetchIdentity(apiKey);
      if (info) {
        makerName = info.name;
        address = info.stellarAddress ? `${info.stellarAddress.slice(0, 6)}…${info.stellarAddress.slice(-6)}` : '—';
        statusStr = info.connectionStatus === 'connected'
          ? chalk.green('● Connected')
          : chalk.gray('○ Offline');
      }
    }

    console.log(
      `  ${chalk.white(name.padEnd(16))} ${chalk.white(makerName.padEnd(20))} ${address.padEnd(16)} ${statusStr}`
    );
  }

  console.log();
  console.log(chalk.gray('  To start a maker:'));
  files.forEach((f: string) => {
    console.log(chalk.cyan(`    npm run dev ${f.replace('.cred', '')}`));
  });
  console.log();
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
