// Server.js - Simple Node.js server to bridge between MetaTrader and web interface
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const zmq = require('zeromq');
const cors = require('cors');

// Configuration
const PORT = process.env.PORT || 3000;
const MT4_HOST = '127.0.0.1';
const MT4_PORT = 5555;

// Create Express application
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Setup ZeroMQ for MT4 communication
let dealer;
try {
  dealer = zmq.socket('dealer');
  dealer.connect(`tcp://${MT4_HOST}:${MT4_PORT}`);
  console.log(`Connected to MT4 at ${MT4_HOST}:${MT4_PORT}`);
} catch (error) {
  console.error('Failed to connect to MetaTrader:', error);
}

// Store latest market data
let marketData = {
  symbol: 'EURUSD',
  bid: 0,
  ask: 0,
  time: new Date().toISOString(),
  balance: 10000,
  equity: 10000,
  margin: 0,
  zones: []
};

// Store active connections
const clients = new Set();

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send current market data to new client
  ws.send(JSON.stringify({
    type: 'market_data',
    data: marketData
  }));
  
  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      console.log('Received:', msg);
      
      // Handle different message types
      switch (msg.type) {
        case 'command':
          // Forward command to MT4
          sendToMT4(msg.command, msg.params);
          break;
          
        case 'get_history':
          // Return trading history
          sendTradeHistory(ws);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Function to send data to MT4
function sendToMT4(command, params) {
  if (!dealer) return;
  
  try {
    const message = JSON.stringify({
      command: command,
      params: params
    });
    
    dealer.send(message);
    console.log('Sent to MT4:', message);
  } catch (error) {
    console.error('Error sending to MT4:', error);
  }
}

// Function to send trade history to client
function sendTradeHistory(ws) {
  // This would typically come from a database or MT4
  // For demo purposes, we'll send mock data
  const history = [
    {
      ticket: 12345,
      symbol: 'EURUSD',
      type: 'BUY',
      openTime: '2025-04-16T10:30:00Z',
      closeTime: '2025-04-16T14:45:00Z',
      lots: 0.1,
      openPrice: 1.0765,
      closePrice: 1.0792,
      profit: 27.0,
      pips: 27
    },
    {
      ticket: 12346,
      symbol: 'EURUSD',
      type: 'SELL',
      openTime: '2025-04-15T15:20:00Z',
      closeTime: '2025-04-15T17:35:00Z',
      lots: 0.1,
      openPrice: 1.0805,
      closePrice: 1.0783,
      profit: 22.0,
      pips: 22
    }
  ];
  
  ws.send(JSON.stringify({
    type: 'history_data',
    data: history
  }));
}

// Handle incoming data from MT4
if (dealer) {
  dealer.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received from MT4:', data);
      
      // Update stored market data
      if (data.symbol) {
        marketData = data;
        
        // Broadcast to all connected clients
        broadcastMarketData();
      }
    } catch (error) {
      console.error('Error processing MT4 message:', error);
    }
  });
}

// Broadcast market data to all connected clients
function broadcastMarketData() {
  const message = JSON.stringify({
    type: 'market_data',
    data: marketData
  });
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Simulate MT4 data for testing (when MT4 is not connected)
function simulateMarketData() {
  setInterval(() => {
    if (marketData.bid === 0) {
      // Generate random price movements
      const basePrice = 1.0750;
      const movement = (Math.random() - 0.5) * 0.0020;
      const bid = basePrice + movement;
      const ask = bid + 0.0002;
      
      marketData = {
        symbol: 'EURUSD',
        bid: bid,
        ask: ask,
        time: new Date().toISOString(),
        balance: 10000 + (Math.random() - 0.3) * 500,
        equity: 10000 + (Math.random() - 0.3) * 500,
        margin: Math.random() * 200,
        positions: Math.floor(Math.random() * 2),
        zones: [
          {
            price: basePrice + 0.0050,
            isSupply: true,
            strength: 0.85,
            time: new Date().toISOString()
          },
          {
            price: basePrice - 0.0060,
            isSupply: false,
            strength: 0.78,
            time: new Date().toISOString()
          }
        ]
      };
      
      broadcastMarketData();
    }
  }, 2000);
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/market-data', (req, res) => {
  res.json(marketData);
});

app.post('/api/command', (req, res) => {
  const { command, params } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  sendToMT4(command, params);
  res.json({ success: true, message: 'Command sent' });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  simulateMarketData(); // Start simulation for testing
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server');
  
  if (dealer) {
    dealer.close();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
