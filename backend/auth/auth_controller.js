const authService = require('./auth_service');
const { sendSuccess, sendError } = require('../utils/response');

const register = async (req, res) => {
    try {
        const { full_name, email, password, phone, role } = req.body;

        if (!full_name || !email || !password) {
            return sendError(res, 'Vui lòng nhập đầy đủ thông tin.', 400);
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return sendError(res, 'Email không hợp lệ.', 400);
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            return sendError(res, 'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.', 400);
        }

        const newUser = await authService.register({ full_name, email, password, phone, role });
        sendSuccess(res, newUser, 'Đăng ký thành công.', 201);
    } catch (error) {
        if (error.statusCode) {
            return sendError(res, error.message, error.statusCode);
        }
        console.error('[Auth] Register error:', error);
        return sendError(res, 'Lỗi server. Vui lòng thử lại sau.', 500);
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendError(res, 'Vui lòng nhập email và mật khẩu.', 400);
        }

        const result = await authService.login({ email, password });

        return sendSuccess(res, result, 'Đăng nhập thành công!');

    } catch (error) {
        if (error.statusCode) {
            return sendError(res, error.message, error.statusCode);
        }
        console.error('[Auth] Login error:', error);
        return sendError(res, 'Lỗi server. Vui lòng thử lại sau.', 500);
    }
};

const getMe = async (req, res) => {
    try {
        const user = await authService.getMe(req.user.id);
        return sendSuccess(res, user, 'Lấy thông tin thành công!');
    } catch (error) {
        if (error.statusCode) {
            return sendError(res, error.message, error.statusCode);
        }
        console.error('[Auth] Get me error:', error);
        return sendError(res, 'Lỗi server. Vui lòng thử lại sau.', 500);
    }
};

module.exports = { register, login, getMe };