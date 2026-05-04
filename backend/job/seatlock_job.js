// Job chạy mỗi 1 phút: tự động release ghế lock đã hết hạn
// Đây là scheduled job theo SRS — tránh ghế bị "treo" mãi mãi

const db = require('../config/db');

const releaseExpiredLocks = async () => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Tìm tất cả ghế đang LOCKED nhưng đã hết hạn
        const [expiredLocks] = await conn.execute(
            `SELECT sl.seat_id, s.trip_id
       FROM seat_locks sl
       JOIN seats s ON s.id = sl.seat_id
       WHERE sl.expires_at < NOW()`
        );

        if (expiredLocks.length === 0) {
            conn.release();
            return;
        }

        // Nhóm theo trip để cập nhật available_seats
        const tripSeatCount = {};
        const seatIds = [];

        for (const lock of expiredLocks) {
            seatIds.push(lock.seat_id);
            tripSeatCount[lock.trip_id] = (tripSeatCount[lock.trip_id] || 0) + 1;
        }

        // Release từng ghế về AVAILABLE
        for (const seatId of seatIds) {
            await conn.execute(
                "UPDATE seats SET status = 'available' WHERE id = ? AND status = 'locked'",
                [seatId]
            );
        }

        // Cập nhật lại available_seats cho từng trip
        for (const [tripId, count] of Object.entries(tripSeatCount)) {
            await conn.execute(
                'UPDATE trips SET available_seats = available_seats + ? WHERE id = ?',
                [count, tripId]
            );
        }

        // Xóa các lock đã hết hạn
        await conn.execute('DELETE FROM seat_locks WHERE expires_at < NOW()');

        await conn.commit();

        if (seatIds.length > 0) {
            console.log(`🔓 [SeatLock Job] Released ${seatIds.length} expired seat(s) at ${new Date().toLocaleTimeString()}`);
        }

    } catch (err) {
        await conn.rollback();
        console.error('[SeatLock Job] Error:', err.message);
    } finally {
        conn.release();
    }
};

// Khởi động job: chạy mỗi 60 giây
const startSeatLockJob = () => {
    console.log('⏰ SeatLock Job started — checking every 60 seconds');
    setInterval(releaseExpiredLocks, 60 * 1000);
};

module.exports = { startSeatLockJob };