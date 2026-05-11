const db = require('./config/db');
const { generateBookingCode } = require('./utils/helpers');
async function seedMore() {
    try {
        const hash = '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.';

        // 1. Add new Operators
        const newOperators = [
            ['Nhà xe Hải Vân', 'haivan@operator.com', '0912345678', hash, 'operator', 'active', 1],
            ['Nhà xe Hoàng Long', 'hoanglong@operator.com', '0923456789', hash, 'operator', 'active', 1],
            ['Nhà xe Kumho', 'kumho@operator.com', '0934567890', hash, 'operator', 'active', 1]
        ];
        
        for(let op of newOperators) {
            const [ex] = await db.query("SELECT id FROM users WHERE email=?", [op[1]]);
            if(ex.length === 0) {
                const [res] = await db.query("INSERT INTO users (full_name, email, phone, password_hash, role, status, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)", op);
                // add company
                await db.query("INSERT INTO companies (user_id, name, phone, status, commission_rate, avg_rating) VALUES (?, ?, ?, 'approved', 12.0, 4.2)", 
                [res.insertId, op[0], '19001000']);
            }
        }

        // 2. Add new Customers
        const newCustomers = [
            ['Trần Văn Cường', 'cuong@gmail.com', '0987654321', hash, 'customer', 'active', 1],
            ['Lê Thị Mai', 'mai@gmail.com', '0976543210', hash, 'customer', 'active', 1],
            ['Phạm Tuấn Anh', 'tuananh@gmail.com', '0965432109', hash, 'customer', 'active', 1],
            ['Nguyễn Lan', 'lan@gmail.com', '0954321098', hash, 'customer', 'active', 1]
        ];

        for(let cus of newCustomers) {
            const [ex] = await db.query("SELECT id FROM users WHERE email=?", [cus[1]]);
            if(ex.length === 0) {
                await db.query("INSERT INTO users (full_name, email, phone, password_hash, role, status, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?)", cus);
            }
        }

        console.log("✅ Đã thêm các nhà xe và khách hàng mới.");

        // Cập nhật số điện thoại ngẫu nhiên cho những user cũ đang bị thiếu số điện thoại
        await db.query("UPDATE users SET phone = CONCAT('09', LPAD(FLOOR(RAND() * 100000000), 8, '0')) WHERE phone IS NULL");
        console.log("✅ Đã điền số điện thoại cho các user cũ.");

        // 3. Tạo Bookings cho những ghế mồ côi
        const [users] = await db.query("SELECT id, full_name, email, phone FROM users WHERE role = 'customer'");
        
        const [bookedSeats] = await db.query(`
            SELECT s.id as seat_id, s.trip_id, t.base_price, t.departure_time, s.seat_code, t.company_id
            FROM seats s
            JOIN trips t ON t.id = s.trip_id
            WHERE s.status = 'booked' 
              AND s.id NOT IN (SELECT seat_id FROM booking_seats)
        `);

        if (bookedSeats.length === 0) {
            console.log('✅ Không có ghế booked nào bị mồ côi.');
            process.exit(0);
        }

        const tripGroups = {};
        for (const seat of bookedSeats) {
            if (!tripGroups[seat.trip_id]) tripGroups[seat.trip_id] = [];
            tripGroups[seat.trip_id].push(seat);
        }

        let bookingsCreated = 0;
        let paymentsCreated = 0;

        for (const tripId in tripGroups) {
            const seats = tripGroups[tripId];
            for (let i = 0; i < seats.length;) {
                const chunkSize = Math.min(Math.floor(Math.random() * 3) + 1, seats.length - i);
                const chunkSeats = seats.slice(i, i + chunkSize);
                i += chunkSize;

                const user = users[Math.floor(Math.random() * users.length)];
                const basePrice = parseFloat(chunkSeats[0].base_price);
                const totalAmount = basePrice * chunkSize;
                let bookingCode;
                while(true) {
                    bookingCode = generateBookingCode();
                    const [ex] = await db.query("SELECT id FROM bookings WHERE booking_code=?", [bookingCode]);
                    if(ex.length===0) break;
                }
                
                const departureTime = new Date(chunkSeats[0].departure_time);
                const now = new Date();
                
                const status = departureTime < now ? 'completed' : 'paid';
                const expiresAt = new Date(now.getTime() - 100000); 

                const createdDate = new Date(departureTime.getTime() - Math.random() * 86400000 * 3); // 3 ngày trước khởi hành

                const [bookingRes] = await db.query(
                    `INSERT INTO bookings (user_id, trip_id, booking_code, subtotal, discount_amount, total_amount, status, expires_at, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [user.id, tripId, bookingCode, totalAmount, 0, totalAmount, status, expiresAt, createdDate]
                );
                const bookingId = bookingRes.insertId;
                bookingsCreated++;

                for (const seat of chunkSeats) {
                    await db.query(
                        'INSERT INTO booking_seats (booking_id, seat_id) VALUES (?, ?)',
                        [bookingId, seat.seat_id]
                    );

                    await db.query(
                        `INSERT INTO passengers (booking_id, seat_id, full_name, phone, id_card, email)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [bookingId, seat.seat_id, user.full_name, user.phone || '0987654321', '012345678912', user.email]
                    );
                }

                await db.query(
                    `INSERT INTO payments (booking_id, transaction_id, amount, payment_method, status, is_processed, paid_at, created_at)
                     VALUES (?, ?, ?, 'mock', 'success', 1, ?, ?)`,
                    [bookingId, 'MOCK-' + Date.now() + Math.floor(Math.random() * 10000), totalAmount, createdDate, createdDate]
                );
                paymentsCreated++;
            }
        }

        console.log(`✅ Hoàn thành! Đã tạo ${bookingsCreated} bookings và ${paymentsCreated} payments cho các ghế mồ côi.`);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
seedMore();
