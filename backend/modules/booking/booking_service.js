const db = require('../../config/db');
const { generateBookingCode } = require('../../utils/helpers');

// ══════════════════════════════════════════════
// FR-03 + FR-27: TÌM KIẾM CHUYẾN XE
// ══════════════════════════════════════════════
const searchTrips = async ({ from_city, to_city, date, vehicle_type, min_price, max_price, sort_by }) => {

    // Tìm route khớp với điểm đi/đến
    const [routes] = await db.execute(
        `SELECT id FROM routes 
     WHERE from_city = ? AND to_city = ? AND status = 'active'`,
        [from_city, to_city]
    );

    if (routes.length === 0) return [];

    const routeId = routes[0].id;

    // Query chuyến xe có ghế trống, nhà xe đã duyệt
    let sql = `
    SELECT
      t.id, t.departure_time, t.arrival_time,
      t.base_price, t.vehicle_type,
      t.total_seats, t.available_seats,
      c.id   AS company_id,
      c.name AS company_name,
      c.avg_rating,
      r.from_city, r.to_city, r.duration_min
    FROM trips t
    JOIN companies c ON c.id = t.company_id
    JOIN routes r    ON r.id = t.route_id
    WHERE t.route_id       = ?
      AND t.status         = 'scheduled'
      AND t.available_seats > 0
      AND c.status         = 'approved'
      AND t.deleted_at     IS NULL
  `;
    const params = [routeId];

    // Lọc theo ngày khởi hành
    if (date) {
        sql += ' AND DATE(t.departure_time) = ?';
        params.push(date);
    }

    // Lọc theo loại xe
    if (vehicle_type) {
        sql += ' AND t.vehicle_type = ?';
        params.push(vehicle_type);
    }

    // Lọc theo khoảng giá
    if (min_price) {
        sql += ' AND t.base_price >= ?';
        params.push(min_price);
    }
    if (max_price) {
        sql += ' AND t.base_price <= ?';
        params.push(max_price);
    }

    // Sắp xếp kết quả
    const sortOptions = {
        price_asc: 't.base_price ASC',
        price_desc: 't.base_price DESC',
        departure: 't.departure_time ASC',
        rating: 'c.avg_rating DESC'
    };
    sql += ' ORDER BY ' + (sortOptions[sort_by] || 't.departure_time ASC');

    const [rows] = await db.execute(sql, params);
    return rows;
};


// ══════════════════════════════════════════════
// FR-06: XEM SƠ ĐỒ GHẾ REAL-TIME
// ══════════════════════════════════════════════
const getTripSeatMap = async (tripId) => {

    // Kiểm tra chuyến tồn tại
    const [trips] = await db.execute(
        `SELECT t.id, t.vehicle_type, t.departure_time, t.arrival_time, t.base_price,
            c.name AS company_name, r.from_city, r.to_city, r.duration_min
     FROM trips t
     JOIN companies c ON c.id = t.company_id
     JOIN routes r    ON r.id = t.route_id
     WHERE t.id = ? AND t.deleted_at IS NULL`,
        [tripId]
    );

    if (trips.length === 0)
        throw { statusCode: 404, message: 'Không tìm thấy chuyến xe.' };

    // Lấy tất cả ghế kèm thời gian hết lock (nếu đang bị lock)
    const [seats] = await db.execute(
        `SELECT 
       s.id, s.seat_code, s.seat_type, s.floor, s.status,
       sl.expires_at AS lock_expires_at,
       sl.user_id    AS locked_by
     FROM seats s
     LEFT JOIN seat_locks sl ON sl.seat_id = s.id
     WHERE s.trip_id = ?
     ORDER BY s.floor, s.seat_code`,
        [tripId]
    );

    return { trip: trips[0], seats };
};


// ══════════════════════════════════════════════
// FR-07: LOCK GHẾ (giữ ghế 10 phút)
// ══════════════════════════════════════════════
const lockSeats = async (userId, tripId, seatIds) => {
    if (!seatIds || seatIds.length === 0)
        throw { statusCode: 400, message: 'Vui lòng chọn ít nhất 1 ghế.' };

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const lockedSeats = [];

        for (const seatId of seatIds) {
            // SELECT FOR UPDATE: khóa row lại, tránh 2 user lock cùng ghế
            const [seats] = await conn.execute(
                'SELECT id, status, trip_id FROM seats WHERE id = ? AND trip_id = ? FOR UPDATE',
                [seatId, tripId]
            );

            if (seats.length === 0)
                throw { statusCode: 404, message: `Ghế ID ${seatId} không tồn tại trong chuyến này.` };

            if (seats[0].status !== 'available')
                throw { statusCode: 409, message: `Ghế ${seatId} không còn trống. Vui lòng chọn ghế khác.` };

            // Đổi trạng thái ghế sang LOCKED
            await conn.execute(
                "UPDATE seats SET status = 'locked' WHERE id = ?",
                [seatId]
            );

            // Tạo seat_lock với thời gian hết hạn 10 phút
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // +10 phút
            await conn.execute(
                `INSERT INTO seat_locks (seat_id, user_id, expires_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = ?, expires_at = ?`,
                [seatId, userId, expiresAt, userId, expiresAt]
            );

            lockedSeats.push(seatId);
        }

        // Cập nhật lại số ghế trống trong trip
        await conn.execute(
            'UPDATE trips SET available_seats = available_seats - ? WHERE id = ?',
            [seatIds.length, tripId]
        );

        await conn.commit();

        return {
            lockedSeats,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            expiresInMin: 10
        };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};


