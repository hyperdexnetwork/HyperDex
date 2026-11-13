import nacl from 'tweetnacl';
import crypto from 'crypto';

const seed = crypto.randomBytes(32);
const keypair = nacl.sign.keyPair.fromSeed(seed);
const privateKey = Buffer.from(seed).toString('hex');
const publicKey = Buffer.from(keypair.publicKey).toString('hex');

console.log('\n=== HyperDex Maker Keypair ===');
console.log('Public key  (register on HyperDex maker dashboard):');
console.log(publicKey);
console.log('\nPrivate key seed (keep secret, set as SIGNER_PRIVATE_KEY in .env):');
console.log(privateKey);
console.log('\nNEVER share your private key. Store it securely.\n');
