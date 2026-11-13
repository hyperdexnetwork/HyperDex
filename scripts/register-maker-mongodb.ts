import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import dotenv from 'dotenv'
import path from 'path'

// Load backend env
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })

const MAKER_ADDRESS = process.env.MM1_ADDRESS || 'GALNCMRJ2GCQ34RH7L55HZLUCZ3EHDIKPWTNTWDGVJ4FJWCP5GDVA726'
const SIGNER_PUBLIC_KEY = process.env.SIGNER_PUBLIC_KEY_HEX || ''
const USDC = process.env.USDC_CONTRACT_ADDRESS || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
const EURC = process.env.EURC_CONTRACT_ADDRESS || 'CDOIV56NSBNVNZN4XPTOT7JVRK6AW4RUISEPYUZYIIKMVIY7X3OH4S5X'

const MakerSchema = new mongoose.Schema({
  stellarAddress: { type: String, required: true, unique: true },
  name: String,
  signerPublicKey: String,
  active: { type: Boolean, default: true },
  serverUrl: { type: String, default: null },
  supportedPairs: [{ tokenIn: String, tokenOut: String }],
  connectionStatus: { type: String, default: 'unknown' },
  lastSeenAt: { type: Date, default: null },
  totalVolume: { type: Number, default: 0 },
  totalTrades: { type: Number, default: 0 },
  totalFeesEarned: { type: Number, default: 0 },
}, { timestamps: true })

const ApiKeySchema = new mongoose.Schema({
  makerId: mongoose.Schema.Types.ObjectId,
  keyHash: String,
  keyPrefix: String,
  label: String,
  active: { type: Boolean, default: true },
  lastUsedAt: Date,
}, { timestamps: true })

const Maker = mongoose.model('Maker', MakerSchema)
const ApiKey = mongoose.model('ApiKey', ApiKeySchema)

async function main() {
  const mongoUri = process.env.MONGODB_URI!
  await mongoose.connect(mongoUri, { dbName: process.env.MONGODB_DB_NAME || 'hyperdex' })
  console.log('Connected to MongoDB')

  // Remove old maker if exists
  await Maker.deleteOne({ stellarAddress: MAKER_ADDRESS })
  await console.log('Cleared old mm1 maker record if any')

  const maker = await Maker.create({
    stellarAddress: MAKER_ADDRESS,
    name: 'HyperDex MM',
    signerPublicKey: SIGNER_PUBLIC_KEY,
    active: true,
    supportedPairs: [
      { tokenIn: USDC, tokenOut: EURC },
      { tokenIn: EURC, tokenOut: USDC },
    ],
    connectionStatus: 'unknown',
  })
  console.log('Created maker:', maker._id.toString())

  const rawKey = 'sk_live_' + crypto.randomBytes(32).toString('hex')
  const keyPrefix = rawKey.slice(0, 15)
  const keyHash = await bcrypt.hash(rawKey, 10)

  await ApiKey.create({
    makerId: maker._id,
    keyHash,
    keyPrefix,
    label: 'Default',
    active: true,
  })

  console.log('\n=== MAKER REGISTERED ===')
  console.log('Address:', MAKER_ADDRESS)
  console.log('API Key:', rawKey)
  console.log('========================\n')
  console.log('Update maker-sdk/.env:')
  console.log('  MAKER_ADDRESS=' + MAKER_ADDRESS)
  console.log('  MAKER_API_KEY=' + rawKey)

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
