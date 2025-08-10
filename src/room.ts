import './style.css'

const socket = new WebSocket("ws://localhost:3001/room");

let isMoving = false;
let playerX = 200;
let playerY = 200;
const keysPressed: Set<string> = new Set();
const baseMovementSpeed = 500;
let lastFrameTime = performance.now();

let targetX = 200;
let targetY = 200;
let currentX = 200;
let currentY = 200;
const lerpSpeed = 0.25;

let lastDirection = 'right';

const otherPlayersMovement = new Map<number, {
    currentX: number,
    currentY: number,
    targetX: number,
    targetY: number
}>();

function lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
}

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const PLAYER_SIZE = 40 * 2.5;

let cachedBuffer: AudioBuffer | null = null;
let audioCtx: AudioContext | null = null;

function worldToLocal(worldX: number, worldY: number): { x: number, y: number } {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return { x: worldX, y: worldY };
    
    const rect = gameArea.getBoundingClientRect();
    const scaleX = rect.width / BASE_WIDTH;
    const scaleY = rect.height / BASE_HEIGHT;
    
    return {
        x: worldX * scaleX,
        y: worldY * scaleY
    };
}

async function loadAudio(url: string) {
    // @ts-ignore
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	cachedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
}

function playCachedAudioNTimes(times: number) {
	if (!cachedBuffer || !audioCtx) return;

	const source = audioCtx.createBufferSource();
	source.buffer = cachedBuffer;
	source.loop = true;

	const totalDuration = cachedBuffer.duration * times;
	source.connect(audioCtx.destination);
	source.start(0);
	source.stop(audioCtx.currentTime + totalDuration);

	source.onended = () => console.log("Finished");
}

function getUserAgent(){
    const userAgent = navigator.userAgent;
    if(userAgent.includes("Chrome") && !userAgent.includes("Chromium") && !userAgent.includes("Edg")) {
        return "Chrome - The bog-standard browser!";
    }
    else if(userAgent.includes("Firefox")) {
        return "Firefox - The best browser!";
    }
    else if(userAgent.includes("Safari") && !userAgent.includes("Edg")) {
        return "Safari - The apple browser!";
    }
    else if(userAgent.includes("Edg")) {
        return "Edge - The suprisingly good browser!";
    }
    else if(userAgent.includes("Opera") || userAgent.includes("OPR")) {
        return "Opera - The worst browser!";
    }else{
        return "idk - The cool unknown browser";
    }
}

function initializeRoom() {
    const username = localStorage.getItem("username") || "Anon";
    document.getElementById('current-username')!.textContent = username;
    
    setupChat();
    
    setupMovement();
    
    setupLeaveButton();
    
    window.addEventListener('resize', () => {
        updateAllPlayersOnResize();
    });
}

function updateAllPlayersOnResize() {
    console.log('Window resized - player positions should be recalculated..... Cba tho');
}

function setupChat() {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const mainChatInput = document.getElementById('main-chat-input') as HTMLInputElement;
    
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && chatInput.value.trim()) {
            const message = chatInput.value.trim();
            socket.send(encodeMessage('chatMessage', {
                message: message,
                username: localStorage.getItem("username") || "Anon"
            }));
            chatInput.value = '';
        }
    });

    mainChatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && mainChatInput.value.trim()) {
            const message = mainChatInput.value.trim();
            socket.send(encodeMessage('chatMessage', {
                message: message,
                username: localStorage.getItem("username") || "Anon"
            }));
            mainChatInput.value = '';
            mainChatInput.blur();
        }
    });
}

