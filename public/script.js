/**
 * Zoom Elite Core Frontend Application Engine
 * Implements WebRTC Full Mesh Signaling Architecture & UI Handling
 */

const socket = io('/');

// View State Selectors
const authPortal = document.getElementById('auth-portal');
const appContainer = document.getElementById('app-container');
const videoGrid = document.getElementById('video-mesh-grid');
const localVideoElement = document.getElementById('local-video-element');
const localVideoContainer = document.getElementById('local-video-container');

// Input Control Selectors
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const generateRoomBtn = document.getElementById('generate-room-btn');
const joinMeetingBtn = document.getElementById('join-meeting-btn');

// Top Metadata Displays
const roomIdDisplay = document.getElementById('session-room-id-display');
const copyRoomIdBtn = document.getElementById('copy-session-id-btn');
const copyInviteBtn = document.getElementById('copy-invite-link-btn');
const sessionClock = document.getElementById('session-clock');

// Bottom Control Dock Elements
const micBtn = document.getElementById('dock-btn-mic');
const cameraBtn = document.getElementById('dock-btn-camera');
const shareBtn = document.getElementById('dock-btn-share');
const handBtn = document.getElementById('dock-btn-hand');
const chatToggleBtn = document.getElementById('dock-btn-chat-toggle');
const chatCounter = document.getElementById('chat-counter');
const participantsToggleBtn = document.getElementById('dock-btn-participants-toggle');
const participantCounterLabel = document.getElementById('participant-counter-label');
const leaveBtn = document.getElementById('dock-btn-leave');
const endBtn = document.getElementById('dock-btn-end');

// Sidebar Component Architecture Selectors
const sidebarPanel = document.getElementById('sidebar-panel');
const sidebarCloseTrigger = document.getElementById('sidebar-close-trigger');
const tabBtnChat = document.getElementById('tab-btn-chat');
const tabBtnParticipants = document.getElementById('tab-btn-participants');
const paneChatView = document.getElementById('pane-chat-view');
const paneParticipantsView = document.getElementById('pane-participants-view');

// Internal Chat and Registry Selectors
const chatScroller = document.getElementById('chat-messages-scroller');
const chatInputElement = document.getElementById('chat-input-element');
const chatSendBtn = document.getElementById('chat-send-btn');
const emojiTrigger = document.getElementById('chat-emoji-trigger');
const emojiPopupTray = document.getElementById('emoji-popup-tray');
const typingBroadcastIndicator = document.getElementById('typing-broadcast-indicator');
const participantsRegistry = document.getElementById('participants-list-registry');

// Host Action Elements
const hostMuteAllBtn = document.getElementById('host-action-mute-all');
const hostDisableVideoAllBtn = document.getElementById('host-action-disable-video-all');

// Core Global State Objects
let localStream = null;
let screenStream = null;
let myUserId = null;
let myUsername = "";
let targetRoomId = "";
let isHost = false;
let isMicActive = true;
let isCameraActive = true;
let isScreenSharing = false;
let isHandRaised = false;
let unreadMessagesCount = 0;
let typingTimeout = null;
let sessionStartTime = null;
let clockIntervalId = null;

// Peer Connection Storage: Maps targetId -> RTCPeerConnection object
const peerConnections = new Map();

// Configuration configuration for public STUN infrastructure
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Auto ID Generation Handler Engine
generateRoomBtn.addEventListener('click', () => {
    const randomBlocks = [];
    for(let i=0; i<3; i++) {
        randomBlocks.push(Math.random().toString(36).substring(2, 7));
    }
    roomInput.value = randomBlocks.join('-');
});

// Initialization: Check URL parameters for direct meeting joins
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRoomId = urlParams.get('room');
    if (sharedRoomId) {
        roomInput.value = sharedRoomId;
    }
});

