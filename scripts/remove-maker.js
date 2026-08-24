/**
 * Permanently remove a maker from the backend database.
 *
 * Deletes the Maker record, every ApiKey issued to it, and the PendingMaker
 * application, so the address can re-apply from scratch. The maker's on-chain
 * pool contract is NOT removed — Soroban contracts cannot be deleted, so a
 * replaced maker leaves an orphaned pool behind by design.
 *
 * Usage (from backend/, so mongoose + .env resolve):
 *   node ../scripts/remove-maker.js G...
 */
const path = require('path');
require(path.join(__dirname, '../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../backend/.env') });
const mongoose = require(path.join(__dirname, '../backend/node_modules/mongoose'));

const address = process.argv[2];
if (!address || !/^G[A-Z2-7]{55}$/.test(address)) {
  console.error('Usage: node scripts/remove-maker.js <G...address>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.connection.db;

  const maker = await db.collection('makers').findOne({ stellarAddress: address });
  if (maker) {
    const keys = await db.collection('apikeys').deleteMany({ makerId: maker._id });
    await db.collection('makers').deleteOne({ _id: maker._id });
    console.log(`deleted maker ${address} (+${keys.deletedCount} api key(s))`);
  } else {
    console.log(`no maker record for ${address}`);
  }

  const pend = await db.collection('pendingmakers').deleteMany({ stellarAddress: address });
  console.log(`deleted ${pend.deletedCount} pending application(s)`);

  const remaining = await db.collection('makers').countDocuments();
  console.log(`makers remaining: ${remaining}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
