import './style.css'

const defaultIP: string = "localhost" //Change this to your server address/ip <--- localhost for development
const defaultPORT: string = "3001" //443 for https and whatever for anything else <--- 3001 for development

let previewSocket: WebSocket

if (defaultPORT === "433") {
  previewSocket = new WebSocket(`wss://${defaultIP}/preview`);
} else {
  previewSocket = new WebSocket(`ws://${defaultIP}:${defaultPORT}/preview`);
}

/*<div class="server-item flex items-center bg-gray-800 p-3 rounded-lg">
  <img src="/assets/Red.png" alt="server status" class="w-6 h-6 mr-3">
  <div class="flex-1">
    <p class="text-xl">Main server #1</p>
  </div>
  <button class="bg-blue-600 rounded-lg px-4 py-2 mr-2 cursor-pointer hover:bg-blue-700 active:translate-y-0.5">CONNECT</button>
  <button class="bg-red-600 hover:bg-red-700 active:translate-y-0.5 rounded-lg px-3 py-2 cursor-pointer">REMOVE</button>
</div>*/

function joinRoomCustom(ip: string, port: string) {
  const username = localStorage.getItem("username");
  const serverIP = document.getElementById('server-IP') as HTMLInputElement;
  const serverPORT = document.getElementById('server-PORT') as HTMLInputElement;
  
  if (!username || username.trim() === '') {
    alert('Please enter a username first!');
    return;
  }
  if (serverIP.value.trim() && serverPORT.value.trim()) {
    ip = serverIP.value.trim()
    port = serverPORT.value.trim()
  }
  localStorage.setItem("serverip", ip)
  localStorage.setItem("serverport", port)
  window.location.href = '/room.html';
}

function fetchWithTimeout(url: string, options = {}, timeout: number = 5000) {
	const controller: AbortController = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);

	return fetch(url, { ...options, signal: controller.signal })
		.finally(() => clearTimeout(id));
}

type serverMap = {
  [key: string]: { serverip: string, serverport: string, servername: string}
}

function addServer(ip: string, port: string, name: string): void {
  const serverList = localStorage.getItem("savedServers") || "{}"
  let parsedServerList: serverMap = JSON.parse(serverList)

  parsedServerList[name] = {
    "serverip" : ip,
    "serverport" : port,
    "servername" : name
  }

  localStorage.setItem('savedServers', JSON.stringify(parsedServerList))

  //Lords blessing if this works because I just shot at this blind

  const servers = document.getElementById('servers') as HTMLElement;

  const divElement = document.createElement("div")
  divElement.classList.add('server-item', 'flex', 'items-center', 'bg-gray-800', 'p-3', 'rounded-lg')
  divElement.dataset.serverip = ip
  divElement.dataset.serverport = port

  const imageElement = document.createElement('img')
  imageElement.classList.add('w-6', 'h-6', 'mr-3')
  imageElement.src = '/assets/Green.png'

  const flexContainer = document.createElement('div')
  flexContainer.classList.add('flex-1')

  const paragraphElement = document.createElement('p')
  paragraphElement.classList.add('text-xl')
  paragraphElement.textContent = name

  const connectButton = document.createElement('button')
  connectButton.classList.add('bg-blue-600', 'rounded-lg', 'px-4', 'py-2', 'mr-2', 'cursor-pointer', 'hover:bg-blue-700', 'active:translate-y-0.5')
  connectButton.innerText = "CONNECT"

  const removeButton = document.createElement('button')
  removeButton.classList.add('bg-red-600', 'hover:bg-red-700', 'active:translate-y-0.5', 'rounded-lg', 'px-3', 'py-2', 'cursor-pointer')
  removeButton.textContent = "REMOVE"

  connectButton.addEventListener('click', () => {
    joinRoomCustom(ip, port)
  })

  removeButton.addEventListener('click', () => {
    const serverList = localStorage.getItem('savedServers') || null
    if (serverList) {
      let parsedServerList = JSON.parse(serverList)
      delete parsedServerList[name]
      localStorage.setItem('savedServers', JSON.stringify(parsedServerList))
    }

    divElement.remove()
  })

  flexContainer.appendChild(paragraphElement)

  divElement.appendChild(imageElement)
  divElement.appendChild(flexContainer)
  divElement.appendChild(connectButton)
  divElement.appendChild(removeButton)

  servers.appendChild(divElement)

  fetchWithTimeout(`http://${ip}:${port}`, {}, 2500)
    .then(_response => { //Most likely means its working
      console.log("connection found")
      imageElement.src = '/assets/Green.png'
    })
    .catch(_error => {
      imageElement.src = "/assets/Red.png" 
    })
}

