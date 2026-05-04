const db = require('../../config/db');

// Lấy danh sách nhà xe, có thể lọc theo status
const getAllCompanies = async (status = null) => {
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

    sql += ' ORDER BY c.created_at DESC';
    const [rows] = await db.execute(sql, params);
    return rows;
};

// Duyệt nhà xe pending → approved
const approveCompany = async (companyId) => {
    const [rows] = await db.execute(
        'SELECT id, status FROM companies WHERE id = ? AND deleted_at IS NULL',
        [companyId]
    );

    if (rows.length === 0) throw { statusCode: 404, message: 'Không tìm thấy nhà xe.' };
    if (rows[0].status === 'approved') throw { statusCode: 400, message: 'Nhà xe này đã được duyệt rồi.' };

    await db.execute('UPDATE companies SET status = ? WHERE id = ?', ['approved', companyId]);
    return { companyId, newStatus: 'approved' };
};

// Khóa nhà xe → toàn bộ chuyến bị ẩn (BR-10)
const blockCompany = async (companyId) => {
    const [rows] = await db.execute(
        'SELECT id, status FROM companies WHERE id = ? AND deleted_at IS NULL',
        [companyId]
    );

    if (rows.length === 0) throw { statusCode: 404, message: 'Không tìm thấy nhà xe.' };
    if (rows[0].status === 'blocked') throw { statusCode: 400, message: 'Nhà xe này đã bị khóa rồi.' };

    await db.execute('UPDATE companies SET status = ? WHERE id = ?', ['blocked', companyId]);
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
        "SELECT COUNT(*) AS totalBookings FROM bookings WHERE status = 'paid'"
    );
    const [[{ totalRevenue }]] = await db.execute(
        "SELECT COALESCE(SUM(total_amount), 0) AS totalRevenue FROM bookings WHERE status = 'paid'"
    );
    const [[{ pendingCompanies }]] = await db.execute(
        "SELECT COUNT(*) AS pendingCompanies FROM companies WHERE status = 'pending'"
    );

    return { totalUsers, totalCompanies, totalBookings, totalRevenue, pendingCompanies };
};

module.exports = {
    getAllCompanies, approveCompany, blockCompany,
    setCommission, getAllRoutes, createRoute, getDashboard
};