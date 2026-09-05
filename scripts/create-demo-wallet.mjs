import { Wallet } from "ethers";
import { writeFile } from "node:fs/promises";

const password = process.env.DEMO_WALLET_PASSWORD;

if (!password) {
  throw new Error("Set DEMO_WALLET_PASSWORD first.");
}

const wallet = Wallet.createRandom();

const encryptedKeystore =
  await wallet.encrypt(password);

await writeFile(
  "./demo-wallet-keystore.json",
  encryptedKeystore
);

await writeFile(
  "./demo-wallet-address.txt",
  wallet.address + "\n"
);

console.log("Demo wallet created.");
console.log("Address:", wallet.address);