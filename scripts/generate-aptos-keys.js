const { Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");

// Generate keys for Resolver 2
const account2 = Account.generate();
console.log("Resolver 2:");
console.log("Private Key:", account2.privateKey.toString());
console.log("Address:", account2.accountAddress.toString());
console.log();

// Generate keys for Resolver 3
const account3 = Account.generate();
console.log("Resolver 3:");
console.log("Private Key:", account3.privateKey.toString());
console.log("Address:", account3.accountAddress.toString());