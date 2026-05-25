SET NAMES utf8mb4;
-- ============================================================
-- HỆ THỐNG ĐẶT VÉ XE KHÁCH ĐA NHÀ XE
-- Phiên bản: 1.0 | Phase 1: Core Schema
-- ============================================================

-- Tạo database và chọn để sử dụng
CREATE DATABASE IF NOT EXISTS bus_booking
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bus_booking;

-- ============================================================
-- BẢNG 1: USERS
-- Lưu tất cả tài khoản: Customer, Operator, Admin
-- ============================================================
CREATE TABLE users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(100)    NOT NULL,
  email         VARCHAR(150)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  phone         VARCHAR(20)     NULL,

  -- Ba role chính của hệ thống
  role          ENUM('customer','operator','admin')
                                NOT NULL DEFAULT 'customer',

  -- Trạng thái tài khoản
  status        ENUM('active','inactive','banned')
                                NOT NULL DEFAULT 'active',

  -- Xác thực email (bắt buộc theo FR-01)
  is_verified   TINYINT(1)      NOT NULL DEFAULT 0,

  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME        NULL,     -- Soft delete

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);


-- ============================================================
-- BẢNG 2: COMPANIES (Nhà xe)
-- Mỗi Operator sở hữu 1 Company
-- ============================================================
CREATE TABLE companies (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,

  -- Liên kết với tài khoản Operator
  user_id         INT UNSIGNED  NOT NULL,

  name            VARCHAR(150)  NOT NULL,
  phone           VARCHAR(20)   NULL,
  address         VARCHAR(255)  NULL,
  logo_url        VARCHAR(500)  NULL,

  -- Admin duyệt trước khi Operator được tạo chuyến (BR-13)
  status          ENUM('pending','approved','blocked')
                                NOT NULL DEFAULT 'pending',

  -- Hoa hồng (%) hệ thống thu trên mỗi booking (FR-17)
  commission_rate DECIMAL(5,2)  NOT NULL DEFAULT 10.00,

  -- Điểm đánh giá trung bình (FR-28)
  avg_rating      DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  total_ratings   INT UNSIGNED  NOT NULL DEFAULT 0,

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_companies_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
);


-- ============================================================
-- BẢNG 3: ROUTES (Tuyến đường)
-- Admin quản lý các tuyến cố định toàn hệ thống (FR-15)
-- Ví dụ: TP.HCM → Đà Lạt
-- ============================================================
CREATE TABLE routes (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  from_city       VARCHAR(100)  NOT NULL,
  to_city         VARCHAR(100)  NOT NULL,

  -- Khoảng cách km và thời gian đi ước tính (phút)
  distance_km     INT UNSIGNED  NULL,
  duration_min    INT UNSIGNED  NULL,

  status          ENUM('active','inactive')
                                NOT NULL DEFAULT 'active',

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- Không cho phép tạo tuyến trùng lặp
  UNIQUE KEY uq_routes_direction (from_city, to_city)
);


-- ============================================================
-- BẢNG 4: TRIPS (Chuyến xe cụ thể)
-- Mỗi Trip = 1 chuyến của 1 Operator trên 1 Route, 1 ngày giờ cụ thể
-- ============================================================
CREATE TABLE trips (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id      INT UNSIGNED  NOT NULL,
  route_id        INT UNSIGNED  NOT NULL,

  departure_time  DATETIME      NOT NULL,  -- Giờ xuất phát
  arrival_time    DATETIME      NOT NULL,  -- Giờ dự kiến đến

  -- Giá vé cơ bản (VNĐ)
  base_price      DECIMAL(12,2) NOT NULL,

  -- Loại xe
  vehicle_type    VARCHAR(50)   NOT NULL DEFAULT 'seat',

  -- Tổng số ghế & số ghế còn trống (cache để query nhanh)
  total_seats     INT UNSIGNED  NOT NULL DEFAULT 40,
  available_seats INT UNSIGNED  NOT NULL DEFAULT 40,

  status          ENUM('scheduled','departed','completed','cancelled')
                                NOT NULL DEFAULT 'scheduled',

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME      NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_trips_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_trips_route
    FOREIGN KEY (route_id) REFERENCES routes(id)
    ON DELETE RESTRICT,

  -- Index để tăng tốc query tìm kiếm chuyến (FR-03)
  INDEX idx_trips_route_departure (route_id, departure_time),
  INDEX idx_trips_status (status)
);