// Join Button Event Handler Entry Point
joinMeetingBtn.addEventListener('click', async () => {
    myUsername = usernameInput.value.trim();
    targetRoomId = roomInput.value.trim();

    if (!myUsername) {
        showToastNotification("Identity Context Error: Please input a display name.");
        return;
    }
    if (!targetRoomId) {
        showToastNotification("Session Target Error: Please enter a Room ID.");
        return;
    }

    // Initialize Local Media AV Input Stream Pipeline
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: true
        });
        localVideoElement.srcObject = localStream;
        localVideoContainer.classList.remove('loading-stream');
    } catch (error) {
        console.warn("AV Initialization Warning: standard tracks denied. Fallback modes enabled.", error);
        showToastNotification("Media Warning: Camera/Microphone access blocked. Joining audio/video muted.");
        // Create black fallback tracking canvas elements to prevent WebRTC pipe breakages
        localStream = createFallbackMediaTracks();
        localVideoElement.srcObject = localStream;
        localVideoContainer.classList.add('loading-stream');
        toggleCameraTrackState(false);
        toggleMicTrackState(false);
    }

    // Shift DOM View Container Layer Elements
    authPortal.classList.add('hidden');
    appContainer.classList.remove('hidden');
    roomIdDisplay.textContent = `Room: ${targetRoomId}`;
    
    // Set socket meta references and broadcast joining state signature
    myUserId = socket.id;
    socket.emit('join-room', { roomId: targetRoomId, username: myUsername });
    
    startSessionClock();
    initializeAudioMonitor(localStream);
});

/**
 * Creates dummy media tracks if the user blocks peripheral hardware access
 */
function createFallbackMediaTracks() {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1f2833'; ctx.fillRect(0, 0, 640, 480);
    const stream = canvas.captureStream(30);
    
    // Web Audio Mock API Node Generator
    if (window.AudioContext || window.webkitAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctxAudio = new AudioContext();
        const oscillator = ctxAudio.createOscillator();
        const dst = ctxAudio.createMediaStreamDestination();
        oscillator.connect(dst);
        stream.addTrack(dst.stream.getAudioTracks()[0]);
    }
    return stream;
}

// Track Connection Framework: Initialize WebRTC Peer Pipeline
socket.on('user-connected', async ({ userId, username, isHost: peerIsHost, joinTime }) => {
    showToastNotification(`${username} joined the elite session.`);
    
    // Establish target RTC Endpoint connection instance
    const pc = createPeerConnectionInstance(userId, username);
    peerConnections.set(userId, pc);

    // Add local media tracks to the peer connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Create SDP Offer
    try {
        const offer = await pc.createOffer();
        await pc.setLocalSideDescription(offer); // Standard compliant wrapper internally parsing description structures
        socket.emit('signal', { targetId: userId, signalData: offer });
    } catch (err) {
        console.error("WebRTC Error establishing pipeline offer context: ", err);
    }
});

// Incoming WebRTC Signal handling
socket.on('signal', async ({ senderId, signalData }) => {
    let pc = peerConnections.get(senderId);
    
    // Lazy instantiation if connection doesn't exist yet
    if (!pc) {
        pc = createPeerConnectionInstance(senderId, "Remote Peer");
        peerConnections.set(senderId, pc);
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    try {
        if (signalData.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', { targetId: senderId, signalData: answer });
        } else if (signalData.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        }
    } catch (err) {
        console.error("SDP Parsing Exception: ", err);
    }
});

socket.on('ice-candidate', async ({ senderId, candidate }) => {
    const pc = peerConnections.get(senderId);
    if (pc && candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("ICE Candidate Injection Fail: ", e);
        }
    }
});

/**
 * Instantiates Core Peer Connection Mechanics
 */
function createPeerConnectionInstance(targetUserId, peerName) {
    // Structural API standard call overrides mapping methods manually
    const pc = new RTCPeerConnection(rtcConfig);
    pc.setLocalSideDescription = pc.setLocalDescription; // Alias mapping boundary stability layer

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { targetId: targetUserId, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        injectRemoteVideoStream(targetUserId, peerName, event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            destroyPeerConnectionInstance(targetUserId);
        }
    };

    return pc;
}

/**
 * Injecting Remote Peer Dynamic DOM Node Structure to Grid System
 */
