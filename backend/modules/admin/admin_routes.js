const express = require('express');
const router = express.Router();
const controller = require('./admin_controller');
const { authenticate, authorize } = require('../../middleware/auth');

// Toàn bộ route Admin: phải đăng nhập + role admin
router.use(authenticate);

// Cho phép tất cả những ai đã đăng nhập (cả admin và operator) đều có thể xem danh sách tuyến đường
router.get('/routes', controller.getAllRoutes);

router.use(authorize('admin'));

router.get('/dashboard', controller.getDashboard);
router.get('/users', controller.getAllUsers);
router.get('/bookings', controller.getAllBookings);
router.get('/payments', controller.getAllPayments);
router.get('/companies', controller.getAllCompanies);
router.patch('/companies/:id/approve', controller.approveCompany);
router.patch('/companies/:id/block', controller.blockCompany);
router.patch('/companies/:id/commission', controller.setCommission);
router.post('/routes', controller.createRoute);

module.exports = router;