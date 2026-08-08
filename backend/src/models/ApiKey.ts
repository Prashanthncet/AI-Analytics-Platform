import { Schema, model, type InferSchemaType } from 'mongoose';

export const API_KEY_PROVIDERS = ['openai', 'anthropic', 'google', 'azure', 'other'] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];

export const API_KEY_STATUSES = ['active', 'expired', 'revoked'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

const apiKeySchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        provider: { type: String, enum: API_KEY_PROVIDERS, default: 'other' },
        keyEncrypted: { type: String, required: true, select: false }, // AES-256-GCM ciphertext — never returned by default
        keyMasked: { type: String, required: true },
        quota: { type: Number, default: 0, min: 0 }, // 0 = unlimited
        usage: { type: Number, default: 0, min: 0 },
        costUsd: { type: Number, default: 0, min: 0 },
        expiresAt: { type: Date },
        status: { type: String, enum: API_KEY_STATUSES, default: 'active' },
        owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>;

export const ApiKey = model('ApiKey', apiKeySchema);
