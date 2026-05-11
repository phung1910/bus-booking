const db = require('../../config/db');

// Lấy danh sách nhà xe, có thể lọc theo status và tìm kiếm
const getAllCompanies = async (status = null, q = null) => {
    let sql = `
    SELECT
      c.id, c.name, c.phone, c.address,
      c.status, c.commission_rate,
      c.avg_rating, c.total_ratings, c.created_at,
      u.full_name AS owner_name,
      u.email     AS owner_email
    FROM companies c
    JOIN users u ON u.id = c.user_id
    WHERE c.deleted_at IS NULL
  `;
    const params = [];

    if (status) {
        sql += ' AND c.status = ?';
        params.push(status);
    }
    
    if (q) {
        sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
        const search = '%' + q + '%';
        params.push(search, search, search, search);
    }

    sql += ' ORDER BY c.created_at DESC';
    const [rows] = await db.execute(sql, params);
    return rows;
};

// Duyệt nhà xe pending → approved
const approveCompany = async (companyId) => {
    const [rows] = await db.execute(
        'SELECT id, status, user_id FROM companies WHERE id = ? AND deleted_at IS NULL',
        [companyId]
    );

    if (rows.length === 0) throw { statusCode: 404, message: 'Không tìm thấy nhà xe.' };
    if (rows[0].status === 'approved') throw { statusCode: 400, message: 'Nhà xe này đã được duyệt rồi.' };

    await db.execute('UPDATE companies SET status = ? WHERE id = ?', ['approved', companyId]);
    await db.execute('UPDATE users SET status = ? WHERE id = ?', ['active', rows[0].user_id]);
    return { companyId, newStatus: 'approved' };
};

// Khóa nhà xe → toàn bộ chuyến bị ẩn (BR-10)
const blockCompany = async (companyId) => {
    const [rows] = await db.execute(
        'SELECT id, status, user_id FROM companies WHERE id = ? AND deleted_at IS NULL',
        [companyId]
    );

    if (rows.length === 0) throw { statusCode: 404, message: 'Không tìm thấy nhà xe.' };
    if (rows[0].status === 'blocked') throw { statusCode: 400, message: 'Nhà xe này đã bị khóa rồi.' };

    await db.execute('UPDATE companies SET status = ? WHERE id = ?', ['blocked', companyId]);
    await db.execute('UPDATE users SET status = ? WHERE id = ?', ['banned', rows[0].user_id]);
    return { companyId, newStatus: 'blocked' };
};

// Cập nhật % hoa hồng cho nhà xe (FR-17)
const setCommission = async (companyId, commissionRate) => {
    if (commissionRate < 0 || commissionRate > 100) {
        throw { statusCode: 400, message: 'Tỷ lệ hoa hồng phải từ 0 đến 100.' };
    }

    const [rows] = await db.execute(
        'SELECT id FROM companies WHERE id = ? AND deleted_at IS NULL',
        [companyId]
    );
    if (rows.length === 0) throw { statusCode: 404, message: 'Không tìm thấy nhà xe.' };

    await db.execute(
        'UPDATE companies SET commission_rate = ? WHERE id = ?',
        [commissionRate, companyId]
    );
    return { companyId, commissionRate };
};

// Lấy tất cả tuyến đường
const getAllRoutes = async () => {
    const [rows] = await db.execute(
        'SELECT * FROM routes ORDER BY from_city, to_city'
    );
    return rows;
};

// Tạo tuyến đường mới (chỉ Admin)
const createRoute = async ({ from_city, to_city, distance_km, duration_min }) => {
    const [existing] = await db.execute(
        'SELECT id FROM routes WHERE from_city = ? AND to_city = ?',
        [from_city, to_city]
    );
    if (existing.length > 0) {
        throw { statusCode: 409, message: `Tuyến ${from_city} → ${to_city} đã tồn tại.` };
    }

    const [result] = await db.execute(
        'INSERT INTO routes (from_city, to_city, distance_km, duration_min) VALUES (?, ?, ?, ?)',
        [from_city, to_city, distance_km || null, duration_min || null]
    );

    const [rows] = await db.execute('SELECT * FROM routes WHERE id = ?', [result.insertId]);
    return rows[0];
};

// Dashboard tổng quan hệ thống (FR-18)
const getDashboard = async () => {
    const [[{ totalUsers }]] = await db.execute(
        "SELECT COUNT(*) AS totalUsers FROM users WHERE deleted_at IS NULL AND role = 'customer'"
    );
    const [[{ totalCompanies }]] = await db.execute(
        "SELECT COUNT(*) AS totalCompanies FROM companies WHERE deleted_at IS NULL AND status = 'approved'"
    );
    const [[{ totalBookings }]] = await db.execute(
        "SELECT COUNT(*) AS totalBookings FROM bookings WHERE status IN ('paid', 'completed')"
    );
    const [[{ totalRevenue }]] = await db.execute(
        "SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue FROM bookings WHERE status IN ('paid', 'completed')"
    );
    const [[{ pendingCompanies }]] = await db.execute(
        "SELECT COUNT(*) AS pendingCompanies FROM companies WHERE status = 'pending'"
    );

    return { totalUsers, totalCompanies, totalBookings, totalRevenue, pendingCompanies };
};

// Lấy danh sách khách hàng
const getAllUsers = async (q = null) => {
    let sql = `SELECT id, full_name, email, phone, status, is_verified, created_at 
               FROM users 
               WHERE role = 'customer' AND deleted_at IS NULL`;
    const params = [];
    
    if (q) {
        sql += ' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
        const search = '%' + q + '%';
        params.push(search, search, search);
    }
    
    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.execute(sql, params);
    return rows;
};

// Lấy danh sách tất cả booking
const getAllBookings = async (q = null) => {
    let sql = `SELECT b.id, b.booking_code, b.total_amount, b.status, b.created_at, b.expires_at,
                t.departure_time,
                u.full_name as customer_name, u.phone as customer_phone, u.email as customer_email,
                c.name as company_name,
                r.from_city, r.to_city,
                (SELECT COUNT(*) FROM booking_seats bs WHERE bs.booking_id = b.id) as seat_count
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         JOIN trips t ON t.id = b.trip_id
         JOIN companies c ON c.id = t.company_id
         JOIN routes r ON r.id = t.route_id
         WHERE b.deleted_at IS NULL`;
         
    const params = [];
    if (q) {
        sql += ' AND (b.booking_code LIKE ? OR u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR c.name LIKE ?)';
        const search = '%' + q + '%';
        params.push(search, search, search, search, search);
    }
    
    sql += ' ORDER BY b.created_at DESC';

    const [rows] = await db.execute(sql, params);
    return rows;
};

// Lấy danh sách giao dịch (Payments) cho doanh thu
const getAllPayments = async () => {
    const [rows] = await db.execute(
        `SELECT p.id, p.transaction_id, p.amount, p.payment_method, p.status, p.created_at,
                b.booking_code,
                c.name as company_name
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         JOIN trips t ON t.id = b.trip_id
         JOIN companies c ON c.id = t.company_id
         ORDER BY p.created_at DESC`
    );
    return rows;
};

module.exports = {
    getAllCompanies, approveCompany, blockCompany,
    setCommission, getAllRoutes, createRoute, getDashboard,
    getAllUsers, getAllBookings, getAllPayments
};