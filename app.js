const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socket(server);

let players = {};
let challengeLocks = {};
let challengeQueues = {};

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", { title: "Chess game" });
});
app.get("/create-game", (req, res) => {
    const gameId = uuidv4();
    const playerName = req.query.playerName;
    players[gameId] = { 
        moveHistory: [],
        white: { id: null, name: playerName }, 
        black: { id: null, name: null }, 
        chess: new Chess(), 
        spectators: [] 
    };
    res.redirect(`/game/${gameId}?playerName=${playerName}`);
});
app.get("/join-game", (req, res) => {
    const gameId = req.query.gameId;
    const playerName = req.query.playerName;
    if (!players[gameId]) {
        return res.send("Invalid Game ID. Please check and try again.");
    }
    res.redirect(`/game/${gameId}?playerName=${playerName}`);
});

app.get("/game/:gameId", (req, res) => {
    const gameId = req.params.gameId;
    const playerName = req.query.playerName;
    if (!players[gameId]) {
        return res.send("Invalid Game ID.");
    }
    res.render("game", { gameId: gameId , playerName: playerName});
});

const isPlayerAvailableForChallenge = (gameId) => {
    if (!challengeLocks[gameId]) {
        challengeLocks[gameId] = { isLocked: false };
    }
    return !challengeLocks[gameId].isLocked;
};
const setChallengeLock = (gameId) => {
    if (!challengeLocks[gameId]) {
        challengeLocks[gameId] = { isLocked: false };
    }

    return new Promise((resolve) => {
        const tryAcquire = () => {
            if (!challengeLocks[gameId].isLocked) {
                challengeLocks[gameId].isLocked = true;
                resolve();
            } else {
                setTimeout(tryAcquire, 100);
            }
        };
        tryAcquire();
    });
};
const releaseChallengeLock = (gameId, accepted = false) => {
    challengeLocks[gameId].isLocked = false;

    if (accepted) {
        rejectAllQueuedChallenges(gameId);
    } else {
        processQueuedChallenges(gameId);
    }
};
const queueChallenge = (gameId, challengerId, challengerName) => {
    if (!challengeQueues[gameId]) {
        challengeQueues[gameId] = [];
    }
    challengeQueues[gameId].push({ challengerId, challengerName });
};
const rejectAllQueuedChallenges = (gameId) => {
    if (challengeQueues[gameId]) {
        while (challengeQueues[gameId].length > 0) {
            const challenge = challengeQueues[gameId].shift();
            io.to(challenge.challengerId).emit("challengeRejected");
        }
    }
};
const processQueuedChallenges = (gameId) => {
    if (challengeQueues[gameId] && challengeQueues[gameId].length > 0) {
        const nextChallenge = challengeQueues[gameId].shift();
        io.to(players[gameId].white.id).emit("challengeRequest", nextChallenge.challengerId, nextChallenge.challengerName);
        setChallengeLock(gameId);
    }
};

