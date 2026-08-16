import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.endsWith("package-lock.json"));

const patterns: Array<[string, RegExp]> = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["AWS secret assignment", /\b(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[:=]\s*[\"']?[A-Za-z0-9/+]{30,}/i],
  ["generic bearer token", /\bAuthorization\s*[:=]\s*Bearer\s+[A-Za-z0-9._~-]{24,}/i],
];

const findings: string[] = [];
for (const file of tracked) {
  if (file.startsWith("docs/") || file.startsWith("observability/")) continue;
  const text = execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(`${file}: ${name}`);
  }
}

if (findings.length) {
  console.error("Potential committed secrets detected:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

console.log(`Secret hygiene passed: scanned ${tracked.length} tracked files.`);
