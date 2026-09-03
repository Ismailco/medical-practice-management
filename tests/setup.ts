process.env["APP_URL"] ??= "https://clinic.test";
process.env["DATABASE_URL"] ??= "postgresql://clinic_demo:clinic_demo@127.0.0.1:5432/clinic_test";
process.env["BETTER_AUTH_SECRET"] ??= "synthetic-test-secret-at-least-thirty-two-characters";
process.env["AUTH_ARGON2_MEMORY_KIB"] ??= "65536";
process.env["AUTH_ARGON2_TIME_COST"] ??= "3";
process.env["AUTH_ARGON2_PARALLELISM"] ??= "1";
process.env["CLINIC_TIMEZONE"] ??= "Africa/Casablanca";
