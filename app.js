const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const server = createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "*",
    }
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

function binaryToString(binaryStr) {
    return binaryStr.split(' ').map(bin => {
        const asciiValue = parseInt(bin, 2);

        return String.fromCharCode(asciiValue);
    }).join('');
};

function stringToBinary(str) {
    return str.split('')
        .map(char => {
            const binary = char.charCodeAt(0).toString(2);
            return binary.padStart(8, '0');
        })
        .join(' ');
};

const binaryEvent = (event) => {
    return event.split('').map(char => {
        const asciiValue = char.charCodeAt(0);
        const binaryValue = asciiValue.toString(2);
        return binaryValue.padStart(8, '0');
    }).join(' ');
};

var userSocket = {};

var partners = {};

var users = {};

var screenShare = {};

io.on('connection', (socket) => {
    // USER JOINED EVENT
    const userJoined = binaryEvent('userJoined');
    socket.on(userJoined, async (data) => {
        const jsonstring = binaryToString(data);
        const obj = JSON.parse(jsonstring);

        console.log('userJoined', obj.socketId);

        if (!users[obj.partnerKey]) {
            users[obj.partnerKey] = {};
        }

        users[obj.partnerKey][obj.userId] = obj.socketId;

        let allUser = [];
        if (users?.[obj.partnerKey]) {
            allUser = [...allUser, ...Object.keys(users[obj.partnerKey])].toString()
        }
        else {
            allUser = allUser.toString();
        }

        io.to(partners[obj.partnerKey]).emit('userData', stringToBinary(allUser));
    });

    // PARTNER JOINED EVENT
    const partnerJoined = binaryEvent('partnerJoined');
    socket.on(partnerJoined, async (data) => {
        const jsonstring = binaryToString(data);
        const obj = JSON.parse(jsonstring);

        console.log('partnerJoined', obj.socketId);

        partners[obj.partnerKey] = obj.socketId;

        let allUser = [];
        if (users?.[obj.partnerKey]) {
            allUser = [...allUser, ...Object.keys(users[obj.partnerKey])].toString()
        }
        else {
            allUser = allUser.toString();
        }

        // socket.to(obj.socketId).emit('previousUserData', stringToBinary(allUser.toString()));

        console.log(obj.socketId, '-- sokcet id --');

        if (!io.sockets.sockets.get(obj.socketId)) {
            console.error(`Socket ID ${obj.socketId} is not connected`);
            return;
        }

        io.to(obj.socketId).emit('userData', stringToBinary(allUser));
        // socket.emit('userData', stringToBinary(allUser));

    });

    const getUsersByPartner = (partnerKey) => {
        let partnerWiseUser = [];
    }

    // SCREEN-SHOT EVENT CALLED FROM PARTNER
    const userClicked = binaryEvent('userClicked');
    socket.on(userClicked, (data) => {
        const stringData = binaryToString(data);
        const parsedData = JSON.parse(stringData);
        const userSocketId = users[parsedData.partnerKey][parsedData.id];
        socket.to(userSocketId).emit(userClicked);
    });

    // SCREEN-SHOT SEND FROM USER
    const sentDataChunk = binaryEvent('sentDataChunk');
    socket.on(sentDataChunk, (chunk, index, totalChunk, partnerKey) => {
        const partnerkey = binaryToString(partnerKey);
        const partnerSocketId = partners[partnerkey];
        const sendChunkData = binaryEvent('sendChunkData');
        let obj = { chunk: chunk, index: index, totalChunk: totalChunk };
        socket.to(partnerSocketId).emit(sendChunkData, obj);
    });

    // SCREEN SHARING START
    const request_screen_share = binaryEvent('request_screen_share');
    socket.on(request_screen_share, (data) => {
        const stringData = binaryToString(data);
        const parsedData = JSON.parse(stringData);
        console.log(parsedData, '-- parsedData --');
        console.log(users, '-- users --');
        const userSocketId = users[parsedData.partnerKey][parsedData.id];
        const start_screen_share = binaryEvent('start_screen_share');
        console.log(users[parsedData.partnerKey][parsedData.id]);
        socket.to(userSocketId).emit(start_screen_share, stringToBinary(parsedData.peerId));
    });

    const ice_candidate = binaryEvent('ice_candidate');
    socket.on(ice_candidate, (data) => {
        const jsonString = binaryToString(data);
        const obj = JSON.parse(jsonString);
        if (obj.id) {
            const candidateString = obj.candidate;
            const binaryCandidate = stringToBinary(JSON.stringify(candidateString));
            const userSocket = users[obj.partnerKey][obj.id];
            const ice_candidate = binaryEvent('ice_candidate');
            socket.to(userSocket).emit(ice_candidate, binaryCandidate);
        }
        else {
            const partnersocket = partners[obj.partneKey];
            const ice_candidate = binaryEvent('ice_candidate');
            io.to(partnersocket).emit(ice_candidate, data);
        }
    });

    const sendOffer = binaryEvent('sendOffer');
    socket.on(sendOffer, (offer, partnerKeyBinary) => {
        const partnerKey = binaryToString(partnerKeyBinary);
        const partnerSocket = partners[partnerKey];
        socket.to(partnerSocket).emit(sendOffer, offer);
    });

    const sendAnswer = binaryEvent('sendAnswer');
    socket.on(sendAnswer, ({ binaryAnswer, id, partnerKey }) => {
        const userId = binaryToString(String(id));
        const partnerkey = binaryToString(String(partnerKey));

        const userSocketId = users[partnerkey][userId];
        screenShare[userId] = 1;
        socket.to(userSocketId).emit(sendAnswer, binaryAnswer);
    });

    const stoppedScreenSharing = binaryEvent('stoppedScreenSharing');
    socket.on(stoppedScreenSharing, (partnerKey) => {
        const Partner = binaryToString(partnerKey);
        const partnerSocket = partners[Partner];

        socket.to(partnerSocket).emit(stoppedScreenSharing);
    });
    // SCREEN SHARING END

    // NOTIFICATION START
    const sendNotification = binaryEvent('sendNotification');
    socket.on(sendNotification, (data) => {
        const obj = binaryToString(data);

        const parsedData = JSON.parse(obj);

        const jsonString = JSON.stringify(parsedData);

        const binaryData = stringToBinary(jsonString);

        const sendNotification = binaryEvent('sendNotification');
        console.log('parsedData -->', parsedData);

        parsedData.id.forEach(element => {
            const userSocketId = users[parsedData.partnerKey][parsedData.id];
            socket.to(userSocketId).emit(sendNotification, (binaryData));
        });
    });
    // NOTIFICATION END

    function deleteSocketId(socketId, ...dataObjects) {
        let deleted = false;

        for (const data of dataObjects) {
            for (const key in data) {
                if (typeof data[key] === "string") {
                    // Case 1: Direct mapping (Object 1)
                    if (data[key] === socketId) {
                        delete data[key];
                        console.log(`Deleted direct socket ID: ${socketId}`);
                        deleted = true;
                    }
                } else if (typeof data[key] === "object") {
                    // Case 2: Nested mapping (Object 2)
                    for (const userId in data[key]) {
                        if (data[key][userId] === socketId) {
                            delete data[key][userId];
                            console.log(`Deleted userId ${userId} with socket ID ${socketId}`);
                            deleted = true;
                        }
                    }

                    // If the nested object is now empty, delete the outer key
                    if (Object.keys(data[key]).length === 0) {
                        delete data[key];
                        console.log(`Deleted empty object for key: ${key}`);
                    }
                }
            }
        }

        return deleted;
    }

    socket.on('disconnect', async () => {
        console.log('User disconnected :- ', socket.id);
    });
});

server.listen(process.env.PORT, (e) => {
    e ? console.log(e) : console.log('Server is running on port :- ', process.env.PORT);
});
