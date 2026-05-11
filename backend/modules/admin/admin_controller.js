const adminService = require('./admin_service');
const { sendSuccess, sendError } = require('../../utils/response');

const getAllCompanies = async (req, res) => {
    try {
        const data = await adminService.getAllCompanies(req.query.status, req.query.q);
        return sendSuccess(res, data, 'Lấy danh sách nhà xe thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Admin] getAllCompanies:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const approveCompany = async (req, res) => {
    try {
        const data = await adminService.approveCompany(req.params.id);
        return sendSuccess(res, data, 'Duyệt nhà xe thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Admin] approveCompany:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const blockCompany = async (req, res) => {
    try {
        const data = await adminService.blockCompany(req.params.id);
        return sendSuccess(res, data, 'Khóa nhà xe thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Admin] blockCompany:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const setCommission = async (req, res) => {
    try {
        const { commission_rate } = req.body;
        if (commission_rate === undefined)
            return sendError(res, 'Vui lòng cung cấp tỷ lệ hoa hồng.', 400);
        const data = await adminService.setCommission(req.params.id, commission_rate);
        return sendSuccess(res, data, 'Cập nhật hoa hồng thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Admin] setCommission:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getAllRoutes = async (req, res) => {
    try {
        const data = await adminService.getAllRoutes();
        return sendSuccess(res, data, 'Lấy danh sách tuyến đường thành công.');
    } catch (e) {
        console.error('[Admin] getAllRoutes:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const createRoute = async (req, res) => {
    try {
        const { from_city, to_city, distance_km, duration_min } = req.body;
        if (!from_city || !to_city)
            return sendError(res, 'Vui lòng nhập điểm đi và điểm đến.', 400);
        const data = await adminService.createRoute({ from_city, to_city, distance_km, duration_min });
        return sendSuccess(res, data, 'Tạo tuyến đường thành công.', 201);
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Admin] createRoute:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getDashboard = async (req, res) => {
    try {
        const data = await adminService.getDashboard();
        return sendSuccess(res, data, 'Lấy dashboard thành công.');
    } catch (e) {
        console.error('[Admin] getDashboard:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getAllUsers = async (req, res) => {
    try {
        const data = await adminService.getAllUsers(req.query.q);
        return sendSuccess(res, data, 'Lấy danh sách khách hàng thành công.');
    } catch (e) {
        console.error('[Admin] getAllUsers:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getAllBookings = async (req, res) => {
    try {
        const data = await adminService.getAllBookings(req.query.q);
        return sendSuccess(res, data, 'Lấy danh sách booking thành công.');
    } catch (e) {
        console.error('[Admin] getAllBookings:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getAllPayments = async (req, res) => {
    try {
        const data = await adminService.getAllPayments();
        return sendSuccess(res, data, 'Lấy danh sách giao dịch thành công.');
    } catch (e) {
        console.error('[Admin] getAllPayments:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

module.exports = {
    getAllCompanies, approveCompany, blockCompany,
    setCommission, getAllRoutes, createRoute, getDashboard,
    getAllUsers, getAllBookings, getAllPayments
};