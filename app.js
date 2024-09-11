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

// Home route
app.get("/", (req, res) => {
    res.render("index", { title: "Chess game" });
});

// Route to create a game
app.get("/create-game", (req, res) => {
    const gameId = uuidv4();
    players[gameId] = { white: null, black: null, chess: new Chess(), spectators: [] };
    res.redirect(`/game/${gameId}`);
});

// Route to join a game using gameId
app.get("/join-game", (req, res) => {
    const gameId = req.query.gameId;
    if (!players[gameId]) {
        return res.send("Invalid Game ID. Please check and try again.");
    }
    res.redirect(`/game/${gameId}`);
});

// Render the game page for the gameId
app.get("/game/:gameId", (req, res) => {
    const gameId = req.params.gameId;
    if (!players[gameId]) {
        return res.send("Invalid Game ID.");
    }
    res.render("game", { gameId: gameId });
});

io.on("connection", (uniqueSocket) => {
    console.log("user joined: ", uniqueSocket.id);
    uniqueSocket.on('joinGame', (gameId) => {
        uniqueSocket.join(gameId);

        if (!players[gameId]) {
            players[gameId] = { white: null, black: null, chess: new Chess(), spectators: [] };
        }
        const chess = players[gameId].chess;
        if (!players[gameId].white) {
            console.log("White joined: ", uniqueSocket.id);
            players[gameId].white = uniqueSocket.id;
            uniqueSocket.emit("playerRole", "w");
        } else if (!players[gameId].black) {
            uniqueSocket.emit("playerRole", null); // Waiting for role assignment (challenge or spectator)
        } else {
            console.log("spec joined:", uniqueSocket.id);
            players[gameId].spectators.push(uniqueSocket.id);
            uniqueSocket.emit("playerRole", "spectator");
            uniqueSocket.emit("boardState", chess.fen());
        }
    });

    uniqueSocket.on("challengeWhitePlayer", (gameId) => {
        if (players[gameId].white) {
            console.log("challenge recievec from ", uniqueSocket.id);
            io.to(players[gameId].white).emit("challengeRequest", uniqueSocket.id);
        }
    });

    uniqueSocket.on("acceptChallenge", (gameId, challengerId) => {
        if (players[gameId].white && players[gameId].black === null) {
            console.log("black joined: ", challengerId);
            players[gameId].black = challengerId;
            io.to(challengerId).emit("playerRole", "b");
        }
    });

    uniqueSocket.on("rejectChallenge", (challengerId) => {
        io.to(challengerId).emit("challengeRejected");
    });

    uniqueSocket.on("joinAsSpectator", (gameId) => {
        players[gameId].spectators.push(uniqueSocket.id);
        uniqueSocket.emit("playerRole", "spectator");
    });

    uniqueSocket.on("startGame", (gameId) => {
        if (players[gameId].white && players[gameId].black) {
            io.in(gameId).emit("gameStarted");
        }
    });

    uniqueSocket.on("move", (move, gameId) => {
        try {
            const chess = players[gameId].chess;
            if (chess.turn() === "w" && uniqueSocket.id !== players[gameId].white) return;
            if (chess.turn() === "b" && uniqueSocket.id !== players[gameId].black) return;

            const result = chess.move(move);
            if (result) {
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
