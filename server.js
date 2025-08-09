import uWS from 'uWebSockets.js';
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __base = path.join(__dirname, "/dist")

const clients = new Set()

let nextID = 1;

function encodeMessage(type, message) {
    return JSON.stringify({ type: type, message: message })
}

uWS.App()
  .get('/', (res, req) => {
    const html = fs.readFileSync(path.join(__base, 'index.html'))
      res.writeHeader('Content-Type', 'text/html');
      res.end(html);
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
        '.json' : 'application/json'
      };

      res.writeHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      res.end(fs.readFileSync(filePath))
    } else {
      res.writeStatus('404 Not Found').end('File not found')
    }
  }).any('/*', (res, req) => {
    const html = fs.readFileSync(path.join(__base, "404.html"))
    res.writeStatus('404 Not Found')
    res.writeHeader('Content-Type', 'text/html')
    res.end(html)
  })

  .ws('/*', {
    open: (ws) => {

      ws.userData = {
        id: nextID++,
        username: "Anon",
        closed: false
      };
      clients.add(ws)
    },

    message: (ws, message, isBinary) => {
      const id = ws.userData.id
      const data = JSON.parse(Buffer.from(message).toString());
      if (data.type == "joinMessage") {
        for (const client of clients) {
          if (client.userData.id !== id){
            client.send(encodeMessage('joinMessage', {id: id, username: `${username} has joined`}))
          } else {
            client.send(encodeMessage('joinMessage', 'You have joined the chat!'))
            client.send(encodeMessage('assignID', id));
            client.send(encodeMessage('updateClients', Array.from(clients, c => c.userData)))
          }
        }
      }
      if (data.type == "updateData") {
        try {
          ws.userData.x = data.message.x;
          ws.userData.y = data.message.y;
          ws.userData.username = data.message.username
        } catch (error) {
          console.error("Somehow the data is wrong")
        }
      }
      if (data.type == "chatMessage") {
        let username = data.message.username;
        if (data.message.username) {
          username = username
        }
        if (data.message.message.length < 128) {
          for (const client of clients) {
            client.send(encodeMessage('chatMessage', { message: data.message.message.trim(), id: username }));
          }
        }
      }
      if (data.type == "moveMessage") {
        for (const client of clients) {
          if (client.userData.id !== id) {
            client.send(encodeMessage("moveMessage", { id: id, x: data.message.x, y: data.message.y }))
          } else {
            ws.userData.x = data.message.x;
            ws.userData.y = data.message.y;
          }
        }
        return;
      }
    },
    close: (ws) => {
      const id = ws.userData.id;
      clients.delete(ws);
      for (const client of clients) {
        if (client.userData.id !== id) {
          client.send(encodeMessage("clientDisconnect", { message: `User ${username} has left`, id: id}))
        }
      }
    }
  })

  .listen(3001, (token) => {
    if (token) {
      console.log("Listening on http://localhost:3001")
    } else {
      console.log("Failed to start server")
    }
  });