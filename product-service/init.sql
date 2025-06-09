CREATE DATABASE IF NOT EXISTS ecommerce_product;
USE ecommerce_product;

CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category_id INT,
    stock INT DEFAULT 0,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Insert demo data
INSERT INTO categories (name, description) VALUES 
('Electronics', 'Electronic devices and gadgets'),
('Clothing', 'Apparel and fashion items'),
('Books', 'Books and educational materials'),
('Home & Garden', 'Home improvement and garden supplies');

INSERT INTO products (name, description, price, category_id, stock, image_url) VALUES 
('Smartphone', 'Latest Android smartphone with great features', 299.99, 1, 50, 'https://via.placeholder.com/300x300'),
('Laptop', 'High-performance laptop for work and gaming', 899.99, 1, 20, 'https://via.placeholder.com/300x300'),
('T-Shirt', 'Comfortable cotton t-shirt', 19.99, 2, 100, 'https://via.placeholder.com/300x300'),
('Programming Book', 'Learn programming with this comprehensive guide', 49.99, 3, 30, 'https://via.placeholder.com/300x300');

-- Create reviews table
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_id (product_id),
    INDEX idx_user_id (user_id)
);

-- Insert demo reviews (assuming user IDs 1 and 2 exist from user service)
INSERT INTO reviews (product_id, user_id, rating, comment) VALUES 
(1, 1, 5, 'Amazing smartphone! Great camera quality and battery life.'),
(1, 2, 4, 'Good phone but a bit expensive. Overall satisfied with the purchase.'),
(2, 1, 5, 'Perfect laptop for programming. Fast and reliable.'),
(2, 2, 4, 'Great performance but gets a bit hot during heavy usage.'),
(3, 1, 3, 'Fabric quality is okay but not the best. Size fits well.'),
(3, 2, 4, 'Comfortable t-shirt, good value for money.'),
(4, 1, 5, 'Excellent book for learning! Very detailed explanations.'),
(4, 2, 5, 'Best programming book I have ever read. Highly recommended!');