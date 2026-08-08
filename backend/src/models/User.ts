import { Schema, model, type InferSchemaType } from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['admin', 'manager', 'member', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 6, select: false },
        role: { type: String, enum: USER_ROLES, default: 'member' },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = model('User', userSchema);

export const comparePassword = (candidate: string, hashed: string): Promise<boolean> =>
    bcrypt.compare(candidate, hashed);