// ══════════════════════════════════════════════
// FR-08: TẠO BOOKING
// ══════════════════════════════════════════════
const createBooking = async (userId, { tripId, seatIds, passengers, voucherCode }) => {

    // Kiểm tra thông tin chuyến
    const [trips] = await db.execute(
        "SELECT id, base_price, status FROM trips WHERE id = ? AND deleted_at IS NULL",
        [tripId]
    );
    if (trips.length === 0)
        throw { statusCode: 404, message: 'Không tìm thấy chuyến xe.' };
    if (trips[0].status !== 'scheduled')
        throw { statusCode: 400, message: 'Chuyến xe này không thể đặt vé.' };

    // Kiểm tra số lượng hành khách khớp số ghế
    if (!passengers || passengers.length !== seatIds.length)
        throw { statusCode: 400, message: 'Số hành khách phải bằng số ghế đã chọn.' };

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Kiểm tra từng ghế có đang bị lock bởi user này không
        for (const seatId of seatIds) {
            const [locks] = await conn.execute(
                `SELECT sl.id FROM seat_locks sl
         WHERE sl.seat_id = ? AND sl.user_id = ? AND sl.expires_at > NOW()`,
                [seatId, userId]
            );
            if (locks.length === 0)
                throw { statusCode: 409, message: `Ghế ID ${seatId} chưa được giữ hoặc đã hết hạn. Vui lòng chọn lại ghế.` };
        }

        // Tính tiền
        const unitPrice = parseFloat(trips[0].base_price);
        const subtotal = unitPrice * seatIds.length;
        let discountAmount = 0;

        // Kiểm tra voucher nếu có (FR-29)
        if (voucherCode) {
            const [vouchers] = await conn.execute(
                `SELECT * FROM vouchers
         WHERE code = ? AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
           AND used_count < max_usage`,
                [voucherCode]
            );
            if (vouchers.length === 0)
                throw { statusCode: 400, message: 'Mã giảm giá không hợp lệ hoặc đã hết lượt dùng.' };

            const voucher = vouchers[0];
            discountAmount = Math.min(subtotal * voucher.discount_percent / 100, voucher.max_discount_amount);
        }

        const totalAmount = subtotal - discountAmount;

        // Sinh booking code duy nhất (thử lại nếu trùng)
        let bookingCode;
        let isUnique = false;
        while (!isUnique) {
            bookingCode = generateBookingCode();
            const [existing] = await conn.execute(
                'SELECT id FROM bookings WHERE booking_code = ?', [bookingCode]
            );
            if (existing.length === 0) isUnique = true;
        }

        // Booking hết hạn sau 10 phút nếu không thanh toán
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Tạo booking
        const [bookingResult] = await conn.execute(
            `INSERT INTO bookings
         (user_id, trip_id, booking_code, subtotal, discount_amount, total_amount, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?)`,
            [userId, tripId, bookingCode, subtotal, discountAmount, totalAmount, expiresAt]
        );
        const bookingId = bookingResult.insertId;

        // Gán ghế vào booking + lưu thông tin hành khách
        for (let i = 0; i < seatIds.length; i++) {
            const seatId = seatIds[i];
            const pax = passengers[i];

            // Gán ghế vào booking
            await conn.execute(
                'INSERT INTO booking_seats (booking_id, seat_id) VALUES (?, ?)',
                [bookingId, seatId]
            );

            // Lưu thông tin hành khách (FR-24)
            await conn.execute(
                `INSERT INTO passengers (booking_id, seat_id, full_name, phone, id_card, email, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [bookingId, seatId,
                    pax.full_name, pax.phone, pax.id_card, pax.email, pax.note || null]
            );
        }

        await conn.commit();

        return {
            bookingId,
            bookingCode,
            subtotal,
            discountAmount,
            totalAmount,
            expiresAt,
            status: 'pending_payment'
        };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};


// ══════════════════════════════════════════════
// FR-23: LỊCH SỬ BOOKING CỦA CUSTOMER
// ══════════════════════════════════════════════
const getMyBookings = async (userId) => {
    const [rows] = await db.execute(
        `SELECT
       b.id, b.booking_code, b.status,
       b.subtotal, b.discount_amount, b.total_amount,
       b.expires_at, b.created_at,
       t.departure_time, t.arrival_time, t.vehicle_type,
       r.from_city, r.to_city,
       c.name AS company_name,
       COUNT(bs.id) AS seat_count
     FROM bookings b
     JOIN trips    t  ON t.id  = b.trip_id
     JOIN routes   r  ON r.id  = t.route_id
     JOIN companies c ON c.id  = t.company_id
     LEFT JOIN booking_seats bs ON bs.booking_id = b.id
     WHERE b.user_id = ? AND b.deleted_at IS NULL
     GROUP BY b.id
     ORDER BY b.created_at DESC`,
        [userId]
    );
    return rows;
};


// ══════════════════════════════════════════════
// FR-12: HỦY VÉ (Customer hủy)
// ══════════════════════════════════════════════
const cancelBooking = async (userId, bookingId) => {
    const [bookings] = await db.execute(
        `SELECT b.*, t.departure_time
     FROM bookings b
     JOIN trips t ON t.id = b.trip_id
     WHERE b.id = ? AND b.user_id = ?`,
        [bookingId, userId]
    );

    if (bookings.length === 0)
        throw { statusCode: 404, message: 'Không tìm thấy booking.' };

    const booking = bookings[0];

    // Chỉ hủy được khi đang PAID
    if (booking.status !== 'paid')
        throw { statusCode: 400, message: 'Chỉ có thể hủy booking đã thanh toán.' };

    // Phải hủy trước ít nhất 4 giờ (BR-03)
    const departureTime = new Date(booking.departure_time);
    const hoursLeft = (departureTime - new Date()) / (1000 * 60 * 60);

    if (hoursLeft < 4)
        throw { statusCode: 400, message: 'Chỉ có thể hủy vé trước ít nhất 4 giờ khởi hành.' };

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Đổi trạng thái booking
        await conn.execute(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
            [bookingId]
        );

        // Lấy danh sách ghế để release
        const [seats] = await conn.execute(
            'SELECT seat_id FROM booking_seats WHERE booking_id = ?',
            [bookingId]
        );

        const seatIds = seats.map(s => s.seat_id);

        // Release tất cả ghế về AVAILABLE
        for (const seatId of seatIds) {
            await conn.execute(
                "UPDATE seats SET status = 'available' WHERE id = ?",
                [seatId]
            );
        }

        // Cập nhật lại available_seats trong trip
        await conn.execute(
            'UPDATE trips SET available_seats = available_seats + ? WHERE id = ?',
            [seatIds.length, booking.trip_id]
        );

        // Tạo refund request trong bảng payments
        await conn.execute(
            `INSERT INTO payments (booking_id, amount, payment_method, status)
       VALUES (?, ?, 'refund', 'pending')`,
            [bookingId, booking.total_amount]
        );

        await conn.commit();
        return { bookingId, status: 'cancelled', refundAmount: booking.total_amount };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};


// ══════════════════════════════════════════════
// Mô phỏng thanh toán (Phase 4 dùng tạm, Phase 6 thay bằng VNPay)
// ══════════════════════════════════════════════
const mockPayment = async (bookingId, userId) => {
    const [bookings] = await db.execute(
        'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
        [bookingId, userId]
    );

    if (bookings.length === 0)
        throw { statusCode: 404, message: 'Không tìm thấy booking.' };

    const booking = bookings[0];

    if (booking.status !== 'pending_payment')
        throw { statusCode: 400, message: `Booking đang ở trạng thái ${booking.status}, không thể thanh toán.` };

    if (new Date(booking.expires_at) < new Date())
        throw { statusCode: 400, message: 'Booking đã hết hạn. Vui lòng đặt lại.' };

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Cập nhật booking → PAID
        await conn.execute(
            "UPDATE bookings SET status = 'paid' WHERE id = ?",
            [bookingId]
        );

        // Cập nhật ghế → BOOKED (xóa lock)
        const [seats] = await conn.execute(
            'SELECT seat_id FROM booking_seats WHERE booking_id = ?',
            [bookingId]
        );

        for (const { seat_id } of seats) {
            await conn.execute(
                "UPDATE seats SET status = 'booked' WHERE id = ?",
                [seat_id]
            );
            await conn.execute(
                'DELETE FROM seat_locks WHERE seat_id = ?',
                [seat_id]
            );
        }

        // Ghi transaction thanh toán
        const transactionId = 'MOCK-' + Date.now();
        await conn.execute(
            `INSERT INTO payments (booking_id, transaction_id, amount, payment_method, status, is_processed, paid_at)
       VALUES (?, ?, ?, 'mock', 'success', 1, NOW())`,
            [bookingId, transactionId, booking.total_amount]
        );

        await conn.commit();

        return {
            bookingId,
            bookingCode: booking.booking_code,
            transactionId,
            amount: booking.total_amount,
            status: 'paid',
            message: 'Thanh toán thành công! (Mock)'
        };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};


module.exports = {
    searchTrips, getTripSeatMap,
    lockSeats, createBooking,
    getMyBookings, cancelBooking, mockPayment
};