const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Routes
app.use('/api/auth', require('./auth/auth_routes'));
app.use('/api/admin', require('./modules/admin/admin_routes'));
app.use('/api/operator', require('./modules/operator/operator_routes'));
app.use('/api/booking', require('./modules/booking/booking_routes')); // 👈 thêm

app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint không tồn tại.' }));

// Khởi động SeatLock Job
const { startSeatLockJob } = require('./job/seatlock_job'); // 👈 thêm
startSeatLockJob();                                           // 👈 thêm

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});