function injectRemoteVideoStream(userId, username, stream) {
    if (document.getElementById(`container-${userId}`)) return;

    const wrapper = document.createElement('div');
    wrapper.id = `container-${userId}`;
    wrapper.className = "video-card-wrapper";

    const loader = document.createElement('div');
    loader.className = "video-loader";
    
    const avatar = document.createElement('div');
    avatar.className = "avatar-fallback hidden";
    avatar.textContent = username.charAt(0).toUpperCase();

    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    // Overlay definitions
    const overlay = document.createElement('div');
    overlay.className = "video-overlay-details";

    const label = document.createElement('span');
    label.className = "user-label-tag";
    label.id = `label-text-${userId}`;
    label.textContent = username;

    const cluster = document.createElement('div');
    cluster.className = "indicator-cluster";

    const speakIcon = document.createElement('span');
    speakIcon.className = "speaking-wave hidden";
    speakIcon.id = `speak-${userId}`;
    speakIcon.textContent = "🔊";

    const handIcon = document.createElement('span');
    handIcon.className = "status-icon status-hand hidden";
    handIcon.id = `hand-${userId}`;
    handIcon.textContent = "✋";

    const micIcon = document.createElement('span');
    micIcon.className = "status-icon status-mic";
    micIcon.id = `mic-${userId}`;
    micIcon.textContent = "🎙️";

    cluster.appendChild(speakIcon);
    cluster.appendChild(handIcon);
    cluster.appendChild(micIcon);
    overlay.appendChild(label);
    overlay.appendChild(cluster);

    wrapper.appendChild(loader);
    wrapper.appendChild(avatar);
    wrapper.appendChild(video);
    wrapper.appendChild(overlay);

    // Interactive Node Click Event Configuration: Pin System Feature
    wrapper.addEventListener('click', () => {
        document.querySelectorAll('.video-card-wrapper').forEach(card => {
            if(card !== wrapper) card.classList.remove('pinned-mode');
        });
        wrapper.classList.toggle('pinned-mode');
    });

    videoGrid.appendChild(wrapper);
    recalculateVideoGridLayout();
    initializeAudioMonitor(stream, userId);
}

function destroyPeerConnectionInstance(userId) {
    const wrapper = document.getElementById(`container-${userId}`);
    if (wrapper) wrapper.remove();
    
    const pc = peerConnections.get(userId);
    if (pc) {
        pc.close();
        peerConnections.delete(userId);
    }
    recalculateVideoGridLayout();
}

/**
 * Dynamically re-allocates aspect space based on active peer count dimensions
 */
function recalculateVideoGridLayout() {
    const cards = videoGrid.querySelectorAll('.video-card-wrapper');
    const totalCount = cards.length;
    
    cards.forEach(card => {
        if (!card.classList.contains('pinned-mode')) {
            card.style.width = '100%';
            card.style.height = '100%';
        }
    });
}

// Handle Room Data Updates from Server
socket.on('room-info', ({ userCount, participants }) => {
    participantCounterLabel.textContent = userCount;
    
    // Evaluate if local identity role configuration has escalated to Host status
    const currentSelfInfo = participants.find(p => p.id === socket.id);
    if (currentSelfInfo && currentSelfInfo.isHost && !isHost) {
        isHost = true;
        showToastNotification("Privilege Escalation: You are now the session host.");
        document.querySelectorAll('.modal-host-auth').forEach(el => el.classList.remove('hidden'));
        endBtn.classList.remove('hidden');
        const selfTag = localVideoContainer.querySelector('.user-label-tag');
        if(selfTag && !selfTag.innerHTML.includes('Host')) {
            selfTag.innerHTML = `<span class="host-tag">Host</span> You`;
        }
    }

    // Refresh dynamic side roster data elements explicitly
    participantsRegistry.innerHTML = "";
    participants.forEach(user => {
        const row = document.createElement('div');
        row.className = "participant-row-instance";

        row.innerHTML = `
            <div class="participant-profile-block">
                <div class="p-avatar">${user.username.charAt(0).toUpperCase()}</div>
                <div class="p-metadata">
                    <span class="p-name">${user.username} ${user.isHost ? '<span class="host-tag">Host</span>' : ''} ${user.id === socket.id ? '(You)' : ''}</span>
                    <span class="p-time">Joined ${user.joinTime}</span>
                </div>
            </div>
            <div class="participant-status-indicators">
                ${user.handRaised ? '<span class="p-badge text-yellow">✋</span>' : ''}
                <span class="p-badge">${user.micMuted ? '❌🎙️' : '🎙️'}</span>
                <span class="p-badge">${user.cameraDisabled ? '❌📹' : '📹'}</span>
            </div>
        `;
        participantsRegistry.appendChild(row);
    });
});

