// Set up test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-at-least-32-characters-long';
process.env.DATABASE_URL = 'postgresql://postgres:secure_dev_password_2024@localhost:5432/customer_insights';
process.env.REDIS_URL = 'redis://localhost:6379';

// Database connection variables
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'secure_dev_password_2024';
process.env.DB_NAME = 'customer_insights';
