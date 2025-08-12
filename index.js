import 'dotenv/config';
import uWS from 'uWebSockets.js';
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __base = path.join(__dirname, "/dist")

const port = process.env.SERVER_PORT || process.env.PORT || process.env.WEBSITES_PORT || 3001;

const roomClients = new Set()
const previewClients = new Set()

const ipConnectionCounts = new Map();
const ipConnectionAttempts = new Map();

const MAX_GLOBAL_CONNECTIONS = parseInt(process.env.MAX_GLOBAL_CONNECTIONS || '500');
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP || '5');
const MAX_CONNECTION_ATTEMPTS_PER_IP = parseInt(process.env.MAX_CONNECTION_ATTEMPTS_PER_IP || '30');
const CONNECTION_ATTEMPT_WINDOW_MS = parseInt(process.env.CONNECTION_ATTEMPT_WINDOW_MS || '60000'); // 1 minute window
// Heartbeat configuration (server-initiated pings)
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '25000'); // how often to send ping
const CLIENT_TIMEOUT_MS = parseInt(process.env.CLIENT_TIMEOUT_MS || '55000'); // time since last pong before disconnect

function pruneAndCountAttempts(ip, now){
  let arr = ipConnectionAttempts.get(ip) || [];
  arr = arr.filter(ts => now - ts < CONNECTION_ATTEMPT_WINDOW_MS);
  arr.push(now);
  ipConnectionAttempts.set(ip, arr);
  return arr.length;
}

function canAcceptConnection(ip, now){
  if (roomClients.size >= MAX_GLOBAL_CONNECTIONS) {
    return { ok: false, code: 503, reason: `Server full (>${MAX_GLOBAL_CONNECTIONS})` };
  }
  const current = ipConnectionCounts.get(ip) || 0;
  if (current >= MAX_CONNECTIONS_PER_IP) {
    return { ok: false, code: 429, reason: `Per-IP connection limit reached (${MAX_CONNECTIONS_PER_IP})` };
  }
  const attemptCount = pruneAndCountAttempts(ip, now);
  if (attemptCount > MAX_CONNECTION_ATTEMPTS_PER_IP) {
    return { ok: false, code: 429, reason: `Too many connection attempts (${attemptCount}/${MAX_CONNECTION_ATTEMPTS_PER_IP}) in window` };
  }
  return { ok: true };
}

let nextID = 1;

let pingIntervalId = null;

function encodeMessage(type, message) {
    return JSON.stringify({ type: type, message: message })
}

function broadcastToPreviewClients(type, message) {
    for (const client of previewClients) {
        if (client.readyState === 1) {
            client.send(encodeMessage(type, message))
        }
    }
}

function getRoomStats() {
    return {
        playerCount: roomClients.size,
        players: Array.from(roomClients, c => ({
            id: c.userData.id,
            x: c.userData.x || 200,
            y: c.userData.y || 200,
            username: c.userData.username || "Anon"
        }))
    }
}

