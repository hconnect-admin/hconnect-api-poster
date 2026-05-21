const Database = require('better-sqlite3');
const path = require('path');

// Resolve a writable data directory:
//   1. APP_DATA_DIR  — set by main.js to app.getPath('userData') when running in Electron
//   2. process.pkg   — set by pkg when running as a packaged exe (read-only virtual FS)
//   3. __dirname     — development / node server.js
const dataDir =
  process.env.APP_DATA_DIR ||
  (process.pkg ? path.dirname(process.execPath) : __dirname);

// Initialize SQLite database
const db = new Database(path.join(dataDir, 'hconnect-api-poster.db'), { 
  verbose: console.log 
});

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customerName TEXT,
    baseUrl TEXT,
    xAppKey TEXT,
    xExternalSystem TEXT,
    enterpriseId TEXT,
    enterpriseIds TEXT,
    clientId TEXT,
    clientSecret TEXT,
    oauthEndpoint TEXT,
    grantType TEXT,
    scope TEXT,
    hotelIds TEXT,
    customVariables TEXT,
    variableNames TEXT,
    currentToken TEXT,
    tokenExpiry TEXT,
    authType TEXT,
    username TEXT,
    password TEXT,
    token TEXT,
    authUrl TEXT,
    tokenUrl TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    folders TEXT,
    requests TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add enterpriseIds column if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(environments)").all();
  const hasEnterpriseIds = columns.some(col => col.name === 'enterpriseIds');
  const hasXExternalSystem = columns.some(col => col.name === 'xExternalSystem');
  
  if (!hasEnterpriseIds) {
    console.log('Adding enterpriseIds column to environments table...');
    db.exec('ALTER TABLE environments ADD COLUMN enterpriseIds TEXT');
    console.log('Migration complete!');
  }
  
  if (!hasXExternalSystem) {
    console.log('Adding xExternalSystem column to environments table...');
    db.exec('ALTER TABLE environments ADD COLUMN xExternalSystem TEXT');
    console.log('Migration complete!');
  }
} catch (error) {
  console.error('Migration error:', error.message);
}

// Prepared statements for environments
const stmts = {
  environment: {
    getAll: db.prepare('SELECT * FROM environments'),
    get: db.prepare('SELECT * FROM environments WHERE id = ?'),
    insert: db.prepare(`
      INSERT OR REPLACE INTO environments 
      (id, name, customerName, baseUrl, xAppKey, xExternalSystem, enterpriseId, enterpriseIds, clientId, clientSecret, oauthEndpoint, grantType, scope, hotelIds, customVariables, variableNames, currentToken, tokenExpiry, authType, username, password, token, authUrl, tokenUrl, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),
    delete: db.prepare('DELETE FROM environments WHERE id = ?')
  },
  collection: {
    getAll: db.prepare('SELECT * FROM collections'),
    get: db.prepare('SELECT * FROM collections WHERE id = ?'),
    insert: db.prepare(`
      INSERT OR REPLACE INTO collections 
      (id, name, description, folders, requests, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),
    delete: db.prepare('DELETE FROM collections WHERE id = ?')
  },
  setting: {
    get: db.prepare('SELECT * FROM settings WHERE key = ?'),
    insert: db.prepare(`
      INSERT OR REPLACE INTO settings 
      (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `),
    delete: db.prepare('DELETE FROM settings WHERE key = ?')
  }
};

// Environment operations
function getAllEnvironments() {
  return stmts.environment.getAll.all().map(parseEnvironment);
}

function getEnvironment(id) {
  const row = stmts.environment.get.get(id);
  return row ? parseEnvironment(row) : null;
}

function saveEnvironment(env) {
  stmts.environment.insert.run(
    env.id,
    env.name,
    env.customerName || null,
    env.baseUrl || null,
    env.xAppKey || null,
    env.xExternalSystem || null,
    env.enterpriseId || null,
    env.enterpriseIds ? JSON.stringify(env.enterpriseIds) : null,
    env.clientId || null,
    env.clientSecret || null,
    env.oauthEndpoint || null,
    env.grantType || null,
    env.scope || null,
    env.hotelIds ? JSON.stringify(env.hotelIds) : null,
    env.customVariables ? JSON.stringify(env.customVariables) : null,
    env.variableNames ? JSON.stringify(env.variableNames) : null,
    env.currentToken || null,
    env.tokenExpiry || null,
    env.authType || null,
    env.username || null,
    env.password || null,
    env.token || null,
    env.authUrl || null,
    env.tokenUrl || null
  );
  return getEnvironment(env.id);
}

function deleteEnvironment(id) {
  stmts.environment.delete.run(id);
}

function parseEnvironment(row) {
  return {
    id: row.id,
    name: row.name,
    customerName: row.customerName,
    baseUrl: row.baseUrl,
    xAppKey: row.xAppKey,
    xExternalSystem: row.xExternalSystem,
    enterpriseId: row.enterpriseId,
    enterpriseIds: row.enterpriseIds ? JSON.parse(row.enterpriseIds) : [],
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    oauthEndpoint: row.oauthEndpoint,
    grantType: row.grantType,
    scope: row.scope,
    hotelIds: row.hotelIds ? JSON.parse(row.hotelIds) : [],
    customVariables: row.customVariables ? JSON.parse(row.customVariables) : [],
    variableNames: row.variableNames ? JSON.parse(row.variableNames) : {},
    currentToken: row.currentToken,
    tokenExpiry: row.tokenExpiry,
    authType: row.authType,
    username: row.username,
    password: row.password,
    token: row.token,
    authUrl: row.authUrl,
    tokenUrl: row.tokenUrl
  };
}

// Collection operations
function getAllCollections() {
  return stmts.collection.getAll.all().map(parseCollection);
}

function getCollection(id) {
  const row = stmts.collection.get.get(id);
  return row ? parseCollection(row) : null;
}

function saveCollection(collection) {
  stmts.collection.insert.run(
    collection.id,
    collection.name,
    collection.description || null,
    collection.folders ? JSON.stringify(collection.folders) : '[]',
    collection.requests ? JSON.stringify(collection.requests) : '[]'
  );
  return getCollection(collection.id);
}

function deleteCollection(id) {
  stmts.collection.delete.run(id);
}

function parseCollection(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    folders: row.folders ? JSON.parse(row.folders) : [],
    requests: row.requests ? JSON.parse(row.requests) : []
  };
}

// Settings operations
function getSetting(key) {
  const row = stmts.setting.get.get(key);
  if (!row) return null;
  
  // Try to parse value as JSON, fallback to string if parsing fails
  let parsedValue = row.value;
  try {
    parsedValue = JSON.parse(row.value);
  } catch (e) {
    // Value is not JSON, keep as string
  }
  
  return { key: row.key, value: parsedValue };
}

function saveSetting(key, value) {
  // Stringify value if it's an object
  const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
  stmts.setting.insert.run(key, valueToStore);
  return getSetting(key);
}

function deleteSetting(key) {
  stmts.setting.delete.run(key);
}

module.exports = {
  db,
  getAllEnvironments,
  getEnvironment,
  saveEnvironment,
  deleteEnvironment,
  getAllCollections,
  getCollection,
  saveCollection,
  deleteCollection,
  getSetting,
  saveSetting,
  deleteSetting
};
