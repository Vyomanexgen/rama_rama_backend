const {
    generateRegistrationOptions
} = require("@simplewebauthn/server");

// Test the function
const uid = "test123";
const userIDBuffer = new TextEncoder().encode(uid);

console.log("Testing generateRegistrationOptions...");
console.log("UserID buffer:", userIDBuffer);

try {
    const options = generateRegistrationOptions({
        rpName: "Attendance System",
        rpID: "localhost",
        userID: userIDBuffer,
        userName: uid,
        userDisplayName: uid,
        timeout: 60000,
        attestationType: "none",
        authenticatorSelection: {
            authenticatorAttachment: "platform",
            requireResidentKey: false,
            residentKey: "preferred",
            userVerification: "preferred"
        }
    });

    console.log("Success! Options:", options);
    console.log("Challenge:", options.challenge);
    console.log("Type of options:", typeof options);
    console.log("Keys:", Object.keys(options));
    console.log("JSON stringify:", JSON.stringify(options, null, 2));
} catch (err) {
    console.error("Error:", err);
}
