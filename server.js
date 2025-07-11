const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve HTML, CSS, JS
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Anonymous Voice Chat</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { font-size: 36px; }
            button { font-size: 20px; padding: 10px 20px; margin: 20px; background-color: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background-color: #218838; }
            .status { font-size: 18px; margin-top: 30px; }
            #audioElement { margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>Anonymous Voice Chat</h1>
        <p>Click below to start your anonymous voice chat!</p>
        <button id="startButton">Start Voice Chat</button>
        <p class="status" id="status">Waiting for your match...</p>
        <audio id="audioElement" controls autoplay></audio>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            const statusElement = document.getElementById('status');
            const startButton = document.getElementById('startButton');
            const audioElement = document.getElementById('audioElement');

            let localStream;
            let peerConnection;
            const serverConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' } 
                ]
            };

            startButton.onclick = function () {
                statusElement.textContent = "Connecting to an anonymous chat...";
                socket.emit('start'); 
            };

            socket.on('matched', function (data) {
                const peerId = data.peerId;
                statusElement.textContent = "You're matched! Establishing voice connection...";
                startCall(peerId);
            });

            async function startCall(peerId) {
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    peerConnection = new RTCPeerConnection(serverConfig);

                    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

                    peerConnection.onicecandidate = function(event) {
                        if (event.candidate) {
                            socket.emit('candidate', { peerId, candidate: event.candidate });
                        }
                    };

                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    socket.emit('offer', { peerId, offer });

                    statusElement.textContent = "Waiting for peer to respond...";
                } catch (error) {
                    console.error('Error starting call:', error);
                }
            }

            socket.on('offer', async function (data) {
                const peerId = data.peerId;
                const offer = data.offer;
                await handleOffer(peerId, offer);
            });

            async function handleOffer(peerId, offer) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.emit('answer', { peerId, answer });

                    statusElement.textContent = "Call in progress...";
                } catch (error) {
                    console.error('Error handling offer:', error);
                }
            }

            socket.on('answer', function (data) {
                const peerId = data.peerId;
                const answer = data.answer;
                peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            });

            socket.on('candidate', function (data) {
                const candidate = data.candidate;
                peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
        </script>
    </body>
    </html>
    `);
});

let waitingUser = null;

io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    socket.on('start', () => {
        if (waitingUser === null) {
            waitingUser = socket.id;
            socket.emit('status', 'You are now waiting for a match...');
        } else {
            const matchedUser = waitingUser;
            waitingUser = null;
            io.to(matchedUser).emit('matched', { peerId: socket.id });
            socket.emit('matched', { peerId: matchedUser });
        }
    });

    socket.on('offer', (data) => {
        const { peerId, offer } = data;
        io.to(peerId).emit('offer', { offer, peerId: socket.id });
    });

    socket.on('answer', (data) => {
        const { peerId, answer } = data;
        io.to(peerId).emit('answer', { answer, peerId: socket.id });
    });

    socket.on('candidate', (data) => {
        const { peerId, candidate } = data;
        io.to(peerId).emit('candidate', { candidate, peerId: socket.id });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected: ' + socket.id);
        waitingUser = waitingUser === socket.id ? null : waitingUser;
    });
});

// Server listen on port 3000
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
