const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static assets from the public directory
app.use(express.static('public'));

// In-memory state management for rooms and active connections
const rooms = new Map();

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUser = null;

    // Handle user joining a room
    socket.on('join-room', ({ roomId, username }) => {
        currentRoom = roomId;
        currentUser = {
            id: socket.id,
            username: username,
            joinTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isHost: false,
            handRaised: false,
            micMuted: false,
            cameraDisabled: false
        };

        socket.join(roomId);

        // Initialize room structure if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map());
            currentUser.isHost = true; // First person to join becomes the host
        }

        const roomUsers = rooms.get(roomId);
        roomUsers.set(socket.id, currentUser);

        // Broadcast to existing users in the room to initiate WebRTC connection
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            username: currentUser.username,
            isHost: currentUser.isHost,
            joinTime: currentUser.joinTime
        });

        // Send the current list of participants back to the newly joined user
        const participants = Array.from(roomUsers.values());
        socket.emit('room-participants', participants);

        // Broadcast updated client count and state to the room
        io.to(roomId).emit('room-info', {
            userCount: roomUsers.size,
            participants: participants
        });
    });

    // WebRTC Signaling: Forward SDP Offers/Answers
    socket.on('signal', ({ targetId, signalData }) => {
        io.to(targetId).emit('signal', {
            senderId: socket.id,
            signalData: signalData
        });
    });

    // WebRTC Signaling: Forward ICE Candidates
    socket.on('ice-candidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('ice-candidate', {
            senderId: socket.id,
            candidate: candidate
        });
    });

    // Text Chat Processing
    socket.on('send-chat-message', (messageText) => {
        if (!currentRoom || !currentUser) return;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        io.to(currentRoom).emit('chat-message', {
            senderId: socket.id,
            username: currentUser.username,
            message: messageText,
            time: timestamp
        });
    });

    // Typing Indicators
    socket.on('typing', (isTyping) => {
        if (!currentRoom || !currentUser) return;
        socket.to(currentRoom).emit('user-typing', {
            userId: socket.id,
            username: currentUser.username,
            isTyping: isTyping
        });
    });

    // Hand Raising State Updates
    socket.on('toggle-hand', (raisedState) => {
        if (!currentRoom || !rooms.has(currentRoom)) return;
        const user = rooms.get(currentRoom).get(socket.id);
        if (user) {
            user.handRaised = raisedState;
            io.to(currentRoom).emit('hand-state-changed', {
                userId: socket.id,
                username: user.username,
                handRaised: raisedState
            });
            io.to(currentRoom).emit('room-info', {
                userCount: rooms.get(currentRoom).size,
                participants: Array.from(rooms.get(currentRoom).values())
            });
        }
    });

    // Media Device State Changes (Mute/Unmute)
    socket.on('media-state-change', ({ type, enabled }) => {
        if (!currentRoom || !rooms.has(currentRoom)) return;
        const user = rooms.get(currentRoom).get(socket.id);
        if (user) {
            if (type === 'audio') user.micMuted = !enabled;
            if (type === 'video') user.cameraDisabled = !enabled;

            socket.to(currentRoom).emit('peer-media-state', {
                userId: socket.id,
                type: type,
                enabled: enabled
            });
        }
    });

    // Host Action: Mute a specific participant or Mute All
    socket.on('host-mute-all', () => {
        if (!currentRoom || !rooms.has(currentRoom)) return;
        const user = rooms.get(currentRoom).get(socket.id);
        if (user && user.isHost) {
            socket.to(currentRoom).emit('force-mute-audio');
        }
    });

    // Host Action: Turn off cameras for all participants
    socket.on('host-disable-all-video', () => {
        if (!currentRoom || !rooms.has(currentRoom)) return;
        const user = rooms.get(currentRoom).get(socket.id);
        if (user && user.isHost) {
            socket.to(currentRoom).emit('force-disable-video');
        }
    });

    // Screen Share Notifications
    socket.on('screen-sharing-status', (isSharing) => {
        if (!currentRoom || !currentUser) return;
        socket.to(currentRoom).emit('peer-screen-sharing', {
            userId: socket.id,
            username: currentUser.username,
            isSharing: isSharing
        });
    });

    // Explicit room departure handling
    socket.on('leave-meeting', () => {
        socket.disconnect();
    });

    // Disconnect event handler handles cleanup
    socket.on('disconnect', () => {
        if (currentRoom && rooms.has(currentRoom)) {
            const roomUsers = rooms.get(currentRoom);
            const userLeaving = roomUsers.get(socket.id);
            
            if (userLeaving) {
                const leaveTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                socket.to(currentRoom).emit('user-disconnected-notify', {
                    userId: socket.id,
                    username: userLeaving.username,
                    leaveTime: leaveTime
                });
                
                roomUsers.delete(socket.id);
                
                if (roomUsers.size === 0) {
                    rooms.delete(currentRoom);
                } else {
                    // Reassign host role if the host left the meeting room
                    if (userLeaving.isHost) {
                        const firstRemainingId = roomUsers.keys().next().value;
                        const newHost = roomUsers.get(firstRemainingId);
                        newHost.isHost = true;
                        io.to(currentRoom).emit('host-changed', {
                            newHostId: firstRemainingId,
                            username: newHost.username
                        });
                    }
                    
                    io.to(currentRoom).emit('room-info', {
                        userCount: roomUsers.size,
                        participants: Array.from(roomUsers.values())
                    });
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  Zoom Elite Engine Online: http://localhost:${PORT} `);
    console.log(`==================================================`);
});