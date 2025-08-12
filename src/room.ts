import './style.css'
import { Filter } from 'bad-words';
import { emojiList } from './emojiList';
import { parse } from 'node-html-parser'

const IP = localStorage.getItem('serverip') || __SERVER_IP__;
const PORT = localStorage.getItem('serverport') || __SERVER_PORT__;

let socket: WebSocket
let heartbeatInterval: NodeJS.Timeout | null = null;
let previousUserID: number | undefined = undefined; // Track previous ID for cleanup

function deletePlayers(): void {
    const gameArea = document.getElementById('game-area') as HTMLElement;
    if (!gameArea) return;
    
    const playerElements = gameArea.querySelectorAll('[id^="player-"]');
    playerElements.forEach(element => element.remove());
    
    const messageBubbles = gameArea.querySelectorAll('.message-bubble');
    messageBubbles.forEach(bubble => bubble.remove());
    
    otherPlayersMovement.clear();
    
    console.log('Cleaned up all player elements and message bubbles');
}

function startPingInterval() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    // Only use the server heartbeat system - no client-side pings
    heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log(`Sending heartbeat to server at ${new Date().toLocaleTimeString()}`);
            socket.send(JSON.stringify({ type: "hb", ts: Date.now() }));
        }
    }, 20000);
}

function stopPingInterval() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function connect() {
    if (!IP || !PORT) {
        console.error('Missing server IP or PORT configuration');
        setTimeout(() => connect(), 5000);
        return;
    }
    
    try {
        if (PORT === "443") {
            socket = new WebSocket(`wss://${IP}/room`);
        } else {
            socket = new WebSocket(`ws://${IP}:${PORT}/room`);
        }

        socket.onopen = () => {
            console.log('Connected to server successfully');
            startPingInterval();
            
            const username = localStorage.getItem("username") || "Anon";
            const joinMessage = {
                username: username,
                message: `Hi, I've joined from ${getUserAgent()}`
            };
            
            socket.send(encodeMessage("joinRoom", joinMessage));
        };

        socket.onmessage = (event) => {
            try {
                handleMessage(event);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        };

        socket.onclose = (event) => {
            console.log('Disconnected, attempting to reconnect...', event);
            stopPingInterval();
            
            if (window.userID) {
                try {
                    showMessageAbovePlayer(window.userID, "Socket failed (stupid js), reconnecting!");
                } catch (error) {
                    console.error('Error showing reconnect message:', error);
                }
            }
            deletePlayers();

            setTimeout(() => {
                connect();
            }, 2000);
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            stopPingInterval();
            if (socket.readyState !== WebSocket.CLOSED) {
                socket.close();
            }
        };
    } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        setTimeout(() => connect(), 5000);
    }
}

connect()

const filter = new Filter();

const profanityCheckbox = document.getElementById('profanity-checkbox') as HTMLInputElement;
const emojiRegex = /\p{Extended_Pictographic}/u;

let isMoving: boolean = false;
let playerX: number = 200;
let playerY: number = 200;
const keysPressed: Set<string> = new Set();
const baseMovementSpeed: number = 500;
let lastFrameTime: DOMHighResTimeStamp = performance.now();

let targetX: number = 200;
let targetY: number = 200;
let currentX: number = 200;
let currentY: number = 200;
const lerpSpeed: number = 0.25;

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

const BASE_WIDTH: number = 1920;
const BASE_HEIGHT: number = 1080;
const PLAYER_SIZE: number = 40 * 2.5;

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

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const source = audioCtx.createBufferSource();
    source.buffer = cachedBuffer;
    source.loop = true;

    const gainNode = audioCtx.createGain();
    
    gainNode.gain.setValueAtTime(0.45, audioCtx.currentTime);
    
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const totalDuration = cachedBuffer.duration * times;
    source.start(0);
    source.stop(audioCtx.currentTime + totalDuration);
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