function setupUsernameInput(): void {
  const usernameInput = document.querySelector('#username-input') as HTMLInputElement;
  if (usernameInput) {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      usernameInput.value = storedUsername;
    }

    usernameInput.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      localStorage.setItem("username", target.value || "Anon");
    });

    usernameInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') {
        const target = event.target as HTMLInputElement;
        localStorage.setItem("username", target.value || "Anon");
        joinRoom();
      }
    });
  }
}

function setupJoinRoomButton(): void {
  const joinBtn = document.getElementById('join-room-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', joinRoom);
  }
}

function setupAddServerButton(): void {
  const addServerButton = document.getElementById('add-server-button') as HTMLButtonElement;
  const serverName = document.getElementById('added-name') as HTMLInputElement;
  const serverIP = document.getElementById('added-ip') as HTMLInputElement;
  const serverPORT = document.getElementById('added-port') as HTMLInputElement;

  addServerButton.addEventListener('click', () => {
    addServer(serverIP.value,serverPORT.value,serverName.value)
  })
}

function loadCustomServers(): void {
  let serverList = localStorage.getItem('savedServers') || null
  if (!serverList) {
    return;
  }

  let parsedServerList = JSON.parse(serverList) as serverMap;

  for (const [_key, value] of Object.entries(parsedServerList)) {
    addServer(value["serverip"], value["serverport"], value["servername"])
  }
}

function joinRoom() {
  const username = localStorage.getItem("username");
  const serverIP = document.getElementById('server-IP') as HTMLInputElement;
  const serverPORT = document.getElementById('server-PORT') as HTMLInputElement;
  let ip: string = defaultIP;
  let port: string = defaultPORT;
  
  if (!username || username.trim() === '') {
    alert('Please enter a username first!');
    return;
  }
  if (serverIP.value.trim() && serverPORT.value.trim()) {
    ip = serverIP.value.trim()
    port = serverPORT.value.trim()
  }
  localStorage.setItem("serverip", ip)
  localStorage.setItem("serverport", port)
  window.location.href = '/room.html';
}

function setupRoomPreview() {
  previewSocket.onopen = () => {
  };

  previewSocket.onmessage = (event) => {
    handlePreviewMessage(event);
  };

  previewSocket.onclose = () => {
    console.log('Preview connection closed');
  };

  previewSocket.onerror = (error) => {
    console.error('Preview WebSocket error:', error);
  };
}

function handlePreviewMessage(event: MessageEvent) {
  let parsedData = event.data;
  if (typeof event.data === "string") {
    parsedData = JSON.parse(parsedData);
  }

  if (parsedData.type === 'playerCount') {
    updatePlayerCount(parsedData.message);
  } else if (parsedData.type === 'roomActivity') {
    updateRoomActivity(parsedData.message);
  } else if (parsedData.type === 'previewPlayers') {
    updatePreviewPlayers(parsedData.message);
  }
}

function updatePlayerCount(count: number) {
  const playerCountElement = document.getElementById('player-count');
  if (playerCountElement) {
    playerCountElement.textContent = count.toString();
  }
}

function updateRoomActivity(message: string) {
  const activityElement = document.getElementById('room-activity');
  if (activityElement) {
    activityElement.textContent = message;
    setTimeout(() => {
      if (activityElement.textContent === message) {
        activityElement.textContent = '';
      }
    }, 3000);
  }
}

function updatePreviewPlayers(players: Array<{ id: number, x: number, y: number, username: string }>) {
  const previewContainer = document.getElementById('room-preview');
  if (!previewContainer) return;

  previewContainer.innerHTML = '';

  players.forEach(player => {
    addPreviewPlayer(player.id, player.x, player.y, player.username);
  });
}

function addPreviewPlayer(id: number, x: number, y: number, _username: string) {
  const previewContainer = document.getElementById('room-preview');
  if (!previewContainer) return;

  const playerDiv = document.createElement('div');
  playerDiv.style.position = 'absolute';
  playerDiv.style.width = '20px';
  playerDiv.style.height = '20px';
  playerDiv.style.backgroundColor = 'rgba(59, 130, 246, 0.6)';
  playerDiv.style.borderRadius = '50%';
  playerDiv.style.left = `${x * 0.7}px`;
  playerDiv.style.top = `${y * 0.7}px`;
  playerDiv.style.transition = 'all 0.5s ease';
  playerDiv.id = `preview-player-${id}`;

  playerDiv.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.4)';

  previewContainer.appendChild(playerDiv);

  setTimeout(() => {
    const element = document.getElementById(`preview-player-${id}`);
    if (element) {
      element.style.opacity = '0';
      setTimeout(() => {
        element.remove();
      }, 500);
    }
  }, 2000);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupUsernameInput();
  setupJoinRoomButton();
  setupAddServerButton();
  loadCustomServers();
  setupRoomPreview();
});

(window as any).joinRoomCustom = (ip: string, port: string) => joinRoomCustom(ip, port);
(window as any).defaultIP = defaultIP;
(window as any).defaultPORT = defaultPORT;