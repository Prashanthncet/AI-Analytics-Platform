import { Schema, model, type InferSchemaType } from 'mongoose';

export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const projectSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
        owner: { type: Schema.Types.ObjectId, ref: 'User' },
        startDate: { type: Date },
        endDate: { type: Date },
    },
    { timestamps: true }
);

projectSchema.index({ name: 'text', description: 'text' });

export type ProjectDoc = InferSchemaType<typeof projectSchema>;

export const Project = model('Project', projectSchema);