-- ============================================================
-- BẢNG 5: SEATS (Ghế xe)
-- Tự động sinh khi Trip được tạo (FR-05)
-- ============================================================
CREATE TABLE seats (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  trip_id     INT UNSIGNED  NOT NULL,

  -- Mã ghế: A1, A2, B1... (dùng để hiển thị sơ đồ)
  seat_code   VARCHAR(10)   NOT NULL,

  -- Loại ghế (window = cạnh cửa sổ, aisle = cạnh lối đi)
  seat_type   ENUM('window','aisle','vip')
                            NOT NULL DEFAULT 'aisle',

  -- Tầng (dành cho xe 2 tầng)
  floor       TINYINT       NOT NULL DEFAULT 1,

  -- Ba trạng thái ghế theo SRS
  status      ENUM('available','locked','booked')
                            NOT NULL DEFAULT 'available',

  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_seats_trip
    FOREIGN KEY (trip_id) REFERENCES trips(id)
    ON DELETE CASCADE,  -- Xóa trip thì xóa hết ghế theo

  -- Mỗi ghế là duy nhất trong 1 chuyến (BR-01)
  UNIQUE KEY uq_seats_trip_code (trip_id, seat_code),

  -- Index để query nhanh ghế trống theo chuyến
  INDEX idx_seats_trip_status (trip_id, status)
);


