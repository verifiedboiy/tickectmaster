const express = require('express');
const initSqlJs = require('sql.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database file path
const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      event_title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      venue_address TEXT NOT NULL,
      venue_rating TEXT DEFAULT '4.5',
      venue_reviews TEXT DEFAULT '6465',
      venue_lat REAL NOT NULL,
      venue_lng REAL NOT NULL,
      section TEXT NOT NULL,
      row_name TEXT NOT NULL,
      level TEXT DEFAULT 'Lower Level',
      num_seats INTEGER DEFAULT 4,
      start_seat INTEGER DEFAULT 1,
      artist_image TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS coins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      balance INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )
  `);

  // Add user_id column if upgrading from older version
  try { db.run('ALTER TABLE templates ADD COLUMN user_id INTEGER DEFAULT 1'); } catch(e) {}
  try { db.run('ALTER TABLE coins ADD COLUMN user_id INTEGER DEFAULT 1'); } catch(e) {}
  try { db.run('ALTER TABLE templates ADD COLUMN recipient_name TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE templates ADD COLUMN order_num TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE templates ADD COLUMN bag_policy TEXT'); } catch(e) {}

  // Initialize default user and coins if empty
  const userRow = db.exec("SELECT * FROM users WHERE email = 'user@email.com'");
  if (userRow.length === 0) {
    db.run("INSERT INTO users (name, email) VALUES ('Default User', 'user@email.com')");
  }
  const coinRow = db.exec('SELECT * FROM coins WHERE user_id = 1');
  if (coinRow.length === 0) {
    db.run('INSERT INTO coins (user_id, balance) VALUES (1, 5)');
  }

  saveDatabase();
}

// Save database to file
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper to run a query and return results as array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql, params = []) {
  if (params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    db.run(sql);
  }
  saveDatabase();
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload setup
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Get User ID from header helper
function getUserId(req) {
  return req.headers['x-user-id'] || 0;
}

// ========== AUTH ROUTES ==========
app.post('/api/auth/signup', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  
  let user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    runSql('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
    runSql('INSERT INTO coins (user_id, balance) VALUES (?, 9999)', [user.id]);
  }
  res.json(user);
});

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (user) {
    res.json(user);
  } else {
    res.status(401).json({ error: 'User not found. Please sign up.' });
  }
});

// ========== API ROUTES ==========

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/bosspage')) {
    return next();
  }
  const userId = getUserId(req);
  if (userId) {
    const user = queryOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(401).json({ error: 'User deleted' });
    }
  }
  next();
});

// Get all templates
app.get('/api/templates', (req, res) => {
  const userId = getUserId(req);
  const templates = queryAll('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  res.json(templates);
});

// Get active template
app.get('/api/templates/active', (req, res) => {
  const userId = getUserId(req);
  const template = queryOne('SELECT * FROM templates WHERE user_id = ? AND is_active = 1', [userId]);
  res.json(template);
});

// Create template
app.post('/api/templates', (req, res) => {
  const userId = getUserId(req);
  const coins = queryOne('SELECT balance FROM coins WHERE user_id = ?', [userId]);
  if (!coins || coins.balance < 1) {
    return res.status(403).json({ error: 'Not enough coins' });
  }

  // Check template limit (max 3)
  const countResult = queryOne('SELECT COUNT(*) as count FROM templates WHERE user_id = ?', [userId]);
  if (countResult.count >= 3) {
    runSql('DELETE FROM templates WHERE id = (SELECT id FROM templates WHERE user_id = ? ORDER BY created_at ASC LIMIT 1)', [userId]);
  }

  // Deduct coin
  runSql('UPDATE coins SET balance = balance - 1 WHERE user_id = ?', [userId]);

  // Deactivate all other templates
  runSql('UPDATE templates SET is_active = 0 WHERE user_id = ?', [userId]);

  const { event_title, event_date, venue_name, venue_address, venue_rating, venue_reviews, venue_lat, venue_lng, section, row_name, level, num_seats, start_seat, artist_image, recipient_name, order_num, bag_policy } = req.body;

  runSql(
    `INSERT INTO templates (user_id, event_title, event_date, venue_name, venue_address, venue_rating, venue_reviews, venue_lat, venue_lng, section, row_name, level, num_seats, start_seat, artist_image, recipient_name, order_num, bag_policy, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [userId, event_title, event_date, venue_name, venue_address, venue_rating || '4.5', venue_reviews || '6465', venue_lat, venue_lng, section, row_name, level || 'Lower Level', num_seats || 4, start_seat || 1, artist_image || null, recipient_name || null, order_num || null, bag_policy || null]
  );

  const template = queryOne('SELECT * FROM templates WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  res.json(template);
});

