const db = require('../../config/db');
const { generateSeats } = require('../../utils/helpers');

// Operator đăng ký nhà xe (cần role operator)
const registerCompany = async (userId, { name, phone, address }) => {
    const [user] = await db.execute(
        "SELECT id, role FROM users WHERE id = ? AND role = 'operator'",
        [userId]
    );
    if (user.length === 0)
        throw { statusCode: 403, message: 'Tài khoản không có quyền đăng ký nhà xe. Cần role operator.' };

    const [existing] = await db.execute(
        'SELECT id FROM companies WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
    );
    if (existing.length > 0)
        throw { statusCode: 409, message: 'Bạn đã đăng ký nhà xe rồi.' };

    const [result] = await db.execute(
        "INSERT INTO companies (user_id, name, phone, address, status) VALUES (?, ?, ?, ?, 'pending')",
        [userId, name, phone || null, address || null]
    );

    const [rows] = await db.execute('SELECT * FROM companies WHERE id = ?', [result.insertId]);
    return rows[0];
};

// Lấy thông tin nhà xe của operator đang đăng nhập
const getMyCompany = async (userId) => {
    const [rows] = await db.execute(
        'SELECT * FROM companies WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
    );
    if (rows.length === 0)
        throw { statusCode: 404, message: 'Bạn chưa đăng ký nhà xe.' };
    return rows[0];
};

// Tạo chuyến xe mới + tự động sinh ghế (FR-04 + FR-05)
const createTrip = async (userId, { route_id, departure_time, arrival_time, base_price, vehicle_type }) => {
    // Kiểm tra nhà xe tồn tại và đã được duyệt (BR-13)
    const [companies] = await db.execute(
        "SELECT id, status FROM companies WHERE user_id = ? AND deleted_at IS NULL",
        [userId]
    );
    if (companies.length === 0)
        throw { statusCode: 404, message: 'Bạn chưa đăng ký nhà xe.' };
    if (companies[0].status !== 'approved')
        throw { statusCode: 403, message: 'Nhà xe chưa được Admin duyệt.' };

    // Kiểm tra route tồn tại
    const [routes] = await db.execute(
        "SELECT id FROM routes WHERE id = ? AND status = 'active'",
        [route_id]
    );
    if (routes.length === 0)
        throw { statusCode: 404, message: 'Tuyến đường không tồn tại hoặc không hoạt động.' };

    // Kiểm tra thời gian hợp lệ
    const dept = new Date(departure_time);
    const arrv = new Date(arrival_time);
    if (dept >= arrv)
        throw { statusCode: 400, message: 'Giờ đến phải sau giờ khởi hành.' };
    if (dept <= new Date())
        throw { statusCode: 400, message: 'Giờ khởi hành phải ở tương lai.' };

    const seats = generateSeats(vehicle_type || 'seat');
    const totalSeats = seats.length;

    // Dùng transaction: tạo trip + ghế phải thành công cùng lúc
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [tripResult] = await conn.execute(
            `INSERT INTO trips
         (company_id, route_id, departure_time, arrival_time, base_price, vehicle_type, total_seats, available_seats)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companies[0].id, route_id, departure_time, arrival_time, base_price,
            vehicle_type || 'seat', totalSeats, totalSeats]
        );

        const tripId = tripResult.insertId;

        // Bulk insert toàn bộ ghế một lần cho nhanh
        const seatValues = seats.map(s => [tripId, s.seat_code, s.seat_type, s.floor, s.status]);
        await conn.query(
            'INSERT INTO seats (trip_id, seat_code, seat_type, floor, status) VALUES ?',
            [seatValues]
        );

        await conn.commit();

        const [tripRows] = await conn.execute(
            `SELECT t.*, r.from_city, r.to_city, c.name AS company_name
       FROM trips t
       JOIN routes r    ON r.id = t.route_id
       JOIN companies c ON c.id = t.company_id
       WHERE t.id = ?`,
            [tripId]
        );

        return { trip: tripRows[0], seatsGenerated: totalSeats };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

// Danh sách chuyến xe của operator (có filter)
const getMyTrips = async (userId, { status, from_date, to_date } = {}) => {
    const [companies] = await db.execute(
        'SELECT id FROM companies WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
    );
    if (companies.length === 0)
        throw { statusCode: 404, message: 'Bạn chưa đăng ký nhà xe.' };

    let sql = `
    SELECT
      t.id, t.departure_time, t.arrival_time,
      t.base_price, t.vehicle_type,
      t.total_seats, t.available_seats, t.status,
      r.from_city, r.to_city,
      COUNT(b.id) AS total_bookings
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    LEFT JOIN bookings b ON b.trip_id = t.id AND b.status = 'paid'
    WHERE t.company_id = ? AND t.deleted_at IS NULL
  `;
    const params = [companies[0].id];

    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (from_date) { sql += ' AND DATE(t.departure_time) >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND DATE(t.departure_time) <= ?'; params.push(to_date); }

    sql += ' GROUP BY t.id ORDER BY t.departure_time DESC';

    const [rows] = await db.execute(sql, params);
    return rows;
};

// Sơ đồ ghế của 1 chuyến (operator xem để quản lý)
const getTripSeats = async (userId, tripId) => {
    const [trips] = await db.execute(
        `SELECT t.id FROM trips t
     JOIN companies c ON c.id = t.company_id
     WHERE t.id = ? AND c.user_id = ?`,
        [tripId, userId]
    );
    if (trips.length === 0)
        throw { statusCode: 404, message: 'Chuyến không tồn tại hoặc bạn không có quyền xem.' };

    const [seats] = await db.execute(
        'SELECT * FROM seats WHERE trip_id = ? ORDER BY floor, seat_code',
        [tripId]
    );
    return seats;
};

// Báo cáo doanh thu (FR-14)
const getRevenueReport = async (userId, { from_date, to_date } = {}) => {
    const [companies] = await db.execute(
        'SELECT id, commission_rate FROM companies WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
    );
    if (companies.length === 0)
        throw { statusCode: 404, message: 'Bạn chưa đăng ký nhà xe.' };

    const { id: companyId, commission_rate } = companies[0];

    let sql = `
    SELECT
      COUNT(b.id)                                        AS total_bookings,
      COALESCE(SUM(b.total_amount), 0)                   AS gross_revenue,
      COALESCE(SUM(b.total_amount * ? / 100), 0)         AS commission_amount,
      COALESCE(SUM(b.total_amount * (1 - ? / 100)), 0)   AS net_revenue
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    WHERE t.company_id = ? AND b.status = 'paid'
  `;
    const params = [commission_rate, commission_rate, companyId];

    if (from_date) { sql += ' AND DATE(b.created_at) >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND DATE(b.created_at) <= ?'; params.push(to_date); }

    const [[summary]] = await db.execute(sql, params);
    return { ...summary, commission_rate };
};

module.exports = {
    registerCompany, getMyCompany,
    createTrip, getMyTrips, getTripSeats,
    getRevenueReport
};