function setupMovement() {
    function isTyping(): boolean {
        const activeElement = document.activeElement;
        return activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
    }

    document.addEventListener('keydown', (event) => {
        if (isTyping()) return;
        
        const key = event.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(key)) {
            event.preventDefault();
            keysPressed.add(key);
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(key)) {
            keysPressed.delete(key);
        }
    });

    function movePlayer() {
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastFrameTime) / 1000;
        lastFrameTime = currentTime;
        
        const frameMovementSpeed = baseMovementSpeed * deltaTime;
        
        if (isTyping()) {
            keysPressed.clear();
            requestAnimationFrame(movePlayer);
            return;
        }

        let moved = false;
        let currentDirection = lastDirection;
        let moveX = 0;
        let moveY = 0;
        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;

        if (keysPressed.has('w')) {
            moveY = -1;
        }
        if (keysPressed.has('s')) {
            moveY = 1;
        }
        if (keysPressed.has('a')) {
            moveX = -1;
            currentDirection = 'left';
        }
        if (keysPressed.has('d')) {
            moveX = 1;
            currentDirection = 'right';
        }

        if (moveX !== 0 && moveY !== 0) {
            const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= magnitude;
            moveY /= magnitude;
        }

        if (moveX !== 0 || moveY !== 0) {
            moved = true;
            targetX = Math.max(PLAYER_SIZE/2, Math.min(BASE_WIDTH - PLAYER_SIZE/2, targetX + moveX * frameMovementSpeed));
            targetY = Math.max(PLAYER_SIZE/2, Math.min(BASE_HEIGHT - PLAYER_SIZE/2, targetY + moveY * frameMovementSpeed));
        }

        if (currentDirection !== lastDirection && window.userID !== undefined) {
            lastDirection = currentDirection;
            updatePlayerDirection(window.userID, currentDirection);
        }

        currentX = lerp(currentX, targetX, lerpSpeed);
        currentY = lerp(currentY, targetY, lerpSpeed);

        updateOtherPlayersPositions();

        const localPos = worldToLocal(currentX, currentY);
        
        const currentPlayerDiv = document.getElementById(`player-${window.userID}`);
        if (currentPlayerDiv) {
            currentPlayerDiv.style.left = `${localPos.x - PLAYER_SIZE/2}px`;
            currentPlayerDiv.style.top = `${localPos.y - PLAYER_SIZE/2}px`;
        }

        if (moved && !isMoving) {
            isMoving = true;
            
            playerX = targetX;
            playerY = targetY;
            
            socket.send(encodeMessage('moveMessage', {
                x: playerX,
                y: playerY,
                direction: lastDirection
            }));
            setTimeout(() => {
                isMoving = false;
            }, 50);
        }

        requestAnimationFrame(movePlayer);
    }

    requestAnimationFrame(movePlayer);
}

function setupLeaveButton() {
    const leaveBtn = document.getElementById('leave-room-btn');
    leaveBtn?.addEventListener('click', () => {
        window.location.href = '/';
    });
}