socket.on('user-disconnected-notify', ({ userId, username, leaveTime }) => {
    showToastNotification(`${username} left the meeting at ${leaveTime}.`);
    destroyPeerConnectionInstance(userId);
});

socket.on('host-changed', ({ newHostId, username }) => {
    showToastNotification(`${username} has been appointed Session Host.`);
});

// Interactive Client Event Mechanics: Local Media Control Interfacing
micBtn.addEventListener('click', () => {
    isMicActive = !isMicActive;
    toggleMicTrackState(isMicActive);
});

cameraBtn.addEventListener('click', () => {
    isCameraActive = !isCameraActive;
    toggleCameraTrackState(isCameraActive);
});

function toggleMicTrackState(isActive) {
    if (localStream && localStream.getAudioTracks().length > 0) {
        localStream.getAudioTracks()[0].enabled = isActive;
        
        const micIcon = localVideoContainer.querySelector('.status-mic');
        if(isActive) {
            micBtn.classList.remove('media-muted');
            micBtn.querySelector('.btn-label').textContent = "Mute";
            if (micIcon) micIcon.classList.remove('hidden');
        } else {
            micBtn.classList.add('media-muted');
            micBtn.querySelector('.btn-label').textContent = "Unmute";
            if (micIcon) micIcon.classList.add('hidden');
        }
        socket.emit('media-state-change', { type: 'audio', enabled: isActive });
    }
}

function toggleCameraTrackState(isActive) {
    if (localStream && localStream.getVideoTracks().length > 0) {
        localStream.getVideoTracks()[0].enabled = isActive;
        
        const avatar = localVideoContainer.querySelector('.avatar-fallback');
        if(isActive) {
            cameraBtn.classList.remove('media-muted');
            cameraBtn.querySelector('.btn-label').textContent = "Stop Video";
            if(avatar) avatar.classList.add('hidden');
            localVideoElement.style.opacity = "1";
        } else {
            cameraBtn.classList.add('media-muted');
            cameraBtn.querySelector('.btn-label').textContent = "Start Video";
            if(avatar) {
                avatar.textContent = myUsername.charAt(0).toUpperCase();
                avatar.classList.remove('hidden');
            }
            localVideoElement.style.opacity = "0";
        }
        socket.emit('media-state-change', { type: 'video', enabled: isActive });
    }
}

// Media Control Notifications from Peer Updates
socket.on('peer-media-state', ({ userId, type, enabled }) => {
    const wrapper = document.getElementById(`container-${userId}`);
    if (!wrapper) return;

    if (type === 'video') {
        const avatar = wrapper.querySelector('.avatar-fallback');
        const video = document.getElementById(`video-${userId}`);
        if (enabled) {
            if(avatar) avatar.classList.add('hidden');
            if(video) video.style.opacity = "1";
        } else {
            if(avatar) {
                avatar.classList.remove('hidden');
            }
            if(video) video.style.opacity = "0";
        }
    } else if (type === 'audio') {
        const micIcon = wrapper.querySelector('.status-mic');
        if (enabled) {
            if (micIcon) micIcon.classList.remove('hidden');
        } else {
            if (micIcon) micIcon.classList.add('hidden');
        }
    }
});

// Hand Raising Control Architecture Elements
handBtn.addEventListener('click', () => {
    isHandRaised = !isHandRaised;
    handBtn.classList.toggle('btn-secondary');
    handBtn.classList.toggle('active');
    
    const selfHandIcon = localVideoContainer.querySelector('.status-hand');
    if(isHandRaised) {
        if(selfHandIcon) selfHandIcon.classList.remove('hidden');
        handBtn.querySelector('.btn-label').textContent = "Lower Hand";
    } else {
        if(selfHandIcon) selfHandIcon.classList.add('hidden');
        handBtn.querySelector('.btn-label').textContent = "Raise Hand";
    }
    
    socket.emit('toggle-hand', isHandRaised);
});

