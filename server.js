/**
 * Wormup Sync Server for Railway
 * خادم مزامنة الأزياء والقبعات لـ wormup
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = createServer(app);

// إعداد Socket.IO مع CORS شامل
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// إعداد Express
app.use(cors({ origin: '*' }));
app.use(express.json());

// فئة إدارة المزامنة
class WormupSyncManager {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            totalMessages: 0,
            roomsCreated: 0,
            startTime: Date.now()
        };
        
        // تنظيف دوري كل 5 دقائق
        setInterval(() => this.cleanup(), 300000);
        
        console.log('🚀 Wormup Sync Manager initialized');
    }
    
    // إضافة لاعب للغرفة
    addPlayer(socket, data) {
        const { wuid, roomId, playerInfo } = data;
        
        if (!wuid || !roomId) {
            socket.emit('error', { code: 'INVALID_DATA', message: 'Missing wuid or roomId' });
            return;
        }
        
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, { players: new Set(), createdAt: Date.now() });
            this.stats.roomsCreated++;
            console.log(`🏠 Created room: ${roomId}`);
        }
        
        // إضافة اللاعب للغرفة
        const room = this.rooms.get(roomId);
        room.players.add(wuid);
        
        // حفظ معلومات اللاعب
        this.players.set(wuid, {
            socket: socket,
            roomId: roomId,
            playerInfo: playerInfo || {},
            joinTime: Date.now(),
            lastActivity: Date.now()
        });
        
        // ربط معلومات Socket
        socket.wuid = wuid;
        socket.roomId = roomId;
        socket.join(roomId);
        
        this.stats.activeConnections++;
        
        console.log(`👤 Player ${wuid} joined room ${roomId}`);
        
        // إخبار باقي اللاعبين في الغرفة
        socket.to(roomId).emit('player_join', {
            wuid: wuid,
            playerInfo: playerInfo
        });
        
        // إرسال تأكيد الانضمام
        socket.emit('join_success', {
            roomId: roomId,
            playersInRoom: room.players.size
        });
    }
    
    // معالجة تحديث السكن
    handleSkinUpdate(socket, data) {
        const { wuid, roomId, skinId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        
        console.log(`🎨 Skin update: ${wuid} -> ${skinId}`);
        
        // إرسال للاعبين الآخرين في الغرفة
        socket.to(roomId).emit('skin_update', {
            wuid: wuid,
            skinId: skinId,
            timestamp: Date.now()
        });
    }
    
    // معالجة تحديث القبعة
    handleHatUpdate(socket, data) {
        const { wuid, roomId, hatId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        
        console.log(`🎩 Hat update: ${wuid} -> ${hatId}`);
        
        // إرسال للاعبين الآخرين في الغرفة
        socket.to(roomId).emit('hat_update', {
            wuid: wuid,
            hatId: hatId,
            timestamp: Date.now()
        });
    }
    
    // معالجة heartbeat
    handleHeartbeat(socket, data) {
        const { wuid } = data;
        
        if (wuid && this.players.has(wuid)) {
            this.updatePlayerActivity(wuid);
            socket.emit('pong', { timestamp: Date.now() });
        }
    }
    
    // إزالة لاعب
    removePlayer(socket) {
        if (!socket.wuid) return;
        
        const wuid = socket.wuid;
        const roomId = socket.roomId;
        
        // إزالة من البيانات
        this.players.delete(wuid);
        
        // إزالة من الغرفة
        if (roomId && this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId);
            room.players.delete(wuid);
            
            // إزالة الغرفة إذا أصبحت فارغة
            if (room.players.size === 0) {
                this.rooms.delete(roomId);
                console.log(`🏠 Removed empty room: ${roomId}`);
            } else {
                // إخبار باقي اللاعبين
                socket.to(roomId).emit('player_leave', { wuid: wuid });
            }
        }
        
        this.stats.activeConnections--;
        console.log(`👋 Player ${wuid} left`);
    }
    
    // التحقق من صحة اللاعب
    validatePlayer(socket, wuid, roomId) {
        if (!wuid || !roomId) {
            socket.emit('error', { code: 'INVALID_DATA', message: 'Missing wuid or roomId' });
            return false;
        }
        
        if (!this.players.has(wuid)) {
            socket.emit('error', { code: 'PLAYER_NOT_FOUND', message: 'Player not registered' });
            return false;
        }
        
        if (!this.rooms.has(roomId)) {
            socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room not found' });
            return false;
        }
        
        return true;
    }
    
    // تحديث نشاط اللاعب
    updatePlayerActivity(wuid) {
        if (this.players.has(wuid)) {
            this.players.get(wuid).lastActivity = Date.now();
        }
    }
    
    // تنظيف الاتصالات المنقطعة
    cleanup() {
        const now = Date.now();
        const timeout = 10 * 60 * 1000; // 10 دقائق
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
    
    // الحصول على إحصائيات
    getStats() {
        return {
            ...this.stats,
            activeConnections: this.players.size,
            activeRooms: this.rooms.size,
            uptime: Date.now() - this.stats.startTime,
            timestamp: Date.now()
        };
    }
    
    // الحصول على معلومات الغرف
    getRoomsInfo() {
        const roomsInfo = {};
        
        this.rooms.forEach((room, roomId) => {
            roomsInfo[roomId] = {
                playerCount: room.players.size,
                players: Array.from(room.players),
                createdAt: room.createdAt
            };
        });
        
        return roomsInfo;
    }
}

// إنشاء مدير المزامنة
const syncManager = new WormupSyncManager();

// معالجة اتصالات Socket.IO
io.on('connection', (socket) => {
    syncManager.stats.totalConnections++;
    console.log(`🔌 New connection: ${socket.id}`);
    
    // رسالة ترحيب
    socket.emit('welcome', {
        message: 'Connected to Wormup Sync Server',
        serverId: process.env.RAILWAY_SERVICE_ID || 'railway',
        timestamp: Date.now()
    });
    
    // معالجة الأحداث
    socket.on('join_room', (data) => {
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
    res.json({
        service: 'Wormup Sync Server',
        status: 'running',
        platform: 'Railway',
        stats: syncManager.getStats(),
        endpoints: {
            websocket: 'wss://[your-railway-domain]',
            stats: '/stats',
            rooms: '/rooms',
            health: '/health'
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/stats', (req, res) => {
    res.json(syncManager.getStats());
});

app.get('/rooms', (req, res) => {
    res.json(syncManager.getRoomsInfo());
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: 'Railway',
        timestamp: new Date().toISOString()
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Wormup Sync Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready for connections`);
    console.log(`🌐 Platform: Railway`);
    
    // عرض معلومات البيئة
    if (process.env.RAILWAY_ENVIRONMENT) {
        console.log(`🚂 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT}`);
    }
    if (process.env.RAILWAY_SERVICE_ID) {
        console.log(`🆔 Service ID: ${process.env.RAILWAY_SERVICE_ID}`);
    }
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

console.log('🎮 Wormup Sync Server initialized successfully!');
