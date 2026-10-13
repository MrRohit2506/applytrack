// Runs before test files import the app, so env validation sees these values.
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/applytrack_test_unused"; // never connected by tests
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234567890";
process.env.CSRF_SECRET = "test-csrf-secret-test-csrf-secret-123456789";
process.env.CLIENT_ORIGIN = "http://localhost:5173";
process.env.COOKIE_SAMESITE = "lax";
process.env.COOKIE_SECURE = "false";
delete process.env.COOKIE_DOMAIN;
process.env.BCRYPT_ROUNDS = "4";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.LOGIN_FAILURE_LIMIT = "1000";
process.env.API_RATE_LIMIT_MAX = "100000";
process.env.IMPORT_MAX_BYTES = "20000";
process.env.IMPORT_MAX_ROWS = "100";
process.env.REMINDER_WINDOW_DAYS = "7";
process.env.TRUST_PROXY = "0";
