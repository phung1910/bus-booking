const operatorService = require('./operator_service');
const { sendSuccess, sendError } = require('../../utils/response');

const registerCompany = async (req, res) => {
    try {
        const { name, phone, address } = req.body;
        if (!name) return sendError(res, 'Vui lòng nhập tên nhà xe.', 400);
        const data = await operatorService.registerCompany(req.user.id, { name, phone, address });
        return sendSuccess(res, data, 'Đăng ký nhà xe thành công! Vui lòng chờ Admin duyệt.', 201);
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] registerCompany:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getMyCompany = async (req, res) => {
    try {
        const data = await operatorService.getMyCompany(req.user.id);
        return sendSuccess(res, data, 'Lấy thông tin nhà xe thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getMyCompany:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const createTrip = async (req, res) => {
    try {
        const { route_id, departure_time, arrival_time, base_price, vehicle_type } = req.body;
        if (!route_id || !departure_time || !arrival_time || !base_price)
            return sendError(res, 'Vui lòng điền đầy đủ thông tin chuyến xe.', 400);
        const data = await operatorService.createTrip(req.user.id,
            { route_id, departure_time, arrival_time, base_price, vehicle_type });
        return sendSuccess(res, data, `Tạo chuyến thành công! Đã sinh ${data.seatsGenerated} ghế.`, 201);
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] createTrip:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getMyTrips = async (req, res) => {
    try {
        const data = await operatorService.getMyTrips(req.user.id, req.query);
        return sendSuccess(res, data, 'Lấy danh sách chuyến xe thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getMyTrips:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getTripSeats = async (req, res) => {
    try {
        const data = await operatorService.getTripSeats(req.user.id, req.params.id);
        return sendSuccess(res, data, 'Lấy sơ đồ ghế thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getTripSeats:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getRevenueReport = async (req, res) => {
    try {
        const data = await operatorService.getRevenueReport(req.user.id, req.query);
        return sendSuccess(res, data, 'Lấy báo cáo doanh thu thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getRevenueReport:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getMyBookings = async (req, res) => {
    try {
        const data = await operatorService.getMyBookings(req.user.id, req.query.q);
        return sendSuccess(res, data, 'Lấy danh sách đặt vé thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getMyBookings:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

const getMyRoutes = async (req, res) => {
    try {
        const data = await operatorService.getMyRoutes(req.user.id);
        return sendSuccess(res, data, 'Lấy danh sách tuyến đường thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Operator] getMyRoutes:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

module.exports = {
    registerCompany, getMyCompany,
    createTrip, getMyTrips, getTripSeats, getRevenueReport, getMyBookings, getMyRoutes
};