CREATE DATABASE IF NOT EXISTS ecommerce_inventory;
USE ecommerce_inventory;

CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(500),
    manager_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE inventory_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    reserved INT NOT NULL DEFAULT 0,
    restock_threshold INT NOT NULL DEFAULT 0,
    last_restocked TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    UNIQUE KEY unique_product_warehouse (product_id, warehouse_id)
);

-- Insert demo warehouses
INSERT INTO warehouses (name, location, manager_id) VALUES 
('Main Warehouse', 'Jakarta Central', 1),
('Secondary Warehouse', 'Surabaya', 2),
('Distribution Center', 'Bandung', 1);

-- Insert demo inventory (assuming product IDs 1-4 exist from product service)
INSERT INTO inventory_products (product_id, warehouse_id, quantity, reserved, restock_threshold, last_restocked) VALUES 
(1, 1, 30, 0, 5, NOW()),
(1, 2, 20, 0, 5, NOW()),
(2, 1, 15, 0, 3, NOW()),
(2, 3, 5, 0, 3, NOW()),
(3, 1, 80, 0, 10, NOW()),
(3, 2, 20, 0, 10, NOW()),
(4, 1, 25, 0, 5, NOW()),
(4, 3, 5, 0, 5, NOW());