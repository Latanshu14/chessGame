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
            io.to(gameId).emit('playerJoined', `${playerName} has joined as white!`);
        } else if (!players[gameId].black.id) {
            uniqueSocket.emit("playerRole", null);
        } else {
            console.log("Spectator joined: ", uniqueSocket.id, playerName);
            players[gameId].spectators.push({ id: uniqueSocket.id, name: playerName });
            uniqueSocket.emit("playerRole", "spectator");
            uniqueSocket.emit("boardState", chess.fen());
            uniqueSocket.emit("gameStarted");
            io.to(gameId).emit('spectatorJoined', `${playerName} has joined as a spectator`);
        }
        io.in(gameId).emit("playerNames", players[gameId].white.name, players[gameId].black.name);
        uniqueSocket.emit('moveHistory', players[gameId].moveHistory);
    });

    uniqueSocket.on("challengeWhitePlayer", (gameId, playerName) => {
        if (players[gameId].white.id) {
            console.log("challenge recievec from ", uniqueSocket.id);
            io.to(players[gameId].white.id).emit("challengeRequest", uniqueSocket.id, playerName);
        }
    });

    uniqueSocket.on("acceptChallenge", (gameId, challengerId, challengerName) => {
        if (players[gameId].white.id && players[gameId].black.id === null) {
            console.log("Black joined: ", challengerId, challengerName);
            players[gameId].black.id = challengerId;
            players[gameId].black.name = challengerName;
            io.to(challengerId).emit("playerRole", "b");
            io.to(challengerId).emit("challengeAccepted");
            io.in(gameId).emit("playerNames", players[gameId].white.name, players[gameId].black.name);
            io.to(gameId).emit('playerJoined', `${challengerName} has joined as black!`);
        }
    });

    uniqueSocket.on("rejectChallenge", (challengerId) => {
        io.to(challengerId).emit("challengeRejected");
    });

    uniqueSocket.on("joinAsSpectator", (gameId, playerName) => {
        const chess = players[gameId].chess;
        console.log("Spectator joined: ", uniqueSocket.id, playerName);
        players[gameId].spectators.push({ id: uniqueSocket.id, name: playerName });
        uniqueSocket.emit("playerRole", "spectator");
        uniqueSocket.emit("boardState", chess.fen());
        uniqueSocket.emit('moveHistory', players[gameId].moveHistory);
        io.to(gameId).emit('spectatorJoined', `${playerName} has joined as a spectator`);
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
