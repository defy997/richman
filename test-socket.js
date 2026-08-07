const { io } = require('socket.io-client');

const socket = io('http://127.0.0.1:3002', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('connect', socket.id);
  socket.emit('createSingleplayer', { playerName: 'test', aiCount: 0, difficulty: 'easy' });
});

socket.on('roomCreated', (data) => {
  console.log('roomCreated', data);
  setTimeout(() => {
    socket.emit('rollDice');
  }, 500);
});

socket.on('gameState', (state) => {
  if (state.currentPlayerIndex === 0 && state.players[0]?.cash !== 50000) {
    console.log('My player cash:', state.players[0]?.cash, 'deposit:', state.players[0]?.deposit);
  }
  if (state.stocks.length > 0 && state.currentPlayerIndex === 0) {
    console.log('Try buy');
    socket.emit('tradeStock', { symbol: state.stocks[0].symbol, action: 'buy', quantity: 1, leverage: 1 });
  }
});

socket.on('error', (e) => {
  console.error('error', e.message);
});

socket.on('message', (m) => {
  console.log('msg:', m.type, m.content);
});

setTimeout(() => {
  console.log('timeout');
  process.exit(0);
}, 8000);
