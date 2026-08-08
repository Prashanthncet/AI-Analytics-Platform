import { Schema, model, type InferSchemaType } from 'mongoose';

export const PRODUCT_TYPES = ['web', 'mobile', 'desktop'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_CATEGORIES = ['ai_tool', 'software'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_STATUSES = ['active', 'trial', 'deprecated'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const productSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        vendor: { type: String, default: '', trim: true },
        type: { type: String, enum: PRODUCT_TYPES, default: 'web' },
        category: { type: String, enum: PRODUCT_CATEGORIES, default: 'ai_tool' },
        status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
        quota: { type: Number, default: 0, min: 0 }, // 0 = unlimited
        usage: { type: Number, default: 0, min: 0 },
        costUsd: { type: Number, default: 0, min: 0 },
        // Licensed software (e.g. Adobe, Figma) tracking.
        licenseKeyEncrypted: { type: String, default: '', select: false },
        licenseKeyMasked: { type: String, default: '' },
        licenseSeats: { type: Number, default: 1, min: 0 },
        licenseExpiresAt: { type: Date },
        owner: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

productSchema.index({ name: 'text', vendor: 'text', description: 'text' });

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const Product = model('Product', productSchema);
