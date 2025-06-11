CREATE DATABASE IF NOT EXISTS ecommerce_warehouse;
USE ecommerce_warehouse;

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS warehouse_capacity;
DROP TABLE IF EXISTS warehouses;

-- Create warehouses table
CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    location VARCHAR(500) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Indonesia',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    manager_id INT,
    phone VARCHAR(50),
    email VARCHAR(255),
    status ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FULL') DEFAULT 'ACTIVE',
    capacity INT DEFAULT NULL,
    occupied_space INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_manager_id (manager_id),
    INDEX idx_status (status),
    INDEX idx_location (city, state),
    INDEX idx_coordinates (latitude, longitude)
);

-- Create warehouse capacity tracking table
CREATE TABLE warehouse_capacity (
    warehouse_id INT PRIMARY KEY,
    total_capacity INT NOT NULL DEFAULT 0,
    occupied_space INT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

-- Insert demo warehouses with realistic Indonesian locations
INSERT INTO warehouses (
    name, code, location, address, city, state, postal_code, country, 
    latitude, longitude, manager_id, phone, email, capacity, status
) VALUES 
(
    'Jakarta Central Warehouse', 
    'WH-JKT-01', 
    'Jakarta Central Distribution Center',
    'Jl. Gatot Subroto No. 123, Menteng Dalam',
    'Jakarta',
    'DKI Jakarta',
    '12870',
    'Indonesia',
    -6.2088,
    106.8456,
    1,
    '+62-21-5551234',
    'jakarta.central@warehouse.com',
    50000,
    'ACTIVE'
),
(
    'Surabaya East Warehouse',
    'WH-SBY-01',
    'Surabaya Eastern Industrial Zone',
    'Jl. Raya Industri No. 456, Rungkut',
    'Surabaya',
    'Jawa Timur',
    '60293',
    'Indonesia',
    -7.2575,
    112.7521,
    2,
    '+62-31-8887654',
    'surabaya.east@warehouse.com',
    35000,
    'ACTIVE'
),
(
    'Bandung West Warehouse',
    'WH-BDG-01',
    'Bandung West Manufacturing Hub',
    'Jl. Soekarno Hatta No. 789, Bojongsoang',
    'Bandung',
    'Jawa Barat',
    '40288',
    'Indonesia',
    -6.9175,
    107.6191,
    1,
    '+62-22-2223456',
    'bandung.west@warehouse.com',
    28000,
    'ACTIVE'
),
(
    'Medan North Warehouse',
    'WH-MDN-01',
    'Medan Northern Logistics Center',
    'Jl. Gatot Subroto No. 321, Medan Baru',
    'Medan',
    'Sumatera Utara',
    '20232',
    'Indonesia',
    3.5952,
    98.6722,
    3,
    '+62-61-4445678',
    'medan.north@warehouse.com',
    22000,
    'ACTIVE'
),
(
    'Makassar South Warehouse',
    'WH-MKS-01',
    'Makassar Southern Distribution Point',
    'Jl. A.P. Pettarani No. 654, Tamalate',
    'Makassar',
    'Sulawesi Selatan',
    '90221',
    'Indonesia',
    -5.1477,
    119.4327,
    3,
    '+62-411-5556789',
    'makassar.south@warehouse.com',
    18000,
    'ACTIVE'
),
(
    'Denpasar Bali Warehouse',
    'WH-DPS-01',
    'Denpasar Central Bali Hub',
    'Jl. Bypass Ngurah Rai No. 987, Sanur',
    'Denpasar',
    'Bali',
    '80228',
    'Indonesia',
    -8.6705,
    115.2126,
    2,
    '+62-361-7778901',
    'denpasar.bali@warehouse.com',
    15000,
    'ACTIVE'
),
(
    'Yogyakarta Special Warehouse',
    'WH-YGY-01',
    'Yogyakarta Special Region Center',
    'Jl. Malioboro No. 234, Gedongtengen',
    'Yogyakarta',
    'DI Yogyakarta',
    '55271',
    'Indonesia',
    -7.7956,
    110.3695,
    2,
    '+62-274-8889012',
    'yogyakarta.special@warehouse.com',
    12000,
    'MAINTENANCE'
),
(
    'Semarang Central Java Hub',
    'WH-SMG-01',
    'Semarang Central Java Logistics',
    'Jl. Pandanaran No. 567, Semarang Tengah',
    'Semarang',
    'Jawa Tengah',
    '50241',
    'Indonesia',
    -6.9667,
    110.4167,
    1,
    '+62-24-9990123',
    'semarang.central@warehouse.com',
    25000,
    'ACTIVE'
);

-- Insert corresponding capacity records
INSERT INTO warehouse_capacity (warehouse_id, total_capacity, occupied_space) VALUES 
(1, 50000, 35000),  -- 70% utilized
(2, 35000, 20000),  -- 57% utilized
(3, 28000, 22000),  -- 79% utilized
(4, 22000, 8000),   -- 36% utilized
(5, 18000, 12000),  -- 67% utilized
(6, 15000, 9000),   -- 60% utilized
(7, 12000, 3000),   -- 25% utilized (in maintenance)
(8, 25000, 15000);  -- 60% utilized

-- Create indexes for better performance
CREATE INDEX idx_warehouse_code ON warehouses(code);
CREATE INDEX idx_warehouse_status_city ON warehouses(status, city);
CREATE INDEX idx_capacity_utilization ON warehouse_capacity(total_capacity, occupied_space);

-- Create view for warehouse utilization
CREATE VIEW warehouse_utilization AS
SELECT 
    w.id,
    w.name,
    w.code,
    w.city,
    w.state,
    w.status,
    wc.total_capacity,
    wc.occupied_space,
    (wc.total_capacity - wc.occupied_space) AS available_space,
    ROUND((wc.occupied_space / wc.total_capacity) * 100, 2) AS utilization_percentage,
    CASE 
        WHEN (wc.occupied_space / wc.total_capacity) > 0.9 THEN 'Critical'
        WHEN (wc.occupied_space / wc.total_capacity) > 0.8 THEN 'High'
        WHEN (wc.occupied_space / wc.total_capacity) > 0.6 THEN 'Medium'
        ELSE 'Low'
    END AS utilization_level
FROM warehouses w
LEFT JOIN warehouse_capacity wc ON w.id = wc.warehouse_id
WHERE w.status != 'INACTIVE';

-- Create stored procedure for finding nearest warehouses
DELIMITER //
CREATE PROCEDURE GetNearestWarehouses(
    IN user_lat DECIMAL(10,8),
    IN user_lng DECIMAL(11,8),
    IN max_distance DECIMAL(10,2),
    IN result_limit INT
)
BEGIN
    SELECT 
        w.*,
        wc.total_capacity,
        wc.occupied_space,
        (wc.total_capacity - wc.occupied_space) AS available_space,
        (6371 * acos(
            cos(radians(user_lat)) * cos(radians(w.latitude)) * 
            cos(radians(w.longitude) - radians(user_lng)) + 
            sin(radians(user_lat)) * sin(radians(w.latitude))
        )) AS distance_km
    FROM warehouses w
    LEFT JOIN warehouse_capacity wc ON w.id = wc.warehouse_id
    WHERE w.latitude IS NOT NULL 
        AND w.longitude IS NOT NULL 
        AND w.status = 'ACTIVE'
        AND (6371 * acos(
            cos(radians(user_lat)) * cos(radians(w.latitude)) * 
            cos(radians(w.longitude) - radians(user_lng)) + 
            sin(radians(user_lat)) * sin(radians(w.latitude))
        )) <= IFNULL(max_distance, 1000)
    ORDER BY distance_km
    LIMIT result_limit;
END//
DELIMITER ;

-- Create trigger to update warehouse capacity when warehouse capacity changes
DELIMITER //
CREATE TRIGGER update_warehouse_capacity_on_change
    AFTER UPDATE ON warehouse_capacity
    FOR EACH ROW
BEGIN
    UPDATE warehouses 
    SET 
        capacity = NEW.total_capacity,
        occupied_space = NEW.occupied_space,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.warehouse_id;
    
    -- Update status based on utilization
    UPDATE warehouses 
    SET status = CASE 
        WHEN NEW.occupied_space >= NEW.total_capacity THEN 'FULL'
        WHEN status = 'FULL' AND NEW.occupied_space < NEW.total_capacity THEN 'ACTIVE'
        ELSE status
    END
    WHERE id = NEW.warehouse_id;
END//
DELIMITER ;

-- Create function to calculate warehouse distance
DELIMITER //
CREATE FUNCTION CalculateDistance(
    lat1 DECIMAL(10,8), 
    lng1 DECIMAL(11,8), 
    lat2 DECIMAL(10,8), 
    lng2 DECIMAL(11,8)
) RETURNS DECIMAL(10,2)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE distance DECIMAL(10,2);
    SET distance = (
        6371 * acos(
            cos(radians(lat1)) * cos(radians(lat2)) * 
            cos(radians(lng2) - radians(lng1)) + 
            sin(radians(lat1)) * sin(radians(lat2))
        )
    );
    RETURN distance;
END//
DELIMITER ;

-- Display created tables and sample data
SHOW TABLES;

SELECT 'Warehouses created:' as 'Status';
SELECT id, name, code, city, state, status, capacity FROM warehouses;

SELECT 'Warehouse capacity summary:' as 'Status';
SELECT * FROM warehouse_utilization;

SELECT 'Database setup completed successfully!' as 'Final Status';