// Determental security risk if this didn't exist... Still not convinced its good enough tho.
function sanitizeAllowImg(input: string): string {
	const root = parse(input);

	root.querySelectorAll('*').forEach((el) => {
		if (el.tagName.toLowerCase() !== 'img') {
			el.replaceWith(el.innerHTML);
		}
	});

	root.querySelectorAll('img').forEach((img) => {
		const src = img.getAttribute('src') || '';

		if (!/^(https?:|data:image\/|\/|\.{0,2}\/|[a-zA-Z0-9_\-])/.test(src) || /^javascript:/i.test(src)) {
			img.remove();
			return;
		}

		Object.keys(img.attributes).forEach((attr) => {
			if (!['src', 'alt', 'title', "class"].includes(attr.toLowerCase())) {
				img.removeAttribute(attr);
			}
		});
	});

	return root.toString();
}

function isSingleEmoji(str: string): boolean {
	const seg = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(str)];
	return seg.length === 1 && emojiRegex.test(str);
};

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
    const mainChatInput = document.getElementById('main-chat-input') as HTMLInputElement;

    mainChatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && mainChatInput.value.trim()) {
            let message: string = mainChatInput.value.trim();
            let messageSplit = message.split(" ")
            let reconstructedMessage: string = ""
            for (let e of messageSplit) {
                if (emojiList[e]) {
                    e = emojiList[e]
                }
                if (!isSingleEmoji(e) && e.startsWith('/assets/')) { //Screw whoever be putting /assets/ in their message
                    e = `<img class='max-w-[24px] max-h-[24px]' src='${e}' alt='emoji'>` //pls dont change the class UwU
                }

                reconstructedMessage += ` ${e}`
            }
            
            socket.send(encodeMessage('chatMessage', {
                message: reconstructedMessage.trimStart().trimEnd(),
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
            
            if (window.userID !== undefined) {
                const messageBubble = document.querySelector(`.message-bubble[data-player-id="${window.userID}"]`) as any;
                if (messageBubble && messageBubble.updatePosition) {
                    messageBubble.updatePosition();
                }
            }
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
        socket.close()
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
    const gameArea = document.getElementById('game-area');
    if (!playerDiv || !gameArea) {
        return;
    }

    const existingBubble = gameArea.querySelector(`.message-bubble[data-player-id="${playerId}"]`);
    if (existingBubble) {
        existingBubble.remove();
    }

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    messageBubble.setAttribute('data-player-id', playerId.toString());
    if (localStorage.getItem("childMode")) {
        message = filter.clean(message);
    }

    message = sanitizeAllowImg(message)

    messageBubble.innerHTML = message;
    
    messageBubble.style.position = 'absolute';
    messageBubble.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageBubble.style.color = 'white';
    messageBubble.style.padding = '10px 14px';
    messageBubble.style.borderRadius = '16px';
    messageBubble.style.fontSize = '16px';
    messageBubble.style.whiteSpace = 'normal';
    messageBubble.style.zIndex = '2000';
    messageBubble.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
    messageBubble.style.maxWidth = '400px';
    messageBubble.style.wordBreak = 'break-word';
    messageBubble.style.textAlign = 'center';
    messageBubble.style.display = 'flex';
    messageBubble.style.flexWrap = 'wrap';
    messageBubble.style.alignItems = 'center';
    messageBubble.style.justifyContent = 'center';
    messageBubble.style.gap = '4px';
    
    function updateBubblePosition() {
        const currentPlayerDiv = document.getElementById(`player-${playerId}`);
        const currentGameArea = document.getElementById('game-area');
        if (!currentPlayerDiv || !currentGameArea || !messageBubble.parentNode) return;
        
        const playerRect = currentPlayerDiv.getBoundingClientRect();
        const gameAreaRect = currentGameArea.getBoundingClientRect();
        
        const playerCenterX = playerRect.left - gameAreaRect.left + playerRect.width / 2;
        const playerTop = playerRect.top - gameAreaRect.top;
        
        messageBubble.style.left = `${playerCenterX}px`;
        messageBubble.style.top = `${playerTop - 20}px`;
        messageBubble.style.transform = 'translateX(-50%)';
    }
    
    updateBubblePosition();
    
    (messageBubble as any).updatePosition = updateBubblePosition;
    
    const images = messageBubble.querySelectorAll('img');
    images.forEach(img => {
        img.style.maxWidth = '24px';
        img.style.maxHeight = '24px';
        img.style.verticalAlign = 'middle';
        img.style.display = 'inline-block';
    });
    
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

    gameArea.appendChild(messageBubble);

    playCachedAudioNTimes(20)

    setTimeout(() => {
        if (messageBubble.parentNode) {
            messageBubble.remove();
        }
    }, 5000);
}

function updatePlayerCount(count: number) {
    const playerCountElement = document.getElementById('player-count');
    if (playerCountElement) {
        playerCountElement.textContent = `Players: ${count}`;
    }
}

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
        
        const messageBubble = document.querySelector(`.message-bubble[data-player-id="${playerId}"]`) as any;
        if (messageBubble && messageBubble.updatePosition) {
            messageBubble.updatePosition();
        }
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
        if (previousUserID !== undefined && previousUserID !== data.id) {
            console.log(`Cleaning up previous player ID: ${previousUserID}`);
            const oldPlayerDiv = document.getElementById(`player-${previousUserID}`);
            if (oldPlayerDiv) {
                oldPlayerDiv.remove();
            }
            otherPlayersMovement.delete(previousUserID);
            
            const oldBubble = document.querySelector(`.message-bubble[data-player-id="${previousUserID}"]`);
            if (oldBubble) {
                oldBubble.remove();
            }
        }
        
        previousUserID = window.userID;
        
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
    },
    ping: (data: { timestamp: number }) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(encodeMessage("pong", { timestamp: data.timestamp }));
        }
    },
    hb: (_data: { ts: number }) => {
        console.log(`Server heartbeat received at ${new Date().toLocaleTimeString()}, responding...`);
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "hb", ts: Date.now() }));
        }
    }
};

