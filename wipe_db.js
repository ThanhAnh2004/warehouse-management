const { Client } = require('pg');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function wipeDB() {
  try {
    // Wipe Postgres Inventory
    const pgInv = new Client({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB_INVENTORY,
    });
    await pgInv.connect();
    console.log('Connected to PG Inventory');
    await pgInv.query('TRUNCATE TABLE products CASCADE');
    console.log('Cleared Inventory DB (products)');
    await pgInv.end();

    // Wipe Postgres Transaction
    const pgTx = new Client({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB_TRANSACTION,
    });
    await pgTx.connect();
    console.log('Connected to PG Transaction');
    await pgTx.query('TRUNCATE TABLE transactions CASCADE');
    console.log('Cleared Transaction DB (transactions)');
    await pgTx.end();

    // Wipe MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    // Drop all collections safely
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.drop();
      console.log(`Dropped collection ${collection.collectionName}`);
    }
    console.log('Dropped MongoDB Data');
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

wipeDB().then(() => console.log('Wipe complete')).catch(e => console.error(e));
