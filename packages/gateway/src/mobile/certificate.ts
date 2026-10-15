import {
	createHash,
	createPrivateKey,
	generateKeyPairSync,
	type KeyObject,
	randomBytes,
	X509Certificate,
} from "node:crypto";
import { join } from "node:path";
import forge from "node-forge";
import { type MobileStore, readSecretFile, writeSecretFile } from "./store.ts";

const TLS_CERT_FILE = "cert.pem";
const TLS_KEY_FILE = "key.pem";
const CERT_VALIDITY_MS = 825 * 24 * 60 * 60 * 1000;

export type MobileCertificateMaterial = {
	readonly certPem: string;
	readonly keyPem: string;
	readonly fingerprint: string;
	readonly expiresAt: number;
};

function mobileCommonName(serverId: string): string {
	return `neko-${serverId.slice(0, 8).toLowerCase()}.invalid`;
}

export function minimalPositiveIntegerHex(bytes: Uint8Array): string {
	let start = 0;
	while (start < bytes.length - 1 && bytes[start] === 0) start++;
	const significant = bytes.subarray(start);
	const first = significant[0] ?? 0;
	return `${first >= 0x80 ? "00" : ""}${Buffer.from(significant).toString("hex")}`;
}

function randomSerialHex(): string {
	for (;;) {
		const hex = minimalPositiveIntegerHex(randomBytes(16));
		if (hex !== "00") return hex;
	}
}

function generateTlsMaterial(serverId: string): { readonly certPem: string; readonly keyPem: string } {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
	const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
	const commonName = mobileCommonName(serverId);
	const cert = forge.pki.createCertificate();
	cert.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
	cert.serialNumber = randomSerialHex();
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date(cert.validity.notBefore.getTime() + CERT_VALIDITY_MS);
	const attributes = [{ name: "commonName", value: commonName }];
	cert.setSubject(attributes);
	cert.setIssuer(attributes);
	cert.setExtensions([
		{ name: "basicConstraints", cA: false },
		{ name: "keyUsage", digitalSignature: true, keyEncipherment: true },
		{ name: "extKeyUsage", serverAuth: true },
		{ name: "subjectAltName", altNames: [{ type: 2, value: commonName }] },
	]);
	cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());
	return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

function materialFromPem(
	certPem: string,
	keyPem: string,
	certPath: string,
	keyPath: string,
): MobileCertificateMaterial {
	let x509: X509Certificate;
	try {
		x509 = new X509Certificate(certPem);
	} catch {
		throw new Error(`Invalid mobile TLS certificate ${certPath}: not a parseable X.509 certificate`);
	}
	let key: KeyObject;
	try {
		key = createPrivateKey(keyPem);
	} catch {
		throw new Error(`Invalid mobile TLS private key ${keyPath}: not a parseable private key`);
	}
	if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength !== 2048)
		throw new Error(`Invalid mobile TLS private key ${keyPath}: expected an RSA-2048 private key`);
	if (!x509.checkPrivateKey(key))
		throw new Error(`Mobile TLS certificate ${certPath} does not match private key ${keyPath}`);
	let forgeCert: forge.pki.Certificate;
	try {
		forgeCert = forge.pki.certificateFromPem(certPem);
	} catch {
		throw new Error(`Invalid mobile TLS certificate ${certPath}: not a parseable X.509 certificate`);
	}
	if (!forgeCert.verify(forgeCert))
		throw new Error(`Invalid mobile TLS certificate ${certPath}: self-signature verification failed`);
	return Object.freeze({
		certPem,
		keyPem,
		fingerprint: createHash("sha256").update(x509.raw).digest("hex"),
		expiresAt: x509.validToDate.getTime(),
	});
}

async function generateAndPersist(
	serverId: string,
	certPath: string,
	keyPath: string,
): Promise<MobileCertificateMaterial> {
	const { certPem, keyPem } = generateTlsMaterial(serverId);
	await writeSecretFile(keyPath, keyPem);
	await writeSecretFile(certPath, certPem);
	return materialFromPem(certPem, keyPem, certPath, keyPath);
}

export class MobileCertificate {
	readonly certPath: string;
	readonly keyPath: string;

	private readonly serverId: string;
	private current: MobileCertificateMaterial;

	private constructor(serverId: string, certPath: string, keyPath: string, initial: MobileCertificateMaterial) {
		this.serverId = serverId;
		this.certPath = certPath;
		this.keyPath = keyPath;
		this.current = initial;
	}

	static async load(store: MobileStore, serverId: string): Promise<MobileCertificate> {
		const certPath = join(store.tlsDir, TLS_CERT_FILE);
		const keyPath = join(store.tlsDir, TLS_KEY_FILE);
		const certPem = await readSecretFile(certPath);
		const keyPem = await readSecretFile(keyPath);
		if (certPem === undefined && keyPem === undefined) {
			return new MobileCertificate(serverId, certPath, keyPath, await generateAndPersist(serverId, certPath, keyPath));
		}
		if (certPem === undefined || keyPem === undefined) {
			throw new Error(`Incomplete mobile TLS material: expected both ${certPath} and ${keyPath}`);
		}
		return new MobileCertificate(serverId, certPath, keyPath, materialFromPem(certPem, keyPem, certPath, keyPath));
	}

	get certPem(): string {
		return this.current.certPem;
	}

	get keyPem(): string {
		return this.current.keyPem;
	}

	get fingerprint(): string {
		return this.current.fingerprint;
	}

	get expiresAt(): number {
		return this.current.expiresAt;
	}

	async regenerate(): Promise<MobileCertificateMaterial> {
		const previous = this.current;
		let next: MobileCertificateMaterial;
		try {
			next = await generateAndPersist(this.serverId, this.certPath, this.keyPath);
		} catch (error) {
			await writeSecretFile(this.keyPath, previous.keyPem).catch(() => undefined);
			await writeSecretFile(this.certPath, previous.certPem).catch(() => undefined);
			throw error;
		}
		this.current = next;
		return next;
	}
}
