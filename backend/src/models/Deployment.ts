import { Schema, model, type InferSchemaType } from 'mongoose';

export const DEPLOYMENT_TARGET_TYPES = ['project', 'product', 'apikey'] as const;
export type DeploymentTargetType = (typeof DEPLOYMENT_TARGET_TYPES)[number];

export const DEPLOYMENT_KINDS = ['web', 'app', 'desktop', 'api'] as const;
export type DeploymentKind = (typeof DEPLOYMENT_KINDS)[number];

export const DEPLOYMENT_STATUSES = ['live', 'offline', 'unknown', 'paused'] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

const deploymentSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        targetType: { type: String, enum: DEPLOYMENT_TARGET_TYPES, required: true },
        targetId: { type: Schema.Types.ObjectId, required: true },
        kind: { type: String, enum: DEPLOYMENT_KINDS, default: 'web' },
        displayUrl: { type: String, default: '', trim: true },
        checkUrl: { type: String, default: '', trim: true },
        enabled: { type: Boolean, default: true },
        status: { type: String, enum: DEPLOYMENT_STATUSES, default: 'unknown' },
        lastCheckedAt: { type: Date },
        lastResponseMs: { type: Number },
        lastStatusChangeAt: { type: Date },
        uptimePercent: { type: Number, default: null, min: 0, max: 100 },
        // Rolling check history — capped in code to the last 1440 entries (~24h at 60s).
        checks: {
            type: [
                {
                    at: { type: Date, required: true },
                    ok: { type: Boolean, required: true },
                    responseMs: { type: Number },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

deploymentSchema.index({ targetType: 1, targetId: 1 });
deploymentSchema.index({ enabled: 1, status: 1 });

export type DeploymentDoc = InferSchemaType<typeof deploymentSchema>;
export type DeploymentCheck = { at: Date; ok: boolean; responseMs?: number };

export const MAX_CHECKS = 1440;

export const Deployment = model('Deployment', deploymentSchema);