function addChatMessage(username: string, message: string) {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'mb-1';
        messageDiv.innerHTML = `<span class="text-blue-300">${username}:</span> ${message}`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function showMessageAbovePlayer(playerId: number, message: string) {
    const playerDiv = document.getElementById(`player-${playerId}`);
    if (!playerDiv) {
        return;
    }

    const existingBubble = playerDiv.querySelector('.message-bubble');
    if (existingBubble) {
        existingBubble.remove();
    }

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    messageBubble.textContent = message;
    messageBubble.style.position = 'absolute';
    messageBubble.style.bottom = `80px`;
    messageBubble.style.left = '50%';
    messageBubble.style.transform = 'translateX(-50%)';
    messageBubble.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageBubble.style.color = 'white';
    messageBubble.style.padding = '10px 14px';
    messageBubble.style.borderRadius = '16px';
    messageBubble.style.fontSize = '16px';
    messageBubble.style.whiteSpace = 'nowrap';
    messageBubble.style.zIndex = '2000';
    messageBubble.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
    messageBubble.style.maxWidth = '250px';
    messageBubble.style.wordBreak = 'break-word';
    messageBubble.style.textAlign = 'center';
    
    const arrow = document.createElement('div');
    arrow.style.position = 'absolute';
    arrow.style.bottom = '-6px';
    arrow.style.left = '50%';
    arrow.style.transform = 'translateX(-50%)';
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '6px solid transparent';
    arrow.style.borderRight = '6px solid transparent';
    arrow.style.borderTop = '6px solid rgba(0, 0, 0, 0.8)';
    messageBubble.appendChild(arrow);

    playerDiv.appendChild(messageBubble);

    playCachedAudioNTimes(20)

    setTimeout(() => {
        if (messageBubble.parentNode) {
            messageBubble.remove();
        }
    }, 3000);
}

function updatePlayerCount(count: number) {
    const playerCountElement = document.getElementById('player-count');
    if (playerCountElement) {
        playerCountElement.textContent = `Players: ${count}`;
    }
}

socket.onopen = () => {
    socket.send(encodeMessage("joinRoom", { 
        username: localStorage.getItem("username") || "Anon", 
        message: `Hi, I've joined from ${getUserAgent()}`
    }));
};

socket.onmessage = (event) => {handleMessage(event);};
socket.onclose = () => {console.log("Connection closed");};
socket.onerror = (error) => {console.error("WebSocket error:", error);};

function addPlayer(playerID: number, worldX: number = 200, worldY: number = 200, _colour: string = 'red', username: string = 'Player', direction: string = 'right'): void {
    const existingPlayer = document.getElementById(`player-${playerID}`);
    if (existingPlayer) {
        existingPlayer.remove();
    }

    const localPos = worldToLocal(worldX, worldY);

    const playerDiv = document.createElement('div');
    playerDiv.style.position = 'absolute';
    playerDiv.style.width = `${PLAYER_SIZE}px`;
    playerDiv.style.height = `${PLAYER_SIZE}px`;
    playerDiv.style.zIndex = '1000';
    playerDiv.style.transition = 'all 0.1s ease';
    playerDiv.id = `player-${playerID}`;
    playerDiv.style.pointerEvents = 'none'
    playerDiv.style.left = `${localPos.x - PLAYER_SIZE/2}px`;
    playerDiv.style.top = `${localPos.y - PLAYER_SIZE/2}px`;
    
    const bearImage = document.createElement('img');
    bearImage.src = '/unicode_bear.png';
    bearImage.style.width = '100%';
    bearImage.style.height = '100%';
    bearImage.style.objectFit = 'contain';
    bearImage.alt = `Player ${username}`;
    bearImage.className = 'player-sprite';
    
    if (direction === 'left') {
        bearImage.style.transform = 'scaleX(-1)';
    }
    
    const nameLabel = document.createElement('div');
    nameLabel.textContent = username;
    nameLabel.style.position = 'absolute';
    nameLabel.style.bottom = `${-10}px`;
    nameLabel.style.left = '50%';
    nameLabel.style.transform = 'translateX(-50%)';
    nameLabel.style.fontSize = '14px';
    nameLabel.style.color = 'white';
    nameLabel.style.textShadow = '1px 1px 2px black';
    nameLabel.style.whiteSpace = 'nowrap';
    
    playerDiv.appendChild(bearImage);
    playerDiv.appendChild(nameLabel);
    document.getElementById('game-area')!.appendChild(playerDiv);
}

function updatePlayerDirection(playerID: number, direction: string): void {
    const playerDiv = document.getElementById(`player-${playerID}`);
    if (!playerDiv) return;
    
    const bearImage = playerDiv.querySelector('.player-sprite') as HTMLImageElement;
    if (!bearImage) return;
    
    if (direction === 'left') {
        bearImage.style.transform = 'scaleX(-1)';
    } else {
        bearImage.style.transform = 'scaleX(1)';
    }
}

function encodeMessage(type: string, message: any): string {
    return JSON.stringify({ type: type, message: message });
}

function handleJoinRoom(data: { id: number, username: string, playerCount: number }) {
    if (data.id === window.userID) {
        return;
    }
    const worldX = 200 + Math.random() * 400;
    const worldY = 200 + Math.random() * 300;
    addPlayer(data.id, worldX, worldY, 'blue', data.username);
    updatePlayerCount(data.playerCount);
    addChatMessage('System', `${data.username} joined the room`);
}

function handleChatMessage(data: { message: string, username: string, playerId: number }) {
    addChatMessage(data.username, data.message);
    
    showMessageAbovePlayer(data.playerId, data.message);
}

function handleMoveMessage(data: { id: number, x: number, y: number, direction?: string }) {
    const playerDiv = document.getElementById(`player-${data.id}`);
    if (!playerDiv) {
        console.log("player not found with ID: ", data.id);
        return;
    }
    
    if (!otherPlayersMovement.has(data.id)) {
        otherPlayersMovement.set(data.id, {
            currentX: data.x,
            currentY: data.y,
            targetX: data.x,
            targetY: data.y
        });
    }
    
    const playerMovement = otherPlayersMovement.get(data.id)!;
    playerMovement.targetX = data.x;
    playerMovement.targetY = data.y;
    
    if (data.direction) {
        updatePlayerDirection(data.id, data.direction);
    }
}

function updateOtherPlayersPositions() {
    otherPlayersMovement.forEach((movement, playerId) => {
        const playerDiv = document.getElementById(`player-${playerId}`);
        if (!playerDiv) {
            otherPlayersMovement.delete(playerId);
            return;
        }
        
        movement.currentX = lerp(movement.currentX, movement.targetX, lerpSpeed);
        movement.currentY = lerp(movement.currentY, movement.targetY, lerpSpeed);
        
        const localPos = worldToLocal(movement.currentX, movement.currentY);
        
        playerDiv.style.left = `${localPos.x - PLAYER_SIZE/2}px`;
        playerDiv.style.top = `${localPos.y - PLAYER_SIZE/2}px`;
    });
}

const linked_functions: Record<string, (data: any) => void> = {
    joinRoom: handleJoinRoom,
    chatMessage: handleChatMessage,
    moveMessage: handleMoveMessage,
    playerLeft: (data: { id: number, username: string, playerCount: number }) => {
        const playerDiv = document.getElementById(`player-${data.id}`);
        if (playerDiv) {
            playerDiv.remove();
        }
        otherPlayersMovement.delete(data.id);
        updatePlayerCount(data.playerCount);
        addChatMessage('System', `${data.username} left the room`);
    },
    updateClients: (data: Array<{ id: number, x: number, y: number, username: string }>) => {
        for (const client of data) {
            if (client.id !== window.userID) {
                addPlayer(client.id, client.x || 200, client.y || 200, 'green', client.username);
            }
        }
        updatePlayerCount(data.length);
    },
    assignID: (data: { id: number, playerCount: number }) => {
        window.userID = data.id;
        const username = localStorage.getItem("username") || "Anon";
        
        playerX = 200;
        playerY = 200;
        targetX = 200;
        targetY = 200;
        currentX = 200;
        currentY = 200;
        
        addPlayer(data.id, playerX, playerY, 'red', username);
        updatePlayerCount(data.playerCount);
        socket.send(encodeMessage('updateData', {
            x: playerX,
            y: playerY,
            username: username
        }));
    }
};

function handleMessage(data: MessageEvent) {
    let parsedData = data.data;
    if (typeof data.data === "string") {
        parsedData = JSON.parse(parsedData);
    }
    if (parsedData.type === undefined || parsedData.message === undefined) {
        console.log("Malformed message", data);
        return;
    }
    if (linked_functions[parsedData.type]) {
        linked_functions[parsedData.type](parsedData.message);
    } else {
        console.log("No handler found for type:", parsedData.type);
    }
}

declare global {
    interface Window {
        userID?: number;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeRoom()
	const cache = await caches.open('audio-cache-v1');
	await cache.add('/sine.wav');
    await loadAudio("/sine.wav")
});
