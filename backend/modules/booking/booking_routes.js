const express = require('express');
const router = express.Router();
const controller = require('./booking_controller');
const { authenticate } = require('../../middleware/auth');

// Public — không cần đăng nhập
router.get('/search', controller.searchTrips);
router.get('/trips/:id/seats', controller.getTripSeatMap);

// Protected — cần đăng nhập
router.post('/lock', authenticate, controller.lockSeats);
router.post('/create', authenticate, controller.createBooking);
router.get('/my-bookings', authenticate, controller.getMyBookings);
router.post('/:id/cancel', authenticate, controller.cancelBooking);
router.post('/:id/mock-payment', authenticate, controller.mockPayment);

module.exports = router;