function handleMessage(data: MessageEvent) {
    try {
        let parsedData = data.data;
        if (typeof data.data === "string") {
            parsedData = JSON.parse(parsedData);
        }
        
        if (!parsedData || typeof parsedData.type !== 'string' || parsedData.message === undefined) {
            console.log("Malformed message", data);
            return;
        }
        
        if (linked_functions[parsedData.type]) {
            try {
                linked_functions[parsedData.type](parsedData.message);
            } catch (error) {
                console.error(`Error handling message type ${parsedData.type}:`, error);
            }
        } else {
            console.log("No handler found for type:", parsedData.type);
        }
    } catch (error) {
        console.error('Error parsing message:', error, data);
    }
}

declare global {
    interface Window {
        userID?: number;
    }
}

function toggleEmojiMenu(): void {
    const emojiMenu = document.getElementById('emoji-list') as HTMLElement;

    if (emojiMenu.classList.contains('hidden')) {
        emojiMenu.classList.remove('hidden')
        emojiMenu.classList.add('absolute')
    } else {
        emojiMenu.classList.remove('absolute')
        emojiMenu.classList.add('hidden')
    }
}

function appendEmoji(tag: string): void {
    const mainChatInput = document.getElementById('main-chat-input') as HTMLInputElement;

    mainChatInput.value = mainChatInput.value.trimEnd() + " " + tag
}

//Purely helper on rizz
function loadEmojis(): void {
    let emojiRows = document.getElementById('emojis')
    for (const [key, value] of Object.entries(emojiList)) {
        if (isSingleEmoji(value)) {
            continue
        }


        const image = document.createElement('img') as HTMLImageElement;
        image.src = value
        image.alt = "Emoji"

        image.classList.add('w-12', 'h-12', 'ml-4', 'cursor-pointer')

        image.onclick = () => {appendEmoji(key)}

        if (emojiRows) {
            emojiRows.appendChild(image)
        }
        
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initializeRoom()
	const cache = await caches.open('audio-cache-v1');
	await cache.add('/sine.wav');
    await loadAudio("/sine.wav")
    if (localStorage.getItem("childMode")) {
        profanityCheckbox.checked = true
    } else{ 
        profanityCheckbox.checked = false
    }
    
    profanityCheckbox.addEventListener('change', () => {
        if (localStorage.getItem("childMode")) {
            localStorage.removeItem("childMode")
        } else {
            localStorage.setItem("childMode", "ThisValueCanBeWhateverIWantItToBe")
        }
        
    })
    loadEmojis()

});

(window as any).toggleEmojiMenu = toggleEmojiMenu