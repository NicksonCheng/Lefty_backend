-- Create Lefty and Lefty_Test databases
CREATE DATABASE
IF NOT EXISTS Lefty;
CREATE DATABASE
IF NOT EXISTS Lefty_Test;
-- 步驟 1: 建立第二個資料庫

CREATE USER
IF NOT EXISTS 'lefty_user'@'%' IDENTIFIED BY '123456';
CREATE USER
IF NOT EXISTS 'lefty_test_user'@'%' IDENTIFIED BY '123456';

-- 步驟 2: 授予各自資料庫的權限

-- lefty_user 擁有 Lefty 資料庫的所有權限
GRANT ALL PRIVILEGES ON Lefty.* TO 'lefty_user'@'%';

-- lefty_test_user 擁有 Lefty_Test 資料庫的所有權限
GRANT ALL PRIVILEGES ON Lefty_Test.* TO 'lefty_test_user'@'%';

FLUSH PRIVILEGES;