// Update template
app.put('/api/templates/:id', (req, res) => {
  const userId = getUserId(req);
  const coins = queryOne('SELECT balance FROM coins WHERE user_id = ?', [userId]);
  if (!coins || coins.balance < 1) {
    return res.status(403).json({ error: 'Not enough coins' });
  }

  // Deduct coin
  runSql('UPDATE coins SET balance = balance - 1 WHERE user_id = ?', [userId]);

  const { event_title, event_date, venue_name, venue_address, venue_rating, venue_reviews, venue_lat, venue_lng, section, row_name, level, num_seats, start_seat, artist_image, recipient_name, order_num, bag_policy } = req.body;

  runSql(
    `UPDATE templates SET event_title=?, event_date=?, venue_name=?, venue_address=?, venue_rating=?, venue_reviews=?, venue_lat=?, venue_lng=?, section=?, row_name=?, level=?, num_seats=?, start_seat=?, artist_image=?, recipient_name=?, order_num=?, bag_policy=?, updated_at=datetime('now') WHERE id=? AND user_id=?`,
    [event_title, event_date, venue_name, venue_address, venue_rating, venue_reviews, venue_lat, venue_lng, section, row_name, level, num_seats, start_seat, artist_image, recipient_name || null, order_num || null, bag_policy || null, req.params.id, userId]
  );

  const template = queryOne('SELECT * FROM templates WHERE id = ? AND user_id = ?', [req.params.id, userId]);
  res.json(template);
});

// Delete template
app.delete('/api/templates/:id', (req, res) => {
  const userId = getUserId(req);
  runSql('DELETE FROM templates WHERE id = ? AND user_id = ?', [req.params.id, userId]);
  res.json({ success: true });
});

// Activate template
app.put('/api/templates/:id/activate', (req, res) => {
  const userId = getUserId(req);
  runSql('UPDATE templates SET is_active = 0 WHERE user_id = ?', [userId]);
  runSql('UPDATE templates SET is_active = 1 WHERE id = ? AND user_id = ?', [req.params.id, userId]);
  const template = queryOne('SELECT * FROM templates WHERE id = ? AND user_id = ?', [req.params.id, userId]);
  res.json(template);
});

// Get coin balance
app.get('/api/coins', (req, res) => {
  const userId = getUserId(req);
  const coins = queryOne('SELECT balance FROM coins WHERE user_id = ?', [userId]);
  res.json(coins || { balance: 0 });
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ path: '/uploads/' + req.file.filename });
});

// ========== BOSSPAGE ROUTES ==========

app.get('/api/bosspage/users', (req, res) => {
  const users = queryAll(`
    SELECT u.id, u.name, u.email, COALESCE(c.balance, 0) as balance,
           (SELECT COUNT(*) FROM templates WHERE user_id = u.id) as template_count
    FROM users u
    LEFT JOIN coins c ON u.id = c.user_id
    ORDER BY u.id DESC
  `);
  res.json(users);
});

app.post('/api/bosspage/add-coins', (req, res) => {
  const { userId, amount } = req.body;
  runSql('UPDATE coins SET balance = balance + ? WHERE user_id = ?', [amount || 1, userId]);
  res.json({ success: true });
});

app.post('/api/bosspage/set-coins', (req, res) => {
  const { userId, amount } = req.body;
  runSql('UPDATE coins SET balance = ? WHERE user_id = ?', [amount || 0, userId]);
  res.json({ success: true });
});

app.delete('/api/bosspage/users/:id', (req, res) => {
  const userId = req.params.id;
  runSql('DELETE FROM users WHERE id = ?', [userId]);
  runSql('DELETE FROM coins WHERE user_id = ?', [userId]);
  runSql('DELETE FROM templates WHERE user_id = ?', [userId]);
  res.json({ success: true });
});

// Serve bosspage
app.get('/bosspage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bosspage.html'));
});

// Serve main app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Boss page: http://localhost:${PORT}/bosspage`);
    console.log(`Network: http://172.20.10.8:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