// If you want the app to use https then use uWS.SLLApp()
// and pass {
//    key_file_name: "./origin.key",
//    cert_file_name: "./origin.pem"
//}
// const app = uWS.SSLApp({key_file_name: "./origin.key",cert_file_name: "./origin.pem"})
const app = uWS.App()
  .options('/*', (res, req) => {
    // Handle preflight requests
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.writeHeader('Access-Control-Max-Age', '86400');
    res.end();
  })
  .get('/', (res, req) => {
    const html = fs.readFileSync(path.join(__base, 'index.html'))
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeHeader('Content-Type', 'text/html');
    res.end(html);
  })
  .get('/room.html', (res, req) => {
    const html = fs.readFileSync(path.join(__base, 'room.html'))
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeHeader('Content-Type', 'text/html');
    res.end(html);
  })
  .get('/unicode_bear.png', (res, req) => {
    const imagePath = path.join(__dirname, 'public', 'unicode_bear.png')
    if (fs.existsSync(imagePath)) {
      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeHeader('Content-Type', 'image/png');
      res.end(fs.readFileSync(imagePath));
    } else {
      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeStatus('404 Not Found').end('Image not found');
    }
  })
  .get('/sine.wav', (res, req) => {
    const imagePath = path.join(__dirname, 'public', 'sine.wav')
    if (fs.existsSync(imagePath)) {
      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeHeader('Content-Type', 'audio/wav');
      res.end(fs.readFileSync(imagePath));
    } else {
      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeStatus('404 Not Found').end('Audio file not found');
    }
  })
  .get("/assets/*", (res, req) => {
    const urlPath = req.getUrl().replace('assets/', '')
    const filePath = path.join(__base, 'assets', urlPath)
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.js': 'application/javascript',
        '.css' : 'text/css',
        '.png': 'image/png',
        'jpg' : 'image/jpeg',
        'jpeg' : 'image/jpeg',
        '.svg' : 'image/svg+xml',
        '.json' : 'application/json',
        '.wav' : 'audio/wav'
      };

      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      res.end(fs.readFileSync(filePath))
    } else {
      res.writeHeader('Access-Control-Allow-Origin', '*');
      res.writeStatus('404 Not Found').end('File not found')
    }
  }).any('/*', (res, req) => {
    const html = fs.readFileSync(path.join(__base, "404.html"))
    res.writeStatus('404 Not Found')
    res.writeHeader('Access-Control-Allow-Origin', '*');
    res.writeHeader('Content-Type', 'text/html')
    res.end(html)
  })

  .ws('/room', {
    upgrade: (res, req, context) => {
      const now = Date.now();
      let ip;
      try {
        ip = Buffer.from(res.getRemoteAddressAsText()).toString();
      } catch {
        ip = 'unknown';
      }

      const verdict = canAcceptConnection(ip, now);
      if (!verdict.ok) {
        res.writeStatus(`${verdict.code} ${verdict.code === 429 ? 'Too Many Requests' : 'Service Unavailable'}`)
          .writeHeader('Connection', 'close')
          .end(verdict.reason);
        return;
      }

      res.upgrade(
        { ip },
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      );
    },
    open: (ws) => {
      const now = Date.now();
      const ip = ws.ip || 'unknown';
      ipConnectionCounts.set(ip, (ipConnectionCounts.get(ip) || 0) + 1);
      ws.userData = {
        id: nextID++,
        username: "Anon",
        x: 200,
        y: 200,
        direction: 'right',
        closed: false,
        lastPong: now,
        lastPing: now,
        connectedAt: now,
        ip
      };
      roomClients.add(ws)
      
      broadcastToPreviewClients('playerCount', roomClients.size)
    },

    message: (ws, message, isBinary) => {
      const id = ws.userData.id;
      let data;
      
      try {
        data = JSON.parse(Buffer.from(message).toString());
      } catch (error) {
        console.error(`JSON parse error from client ${id}: ${error}`);
        return;
      }
      
      if (!data || typeof data.type !== 'string') {
        console.error(`Invalid message structure from client ${id}:`, data);
        return;
      }
      
      try {
        if (data.type == "joinRoom") {
          const incomingSession = data.message?.sessionId;
          if (incomingSession) {
            ws.userData.sessionId = incomingSession;
            const duplicates = [];
            for (const client of roomClients) {
              if (client !== ws && client.userData.sessionId && client.userData.sessionId === incomingSession) {
                duplicates.push(client);
              }
            }
            for (const dup of duplicates) {
              try {
                for (const other of roomClients) {
                  if (other !== dup && other !== ws) {
                    try {
                      other.send(encodeMessage("playerLeft", {
                        id: dup.userData.id,
                        username: dup.userData.username,
                        playerCount: roomClients.size - 1 // tentative count after removal
                      }));
                    } catch {}
                  }
                }
                roomClients.delete(dup);
                try { dup.end(4001, 'Replaced by new session connection'); } catch {}
                console.log(`Replaced stale connection for session ${incomingSession} (old id ${dup.userData.id} -> new id ${ws.userData.id})`);
              } catch (dupErr) {
                console.error('Error replacing duplicate session connection:', dupErr);
              }
            }
            if (duplicates.length) {
              broadcastToPreviewClients('playerCount', roomClients.size);
              broadcastToPreviewClients('previewPlayers', getRoomStats().players);
            }
          }
          ws.userData.username = data.message?.username || "Anon";
          
          for (const client of roomClients) {
            try {
              if (client.userData.id !== id){
                client.send(encodeMessage('joinRoom', {
                  id: id, 
                  username: ws.userData.username,
                  playerCount: roomClients.size
                }))
              } else {
                client.send(encodeMessage('assignID', {
                  id: id,
                  playerCount: roomClients.size
                }));
                client.send(encodeMessage('updateClients', Array.from(roomClients, c => c.userData)))
              }
            } catch (clientError) {
              console.error(`Error sending to client ${client.userData.id}: ${clientError}`);
              roomClients.delete(client);
            }
          }
          
          broadcastToPreviewClients('roomActivity', `${ws.userData.username} joined the room`)
          broadcastToPreviewClients('playerCount', roomClients.size)
        }
      
      if (data.type == "updateData") {
        try {
          ws.userData.x = data.message?.x;
          ws.userData.y = data.message?.y;
          ws.userData.username = data.message?.username || ws.userData.username;
          
          broadcastToPreviewClients('previewPlayers', getRoomStats().players)
        } catch (error) {
          console.error("Error updating data:", error)
        }
      }
      
      if (data.type == "chatMessage") {
        try {
          const username = data.message?.username || ws.userData.username;
          if (data.message?.message && data.message.message.length < 512) {
            for (const client of roomClients) {
              try {
                client.send(encodeMessage('chatMessage', { 
                  message: data.message.message.trim(), 
                  username: username,
                  playerId: id
                }));
              } catch (clientError) {
                console.error(`Error sending chat to client ${client.userData.id}: ${clientError}`);
                roomClients.delete(client);
              }
            }
            
            broadcastToPreviewClients('roomActivity', `${username}: ${data.message.message.trim()}`)
          }
        } catch (error) {
          console.error("Error handling chat message:", error);
        }
      }
      
      if (data.type == "moveMessage") {
        try {
          for (const client of roomClients) {
            try {
              if (client.userData.id !== id) {
                client.send(encodeMessage("moveMessage", { 
                  id: id, 
                  x: data.message?.x, 
                  y: data.message?.y,
                  direction: data.message?.direction
                }))
              } else {
                ws.userData.x = data.message?.x;
                ws.userData.y = data.message?.y;
                if (data.message?.direction) {
                  ws.userData.direction = data.message.direction;
                }
              }
            } catch (clientError) {
              console.error(`Error sending move to client ${client.userData.id}: ${clientError}`);
              roomClients.delete(client);
            }
          }
          
          if (Math.random() < 0.1) {
            broadcastToPreviewClients('previewPlayers', getRoomStats().players)
          }
        } catch (error) {
          console.error("Error handling move message:", error);
        }
        return;
      }
      
      if (data.type == "ping") {
        try {
          ws.send(encodeMessage('pong', { timestamp: data.message?.timestamp }));
        } catch (error) {
          console.error('Error sending pong:', error);
        }
        return;
      }
      
      if (data.type == "pong") {
        ws.userData.lastPong = Date.now();
        return;
      }

      if (data.type === "hb") {
        console.log(`Heartbeat received from client ${ws.userData.id} (${ws.userData.username})`);
        ws.userData.lastPong = Date.now();
        return;
      }
      
      } catch (error) {
        console.error(`Error handling message from client ${id}: ${error}`);
        console.error(`Message type: ${data?.type}, Message:`, data);
      }
    },
    
    close: (ws) => {
      const id = ws.userData.id;
      const username = ws.userData.username || "Anon";
      const ip = ws.userData.ip || 'unknown';
      
      console.log(`Client ${id} (${username}) disconnected`);
      roomClients.delete(ws);
      if (ipConnectionCounts.has(ip)) {
        const next = (ipConnectionCounts.get(ip) || 1) - 1;
        if (next <= 0) ipConnectionCounts.delete(ip); else ipConnectionCounts.set(ip, next);
      }
      
      for (const client of roomClients) {
        try {
          client.send(encodeMessage("playerLeft", { 
            id: id,
            username: username,
            playerCount: roomClients.size
          }));
        } catch (error) {
          console.error(`Error notifying client of disconnect: ${error}`);
          roomClients.delete(client);
        }
      }
      
      broadcastToPreviewClients('roomActivity', `${username} left the room`)
      broadcastToPreviewClients('playerCount', roomClients.size)
      broadcastToPreviewClients('previewPlayers', getRoomStats().players)
    }
  })

  .ws('/preview', {
    open: (ws) => {
      previewClients.add(ws)
      
      const stats = getRoomStats()
      ws.send(encodeMessage('playerCount', stats.playerCount))
      ws.send(encodeMessage('previewPlayers', stats.players))
    },

    message: (ws, message, isBinary) => {
    },

    close: (ws) => {
      previewClients.delete(ws)
    }
  })

