CREATE DATABASE IF NOT EXISTS ecommerce_user;
USE ecommerce_user;

-- Drop table if exists to recreate with new structure
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'customer') DEFAULT 'customer',
    fullName VARCHAR(255) NULL,
    address TEXT NULL,
    phoneNumber VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Add indexes for better performance
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_role (role)
);

-- Insert demo users with enhanced data
INSERT INTO users (username, email, password, role, fullName, address, phoneNumber) VALUES 
(
    'admin', 
    'admin@example.com', 
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ3/F8X1oQjJKV618kvZO.6YM8sM6DV6', 
    'admin',
    'Administrator',
    'Jl. Admin No. 1, Jakarta Pusat, DKI Jakarta 10110',
    '+62-21-12345678'
),
(
    'customer1', 
    'customer1@example.com', 
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ3/F8X1oQjJKV618kvZO.6YM8sM6DV6', 
    'customer',
    'John Doe',
    'Jl. Customer No. 123, Bandung, Jawa Barat 40115',
    '+62-22-87654321'
),
(
    'customer2', 
    'customer2@example.com', 
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ3/F8X1oQjJKV618kvZO.6YM8sM6DV6', 
    'customer',
    'Jane Smith',
    'Jl. Pelanggan No. 456, Surabaya, Jawa Timur 60119',
    '+62-31-11223344'
);

-- Create a view for user statistics (optional)
CREATE VIEW user_stats AS
SELECT 
    role,
    COUNT(*) as total_users,
    COUNT(CASE WHEN fullName IS NOT NULL THEN 1 END) as users_with_fullname,
    COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as users_with_address,
    COUNT(CASE WHEN phoneNumber IS NOT NULL THEN 1 END) as users_with_phone
FROM users 
GROUP BY role;