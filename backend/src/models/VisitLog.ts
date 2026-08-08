import { Schema, model, type InferSchemaType } from 'mongoose';

export const VISIT_SITE_TYPES = ['project', 'product', 'apikey'] as const;
export type VisitSiteType = (typeof VISIT_SITE_TYPES)[number];

const visitLogSchema = new Schema(
    {
        siteType: { type: String, enum: VISIT_SITE_TYPES, required: true },
        siteId: { type: Schema.Types.ObjectId, required: true },
        page: { type: String, default: '/', trim: true },
        referrer: { type: String, default: '' },
        // Best-effort session id (localStorage on the tracked site) used to approximate visitors.
        session: { type: String, default: '' },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

visitLogSchema.index({ siteType: 1, siteId: 1, createdAt: -1 });
visitLogSchema.index({ siteType: 1, siteId: 1, page: 1, createdAt: -1 });

export type VisitLogDoc = InferSchemaType<typeof visitLogSchema>;

export const VisitLog = model('VisitLog', visitLogSchema);
