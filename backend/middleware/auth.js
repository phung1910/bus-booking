const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/response');
require('dotenv').config();

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return sendError(res, 'Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.', 401);
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return sendError(res, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
        }
        return sendError(res, 'Token không hợp lệ.', 401);
    }
}

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return sendError(res, 'Chưa xác thực.', 401);
        }
        if (!allowedRoles.includes(req.user.role)) {
            return sendError(res, `Bạn không có quyền thực hiện thao tác này. Yêu cầu quyền: ${allowedRoles.join(' hoặc ')}.`, 403);
        }
        next();
    }
}

module.exports = { authenticate, authorize };