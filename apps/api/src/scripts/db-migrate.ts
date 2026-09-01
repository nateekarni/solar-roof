import { loadEnv } from "@solar/domain";

const env = loadEnv(process.env);

console.log("Database migration bootstrap is ready.");
console.log(`Target database is configured for ${env.NODE_ENV}.`);
console.log("No application migrations exist yet for Task 1.");

