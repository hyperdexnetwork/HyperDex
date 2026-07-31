import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import nacl from 'tweetnacl';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

import { USDC_CONTRACT, EURC_CONTRACT, STELLAR_RPC } from './constants';

const BACKEND_HTTP_URL = process.env.BACKEND_HTTP_URL ?? 'https://hyperdex.onrender.com';

process.on('SIGINT', () => {
  console.log(chalk.red('\n\n  ✗ Setup interrupted.'));
  console.log(chalk.gray('  No changes were saved.\n'));
  process.exit(1);
});

async function main() {
  try {
    console.log('\n');
    console.log(chalk.hex('#7c3aed')('  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██████╗ ███████╗██╗  ██╗'));
    console.log(chalk.hex('#7c3aed')('  ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝'));
    console.log(chalk.hex('#8b5cf6')('  ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝██║  ██║█████╗   ╚███╔╝ '));
    console.log(chalk.hex('#8b5cf6')('  ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗██║  ██║██╔══╝   ██╔██╗ '));
    console.log(chalk.hex('#06b6d4')('  ██║  ██║   ██║   ██║     ███████╗██║  ██║██████╔╝███████╗██╔╝ ██╗'));
    console.log(chalk.hex('#06b6d4')('  ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═╝'));
    console.log();
    console.log(chalk.white.bold('  Market Maker Setup Wizard'));
    console.log(chalk.gray('  Stellar Testnet · RFQ DEX · Sealed Bid\n'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.yellow('  ⚡ This wizard will:'));
    console.log(chalk.gray('     1. Verify your API key with the backend'));
    console.log(chalk.gray('     2. Generate your signing keypair securely'));
    console.log(chalk.gray('     3. Save a named credential file'));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.gray('  You need an API key from the HyperDEX admin.'));
    console.log(chalk.gray('  If you do not have one yet:'));
    console.log(chalk.gray('    1. Visit https://hyperdex.live/maker'));
    console.log(chalk.gray('    2. Submit your application'));
    console.log(chalk.gray('    3. Wait for admin approval and email'));
    console.log(chalk.gray('  ─────────────────────────────────────────────\n'));

    // ── STEP 1: Ask for API key ───────────────────────────────────────────────
    const { apiKey } = await prompts({
      type: 'text',
      name: 'apiKey',
      message: 'Enter your API key from admin:',
      hint: 'starts with sk_live_',
      validate: (v: string) => {
        if (!v) return 'API key is required';
        if (!v.startsWith('sk_live_')) return 'Must start with sk_live_';
        if (v.length < 72) return 'API key looks incomplete';
        return true;
      },
    }, { onCancel: () => { console.log(chalk.red('\n  ✗ Setup cancelled.\n')); process.exit(1); } });

    // ── STEP 2: Verify API key ────────────────────────────────────────────────
    const spinner = ora('Verifying API key…').start();

    let maker: { name: string; stellarAddress: string; active: boolean; supportedPairs: unknown[] } | null = null;
    let credentialName: string;
    let makerAddress = '';
    let poolAddress = '';

    try {
      const response = await axios.post(`${BACKEND_HTTP_URL}/api/makers/verify-key`, { apiKey });

      if (!response.data.success) {
        spinner.fail('API key is invalid');
        console.log(chalk.red('  Contact your admin for a valid API key.'));
        process.exit(1);
      }

      maker = response.data.maker;
      spinner.succeed(chalk.green(`Verified as: ${maker!.name} (${maker!.stellarAddress.slice(0, 8)}…)`));

      console.log();
      console.log(chalk.gray('  Name:    ') + chalk.white(maker!.name));
      console.log(chalk.gray('  Address: ') + chalk.white(maker!.stellarAddress));
      console.log();

      credentialName = maker!.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      makerAddress = maker!.stellarAddress;

      // Fetch pool address
      const poolSpinner = ora('Fetching pool address…').start();
      try {
        const poolRes = await axios.get(
          `${BACKEND_HTTP_URL}/api/makers/${makerAddress}/pool`
        );
        poolAddress = poolRes.data.poolAddress || '';
        if (poolAddress) {
          poolSpinner.succeed(`Pool found: ${poolAddress.slice(0, 8)}...`);
        } else {
          poolSpinner.warn('No pool deployed yet — deploy from /maker dashboard first');
          console.log(chalk.gray('  You can run npm run setup again after deploying your pool'));
        }
      } catch {
        poolSpinner.warn('Could not fetch pool address — add it manually after deployment');
      }
    } catch (err) {
      spinner.warn('Could not reach backend');
      console.log(chalk.yellow('  Backend may be offline. Enter your maker name manually.'));
      const { manualName } = await prompts({
        type: 'text',
        name: 'manualName',
        message: 'Enter your maker name (used for credential filename):',
        validate: (v: string) => v.trim().length >= 2 ? true : 'Name too short',
      }, { onCancel: () => { process.exit(1); } });
      credentialName = manualName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    // ── STEP 3: Generate keypair ──────────────────────────────────────────────
    console.log(chalk.gray('\n  ─────────────────────────────────────────────'));
    console.log(chalk.hex('#7c3aed')('  Step 2/3  ') + chalk.white.bold('Generate Signing Keypair'));
    console.log(chalk.gray('  ─────────────────────────────────────────────\n'));

    const spinnerKp = ora({ text: 'Generating secure ed25519 keypair…', color: 'magenta' }).start();
    await new Promise(r => setTimeout(r, 600));

    const seed = crypto.randomBytes(32);
    const keypair = nacl.sign.keyPair.fromSeed(seed);
    const privateKeyHex = Buffer.from(seed).toString('hex');
    const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

    spinnerKp.succeed(chalk.green('Keypair generated'));

    // ── STEP 4: Write named credential file ───────────────────────────────────
    const credentialsDir = path.join(__dirname, '../credentials');
    if (!fs.existsSync(credentialsDir)) {
      fs.mkdirSync(credentialsDir, { recursive: true });
    }

    const credPath = path.join(credentialsDir, `${credentialName}.cred`);

    const credContent = [
      `# HyperDEX Maker Credentials — ${maker?.name ?? credentialName}`,
      `# Generated: ${new Date().toISOString()}`,
      `# KEEP THIS FILE SECURE — DO NOT COMMIT`,
      ``,
      `# Authentication`,
      `MAKER_API_KEY=${apiKey}`,
      ``,
      `# Signing keypair (ed25519)`,
      `SIGNER_PRIVATE_KEY=${privateKeyHex}`,
      ``,
      `# Maker identity`,
      `MAKER_ADDRESS=${makerAddress}`,
      ``,
      `# Pool contract (your dedicated liquidity pool)`,
      `POOL_ADDRESS=${poolAddress}`,
      ``,
      `# Network`,
      `PORT=3001`,
      `BACKEND_WS_URL=wss://hyperdex.onrender.com/ws/maker`,
      ``,
      `# Stellar network — set to 'mainnet' for production (defaults to testnet).`,
      `# On mainnet also point STELLAR_RPC_URL at your production RPC and use the`,
      `# mainnet USDC/EURC SAC addresses below.`,
      `STELLAR_NETWORK=${process.env.STELLAR_NETWORK ?? 'testnet'}`,
      `STELLAR_RPC_URL=${STELLAR_RPC}`,
      ``,
      `# Token contracts (Stellar SAC addresses — swap for mainnet SACs in production)`,
      `USDC_CONTRACT=${USDC_CONTRACT}`,
      `EURC_CONTRACT=${EURC_CONTRACT}`,
    ].join('\n');

    if (fs.existsSync(credPath)) {
      const { overwrite } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: 'Credential file already exists. Overwrite with a NEW keypair?\n  ⚠ This will break your on-chain registration until you update the signer key via /maker dashboard.',
        initial: false,
      }, { onCancel: () => { process.exit(1); } });
      if (!overwrite) {
        console.log(chalk.yellow('\n  Keeping existing credentials. Exiting.'));
        process.exit(0);
      }
    }

    fs.writeFileSync(credPath, credContent, { mode: 0o600 });

    // ── STEP 5: Register signer key with backend ───────────────────────────────
    const spinnerReg = ora('Registering signer key with backend...').start();
    try {
      const httpUrl = BACKEND_HTTP_URL
        .replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws/maker', '');

      await axios.post(
        `${httpUrl}/api/makers/register-signer-key`,
        { signerPublicKey: publicKeyHex },
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      spinnerReg.succeed('Signer key registered — pool deployment form pre-filled');
    } catch {
      spinnerReg.warn('Could not register signer key — enter it manually in dashboard');
    }

    // ── STEP 6: Show public key and next steps ────────────────────────────────
    console.log('\n  ═══════════════════════════════════════');
    console.log(chalk.green.bold('  ✓ Setup Complete'));
    console.log('  ═══════════════════════════════════════');
    console.log();
    console.log(chalk.white('  Your SIGNER PUBLIC KEY:'));
    console.log();
    console.log('  ' + chalk.bgHex('#1a1d27').hex('#a78bfa')('  ' + publicKeyHex + '  '));
    console.log();
    console.log(chalk.yellow('  📋 Copy this key — you may need it if backend is offline'));
    console.log();
    console.log(chalk.white('  Next steps:'));
    console.log(chalk.gray('  1. Visit https://hyperdex.live/maker'));
    console.log(chalk.gray('  2. Click [Deploy Pool Contract] (signer key is auto-filled)'));
    console.log(chalk.gray('  3. Deposit inventory to your pool'));
    console.log(chalk.gray('  4. Run: ') + chalk.cyan(`npm run dev ${credentialName}`));
    console.log();
    console.log(chalk.gray(`  Credentials saved: credentials/${credentialName}.cred`));
    console.log();
  } catch (error: unknown) {
    console.log();
    console.log(chalk.red('  ✗ Setup failed unexpectedly:'));
    console.log(chalk.red('    ' + (error instanceof Error ? error.message : String(error))));
    process.exit(1);
  }
}

main();
