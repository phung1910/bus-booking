const express = require('express');
const router = express.Router();
const controller = require('./operator_controller');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);
router.use(authorize('operator'));

router.post('/company', controller.registerCompany);
router.get('/company', controller.getMyCompany);
router.post('/trips', controller.createTrip);
router.get('/trips', controller.getMyTrips);
router.get('/trips/:id/seats', controller.getTripSeats);
router.get('/revenue', controller.getRevenueReport);
router.get('/bookings', controller.getMyBookings);
router.get('/routes', controller.getMyRoutes);

module.exports = router;