-- ============================================================
-- BẢNG 6: SEAT_LOCKS (Giữ ghế tạm thời)
-- Ghế bị lock 10 phút khi user đang trong quá trình đặt (FR-07)
-- ============================================================
CREATE TABLE seat_locks (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  seat_id     INT UNSIGNED  NOT NULL,
  user_id     INT UNSIGNED  NOT NULL,

  -- Thời điểm hết hạn lock (= created_at + 10 phút)
  expires_at  DATETIME      NOT NULL,

  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_seat_locks_seat
    FOREIGN KEY (seat_id) REFERENCES seats(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_seat_locks_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,

  -- Mỗi ghế chỉ có 1 lock tại 1 thời điểm
  UNIQUE KEY uq_seat_locks_seat (seat_id),

  -- Index để scheduled job tìm nhanh các lock hết hạn
  INDEX idx_seat_locks_expires (expires_at)
);


-- ============================================================
-- BẢNG 7: BOOKINGS (Giao dịch đặt vé)
-- 1 Booking có thể gồm nhiều ghế (nhiều hành khách)
-- ============================================================
CREATE TABLE bookings (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED    NOT NULL,
  trip_id         INT UNSIGNED    NOT NULL,

  -- Mã booking duy nhất, hiển thị cho khách (BK-XXXXXXXX)
  booking_code    VARCHAR(20)     NOT NULL,

  -- Giá gốc, giảm giá, và tổng tiền thực trả
  subtotal        DECIMAL(12,2)   NOT NULL,
  discount_amount DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  total_amount    DECIMAL(12,2)   NOT NULL,

  -- Trạng thái booking theo state machine trong SRS
  status          ENUM(
    'pending_payment',  -- Vừa tạo, chờ thanh toán
    'paid',             -- Thanh toán thành công
    'payment_failed',   -- Thanh toán thất bại
    'expired',          -- Quá 10 phút chưa thanh toán
    'cancelled',        -- Customer hủy
    'cancelled_by_operator', -- Operator hủy chuyến
    'completed'         -- Chuyến đã hoàn thành
  ) NOT NULL DEFAULT 'pending_payment',

  -- Booking hết hạn sau 10 phút nếu chưa thanh toán (FR-08)
  expires_at      DATETIME        NOT NULL,

  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME        NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_code (booking_code),

  CONSTRAINT fk_bookings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_trip
    FOREIGN KEY (trip_id) REFERENCES trips(id)
    ON DELETE RESTRICT,

  INDEX idx_bookings_user (user_id),
  INDEX idx_bookings_trip (trip_id),
  INDEX idx_bookings_status (status)
);


-- ============================================================
-- BẢNG 8: BOOKING_SEATS (Ghế thuộc Booking)
-- Bảng trung gian: 1 booking có nhiều ghế
-- ============================================================
CREATE TABLE booking_seats (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  booking_id  INT UNSIGNED  NOT NULL,
  seat_id     INT UNSIGNED  NOT NULL,

  PRIMARY KEY (id),
  -- 1 ghế chỉ thuộc 1 booking (BR-01)
  UNIQUE KEY uq_booking_seats_seat (seat_id),

  CONSTRAINT fk_booking_seats_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_booking_seats_seat
    FOREIGN KEY (seat_id) REFERENCES seats(id)
    ON DELETE RESTRICT
);


-- ============================================================
-- BẢNG 9: PASSENGERS (Thông tin hành khách)
-- Mỗi ghế trong booking gắn với 1 hành khách (FR-24)
-- ============================================================
CREATE TABLE passengers (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  booking_id      INT UNSIGNED  NOT NULL,
  seat_id         INT UNSIGNED  NOT NULL,

  full_name       VARCHAR(100)  NOT NULL,
  phone           VARCHAR(20)   NOT NULL,
  id_card         VARCHAR(20)   NOT NULL, -- CCCD/CMND/Hộ chiếu
  email           VARCHAR(150)  NOT NULL,
  note            TEXT          NULL,     -- Yêu cầu đặc biệt

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_passengers_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_passengers_seat
    FOREIGN KEY (seat_id) REFERENCES seats(id)
    ON DELETE RESTRICT
);


-- ============================================================
-- BẢNG 10: PAYMENTS (Giao dịch thanh toán)
-- Lưu toàn bộ lịch sử giao dịch với Payment Gateway (FR-11)
-- ============================================================
CREATE TABLE payments (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  booking_id          INT UNSIGNED    NOT NULL,

  -- ID giao dịch từ phía Payment Gateway (VNPay...)
  transaction_id      VARCHAR(100)    NULL,

  amount              DECIMAL(12,2)   NOT NULL,
  payment_method      VARCHAR(50)     NOT NULL DEFAULT 'vnpay',

  status              ENUM('pending','success','failed','refunded')
                                      NOT NULL DEFAULT 'pending',

  -- Raw response từ gateway để đối soát (FR-11)
  gateway_response    JSON            NULL,

  -- Idempotency: đánh dấu đã xử lý để tránh xử lý trùng
  is_processed        TINYINT(1)      NOT NULL DEFAULT 0,

  paid_at             DATETIME        NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_transaction (transaction_id),

  CONSTRAINT fk_payments_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE RESTRICT,

  INDEX idx_payments_booking (booking_id),
  INDEX idx_payments_status (status)
);


-- ============================================================
-- DỮ LIỆU MẪU (Seed Data) để test ngay
-- ============================================================

-- Admin account (password: Test@1234)
INSERT INTO users (full_name, email, password_hash, role, status, is_verified)
VALUES (
  'Super Admin',
  'admin@busbooking.com',
  '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.',
  'admin', 'active', 1
);

-- Mock Operators (password: Test@1234)
INSERT INTO users (full_name, email, password_hash, role, status, is_verified) VALUES
('Nhà xe Phương Trang', 'phuta@operator.com', '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.', 'operator', 'active', 1),
('Nhà xe Thành Bưởi', 'thanhbuoi@operator.com', '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.', 'operator', 'active', 1);

-- Mock Customers (password: Test@1234)
INSERT INTO users (full_name, email, password_hash, role, status, is_verified) VALUES
('Khách Hàng A', 'khacha@gmail.com', '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.', 'customer', 'active', 1),
('Khách Hàng B', 'khachb@gmail.com', '$2b$10$kGnXtpywSjGAwDc5f9r7jeB6v7o23IsmPAo0Nv5LjKt3AEJUPIHm.', 'customer', 'active', 1);

-- Một vài tuyến đường phổ biến
INSERT INTO routes (from_city, to_city, distance_km, duration_min) VALUES
  ('TP. Hồ Chí Minh', 'Đà Lạt',   300, 360),
  ('TP. Hồ Chí Minh', 'Vũng Tàu', 125, 150),
  ('TP. Hồ Chí Minh', 'Phan Thiết',200, 240),
  ('Hà Nội',          'Hải Phòng', 120, 135),
  ('Hà Nội',          'Đà Nẵng',   780, 840);
