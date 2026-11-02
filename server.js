const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 4173;

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// Initialize SQLite database
let db;
try {
  const dbPath = path.join(__dirname, 'badminton_sessions.db');
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  console.log('✓ SQLite database initialized at', dbPath);
} catch (err) {
  console.warn('! SQLite init failed, falling back to memory storage:', err.message);
  db = null;
}

// In-memory fallback if SQLite fails or as quick cache
let memorySession = {
  players: [],
  rounds: []
};

// Load initial state from SQLite if available
if (db) {
  try {
    const row = db.prepare('SELECT data FROM sessions WHERE id = ?').get('main');
    if (row && row.data) {
      memorySession = JSON.parse(row.data);
      console.log(`✓ Loaded saved session with ${memorySession.players.length} players from SQLite`);
    }
  } catch (err) {
    console.warn('Failed loading existing session from SQLite:', err.message);
  }
}

// SSE Clients Registry
const sseClients = new Set();

function broadcastState(newState) {
  const payload = `data: ${JSON.stringify(newState)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Heartbeat to keep SSE connections open through proxies
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': heartbeat\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 25000);

// API Routes
app.get('/api/session', (req, res) => {
  res.json(memorySession);
});

app.post('/api/session', (req, res) => {
  const { players, rounds } = req.body;
  if (!Array.isArray(players) || !Array.isArray(rounds)) {
    return res.status(400).json({ error: 'Invalid session format' });
  }

  memorySession = { players, rounds };

  // Persist to SQLite
  if (db) {
    try {
      const stmt = db.prepare(`
        INSERT INTO sessions (id, data, updated_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `);
      stmt.run('main', JSON.stringify(memorySession), Date.now());
    } catch (err) {
      console.error('Failed saving to SQLite:', err.message);
    }
  }

  // Notify all connected clients in real time
  broadcastState(memorySession);

  res.json({ success: true });
});

app.delete('/api/session', (req, res) => {
  memorySession = { players: [], rounds: [] };

  if (db) {
    try {
      const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
      stmt.run('main');
    } catch (err) {
      console.error('Failed deleting from SQLite:', err.message);
    }
  }

  broadcastState(memorySession);
  res.json({ success: true, message: 'Session reset' });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state upon connection
  res.write(`data: ${JSON.stringify(memorySession)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Fallback to index.html for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏸 Badminton Doubles Scheduler Server running at http://localhost:${PORT}`);
  console.log(`   Live multi-device real-time sync active via SSE & SQLite.\n`);
});