socket.on('hand-state-changed', ({ userId, username, handRaised }) => {
    if(userId === socket.id) return;
    const wrapper = document.getElementById(`container-${userId}`);
    if(wrapper) {
        const handIcon = wrapper.querySelector('.status-hand');
        if(handRaised) {
            if(handIcon) handIcon.classList.remove('hidden');
            showToastNotification(`${username} raised their hand.`);
        } else {
            if(handIcon) handIcon.classList.add('hidden');
        }
    }
});

// Structural Enforcement: Host Core Commands
socket.on('force-mute-audio', () => {
    if(!isHost) {
        isMicActive = false;
        toggleMicTrackState(false);
        showToastNotification("The session host muted your audio.");
    }
});

socket.on('force-disable-video', () => {
    if(!isHost) {
        isCameraActive = false;
        toggleCameraTrackState(false);
        showToastNotification("The session host turned off your camera.");
    }
});

hostMuteAllBtn.addEventListener('click', () => {
    if(isHost) socket.emit('host-mute-all');
});

hostDisableVideoAllBtn.addEventListener('click', () => {
    if(isHost) socket.emit('host-disable-all-video');
});

// Interactive Desktop Frame Screen Sharing Framework Logic Execution
shareBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            isScreenSharing = true;
            shareBtn.classList.add('active');
            shareBtn.querySelector('.btn-label').textContent = "Stop Share";
            localVideoContainer.classList.add('screen-sharing-view');

            const videoTrack = screenStream.getVideoTracks()[0];
            
            // Swap outbound presentation layout streaming pipes
            peerConnections.forEach((pc) => {
                const senders = pc.getSenders();
                const sender = senders.find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack);
            });

            localVideoElement.srcObject = screenStream;

            videoTrack.onended = () => { stopScreenSharingPipeline(); };
            socket.emit('screen-sharing-status', true);
            showToastNotification("Screen sharing initiated successfully.");
        } catch (err) {
            console.error("Screen Share Disrupted: ", err);
            isScreenSharing = false;
        }
    } else {
        stopScreenSharingPipeline();
    }
});

function stopScreenSharingPipeline() {
    if (!isScreenSharing) return;
    isScreenSharing = false;
    shareBtn.classList.remove('active');
    shareBtn.querySelector('.btn-label').textContent = "Share Screen";
    localVideoContainer.classList.remove('screen-sharing-view');

    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
    }

    const baseVideoTrack = localStream.getVideoTracks()[0];
    peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(baseVideoTrack);
    });

    localVideoElement.srcObject = localStream;
    socket.emit('screen-sharing-status', false);
    showToastNotification("Screen sharing terminated. Restoring local camera stream.");
}

socket.on('peer-screen-sharing', ({ userId, username, isSharing }) => {
    const wrapper = document.getElementById(`container-${userId}`);
    if(wrapper) {
        if(isSharing) {
            wrapper.classList.add('screen-sharing-view');
            showToastNotification(`${username} started sharing their screen.`);
        } else {
            wrapper.classList.remove('screen-sharing-view');
        }
    }
});

// Active Speaker Detection Engine
function initializeAudioMonitor(stream, userId = null) {
    if(!window.AudioContext && !window.webkitAudioContext) return;
    
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioCtx();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        let activeSpeakerCounter = 0;

        const checkVolume = () => {
            if (!peerConnections.has(userId) && userId !== null) return; // Terminate checking loops if peer drops
            analyser.getByteFrequencyData(data);
            let sum = 0;
            data.forEach(v => sum += v);
            const averageVolume = sum / data.length;

            const speakerIcon = userId ? document.getElementById(`speak-${userId}`) : localVideoContainer.querySelector('.speaking-wave');
            const elementWrapper = userId ? document.getElementById(`container-${userId}`) : localVideoContainer;

            if (averageVolume > 35) { // Sensitivity cutoff threshold level parameter variables
                activeSpeakerCounter++;
                if (activeSpeakerCounter > 10) { // Enforce temporal window logic frames to smooth state transitions
                    if (speakerIcon) speakerIcon.classList.remove('hidden');
                    if (elementWrapper) elementWrapper.classList.add('active-speaker-ring');
                }
            } else {
                activeSpeakerCounter = 0;
                if (speakerIcon) speakerIcon.classList.add('hidden');
                if (elementWrapper) elementWrapper.classList.remove('active-speaker-ring');
            }
            setTimeout(checkVolume, 100);
        };
        checkVolume();
    } catch(e) {
        console.warn("Audio Context Monitor Instance Initialization Exception: ", e);
    }
}