app.listen('0.0.0.0', port, (token) => {
  if (token) {
    console.log(`Server listening on http://0.0.0.0:${port}`)
    if (!pingIntervalId) {
      pingIntervalId = setInterval(() => {
        const now = Date.now();
        let removed = false;
        for (const ws of roomClients) {
          try {
            const last = ws.userData.lastPong || ws.userData.connectedAt || now;
            if (now - last > CLIENT_TIMEOUT_MS) {
              try { ws.end(4000, 'Heartbeat timeout'); } catch {}
              roomClients.delete(ws);
              removed = true;
              console.log(`Heartbeat timeout for client ${ws.userData.id} (${ws.userData.username})`);
              continue;
            }
            ws.userData.lastPing = now;
            ws.send(encodeMessage('ping', { timestamp: now }));
          } catch (e) {
            console.error('Error during heartbeat for client', ws.userData?.id, e);
            roomClients.delete(ws);
            removed = true;
          }
        }
        if (removed) {
            broadcastToPreviewClients('playerCount', roomClients.size);
            broadcastToPreviewClients('previewPlayers', getRoomStats().players);
        }
      }, HEARTBEAT_INTERVAL_MS);
    }
  } else {
    console.log(`Failed to start server on port ${port}`)
    process.exit(1)
  }
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
  }
  process.exit(0);
});