io.on("connection", (uniqueSocket) => {
    
    uniqueSocket.on('joinGame', (gameId, playerName) => {
        uniqueSocket.join(gameId);
        console.log("user joined: ", uniqueSocket.id, playerName);
        if (!players[gameId]) {
            players[gameId] = { moveHistory: [], white: { id: null, name: playerName }, black: { id: null, name: null }, chess: new Chess(), spectators: [] };
        }
        const chess = players[gameId].chess;
        if (!players[gameId].white.id) {
            console.log("White joined: ", uniqueSocket.id, playerName);
            players[gameId].white.id = uniqueSocket.id;
            players[gameId].white.name = playerName;
            uniqueSocket.emit("playerRole", "w");
            io.to(gameId).emit("chatMessage", { playerName: playerName, message: `${playerName} has joined as white.` });
        } else if (!players[gameId].black.id) {
            uniqueSocket.emit("playerRole", null);
        } else {
            console.log("Spectator joined: ", uniqueSocket.id, playerName);
            players[gameId].spectators.push({ id: uniqueSocket.id, name: playerName });
            uniqueSocket.emit("playerRole", "spectator");
            uniqueSocket.emit("boardState", chess.fen());
            uniqueSocket.emit("gameStarted");
            io.to(gameId).emit("chatMessage", { playerName: playerName, message: `${playerName} has joined as a spectator.` });
        }
        io.in(gameId).emit("playerNames", players[gameId].white.name, players[gameId].black.name);
        uniqueSocket.emit('moveHistory', players[gameId].moveHistory);
    });

    uniqueSocket.on("chatMessage", (data) => {
        const { gameId, message, playerName } = data;
        io.in(gameId).emit("chatMessage", { playerName, message });
    });

    uniqueSocket.on("challengeWhitePlayer", async (gameId, challengerId, challengerName) => {
        if (isPlayerAvailableForChallenge(gameId)) {
            console.log(`Challenge received from ${challengerName}`);
            io.to(players[gameId].white.id).emit("challengeRequest", challengerId, challengerName);
            setChallengeLock(gameId);
        } else {
            console.log(`Challenge queued from ${challengerName}`);
            queueChallenge(gameId, challengerId, challengerName); 
        }
    });
    uniqueSocket.on("acceptChallenge", (gameId, challengerId, challengerName) => {
        if (players[gameId].white.id && players[gameId].black.id === null) {
            console.log(`Black joined: ${challengerId}`);
            players[gameId].black = { id: challengerId, name: challengerName };
            io.to(challengerId).emit("playerRole", "b");
            io.to(challengerId).emit("challengeAccepted");
            io.in(gameId).emit("playerNames", players[gameId].white.name, players[gameId].black.name);
            io.to(gameId).emit("chatMessage", { playerName: challengerName, message: `${challengerName} has joined as black.` });
        }

        releaseChallengeLock(gameId, true);
    });

    uniqueSocket.on("rejectChallenge", (gameId, challengerId) => {
        io.to(challengerId).emit("challengeRejected");
        releaseChallengeLock(gameId, false);  
    });

    uniqueSocket.on("joinAsSpectator", (gameId, playerName) => {
        const chess = players[gameId].chess;
        console.log("Spectator joined: ", uniqueSocket.id, playerName);
        players[gameId].spectators.push({ id: uniqueSocket.id, name: playerName });
        uniqueSocket.emit("playerRole", "spectator");
        uniqueSocket.emit("boardState", chess.fen());
        uniqueSocket.emit('moveHistory', players[gameId].moveHistory);
        io.to(gameId).emit("chatMessage", { playerName: playerName, message: `${playerName} has joined as a spectator.` });
    });

    uniqueSocket.on("startGame", (gameId) => {
        if (players[gameId].white.id && players[gameId].black.id) {
            io.in(gameId).emit("gameStarted");
        } else {
            uniqueSocket.emit("noBlackPlayer");
        }
    });

    uniqueSocket.on("move", (move, gameId) => {
        try {
            const chess = players[gameId].chess;
            if (chess.turn() === "w" && uniqueSocket.id !== players[gameId].white.id) return;
            if (chess.turn() === "b" && uniqueSocket.id !== players[gameId].black.id) return;

            const result = chess.move(move);
            if (result) {
                players[gameId].moveHistory.push(move);
                io.in(gameId).emit("move", move);
                io.in(gameId).emit("boardState", chess.fen());
                
            } else {
                uniqueSocket.emit("invalidMove", move); 
            }
        } catch (error) {
            console.log("Error processing move:", error);
        }
    });

    uniqueSocket.on("disconnect", (gameId) => {
        if (uniqueSocket.id === players[gameId]?.white) {
            players[gameId].white = null;
        }
        if (uniqueSocket.id === players[gameId]?.black) {
            players[gameId].black = null;
        }
    });
});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
