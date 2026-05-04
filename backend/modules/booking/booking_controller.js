const bookingService = require('./booking_service');
const { sendSuccess, sendError } = require('../../utils/response');

// GET /api/booking/search?from_city=...&to_city=...&date=...
const searchTrips = async (req, res) => {
    try {
        const { from_city, to_city, date } = req.query;
        if (!from_city || !to_city)
            return sendError(res, 'Vui lòng nhập điểm đi và điểm đến.', 400);
        const data = await bookingService.searchTrips(req.query);
        return sendSuccess(res, data, `Tìm thấy ${data.length} chuyến xe.`);
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] searchTrips:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// GET /api/booking/trips/:id/seats
const getTripSeatMap = async (req, res) => {
    try {
        const data = await bookingService.getTripSeatMap(req.params.id);
        return sendSuccess(res, data, 'Lấy sơ đồ ghế thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] getTripSeatMap:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// POST /api/booking/lock  (cần đăng nhập)
const lockSeats = async (req, res) => {
    try {
        const { trip_id, seat_ids } = req.body;
        if (!trip_id || !seat_ids?.length)
            return sendError(res, 'Vui lòng cung cấp trip_id và seat_ids.', 400);
        const data = await bookingService.lockSeats(req.user.id, trip_id, seat_ids);
        return sendSuccess(res, data, 'Giữ ghế thành công! Bạn có 10 phút để hoàn tất đặt vé.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] lockSeats:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// POST /api/booking/create  (cần đăng nhập)
const createBooking = async (req, res) => {
    try {
        const { trip_id, seat_ids, passengers, voucher_code } = req.body;
        if (!trip_id || !seat_ids?.length || !passengers?.length)
            return sendError(res, 'Thiếu thông tin đặt vé.', 400);
        const data = await bookingService.createBooking(req.user.id, {
            tripId: trip_id, seatIds: seat_ids,
            passengers, voucherCode: voucher_code
        });
        return sendSuccess(res, data, 'Tạo booking thành công! Vui lòng thanh toán trong 10 phút.', 201);
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] createBooking:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// GET /api/booking/my-bookings  (cần đăng nhập)
const getMyBookings = async (req, res) => {
    try {
        const data = await bookingService.getMyBookings(req.user.id);
        return sendSuccess(res, data, 'Lấy lịch sử booking thành công.');
    } catch (e) {
        console.error('[Booking] getMyBookings:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// POST /api/booking/:id/cancel  (cần đăng nhập)
const cancelBooking = async (req, res) => {
    try {
        const data = await bookingService.cancelBooking(req.user.id, req.params.id);
        return sendSuccess(res, data, 'Hủy vé thành công.');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] cancelBooking:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

// POST /api/booking/:id/mock-payment  (cần đăng nhập)
const mockPayment = async (req, res) => {
    try {
        const data = await bookingService.mockPayment(req.params.id, req.user.id);
        return sendSuccess(res, data, 'Thanh toán thành công!');
    } catch (e) {
        if (e.statusCode) return sendError(res, e.message, e.statusCode);
        console.error('[Booking] mockPayment:', e);
        return sendError(res, 'Lỗi server.', 500);
    }
};

module.exports = {
    searchTrips, getTripSeatMap, lockSeats,
    createBooking, getMyBookings, cancelBooking, mockPayment
};