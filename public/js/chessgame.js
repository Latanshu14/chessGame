const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

const playButton = document.querySelector("#play-button");
const inviteButton = document.querySelector("#invite-button");
const challengeButton = document.querySelector("#challenge-button");
const spectatorButton = document.querySelector("#spectator-button");
const challengePopup = document.querySelector("#challenge-popup");
const acceptButton = document.querySelector("#accept-challenge");
const rejectButton = document.querySelector("#reject-challenge");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let gameStarted = false;

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";
    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square",
                (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark");
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;

                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowIndex, col: squareIndex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });
                pieceElement.addEventListener("dragend", () => {
                    draggedPiece = null;
                    sourceSquare = null;
                });
                squareElement.appendChild(pieceElement);
            }
            squareElement.addEventListener("dragover", function (e) {
                e.preventDefault();
            });
            squareElement.addEventListener("drop", function (e) {
                e.preventDefault();
                if (draggedPiece) {
                    const targetSource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col)
                    };
                    handleMove(sourceSquare, targetSource);
                }
            });
            boardElement.appendChild(squareElement);
        });
    });
    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }
};

const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: "q",
    };
    socket.emit("move", move, gameId);
};

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        'p': '\u2659', 'r': '\u2656', 'n': '\u2658', 'b': '\u2657',
        'q': '\u2655', 'k': '\u2654', 'P': '\u265F', 'R': '\u265C',
        'N': '\u265E', 'B': '\u265D', 'Q': '\u265B', 'K': '\u265A'
    };
    return unicodePieces[piece.type] || "";
};

const updateUI = () => {
    hideAllButtons();
    if (playerRole === "w" && !gameStarted) {
        playButton.style.display = "block";
        inviteButton.style.display = "block";
    } else if (!gameStarted && !playerRole) {
        spectatorButton.style.display = "block";
        challengeButton.style.display = "block";
    }
};

const hideAllButtons = () => {
    playButton.style.display = "none";
    inviteButton.style.display = "none";
    challengeButton.style.display = "none";
    spectatorButton.style.display = "none";
    challengePopup.style.display = "none";
};

inviteButton.addEventListener("click", () => {
    const gameIdText = document.getElementById('gameIdText').textContent;
    console.log('Game ID to copy:', gameIdText);
    console.log(gameIdText);
    navigator.clipboard.writeText(gameIdText).then(() => {
        alert('Game ID copied to clipboard: ' + gameIdText);
    }).catch(err => {
        alert('Failed to copy Game ID');
    });
});

playButton.addEventListener("click", () => {
    socket.emit("startGame", gameId);
});

spectatorButton.addEventListener("click", () => {
    const playerName = document.getElementById('playerName').textContent;
    console.log(playerName);
    socket.emit("joinAsSpectator", gameId, playerName);
    playerRole = "spectator";
    updateUI();
});

challengeButton.addEventListener("click", () => {
    const playerName = document.getElementById('playerName').textContent;
    console.log(socket.id, " is challenging to white");
    socket.emit("challengeWhitePlayer", gameId, playerName);
});
acceptButton.addEventListener("click", () => {
    socket.emit("acceptChallenge", gameId, challengerId);
    hideChallengePopup();
});
rejectButton.addEventListener("click", () => {
    socket.emit("rejectChallenge", socket.id);
    hideChallengePopup();
});
const showChallengePopup = () => {
    challengePopup.style.display = "block";
};

const hideChallengePopup = () => {
    challengePopup.style.display = "none";
};

socket.on("playerRole", function (role) {
    playerRole = role;
    updateUI();
    renderBoard();
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    renderBoard();
});

socket.on("move", function (move) {
    chess.move(move);
    renderBoard();
});

socket.on("gameStarted", function () {
    gameStarted = true;
    hideAllButtons();
    renderBoard();
});

socket.on("challengeRequest", function (challengerId, challengerName) {
    console.log("challenge recieved from ", challengerId, " to ", socket.id);
    const accept = confirm("A player has challenged you. Do you accept?");
    if (accept) {
        socket.emit("acceptChallenge", gameId, challengerId, challengerName);
        console.log("Challenge accepted.");
    } else {
        socket.emit("rejectChallenge", challengerId);
        console.log("Challenge rejected.");
    }
});
socket.on("challengeRejected", function () {
    if (playerRole === "b") {
        renderBoard();
    }
});
socket.on("challengeAccepted", function () {
    if (playerRole === "b") {
        hideAllButtons();
        renderBoard();
    }
});
socket.on('playerNames', (whiteName, blackName) => {
    document.getElementById('whitePlayerName').textContent = whiteName ? whiteName : 'Waiting for player...';
    document.getElementById('blackPlayerName').textContent = blackName ? blackName : 'Waiting for player...';
});

socket.on('spectatorJoined', (spectatorNames) => {
    document.getElementById('spectatorsList').innerHTML = '';
    spectatorNames.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        document.getElementById('spectatorsList').appendChild(li);
    });
});
renderBoard();
