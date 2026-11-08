// Generates a VAPID key pair for Web Push.
// Usage: node scripts/gen-vapid.mjs
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
const pub = Buffer.from(raw).toString("base64url");
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
const priv = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });

console.log("\n1) wrangler.toml 의 VAPID_PUBLIC_KEY 에 붙여넣기:\n");
console.log(pub);
console.log("\n2) 아래 명령을 실행하고, 물어보면 그 다음 줄의 JSON 전체를 붙여넣기:\n");
console.log("npx wrangler secret put VAPID_PRIVATE_JWK\n");
console.log(priv + "\n");
