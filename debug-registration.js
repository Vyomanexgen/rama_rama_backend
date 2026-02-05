/**
 * Debug script to test WebAuthn registration options generation
 * Run this to verify the backend can generate valid registration options
 */

const {
    generateRegistrationOptions
} = require("@simplewebauthn/server");

console.log("=".repeat(50));
console.log("WebAuthn Registration Debug Test");
console.log("=".repeat(50));
console.log();

const testUID = "test_user_123";
const userIDBuffer = new TextEncoder().encode(testUID);

console.log("1. Test UID:", testUID);
console.log("2. UserID Buffer Length:", userIDBuffer.length);
console.log();

try {
    console.log("3. Generating registration options...");

    const options = generateRegistrationOptions({
        rpName: "Attendance System",
        rpID: "localhost",
        userID: userIDBuffer,
        userName: testUID,
        userDisplayName: testUID,
        timeout: 60000,
        attestationType: "none",
        authenticatorSelection: {
            authenticatorAttachment: "platform",
            requireResidentKey: false,
            residentKey: "preferred",
            userVerification: "discouraged"
        }
    });

    console.log("✅ SUCCESS! Options generated:");
    console.log();
    console.log("Challenge:", options.challenge);
    console.log("RP ID:", options.rp.id);
    console.log("RP Name:", options.rp.name);
    console.log("User ID (base64):", options.user.id);
    console.log("User Name:", options.user.name);
    console.log();
    console.log("Full options object:");
    console.log(JSON.stringify(options, null, 2));
    console.log();
    console.log("=".repeat(50));
    console.log("✅ Backend WebAuthn setup is working correctly!");
    console.log("=".repeat(50));

} catch (err) {
    console.error("❌ ERROR generating registration options!");
    console.error();
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error();
    console.error("=".repeat(50));
    console.error("❌ Backend WebAuthn setup has issues!");
    console.error("=".repeat(50));
    process.exit(1);
}
