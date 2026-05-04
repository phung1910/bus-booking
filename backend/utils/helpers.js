// Hàm sinh mã booking duy nhất: BK-XXXXXXXX
const generateBookingCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'BK-';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Sinh danh sách ghế tự động theo loại xe (FR-05)
const generateSeats = (vehicleType) => {
    const configs = {
        // Xe ghế ngồi: 4 cột, 10 hàng = 40 ghế
        seat: {
            rows: 10,
            cols: ['A', 'B', 'C', 'D'],
            types: ['window', 'aisle', 'aisle', 'window'],
            floors: [1]
        },
        // Xe giường nằm: 3 cột, 2 tầng, 10 hàng = 60 ghế
        sleeper: {
            rows: 10,
            cols: ['A', 'B', 'C'],
            types: ['window', 'aisle', 'window'],
            floors: [1, 2]
        },
        // Xe limousine: 2 cột VIP, 9 hàng = 18 ghế
        limousine: {
            rows: 9,
            cols: ['A', 'B'],
            types: ['vip', 'vip'],
            floors: [1]
        }
    };

    const config = configs[vehicleType] || configs['seat'];
    const seats = [];

    for (const floor of config.floors) {
        // Xe 2 tầng: tầng 1 = L (Lower), tầng 2 = U (Upper)
        const prefix = config.floors.length > 1
            ? (floor === 1 ? 'L' : 'U')
            : '';

        for (let row = 1; row <= config.rows; row++) {
            for (let c = 0; c < config.cols.length; c++) {
                seats.push({
                    seat_code: `${prefix}${config.cols[c]}${row}`,
                    seat_type: config.types[c],
                    floor: floor,
                    status: 'available'
                });
            }
        }
    }

    return seats;
};

module.exports = { generateBookingCode, generateSeats };