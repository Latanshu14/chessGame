const express  = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { title } = require("process");
const app = express();
const server = http.createServer(app);
const io = socket(server);
const { v4: uuidv4 } = require('uuid');

const chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", {title: "Chess game"});
})

app.get("/create-game", (req, res) => {
    const gameId = uuidv4();
    players[gameId] = { white: null, black: null, chess: new Chess(), spectators: [] };
    res.redirect(`/game/${gameId}`);
});

app.get("/join-game", (req, res) => {
    const gameId = req.query.gameId;
    if (!players[gameId]) {
        return res.send("Invalid Game ID. Please check and try again.");
    }
    res.redirect(`/game/${gameId}`);
});

app.get("/game/:gameId", (req, res) => {
    const gameId = req.params.gameId;
    if (!players[gameId]) {
        return res.send("Invalid Game ID.");
    }

    res.render("game", { gameId: gameId });
});

io.on("connection", function (uniqueSocket) {
    console.log("connected");

    uniqueSocket.on('joinGame', function (gameId) {
        uniqueSocket.join(gameId);
        if (!players[gameId]) {
            players[gameId] = {
                white: null,
                black: null,
                chess: new Chess(),
                spectators: []
            };
        }
        const chess = players[gameId].chess;
        if (!players[gameId].white) {
            console.log("white joined");
            players[gameId].white = uniqueSocket.id;
            console.log(players[gameId].white);
            uniqueSocket.emit("playerRole", "w");
        } else if (!players[gameId].black) {
            console.log("black joined");
            players[gameId].black = uniqueSocket.id;
            uniqueSocket.emit("playerRole", "b");
        } else {
            players[gameId].spectators.push(uniqueSocket.id);
            uniqueSocket.emit("spectatorRole");
            uniqueSocket.emit("boardState", chess.fen());
        }
    });

    uniqueSocket.on("disconnect", function () {
        if (uniqueSocket.id === players[gameId].white) {
            delete players[gameId].white;
        }
        else if (uniqueSocket.id === players[gameId].black) {
            delete players[gameId].black;
        }
    });

    uniqueSocket.on("move", (move, gameId) => {
        try {
            if (!players[gameId]) {
                console.log("No game found for this gameId:", gameId);
                return;
            }
            const chess = players[gameId].chess;
            if (!chess) {
                console.log("No chess instance found for this gameId:", gameId);
                return;
            }
            if (chess.turn() === "w" && uniqueSocket.id !== players[gameId].white) return;
            if (chess.turn() === "b" && uniqueSocket.id !== players[gameId].black) return;
            const result = chess.move(move);
            console.log("Move result:", result);
            if (result) {
                io.in(gameId).emit("move", move);  
                io.in(gameId).emit("boardState", chess.fen());
            } else {
                uniqueSocket.emit("invalidMove", move);
            }
        } catch (error) {
            console.log(error);
            uniqueSocket.emit("Invalid Move: ", move);
        }
    });
});

server.listen(3000, function () {
    console.log("listening on port 3000")
});