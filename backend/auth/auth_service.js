const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            email: user.email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN
        }
    );
}

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            id: user.id
        },
        process.env.JWT_REFRESH_SECRET,
        {
            expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
        }
    );
};

const register = async ({ full_name, email, password, phone, role }) => {
    const [existing] = await db.execute(
        'SELECT id FROM users WHERE email = ?', [email]
    );
    if (existing.length > 0) {
        const err = new Error('Email đã tồn tại.');
        err.statusCode = 400;
        throw err;
    }
    const password_hash = await bcrypt.hash(password, 10);
    const allowedRoles = ['customer', 'operator', 'admin'];
    const userRole = allowedRoles.includes(role) ? role : 'customer';
    const [result] = await db.execute(
        `INSERT INTO users (full_name, email, password_hash, phone, role, status, is_verified)
     VALUES (?, ?, ?, ?, ?, 'active', 1)`,
        [full_name, email, password_hash, phone || null, userRole]
    );
    const [rows] = await db.execute(
        'SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = ?',
        [result.insertId]
    );
    return rows[0];
};

const login = async ({ email, password }) => {
    const [rows] = await db.execute(
        'SELECT id, full_name, email, password_hash, role, status FROM users WHERE email = ? AND deleted_at IS NULL',
        [email]
    );
    if (rows.length === 0) {
        const err = new Error('Email hoặc mật khẩu không chính xác.');
        err.statusCode = 401;
        throw err;
    }
    const user = rows[0];

    if (user.status === 'banned') {
        const err = new Error('Tài khoản của bạn đã bị khóa.');
        err.statusCode = 403;
        throw err;
    }

    if (user.status == 'inactive') {
        const err = new Error('Tài khoản của bạn chưa được kích hoạt.');
        err.statusCode = 403;
        throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
        const err = new Error('Email hoặc mật khẩu không chính xác.');
        err.statusCode = 401;
        throw err;
    }

    const access_token = generateAccessToken(user);
    const refresh_token = generateRefreshToken(user);

    return {
        access_token,
        refresh_token,
        user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role
        }
    };
};

const getMe = async (userId) => {
    const [rows] = await db.execute(
        `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at,
            c.id as company_id, c.name as company_name, c.status as company_status
         FROM users u
         LEFT JOIN companies c ON c.user_id = u.id
        WHERE u.id = ? AND u.deleted_at IS NULL`,
        [userId]
    );
    if (rows.length === 0) {
        const err = new Error('Không tìm thấy tài khoản.');
        err.statusCode = 404;
        throw err;
    }
    return rows[0];
}
module.exports = { register, login, getMe };