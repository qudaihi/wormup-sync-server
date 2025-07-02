/**
 * Wormup Sync Server - بدون مكتبة CORS
 * إعداد CORS يدوي مدمج
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);

// إعداد CORS يدوياً بدون مكتبة خارجية
const allowedOrigins = [
    'https://wormate.io',
    'https://www.wormate.io',
    'http://wormate.io',
    'http://www.wormate.io',
    'https://wormup.in',
    'http://wormup.in',
    'http://localhost:3000',
    'https://localhost:3000'
];

// إعداد Socket.IO مع CORS يدوي
const io = new Server(server, {
    cors: {
        origin: function(origin, callback) {
            // السماح لجميع الطلبات إذا لم يكن هناك origin (مثل mobile apps)
            if (!origin) return callback(null, true);
            
            // فحص إذا كان المصدر مسموحاً
            if (allowedOrigins.includes(origin) || origin.includes('wormate') || origin.includes('wormup')) {
                return callback(null, true);
            }
            
            // السماح لجميع localhost
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                return callback(null, true);
            }
            
            // إذا لم يكن مسموحاً، ارفض
            return callback(new Error('Not allowed by CORS'), false);
        },
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// إعداد Express middleware يدوياً
app.use(express.json());

// إعداد CORS headers يدوياً لجميع طلبات HTTP
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    // فحص المصدر وإعداد headers
    if (!origin) {
        // لا يوجد origin - طلب مباشر
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.includes(origin)) {
        // مصدر مسموح
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin.includes('wormate') || origin.includes('wormup')) {
        // مصدر يحتوي على wormate أو wormup
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        // localhost للتطوير
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // مصدر غير مسموح - لكن لا نرفض لتجنب الأخطاء
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    // إعداد باقي CORS headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 ساعة
    
    // استجابة فورية لطلبات OPTIONS
    if (req.method === 'OPTIONS') {
        res.status(204).send();
        return;
    }
    
    next();
});

// فئة إدارة المزامنة
class WormupSyncManager {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            skinUpdates: 0,
            hatUpdates: 0,
            roomsCreated: 0,
            corsRequests: 0,
            startTime: Date.now()
        };
        
        setInterval(() => this.cleanup(), 300000);
        setInterval(() => this.printStats(), 600000);
        
        console.log('🚀 Wormup Sync Manager initialized with manual CORS');
    }
    
    addPlayer(socket, data) {
        const { wuid, roomId, playerInfo } = data;
        
        if (!wuid || !roomId) {
            socket.emit('error', { 
                code: 'INVALID_DATA', 
                message: 'Missing wuid or roomId',
                timestamp: Date.now() 
            });
            return;
        }
        
        // إزالة اللاعب القديم إذا وجد
        if (this.players.has(wuid)) {
            const existingPlayer = this.players.get(wuid);
            if (existingPlayer.socket.connected) {
                existingPlayer.socket.disconnect();
                console.log(`🔄 Replaced existing connection for ${wuid}`);
            }
        }
        
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, { 
                players: new Set(), 
                createdAt: Date.now(),
                lastActivity: Date.now()
            });
            this.stats.roomsCreated++;
            console.log(`🏠 Created room: ${roomId}`);
        }
        
        const room = this.rooms.get(roomId);
        room.players.add(wuid);
        room.lastActivity = Date.now();
        
        this.players.set(wuid, {
            socket: socket,
            roomId: roomId,
            playerInfo: playerInfo || {},
            joinTime: Date.now(),
            lastActivity: Date.now()
        });
        
        socket.wuid = wuid;
        socket.roomId = roomId;
        socket.join(roomId);
        
        this.stats.activeConnections++;
        
        console.log(`👤 Player ${wuid} (${playerInfo?.name || 'Unknown'}) joined room ${roomId}`);
        
        // إخبار باقي اللاعبين
        socket.to(roomId).emit('player_join', {
            wuid: wuid,
            playerInfo: playerInfo,
            timestamp: Date.now()
        });
        
        // تأكيد الانضمام
        socket.emit('join_success', {
            roomId: roomId,
            playersInRoom: room.players.size,
            serverTime: Date.now(),
            message: 'Successfully joined room with manual CORS'
        });
    }
    
    handleSkinUpdate(socket, data) {
        const { wuid, roomId, skinId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        this.stats.skinUpdates++;
        
        console.log(`🎨 Skin update: ${wuid} -> ${skinId} in room ${roomId}`);
        
        // إرسال للآخرين
        socket.to(roomId).emit('skin_update', {
            wuid: wuid,
            skinId: skinId,
            timestamp: Date.now()
        });
        
        // تأكيد للمرسل
        socket.emit('update_confirmed', {
            type: 'skin',
            skinId: skinId,
            timestamp: Date.now()
        });
    }
    
    handleHatUpdate(socket, data) {
        const { wuid, roomId, hatId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        this.stats.hatUpdates++;
        
        console.log(`🎩 Hat update: ${wuid} -> ${hatId} in room ${roomId}`);
        
        // إرسال للآخرين
        socket.to(roomId).emit('hat_update', {
            wuid: wuid,
            hatId: hatId,
            timestamp: Date.now()
        });
        
        // تأكيد للمرسل
        socket.emit('update_confirmed', {
            type: 'hat',
            hatId: hatId,
            timestamp: Date.now()
        });
    }
    
    handleHeartbeat(socket, data) {
        const { wuid } = data;
        
        if (wuid && this.players.has(wuid)) {
            this.updatePlayerActivity(wuid);
            socket.emit('pong', { 
                timestamp: Date.now(),
                status: 'alive'
            });
        }
    }
    
    removePlayer(socket) {
        if (!socket.wuid) return;
        
        const wuid = socket.wuid;
        const roomId = socket.roomId;
        
        this.players.delete(wuid);
        
        if (roomId && this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId);
            room.players.delete(wuid);
            
            if (room.players.size === 0) {
                this.rooms.delete(roomId);
                console.log(`🏠 Removed empty room: ${roomId}`);
            } else {
                socket.to(roomId).emit('player_leave', { 
                    wuid: wuid,
                    timestamp: Date.now()
                });
            }
        }
        
        this.stats.activeConnections--;
        console.log(`👋 Player ${wuid} left`);
    }
    
    validatePlayer(socket, wuid, roomId) {
        if (!wuid || !roomId) {
            socket.emit('error', { 
                code: 'INVALID_DATA', 
                message: 'Missing wuid or roomId',
                timestamp: Date.now()
            });
            return false;
        }
        
        if (!this.players.has(wuid)) {
            socket.emit('error', { 
                code: 'PLAYER_NOT_FOUND', 
                message: 'Player not registered',
                timestamp: Date.now()
            });
            return false;
        }
        
        return true;
    }
    
    updatePlayerActivity(wuid) {
        if (this.players.has(wuid)) {
            this.players.get(wuid).lastActivity = Date.now();
        }
    }
    
    cleanup() {
        const now = Date.now();
        const timeout = 10 * 60 * 1000;
        let cleanedCount = 0;
        
        this.players.forEach((playerData, wuid) => {
            if (now - playerData.lastActivity > timeout || 
                !playerData.socket.connected) {
                this.removePlayer(playerData.socket);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} inactive connections`);
        }
    }
    
    printStats() {
        console.log('📊 Server Stats:', {
            activeConnections: this.players.size,
            activeRooms: this.rooms.size,
            totalMessages: this.stats.totalMessages,
            skinUpdates: this.stats.skinUpdates,
            hatUpdates: this.stats.hatUpdates,
            corsRequests: this.stats.corsRequests
        });
    }
    
    getStats() {
        return {
            ...this.stats,
            activeConnections: this.players.size,
            activeRooms: this.rooms.size,
            uptime: Date.now() - this.stats.startTime,
            timestamp: Date.now()
        };
    }
    
    getRoomsInfo() {
        const roomsInfo = {};
        
        this.rooms.forEach((room, roomId) => {
            const players = Array.from(room.players).map(playerId => {
                const player = this.players.get(playerId);
                return {
                    wuid: playerId,
                    playerInfo: player?.playerInfo || {},
                    online: player?.socket?.connected || false
                };
            });
            
            roomsInfo[roomId] = {
                playerCount: room.players.size,
                players: players,
                createdAt: room.createdAt
            };
        });
        
        return roomsInfo;
    }
}

const syncManager = new WormupSyncManager();

// معالجة اتصالات Socket.IO
io.on('connection', (socket) => {
    syncManager.stats.totalConnections++;
    const clientOrigin = socket.handshake.headers.origin || 'unknown';
    console.log(`🔌 New connection: ${socket.id} from ${clientOrigin}`);
    
    // رسالة ترحيب
    socket.emit('welcome', {
        message: 'Connected to Wormup Sync Server (Manual CORS)',
        serverId: process.env.RAILWAY_SERVICE_ID || 'railway',
        version: '2.2.0',
        corsMode: 'manual',
        timestamp: Date.now()
    });
    
    socket.on('join_room', (data) => {
        console.log('📥 Join room request:', data);
        syncManager.addPlayer(socket, data);
    });
    
    socket.on('skin_update', (data) => {
        syncManager.handleSkinUpdate(socket, data);
    });
    
    socket.on('hat_update', (data) => {
        syncManager.handleHatUpdate(socket, data);
    });
    
    socket.on('heartbeat', (data) => {
        syncManager.handleHeartbeat(socket, data);
    });
    
    socket.on('disconnect', (reason) => {
        console.log(`❌ Disconnected: ${socket.id} - ${reason}`);
        syncManager.removePlayer(socket);
    });
    
    socket.on('error', (error) => {
        console.error(`❌ Socket error: ${socket.id}`, error);
    });
});

// HTTP Routes
app.get('/', (req, res) => {
    syncManager.stats.corsRequests++;
    res.json({
        service: 'Wormup Sync Server',
        version: '2.2.0 (Manual CORS)',
        status: 'running',
        platform: 'Railway',
        corsMode: 'manual',
        stats: syncManager.getStats(),
        timestamp: new Date().toISOString()
    });
});

app.get('/stats', (req, res) => {
    syncManager.stats.corsRequests++;
    res.json(syncManager.getStats());
});

app.get('/rooms', (req, res) => {
    syncManager.stats.corsRequests++;
    res.json(syncManager.getRoomsInfo());
});

app.get('/health', (req, res) => {
    syncManager.stats.corsRequests++;
    res.status(200).json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        corsMode: 'manual',
        timestamp: new Date().toISOString()
    });
});

// اختبار CORS
app.get('/test-cors', (req, res) => {
    res.json({
        message: 'CORS test successful',
        origin: req.headers.origin,
        timestamp: new Date().toISOString()
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Wormup Sync Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready with manual CORS`);
    console.log(`🌐 Platform: Railway`);
    console.log(`🔧 CORS mode: Manual (no external library)`);
});

// معالجة إشارات النظام
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

console.log('🎮 Wormup Sync Server with manual CORS initialized!');
