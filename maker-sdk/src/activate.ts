import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { USDC_CONTRACT, EURC_CONTRACT } from './constants';

const ENV_PATH = path.join(__dirname, '../.env');

process.on('SIGINT', () => {
  console.log(chalk.red('\n\n  ✗ Activation cancelled. Your existing config is unchanged.\n'));
  process.exit(1);
});

function parseEnvFile(content: string): Record<string, string> {
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

function rebuildEnvFile(original: string, updates: Record<string, string>): string {
  const lines = original.split('\n');
  const touched = new Set<string>();

  const updated = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key in updates) {
      touched.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys not already in the file
  for (const [key, val] of Object.entries(updates)) {
    if (!touched.has(key)) {
      updated.push(`${key}=${val}`);
    }
  }

  return updated.join('\n');
}

async function main() {
  try {
    // ── BANNER ─────────────────────────────────────────────────────────────────
    console.log(chalk.hex('#7c3aed')('\n  HyperDex Maker SDK — Activation\n'));
    console.log(chalk.gray('  Complete your setup with the credentials from your admin.\n'));

    // ── CHECK .ENV EXISTS ─────────────────────────────────────────────────────
    if (!fs.existsSync(ENV_PATH)) {
      console.log(chalk.red('  ✗ No configuration found.'));
      console.log(chalk.gray('  Run npm run setup first to generate your keypair.\n'));
      process.exit(1);
    }

    const rawEnv = fs.readFileSync(ENV_PATH, 'utf8');
    const existingEnv = parseEnvFile(rawEnv);

    if (!existingEnv.SIGNER_PRIVATE_KEY) {
      console.log(chalk.red('  ✗ Keypair not found. Run npm run setup first.\n'));
      process.exit(1);
    }

    // ── CHECK IF ALREADY ACTIVATED ────────────────────────────────────────────
    if (existingEnv.MAKER_API_KEY) {
      console.log(chalk.green('  ✓ You are already activated.\n'));
      console.log(chalk.gray('  Maker address:  ') + chalk.white(existingEnv.MAKER_ADDRESS ?? '(not set)'));
      console.log(chalk.gray('  Maker name:     ') + chalk.white(existingEnv.MAKER_NAME ?? '(not set)'));
      console.log(chalk.gray('  API key:        ') + chalk.white(existingEnv.MAKER_API_KEY.slice(0, 15) + '...'));
      console.log(chalk.gray('  Backend URL:    ') + chalk.white(existingEnv.BACKEND_WS_URL ?? '(not set)'));
      console.log();

      const { reactivate } = await prompts({
        type: 'confirm',
        name: 'reactivate',
        message: 'Update your API key or backend URL?',
        initial: false,
      }, {
        onCancel: () => {
          console.log(chalk.green('\n  ✓ Already active. Run npm run dev to start.\n'));
          process.exit(0);
        },
      });

      if (!reactivate) {
        console.log(chalk.green('\n  ✓ Already active. Run npm run dev to start.\n'));
        process.exit(0);
      }
      console.log();
    }

    // ── SHOW REGISTERED IDENTITY ──────────────────────────────────────────────
    console.log(chalk.gray('  Confirming your registration:'));
    console.log(chalk.gray('  Maker address: ') + chalk.white(existingEnv.MAKER_ADDRESS ?? '(not set)'));
    console.log(chalk.gray('  Maker name:    ') + chalk.white(existingEnv.MAKER_NAME ?? '(not set)'));
    console.log();

    // ── ASK FOR CREDENTIALS ───────────────────────────────────────────────────
    const credentials = await prompts(
      [
        {
          type: 'text',
          name: 'apiKey',
          message: 'API key from your admin (sk_live_...):',
          validate: (v: string) => {
            if (!v) return 'API key is required';
            if (!v.startsWith('sk_live_')) return 'API key must start with sk_live_';
            if (v.length < 72) return 'API key looks incomplete — check you copied the full key';
            return true;
          },
        },
        {
          type: 'text',
          name: 'backendWsUrl',
          message: 'HyperDex backend WebSocket URL:',
          initial: existingEnv.BACKEND_WS_URL || 'wss://backend-production-c4e14cb9.up.railway.app/ws/maker',
          hint: 'press enter for default',
          validate: (v: string) => {
            if (!v) return 'URL is required';
            if (!v.startsWith('ws://') && !v.startsWith('wss://')) return 'Must start with ws:// or wss://';
            return true;
          },
        },
        {
          type: 'number',
          name: 'port',
          message: 'Port for your maker server:',
          initial: parseInt(existingEnv.PORT || '3001'),
          min: 1000,
          max: 65535,
        },
      ],
      {
        onCancel: () => {
          console.log(chalk.red('\n  ✗ Activation cancelled. Your existing config is unchanged.\n'));
          process.exit(1);
        },
      }
    );

    // ── VERIFY API KEY ────────────────────────────────────────────────────────
    const spinner = ora({
      text: 'Verifying your API key with the backend...',
      color: 'cyan',
    }).start();

    const httpUrl = credentials.backendWsUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://')
      .replace('/ws/maker', '');

    let keyVerified = false;
    let backendOnline = false;
    let makerAddress = existingEnv.MAKER_ADDRESS || '';
    let poolAddress = existingEnv.POOL_ADDRESS || '';

    try {
      const healthRes = await axios.get(`${httpUrl}/health`, { timeout: 5000 });
      if (healthRes.data?.status === 'ok') {
        backendOnline = true;
      }
    } catch {
      backendOnline = false;
    }

    if (backendOnline) {
      try {
        const verifyRes = await axios.post(
          `${httpUrl}/api/makers/verify-key`,
          { apiKey: credentials.apiKey, makerAddress: existingEnv.MAKER_ADDRESS },
          { timeout: 10000 }
        );
        if (verifyRes.data?.success) {
          spinner.succeed(chalk.green('API key verified ✓'));
          keyVerified = true;

          // Capture maker address from response
          makerAddress = verifyRes.data.maker?.stellarAddress || existingEnv.MAKER_ADDRESS || '';

          // Fetch pool address
          try {
            const poolRes = await axios.get(
              `${httpUrl}/api/makers/${makerAddress}/pool`,
              { timeout: 5000 }
            );
            if (poolRes.data.poolAddress) {
              poolAddress = poolRes.data.poolAddress;
              console.log(chalk.green(`  ✓ Pool found: ${poolAddress.slice(0, 8)}...`));
            } else {
              console.log(chalk.yellow('  ⚠ No pool deployed — deploy from /maker dashboard'));
            }
          } catch {
            console.log(chalk.gray('  Pool address not fetched — keeping existing'));
          }
        } else {
          spinner.fail('API key invalid — check you copied it correctly');
          console.log(chalk.gray('  Contact your admin for a new API key.'));
          process.exit(1);
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response) {
          const status = err.response.status;
          const error = err.response.data?.error ?? 'Unknown error';
          if (status === 401) {
            spinner.fail(`API key invalid — ${error}`);
            console.log(chalk.gray('  Contact your admin for a new API key.'));
            process.exit(1);
          } else if (status === 404) {
            spinner.fail(`Maker not found — admin may not have registered you yet`);
            console.log(chalk.gray('  Contact your admin to complete your registration first.'));
            process.exit(1);
          } else {
            spinner.fail(`Backend error (${status}) — ${error}`);
            process.exit(1);
          }
        } else {
          spinner.fail('Could not reach verify endpoint');
          process.exit(1);
        }
      }
    } else {
      spinner.warn('Backend not reachable — key saved but not verified');
      console.log(chalk.gray('  Make sure the backend is running before npm run dev'));
    }

    // ── WRITE COMPLETE .ENV ───────────────────────────────────────────────────
    const updatedContent = rebuildEnvFile(rawEnv, {
      MAKER_API_KEY: credentials.apiKey,
      BACKEND_WS_URL: credentials.backendWsUrl,
      PORT: String(credentials.port),
      MAKER_ADDRESS: makerAddress,
      POOL_ADDRESS: poolAddress,
      USDC_CONTRACT,
      EURC_CONTRACT,
    });

    fs.writeFileSync(ENV_PATH, updatedContent, { encoding: 'utf8', mode: 0o600 });

    // ── FINAL SCREEN ──────────────────────────────────────────────────────────
    console.log('\n');
    console.log(chalk.gray('  ═══════════════════════════════════════════════'));
    console.log(chalk.green.bold('  ✓ Activation Complete — You are ready!'));
    console.log(chalk.gray('  ═══════════════════════════════════════════════'));
    console.log();
    console.log(chalk.white.bold('  Configuration summary:'));
    console.log();
    console.log(chalk.gray('  Maker address:  ') + chalk.white(existingEnv.MAKER_ADDRESS ?? ''));
    console.log(chalk.gray('  Maker name:     ') + chalk.white(existingEnv.MAKER_NAME ?? ''));
    console.log(chalk.gray('  Backend:        ') + chalk.white(credentials.backendWsUrl));
    console.log(chalk.gray('  Port:           ') + chalk.white(String(credentials.port)));
    console.log(chalk.gray('  API key:        ') + chalk.white(credentials.apiKey.slice(0, 15) + '...'));
    console.log(chalk.gray('  Private key:    ') + chalk.red('[stored securely — never shown]'));
    console.log();
    console.log(chalk.gray('  ───────────────────────────────────────────────'));
    console.log(chalk.white.bold('  Start your maker server:'));
    console.log();
    console.log('     ' + chalk.bgHex('#1a1d27').cyan('  npm run dev  '));
    console.log();
    console.log(chalk.gray('  Your server will:'));
    console.log(chalk.gray('    • Connect to HyperDex via WebSocket'));
    console.log(chalk.gray('    • Stream live USDC/EURC price levels'));
    console.log(chalk.gray('    • Respond to RFQ requests within 750ms'));
    console.log(chalk.gray('    • Sign quotes with your private key'));
    console.log();
    if (!keyVerified) {
      console.log(chalk.yellow('  ⚠  API key was not verified (backend offline).'));
      console.log(chalk.gray('     Start the backend before running npm run dev.'));
      console.log();
    }
    console.log(chalk.gray('  ═══════════════════════════════════════════════\n'));

  } catch (error: unknown) {
    console.log();
    console.log(chalk.red('  ✗ Activation failed unexpectedly:'));
    console.log(chalk.red('    ' + (error instanceof Error ? error.message : String(error))));
    console.log();
    process.exit(1);
  }
}

main();
