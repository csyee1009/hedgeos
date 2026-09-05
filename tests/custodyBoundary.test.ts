import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function stripCommentsAndStrings(code: string): string {
  // Strip block comments
  let clean = code.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip line comments
  clean = clean.replace(/\/\/.*/g, "");
  return clean;
}

export function scanDirectoryForCustodyViolations(dirRelativePath: string = "src") {
  const srcDir = join(__dirname, "../", dirRelativePath);
  const files = getAllFiles(srcDir);

  const forbiddenTokens = [
    "new ethers.Wallet",
    "ethers.Wallet.createRandom",
    "Wallet.fromPhrase",
    "getSigner(",
    "signTransaction(",
    "signTypedData(",
    "sendTransaction(",
    "eth_sendTransaction",
    "eth_sendRawTransaction",
  ];

  const violations: Array<{ file: string; token: string }> = [];

  for (const file of files) {
    const rawContent = readFileSync(file, "utf8");
    const cleanContent = stripCommentsAndStrings(rawContent);

    for (const token of forbiddenTokens) {
      if (cleanContent.includes(token)) {
        violations.push({ file, token });
      }
    }

    if (!file.includes("LLMOutputValidator.ts")) {
      const secretAssignRegex = /\b(PRIVATE_KEY|MNEMONIC|SEED_PHRASE)\s*=/g;
      if (secretAssignRegex.test(cleanContent)) {
        violations.push({ file, token: "SECRET_ASSIGNMENT" });
      }
    }
  }
  return violations;
}

describe("Production Custody Invariant Static Scan Suite", () => {
  it("custody static scan passes (no write, signer, or wallet execution in src/)", () => {
    const violations = scanDirectoryForCustodyViolations("src");
    expect(violations).toEqual([]);
  });
});

