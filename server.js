/**
 * Wormup Sync Server - Enhanced Version
 * خادم مزامنة محسن مع ميزات إضافية
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
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// إعداد Express
app.use(cors({ origin: '*' }));
app.use(express.json());

// فئة إدارة المزامنة المحسنة
class EnhancedWormupSyncManager {
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
            startTime: Date.now()
        };
        
        // تنظيف دوري كل 5 دقائق
        setInterval(() => this.cleanup(), 300000);
        
        // طباعة إحصائيات كل 10 دقائق
        setInterval(() => this.printStats(), 600000);
        
        console.log('🚀 Enhanced Wormup Sync Manager initialized');
    }
    
    // إضافة لاعب للغرفة
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
        
        // التحقق من أن اللاعب ليس موجوداً بالفعل
        if (this.players.has(wuid)) {
            const existingPlayer = this.players.get(wuid);
            if (existingPlayer.socket.connected) {
                // قطع الاتصال القديم
                existingPlayer.socket.disconnect();
                console.log(`🔄 Replaced existing connection for ${wuid}`);
            }
        }
        
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, { 
                players: new Set(), 
                createdAt: Date.now(),
                lastActivity: Date.now(),
                messageCount: 0
            });
            this.stats.roomsCreated++;
            console.log(`🏠 Created room: ${roomId}`);
        }
        
        // إضافة اللاعب للغرفة
        const room = this.rooms.get(roomId);
        room.players.add(wuid);
        room.lastActivity = Date.now();
        
        // حفظ معلومات اللاعب
        this.players.set(wuid, {
            socket: socket,
            roomId: roomId,
            playerInfo: playerInfo || {},
            joinTime: Date.now(),
            lastActivity: Date.now(),
            messagesSent: 0
        });
        
        // ربط معلومات Socket
        socket.wuid = wuid;
        socket.roomId = roomId;
        socket.join(roomId);
        
        this.stats.activeConnections++;
        
        console.log(`👤 Player ${wuid} (${playerInfo?.name || 'Unknown'}) joined room ${roomId}`);
        
        // إخبار باقي اللاعبين في الغرفة
        socket.to(roomId).emit('player_join', {
            wuid: wuid,
            playerInfo: playerInfo,
            timestamp: Date.now()
        });
        
        // إرسال تأكيد الانضمام مع معلومات الغرفة
        const roomPlayers = Array.from(room.players).map(playerId => {
            const player = this.players.get(playerId);
            return {
                wuid: playerId,
                playerInfo: player?.playerInfo || {},
                online: player?.socket?.connected || false
            };
        });
        
        socket.emit('join_success', {
            roomId: roomId,
            playersInRoom: room.players.size,
            players: roomPlayers,
            serverTime: Date.now()
        });
    }
    
    // معالجة تحديث السكن
    handleSkinUpdate(socket, data) {
        const { wuid, roomId, skinId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        this.stats.skinUpdates++;
        
        // تحديث stats الغرفة
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).messageCount++;
        }
        
        console.log(`🎨 Skin update: ${wuid} -> ${skinId} in room ${roomId}`);
        
        // إرسال للاعبين الآخرين في الغرفة
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
    
    // معالجة تحديث القبعة
    handleHatUpdate(socket, data) {
        const { wuid, roomId, hatId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        this.stats.hatUpdates++;
        
        // تحديث stats الغرفة
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).messageCount++;
        }
        
        console.log(`🎩 Hat update: ${wuid} -> ${hatId} in room ${roomId}`);
        
        // إرسال للاعبين الآخرين في الغرفة
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
    
    // معالجة تحديث شامل للمظهر (جديد)
    handleAppearanceUpdate(socket, data) {
        const { wuid, roomId, skinId, hatId, eyesId } = data;
        
        if (!this.validatePlayer(socket, wuid, roomId)) return;
        
        this.updatePlayerActivity(wuid);
        this.stats.totalMessages++;
        
        console.log(`🎭 Full appearance update: ${wuid} in room ${roomId}`);
        
        // إرسال للاعبين الآخرين في الغرفة
        socket.to(roomId).emit('appearance_update', {
            wuid: wuid,
            skinId: skinId,
            hatId: hatId,
            eyesId: eyesId,
            timestamp: Date.now()
        });
        
        // تأكيد للمرسل
        socket.emit('update_confirmed', {
            type: 'appearance',
            skinId: skinId,
            hatId: hatId,
            eyesId: eyesId,
            timestamp: Date.now()
        });
    }
    
    // معالجة heartbeat محسنة
    handleHeartbeat(socket, data) {
        const { wuid } = data;
        
        if (wuid && this.players.has(wuid)) {
            this.updatePlayerActivity(wuid);
            
            // إرسال معلومات إضافية مع pong
            const player = this.players.get(wuid);
            const room = this.rooms.get(player.roomId);
            
            socket.emit('pong', { 
                timestamp: Date.now(),
                playersInRoom: room?.players.size || 0,
                serverUptime: Date.now() - this.stats.startTime
            });
        }
    }
    
    // طلب قائمة اللاعبين في الغرفة (جديد)
    handleGetRoomPlayers(socket, data) {
        const { roomId } = data;
        const wuid = socket.wuid;
        
        if (!wuid || !this.players.has(wuid)) {
            socket.emit('error', { 
                code: 'UNAUTHORIZED',
                message: 'Player not registered'
            });
            return;
        }
        
        if (!this.rooms.has(roomId)) {
            socket.emit('room_players', { players: [] });
            return;
        }
        
        const room = this.rooms.get(roomId);
        const players = Array.from(room.players).map(playerId => {
            const player = this.players.get(playerId);
            return {
                wuid: playerId,
                playerInfo: player?.playerInfo || {},
                online: player?.socket?.connected || false,
                lastActivity: player?.lastActivity || 0
            };
        });
        
        socket.emit('room_players', { 
            roomId: roomId,
            players: players,
            timestamp: Date.now()
        });
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
                socket.to(roomId).emit('player_leave', { 
                    wuid: wuid,
                    timestamp: Date.now()
                });
            }
        }
        
        this.stats.activeConnections--;
        console.log(`👋 Player ${wuid} left`);
    }
    
    // التحقق من صحة اللاعب
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
        
        if (!this.rooms.has(roomId)) {
            socket.emit('error', { 
                code: 'ROOM_NOT_FOUND', 
                message: 'Room not found',
                timestamp: Date.now()
            });
            return false;
        }
        
        // تحديث عداد الرسائل للاعب
        const player = this.players.get(wuid);
        player.messagesSent++;
        
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
        let cleanedPlayers = 0;
        let cleanedRooms = 0;
        
        this.players.forEach((playerData, wuid) => {
            if (now - playerData.lastActivity > timeout || 
                !playerData.socket.connected) {
                
                this.removePlayer(playerData.socket);
                cleanedPlayers++;
            }
        });
        
        // تنظيف الغرف الفارغة القديمة
        this.rooms.forEach((room, roomId) => {
            if (room.players.size === 0 && 
                now - room.lastActivity > timeout) {
                this.rooms.delete(roomId);
                cleanedRooms++;
            }
        });
        
        if (cleanedPlayers > 0 || cleanedRooms > 0) {
            console.log(`🧹 Cleaned up ${cleanedPlayers} players and ${cleanedRooms} rooms`);
        }
    }
    
    // طباعة إحصائيات دورية
    printStats() {
        const stats = this.getStats();
        console.log('📊 Server Stats:', {
            activeConnections: stats.activeConnections,
            activeRooms: stats.activeRooms,
            totalMessages: stats.totalMessages,
            skinUpdates: stats.skinUpdates,
            hatUpdates: stats.hatUpdates,
            uptime: Math.round(stats.uptime / 1000 / 60) + ' minutes'
        });
    }
    
    // الحصول على إحصائيات محسنة
    getStats() {
        return {
            ...this.stats,
            activeConnections: this.players.size,
            activeRooms: this.rooms.size,
            uptime: Date.now() - this.stats.startTime,
            averagePlayersPerRoom: this.rooms.size > 0 ? 
                Array.from(this.rooms.values()).reduce((sum, room) => sum + room.players.size, 0) / this.rooms.size : 0,
            timestamp: Date.now()
        };
    }
    
    // الحصول على معلومات الغرف المحسنة
    getRoomsInfo() {
        const roomsInfo = {};
        
        this.rooms.forEach((room, roomId) => {
            const players = Array.from(room.players).map(playerId => {
                const player = this.players.get(playerId);
                return {
                    wuid: playerId,
                    playerInfo: player?.playerInfo || {},
                    online: player?.socket?.connected || false,
                    lastActivity: player?.lastActivity || 0,
                    messagesSent: player?.messagesSent || 0
                };
            });
            
            roomsInfo[roomId] = {
                playerCount: room.players.size,
                players: players,
                createdAt: room.createdAt,
                lastActivity: room.lastActivity,
                messageCount: room.messageCount || 0
            };
        });
        
        return roomsInfo;
    }
}

// إنشاء مدير المزامنة المحسن
const syncManager = new EnhancedWormupSyncManager();

// معالجة اتصالات Socket.IO
io.on('connection', (socket) => {
    syncManager.stats.totalConnections++;
    console.log(`🔌 New connection: ${socket.id} (Total: ${syncManager.stats.totalConnections})`);
    
    // رسالة ترحيب محسنة
    socket.emit('welcome', {
        message: 'Connected to Enhanced Wormup Sync Server',
        serverId: process.env.RAILWAY_SERVICE_ID || 'railway',
        version: '2.0.0',
        features: ['skin_sync', 'hat_sync', 'appearance_sync', 'heartbeat', 'room_management'],
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
    
    // حدث جديد للمظهر الشامل
    socket.on('appearance_update', (data) => {
        syncManager.handleAppearanceUpdate(socket, data);
    });
    
    socket.on('heartbeat', (data) => {
        syncManager.handleHeartbeat(socket, data);
    });
    
    // حدث جديد للحصول على قائمة اللاعبين
    socket.on('get_room_players', (data) => {
        syncManager.handleGetRoomPlayers(socket, data);
    });
    
    socket.on('disconnect', (reason) => {
        console.log(`❌ Disconnected: ${socket.id} - ${reason}`);
        syncManager.removePlayer(socket);
    });
    
    socket.on('error', (error) => {
        console.error(`❌ Socket error: ${socket.id}`, error);
    });
});

// HTTP Routes محسنة
app.get('/', (req, res) => {
    res.json({
        service: 'Enhanced Wormup Sync Server',
        version: '2.0.0',
        status: 'running',
        platform: 'Railway',
        stats: syncManager.getStats(),
        features: [
            'Real-time skin synchronization',
            'Real-time hat synchronization', 
            'Full appearance synchronization',
            'Room management',
            'Player heartbeat monitoring',
            'Automatic cleanup',
            'Enhanced error handling'
        ],
        endpoints: {
            websocket: 'wss://[your-railway-domain]',
            stats: '/stats',
            rooms: '/rooms',
            health: '/health',
            players: '/players'
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
    const stats = syncManager.getStats();
    const isHealthy = stats.activeConnections >= 0 && process.uptime() > 0;
    
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: 'Railway',
        connections: stats.activeConnections,
        rooms: stats.activeRooms,
        timestamp: new Date().toISOString()
    });
});

// endpoint جديد لمعلومات اللاعبين
app.get('/players', (req, res) => {
    const players = Array.from(syncManager.players.entries()).map(([wuid, data]) => ({
        wuid: wuid,
        roomId: data.roomId,
        playerInfo: data.playerInfo,
        online: data.socket.connected,
        joinTime: data.joinTime,
        lastActivity: data.lastActivity,
        messagesSent: data.messagesSent || 0
    }));
    
    res.json({
        totalPlayers: players.length,
        players: players,
        timestamp: new Date().toISOString()
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Enhanced Wormup Sync Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready for connections`);
    console.log(`🌐 Platform: Railway`);
    console.log(`✨ Version: 2.0.0 with enhanced features`);
    
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

console.log('🎮 Enhanced Wormup Sync Server initialized successfully!');
