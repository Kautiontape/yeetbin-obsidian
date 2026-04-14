const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function fromBase64url(str: string): Uint8Array {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encrypt(plaintext: string): Promise<{ ciphertext: string; key: string }> {
	const key = await crypto.subtle.generateKey(
		{ name: ALGO, length: KEY_LENGTH },
		true,
		['encrypt', 'decrypt']
	);

	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoded = new TextEncoder().encode(plaintext);
	const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(encrypted), iv.length);

	const exportedKey = await crypto.subtle.exportKey('raw', key);

	return {
		ciphertext: base64url(combined),
		key: base64url(new Uint8Array(exportedKey)),
	};
}

export async function decrypt(ciphertext: string, keyStr: string): Promise<string> {
	const data = fromBase64url(ciphertext);
	const iv = data.slice(0, IV_LENGTH);
	const encrypted = data.slice(IV_LENGTH);

	const keyData = fromBase64url(keyStr);
	const key = await crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: ALGO, length: KEY_LENGTH },
		false,
		['decrypt']
	);

	const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, encrypted);
	return new TextDecoder().decode(decrypted);
}
