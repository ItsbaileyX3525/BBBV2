import './style.css'

const previewSocket = new WebSocket("ws://localhost:3001/preview");

function setupUsernameInput() {
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

function setupJoinRoomButton() {
  const joinBtn = document.getElementById('join-room-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', joinRoom);
  }
}

function joinRoom() {
  const username = localStorage.getItem("username");
  if (!username || username.trim() === '') {
    alert('Please enter a username first!');
    return;
  }
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
  setupRoomPreview();
});
