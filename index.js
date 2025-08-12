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

let nextID = 1;

let pingIntervalId = null;
const PING_INTERVAL = 20000; // send every 20 seconds
const PONG_TIMEOUT = 120000; // close if no pong in 2 minutes

function initializePingSystem() {
	if (pingIntervalId) clearInterval(pingIntervalId);

	pingIntervalId = setInterval(() => {
		const now = Date.now();

		for (const client of roomClients) {
			const timeSinceLastPong = now - client.userData.lastPong;
			if (timeSinceLastPong > PONG_TIMEOUT) {
				console.log(`Client ${client.userData.id} (${client.userData.username}) timed out after ${Math.round(timeSinceLastPong / 1000)}s of no response`);
				client.close();
				continue;
			}

			if (client.readyState === 1) {
				try {
					client.send(encodeMessage("hb", { ts: now }));
					client.userData.lastPing = now;
				} catch (error) {
					console.error("Error sending heartbeat:", error);
					client.close();
				}
			}
		}
	}, PING_INTERVAL);
}


initializePingSystem();

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
    open: (ws) => {
      const now = Date.now();
      ws.userData = {
        id: nextID++,
        username: "Anon",
        x: 200,
        y: 200,
        direction: 'right',
        closed: false,
        lastPong: now,
        lastPing: now,
        connectedAt: now
      };
      roomClients.add(ws)
      
      broadcastToPreviewClients('playerCount', roomClients.size)
    },

    message: (ws, message, isBinary) => {
      const id = ws.userData.id
      const data = JSON.parse(Buffer.from(message).toString());
      
      if (data.type == "joinRoom") {
        ws.userData.username = data.message.username || "Anon";
        
        for (const client of roomClients) {
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
        }
        
        broadcastToPreviewClients('roomActivity', `${ws.userData.username} joined the room`)
        broadcastToPreviewClients('playerCount', roomClients.size)
      }
      
      if (data.type == "updateData") {
        try {
          ws.userData.x = data.message.x;
          ws.userData.y = data.message.y;
          ws.userData.username = data.message.username
          
          broadcastToPreviewClients('previewPlayers', getRoomStats().players)
        } catch (error) {
          console.error("Error updating data:", error)
        }
      }
      
      if (data.type == "chatMessage") {
        const username = data.message.username || ws.userData.username;
        if (data.message.message.length < 512) {
          for (const client of roomClients) {
            client.send(encodeMessage('chatMessage', { 
              message: data.message.message.trim(), 
              username: username,
              playerId: id
            }));
          }
          
          broadcastToPreviewClients('roomActivity', `${username}: ${data.message.message.trim()}`)
        }
      }
      
      if (data.type == "moveMessage") {
        for (const client of roomClients) {
          if (client.userData.id !== id) {
            client.send(encodeMessage("moveMessage", { 
              id: id, 
              x: data.message.x, 
              y: data.message.y,
              direction: data.message.direction
            }))
          } else {
            ws.userData.x = data.message.x;
            ws.userData.y = data.message.y;
            if (data.message.direction) {
              ws.userData.direction = data.message.direction;
            }
          }
        }
        
        if (Math.random() < 0.1) {
          broadcastToPreviewClients('previewPlayers', getRoomStats().players)
        }
        return;
      }
      
      if (data.type == "ping") {
        try {
          ws.send(encodeMessage('pong', { timestamp: data.message.timestamp }));
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


    },
    
    close: (ws) => {
      const id = ws.userData.id;
      const username = ws.userData.username || "Anon";
      
      console.log(`Client ${id} (${username}) disconnected`);
      roomClients.delete(ws);
      
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