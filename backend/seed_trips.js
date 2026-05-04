const db = require('./config/db');
const { generateSeats } = require('./utils/helpers');

async function seedData() {
    console.log('🚀 Bắt đầu tạo mock data...');
    try {
        // 1. Lấy Operators và tạo Companies nếu chưa có
        const [operators] = await db.query("SELECT id FROM users WHERE role = 'operator'");
        if (operators.length === 0) {
            console.log('❌ Không tìm thấy user operator nào. Vui lòng chạy db.sql trước.');
            return;
        }

        const companyIds = [];
        for (const op of operators) {
            const [existing] = await db.query("SELECT id FROM companies WHERE user_id = ?", [op.id]);
            if (existing.length === 0) {
                const name = op.id % 2 === 0 ? 'Nhà xe Phương Trang' : 'Nhà xe Thành Bưởi';
                const [res] = await db.query(
                    "INSERT INTO companies (user_id, name, phone, status, commission_rate, avg_rating) VALUES (?, ?, ?, 'approved', 10.0, 4.5)",
                    [op.id, name, '0901234567']
                );
                companyIds.push(res.insertId);
                console.log(`✅ Đã tạo công ty ${name} cho user ${op.id}`);
            } else {
                // Đảm bảo được duyệt
                await db.query("UPDATE companies SET status = 'approved' WHERE id = ?", [existing[0].id]);
                companyIds.push(existing[0].id);
            }
        }

        // 2. Lấy Routes
        const [routes] = await db.query("SELECT id, duration_min FROM routes WHERE status = 'active'");
        if (routes.length === 0) {
            console.log('❌ Không tìm thấy route nào.');
            return;
        }

        // 3. Xóa các trips/seats cũ (nếu muốn làm sạch, nhưng tránh lỗi FK thì cần cẩn thận)
        // await db.query("SET FOREIGN_KEY_CHECKS = 0");
        // await db.query("TRUNCATE TABLE seats");
        // await db.query("TRUNCATE TABLE trips");
        // await db.query("SET FOREIGN_KEY_CHECKS = 1");

        // 4. Tạo Trips với nhiều ngày và trạng thái khác nhau
        const vehicleTypes = ['seat', 'sleeper', 'limousine'];
        const statuses = ['scheduled', 'departed', 'completed', 'cancelled'];
        
        let tripsCreated = 0;
        let seatsCreated = 0;

        const basePrices = [150000, 200000, 250000, 300000, 450000];

        console.log('⏳ Đang tạo các chuyến xe và ghế, quá trình này có thể mất vài giây...');

        const batchSize = 100;
        
        // Mốc thời gian: 5 ngày quá khứ, hôm nay, và 10 ngày tương lai
        for (let dayOffset = -5; dayOffset <= 10; dayOffset++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + dayOffset);
            
            // Mỗi ngày tạo 3-5 chuyến cho mỗi route
            for (const route of routes) {
                const companyId = companyIds[Math.floor(Math.random() * companyIds.length)];
                
                // Random số chuyến trong ngày
                const numTrips = Math.floor(Math.random() * 3) + 3; // 3 đến 5 chuyến

                for (let i = 0; i < numTrips; i++) {
                    const vehicleType = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
                    const basePrice = basePrices[Math.floor(Math.random() * basePrices.length)];
                    
                    // Trạng thái phụ thuộc vào thời gian
                    let status = 'scheduled';
                    if (dayOffset < 0) status = 'completed';
                    if (dayOffset === 0) status = Math.random() > 0.5 ? 'scheduled' : 'departed';
                    if (Math.random() > 0.9) status = 'cancelled'; // 10% hủy

                    // Giờ khởi hành: từ 5h sáng đến 22h tối
                    const hour = 5 + Math.floor(Math.random() * 18);
                    const minute = Math.random() > 0.5 ? 0 : 30;
                    
                    const departureTime = new Date(targetDate);
                    departureTime.setHours(hour, minute, 0, 0);

                    const durationMin = route.duration_min || 360; // mặc định 6 tiếng
                    const arrivalTime = new Date(departureTime.getTime() + durationMin * 60000);

                    const seats = generateSeats(vehicleType);
                    const totalSeats = seats.length;
                    
                    // Random số ghế đã bán cho chuyến
                    // Chuyến quá khứ/departed thì bán nhiều, chuyến tương lai bán ít hơn
                    let soldSeatsCount = 0;
                    if (status === 'completed' || status === 'departed') {
                        soldSeatsCount = Math.floor(Math.random() * totalSeats);
                    } else if (status === 'scheduled') {
                        soldSeatsCount = Math.floor(Math.random() * (totalSeats / 2));
                    }
                    const availableSeats = totalSeats - soldSeatsCount;

                    // Insert Trip
                    const [tripResult] = await db.query(
                        `INSERT INTO trips (company_id, route_id, departure_time, arrival_time, base_price, vehicle_type, total_seats, available_seats, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [companyId, route.id, departureTime, arrivalTime, basePrice, vehicleType, totalSeats, availableSeats, status]
                    );

                    const tripId = tripResult.insertId;
                    tripsCreated++;

                    // Chuẩn bị batch insert Seats
                    const seatValues = seats.map((s, index) => {
                        let seatStatus = 'available';
                        // Đặt các ghế đầu tiên thành booked cho khớp với soldSeatsCount
                        if (index < soldSeatsCount && status !== 'cancelled') {
                            seatStatus = 'booked';
                        }
                        return [tripId, s.seat_code, s.seat_type, s.floor, seatStatus];
                    });

                    // Bulk insert seats cho nhanh
                    await db.query(
                        'INSERT INTO seats (trip_id, seat_code, seat_type, floor, status) VALUES ?',
                        [seatValues]
                    );
                    
                    seatsCreated += seats.length;
                }
            }
        }

        console.log(`✅ Hoàn thành!`);
        console.log(`🚐 Đã tạo: ${tripsCreated} chuyến xe.`);
        console.log(`💺 Đã tạo: ${seatsCreated} ghế ngồi.`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi:', error);
        process.exit(1);
    }
}

seedData();
