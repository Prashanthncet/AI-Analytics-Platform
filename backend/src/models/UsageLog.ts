import { Schema, model, type InferSchemaType } from 'mongoose';

export const USAGE_TARGET_TYPES = ['apikey', 'product'] as const;
export type UsageTargetType = (typeof USAGE_TARGET_TYPES)[number];

const usageLogSchema = new Schema(
    {
        targetType: { type: String, enum: USAGE_TARGET_TYPES, required: true },
        targetId: { type: Schema.Types.ObjectId, required: true },
        usageDelta: { type: Number, required: true, min: 0 },
        costDelta: { type: Number, required: true, min: 0, default: 0 },
        note: { type: String, default: '', trim: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

usageLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export type UsageLogDoc = InferSchemaType<typeof usageLogSchema>;

export const UsageLog = model('UsageLog', usageLogSchema);