// Sidebar Interaction & Chat Routing Code Blocks
chatToggleBtn.addEventListener('click', () => {
    openSidebarPane('chat');
});

participantsToggleBtn.addEventListener('click', () => {
    openSidebarPane('participants');
});

sidebarCloseTrigger.addEventListener('click', () => {
    sidebarPanel.classList.add('hidden');
});

function openSidebarPane(paneType) {
    sidebarPanel.classList.remove('hidden');
    if (paneType === 'chat') {
        tabBtnChat.classList.add('active');
        tabBtnParticipants.classList.remove('active');
        paneChatView.classList.add('active-pane');
        paneParticipantsView.classList.remove('active-pane');
        unreadMessagesCount = 0;
        chatCounter.classList.add('hidden');
    } else {
        tabBtnChat.classList.remove('active');
        tabBtnParticipants.classList.add('active');
        paneChatView.classList.remove('active-pane');
        paneParticipantsView.classList.add('active-pane');
    }
}

tabBtnChat.addEventListener('click', () => openSidebarPane('chat'));
tabBtnParticipants.addEventListener('click', () => openSidebarPane('participants'));

// Messaging System Event Handling Hooks
chatInputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        transmitChatMessage();
    } else {
        socket.emit('typing', true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { socket.emit('typing', false); }, 2000);
    }
});

chatSendBtn.addEventListener('click', transmitChatMessage);

function transmitChatMessage() {
    const text = chatInputElement.value.trim();
    if(!text) return;
    socket.emit('send-chat-message', text);
    socket.emit('typing', false);
    chatInputElement.value = "";
}

socket.on('chat-message', ({ senderId, username, message, time }) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble-instance ${senderId === socket.id ? 'self-post' : ''}`;
    
    bubble.innerHTML = `
        <div class="bubble-meta">
            <span class="chat-username">${username}</span>
            <span class="chat-timestamp">${time}</span>
        </div>
        <div class="chat-body-text">${escapeHtmlDataEntities(message)}</div>
    `;
    
    chatScroller.appendChild(bubble);
    chatScroller.scrollTop = chatScroller.scrollHeight;

    // Handle background notification states increments
    if (sidebarPanel.classList.contains('hidden') || !paneChatView.classList.contains('active-pane')) {
        unreadMessagesCount++;
        chatCounter.textContent = unreadMessagesCount;
        chatCounter.classList.remove('hidden');
        showToastNotification(`New message from ${username}`);
    }
});

socket.on('user-typing', ({ userId, username, isTyping }) => {
    if (isTyping) {
        typingBroadcastIndicator.textContent = `${username} is typing...`;
        typingBroadcastIndicator.classList.remove('hidden');
    } else {
        typingBroadcastIndicator.classList.add('hidden');
    }
});

// Quick Emoji Box Popups
emojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPopupTray.classList.toggle('hidden');
});

document.addEventListener('click', () => { emojiPopupTray.classList.add('hidden'); });

emojiPopupTray.addEventListener('click', (e) => {
    if(e.target.classList.contains('emoji-item')) {
        chatInputElement.value += e.target.textContent;
        chatInputElement.focus();
    }
});

// Global Application Core Helpers
function escapeHtmlDataEntities(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function startSessionClock() {
    sessionStartTime = Date.now();
    clockIntervalId = setInterval(() => {
        const diff = Date.now() - sessionStartTime;
        const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        sessionClock.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

function showToastNotification(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = "toast-banner";
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => { toast.remove(); });
    }, 4000);
}

// Copy Action Handlers
copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(targetRoomId);
    showToastNotification("Room ID copied to system clipboard.");
});

copyInviteBtn.addEventListener('click', () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${targetRoomId}`;
    navigator.clipboard.writeText(url);
    showToastNotification("Invitation Link copied to system clipboard.");
});

// Clean Exit Operations Hook Processing
leaveBtn.addEventListener('click', () => { window.location.reload(); });
endBtn.addEventListener('click', () => { window.location.reload(); });