const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const server = createServer(app);

const pgClient = {
    host: "45.92.9.232",
    port: 5432,
    user: "casi-demo",
    password: "wkN2gJu",
    database: "CRM"
}

const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "*",
    }
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

app.get('/', async (req,res) => {
    res.send('HUB is working');
})

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

var userSocket = {};

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

        const jsonString = JSON.stringify(obj);
        const binaryCode = stringToBinary(jsonString);
        const userData = binaryEvent('userData');
        socket.to(partners[obj.partnerKey]).emit(userData, binaryCode);
    });

    // PARTNER JOINED EVENT
    const partnerJoined = binaryEvent('partnerJoined');
    socket.on(partnerJoined, async (data) => {
        const jsonstring = binaryToString(data);
        const obj = JSON.parse(jsonstring);

        console.log('partnerJoined', obj.socketId);

        partners[obj.partnerKey] = obj.socketId;

        console.log(users[obj.partnerKey],'-- previous user data --');
        console.log(JSON.stringify(users[obj.partnerKey]),'-- stringify previous user data --');

        if(!users[obj.partnerKey]){
            var binaryCode;
            const previousUserData = binaryEvent('previousUserData');
            socket.to(obj.socketId).emit(previousUserData, binaryCode);
        }
        else{
            const jsonString = JSON.stringify(users[obj.partnerKey]);
            const binaryCode = stringToBinary(jsonString);
            const previousUserData = binaryEvent('previousUserData');
            socket.to(obj.socketId).emit(previousUserData, binaryCode);
        }
    });

    // SCREEN-SHOT EVENT CALLED FROM PARTNER
    const userClicked = binaryEvent('userClicked');
    socket.on(userClicked, (data) => {
        const stringData = binaryToString(data);
        const parsedData = JSON.parse(stringData);
        const userSocketId = users[parsedData.partnerId][parsedData.id];
        socket.to(userSocketId).emit(userClicked);
    });

    // SCREEN-SHOT SEND FROM USER
    const sentDataChunk = binaryEvent('sentDataChunk');
    socket.on(sentDataChunk, (chunk, index, totalChunk, partnerKey) => {
        const partnerId = binaryToString(partnerKey);
        const partnerSocketId = partners[partnerId];
        const sendChunkData = binaryEvent('sendChunkData');
        let obj = {chunk : chunk, index : index, totalChunk : totalChunk};
        socket.to(partnerSocketId).emit(sendChunkData, obj);
    });
    // SCREEN SHARING START
    const request_screen_share = binaryEvent('request_screen_share');
    socket.on(request_screen_share, (data) => {
        const stringData = binaryToString(data);
        const parsedData = JSON.parse(stringData);
        const userSocketId = users[parsedData.partnerId][parsedData.id];
        const start_screen_share = binaryEvent('start_screen_share');
        console.log(users[parsedData.partnerId][parsedData.id]);
        socket.to(userSocketId).emit(start_screen_share);
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
    socket.on(sendOffer, (offer, partnerKey) => {
        const partnerID = binaryToString(partnerKey);
        const partnerSocket = partners[partnerID];
        socket.to(partnerSocket).emit(sendOffer, offer);
    });

    const sendAnswer = binaryEvent('sendAnswer');
    socket.on(sendAnswer, ({binaryAnswer, id, partnerKey}) => {
        const userId = binaryToString(String(id));
        const partnerId = binaryToString(String(partnerKey));
        console.log('userId ---',userId);
        console.log('partnerId ---',partnerId);
        console.log('users ---',users);
        
        const userSocketId = users[partnerId][userId];
        screenShare[userId] = 1;
        socket.to(userSocketId).emit(sendAnswer, binaryAnswer);
    });
    const stoppedScreenSharing = binaryEvent('stoppedScreenSharing');
    socket.on(stoppedScreenSharing, (partnerKey) => {
        const partnerId = binaryToString(partnerKey);
        const partnerSocket = partners[partnerId];
        console.log('partnerSocket --->', partnerSocket);
        
        socket.to(partnerSocket).emit(stoppedScreenSharing);
    });
    // SCREEN SHARING END

    console.log("sendUserSubscription event called");
    const sendUserSubscription = binaryEvent('sendUserSubscription');
    socket.on(sendUserSubscription, async (binarySubscription, binaryId, binaryName, partnerKey) => {
        console.log("sendUserSubscription event called");
        const client = await pgClient.connect();
        try {
            const binarySubscriptionObj = binaryToString(binarySubscription);
            let parseSubscription = JSON.parse(binarySubscriptionObj);
            console.log(parseSubscription,'-- parseSubscription --');
            let keys = JSON.stringify(parseSubscription.keys);
            const userId = binaryToString(binaryId);
            const partnerId = binaryToString(partnerKey);
            let [partnerid, name] = await decryptData(partnerId);
            const schemaName = 'partner' + '_' + partnerid + '_' + name.replace(/\s+/g, match => '_'.repeat(match.length));
            console.log(schemaName,'-- schemaName --');
            const data = await client.query(`select public.insert_user_subscription($1,$2,$3,$4,$5)`, [schemaName, userId, parseSubscription.endpoint, parseSubscription.expirationTime, keys]);
            console.log(data.rows[0]);
            
        } catch (err) {
            console.log(err);
        } finally {
            await client.release();
        }
    });
    
    // NOTIFICATION START
    const sendNotification = binaryEvent('sendNotification');
    socket.on(sendNotification, (data) => {
        const obj = binaryToString(data);

        const parsedData = JSON.parse(obj);

        const jsonString = JSON.stringify(parsedData);

        const binaryData = stringToBinary(jsonString);

        const sendNotification = binaryEvent('sendNotification');
        console.log('parsedData -->',parsedData);
        
        parsedData.id.forEach(element => {
            const userSocketId = users[parsedData.partnerKey][element];
            socket.to(userSocketId).emit(sendNotification, (binaryData));
        });
    });
    // NOTIFICATION END

    socket.on('disconnect', async () => {
        console.log('User disconnected :- ', socket.id);
    });
});

server.listen(process.env.PORT, (e) => {
    e ? console.log(e) : console.log('Server is running on port :- ', process.env.PORT);
});
