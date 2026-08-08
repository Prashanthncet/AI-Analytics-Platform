import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/** Derive a 32-byte key from ENCRYPTION_KEY (falls back to JWT_SECRET for dev). */
const getKey = (): Buffer => {
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev_encryption_key';
    return crypto.createHash('sha256').update(secret).digest();
};

/** Encrypt a plaintext secret. Returns `${iv}:${authTag}:${ciphertext}` in hex. */
export const encryptSecret = (plain: string): string => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

/** Decrypt a payload produced by encryptSecret. Throws on tampering. */
export const decryptSecret = (payload: string): string => {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) {
        throw new Error('Malformed encrypted payload');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
};

/** Show only the first 4 and last 4 characters of a secret. */
export const maskSecret = (secret: string): string => {
    if (secret.length <= 8) return '••••••••';
    return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
};
