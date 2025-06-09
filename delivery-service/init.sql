CREATE DATABASE IF NOT EXISTS ecommerce_delivery;
USE ecommerce_delivery;

CREATE TABLE IF NOT EXISTS delivery_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    service_id VARCHAR(100) UNIQUE NOT NULL,
    status ENUM('pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'failed', 'cancelled') DEFAULT 'pending',
    estimated_delivery DATETIME,
    actual_delivery DATETIME,
    tracking_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Add indexes for better performance
    INDEX idx_order_id (order_id),
    INDEX idx_service_id (service_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at)
);

-- Insert sample tracking data (for testing)
INSERT INTO delivery_tracking (order_id, service_id, status, estimated_delivery, tracking_notes) VALUES 
(1, 'TRK1001001', 'shipped', DATE_ADD(NOW(), INTERVAL 3 DAY), 'Package shipped from Jakarta warehouse'),
(2, 'TRK2002002', 'processing', DATE_ADD(NOW(), INTERVAL 5 DAY), 'Order being prepared for shipment'),
(3, 'TRK3003003', 'delivered', DATE_SUB(NOW(), INTERVAL 1 DAY), 'Successfully delivered to customer'),
(4, 'TRK4004004', 'out_for_delivery', NOW(), 'Out for delivery - arriving today')
ON DUPLICATE KEY UPDATE 
    status = VALUES(status),
    tracking_notes = VALUES(tracking_notes),
    updated_at = CURRENT_TIMESTAMP;

-- Create tracking history table for audit trail (optional enhancement)
CREATE TABLE IF NOT EXISTS tracking_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_id INT NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    notes TEXT,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tracking_id) REFERENCES delivery_tracking(id) ON DELETE CASCADE,
    INDEX idx_tracking_id (tracking_id),
    INDEX idx_changed_at (changed_at)
);

-- Create trigger to log status changes
DELIMITER //
CREATE TRIGGER IF NOT EXISTS track_status_changes 
AFTER UPDATE ON delivery_tracking
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO tracking_history (tracking_id, old_status, new_status, notes)
        VALUES (NEW.id, OLD.status, NEW.status, CONCAT('Status changed from ', OLD.status, ' to ', NEW.status));
    END IF;
END//
DELIMITER ;

-- Create stored procedure for generating unique tracking IDs
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS GenerateTrackingId(
    IN p_order_id INT,
    OUT p_tracking_id VARCHAR(100)
)
BEGIN
    DECLARE v_timestamp BIGINT;
    DECLARE v_random INT;
    DECLARE v_suffix VARCHAR(10);
    
    -- Get current timestamp
    SET v_timestamp = UNIX_TIMESTAMP();
    
    -- Generate random number
    SET v_random = FLOOR(RAND() * 1000);
    
    -- Create suffix from last 6 digits of timestamp + random
    SET v_suffix = RIGHT(CONCAT(v_timestamp, LPAD(v_random, 3, '0')), 6);
    
    -- Create tracking ID
    SET p_tracking_id = CONCAT('TRK', p_order_id, v_suffix);
    
    -- Ensure uniqueness (retry if exists)
    WHILE EXISTS(SELECT 1 FROM delivery_tracking WHERE service_id = p_tracking_id) DO
        SET v_random = FLOOR(RAND() * 1000);
        SET v_suffix = RIGHT(CONCAT(v_timestamp, LPAD(v_random, 3, '0')), 6);
        SET p_tracking_id = CONCAT('TRK', p_order_id, v_suffix);
    END WHILE;
END//
DELIMITER ;

-- Create view for tracking summary
CREATE OR REPLACE VIEW tracking_summary AS
SELECT 
    dt.service_id,
    dt.order_id,
    dt.status,
    dt.estimated_delivery,
    dt.actual_delivery,
    dt.tracking_notes,
    dt.created_at,
    dt.updated_at,
    CASE 
        WHEN dt.status = 'delivered' THEN 'Completed'
        WHEN dt.status IN ('failed', 'cancelled') THEN 'Failed'
        WHEN dt.estimated_delivery < NOW() AND dt.status NOT IN ('delivered', 'failed', 'cancelled') THEN 'Overdue'
        ELSE 'Active'
    END as delivery_status,
    DATEDIFF(dt.estimated_delivery, dt.created_at) as estimated_days,
    CASE 
        WHEN dt.actual_delivery IS NOT NULL THEN DATEDIFF(dt.actual_delivery, dt.created_at)
        ELSE NULL
    END as actual_days
FROM delivery_tracking dt;

-- Create function to get delivery progress percentage
DELIMITER //
CREATE FUNCTION IF NOT EXISTS GetDeliveryProgress(p_status VARCHAR(50))
RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    CASE p_status
        WHEN 'pending' THEN RETURN 20;
        WHEN 'processing' THEN RETURN 40;
        WHEN 'shipped' THEN RETURN 60;
        WHEN 'out_for_delivery' THEN RETURN 80;
        WHEN 'delivered' THEN RETURN 100;
        WHEN 'failed' THEN RETURN 0;
        WHEN 'cancelled' THEN RETURN 0;
        ELSE RETURN 0;
    END CASE;
END//
DELIMITER ;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON ecommerce_delivery.* TO 'delivery_user'@'%';
-- GRANT EXECUTE ON PROCEDURE ecommerce_delivery.GenerateTrackingId TO 'delivery_user'@'%';

-- Display summary
SELECT 'Database setup completed successfully!' as Status;
SELECT COUNT(*) as 'Total Tracking Records' FROM delivery_tracking;
SELECT status, COUNT(*) as count FROM delivery_tracking GROUP BY status;