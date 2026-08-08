import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MONGO_URI_DEFAULT } from './config/db';
import { User, type UserRole } from './models/User';
import { Project } from './models/Project';
import { Product } from './models/Product';
import { Deployment } from './models/Deployment';
import { encryptSecret, maskSecret } from './utils/crypto';

dotenv.config();

const DAY_MS = 24 * 60 * 60 * 1000;

const ensureAdmin = async (): Promise<{ id: string; name: string; email: string; role: UserRole }> => {
    const email = (process.env.ADMIN_EMAIL || 'admin@corp.com').toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD || 'secret123';
    const name = process.env.ADMIN_NAME || 'Admin';

    const existing = await User.findOne({ email }).select('+password');
    if (existing) {
        // Self-heal: if the stored password no longer matches ADMIN_PASSWORD (e.g. the
        // env changed, or an old seed double-hashed it), rehash so login keeps working.
        const matches = await bcrypt.compare(password, existing.password);
        if (!matches) {
            existing.password = password; // pre('save') hook rehashes
            await existing.save();
            console.log(`✓ Admin password reset to ADMIN_PASSWORD value (${email})`);
        }
        console.log(`✓ Admin already exists: ${email}`);
        return { id: existing._id.toString(), name: existing.name, email: existing.email, role: existing.role as UserRole };
    }

    // Pass the plaintext password — the User model's pre('save') hook hashes it once.
    const user = await User.create({
        name,
        email,
        password,
        role: 'admin',
    });
    console.log(`✓ Admin created: ${email} (password from ADMIN_PASSWORD or "secret123")`);
    return { id: user._id.toString(), name, email, role: 'admin' };
};

const wipeAll = async (): Promise<void> => {
    const collections = ['users', 'projects', 'products', 'apikeys', 'deployments', 'visitlogs', 'usagelogs'];
    for (const name of collections) {
        try {
            await mongoose.connection.collection(name).deleteMany({});
        } catch {
            // collection may not exist yet — fine
        }
    }
    console.log('✓ Wiped all collections — starting from a clean slate');
};

const seedRealData = async (adminId: string): Promise<void> => {

    // ---------- Projects: the user's real websites + mobile apps ----------
    const createdProjects = await Project.create([
        {
            name: 'NDC & Co.',
            description: 'Company website & portfolio — ndc-co.vercel.app',
            status: 'active',
            owner: adminId,
            startDate: new Date(Date.now() - 240 * DAY_MS),
        },
        {
            name: 'Document Verification Tool',
            description: 'Verify and validate documents online — document-verification-tool.vercel.app',
            status: 'active',
            owner: adminId,
            startDate: new Date(Date.now() - 180 * DAY_MS),
        },
        {
            name: 'Kannada Keyword Extractor',
            description: 'AI keyword extraction for Kannada text — kannada-keyword-extractor.vercel.app',
            status: 'active',
            owner: adminId,
            startDate: new Date(Date.now() - 120 * DAY_MS),
        },
        {
            name: 'NDC Mobile App',
            description: 'iOS & Android companion app for NDC & Co.',
            status: 'active',
            owner: adminId,
            startDate: new Date(Date.now() - 90 * DAY_MS),
        },
        {
            name: 'DocVerify Mobile',
            description: 'Mobile document verification with scan & verify.',
            status: 'on_hold',
            owner: adminId,
            startDate: new Date(Date.now() - 45 * DAY_MS),
        },
    ]);
    const p1 = createdProjects[0]!;
    const p2 = createdProjects[1]!;
    const p3 = createdProjects[2]!;
    const app1 = createdProjects[3]!;
    const app2 = createdProjects[4]!;
    console.log('✓ Projects created: 3 live websites + 2 mobile apps');

    // ---------- Deployments: monitor the REAL sites every 60s ----------
    await Deployment.create([
        {
            name: 'NDC & Co. — production',
            targetType: 'project',
            targetId: p1._id,
            kind: 'web',
            displayUrl: 'https://ndc-co.vercel.app/',
            checkUrl: 'https://ndc-co.vercel.app/',
            status: 'unknown',
            enabled: true,
        },
        {
            name: 'Document Verification — production',
            targetType: 'project',
            targetId: p2._id,
            kind: 'web',
            displayUrl: 'https://document-verification-tool.vercel.app/',
            checkUrl: 'https://document-verification-tool.vercel.app/',
            status: 'unknown',
            enabled: true,
        },
        {
            name: 'Kannada Keyword Extractor — production',
            targetType: 'project',
            targetId: p3._id,
            kind: 'web',
            displayUrl: 'https://kannada-keyword-extractor.vercel.app/',
            checkUrl: 'https://kannada-keyword-extractor.vercel.app/',
            status: 'unknown',
            enabled: true,
        },
        {
            name: 'NDC Mobile App — API',
            targetType: 'project',
            targetId: app1._id,
            kind: 'app',
            displayUrl: 'https://apps.apple.com/',
            checkUrl: 'https://ndc-co.vercel.app/', // app backend probe
            status: 'unknown',
            enabled: true,
        },
        {
            name: 'DocVerify Mobile — API',
            targetType: 'project',
            targetId: app2._id,
            kind: 'app',
            displayUrl: 'https://play.google.com/',
            checkUrl: 'https://document-verification-tool.vercel.app/', // app backend probe
            status: 'unknown',
            enabled: true,
        },
    ]);
    console.log('✓ Deployments created — monitoring real URLs (live/offline data starts now)');

    // ---------- Products: AI tools (real products the admin owns; usage/cost start at 0 and
    // are filled by real provider usage connectors or manual updates — never seeded).
    const createdAiTools = await Product.create([
        {
            name: 'OpenAI GPT-4o',
            description: 'Flagship LLM for chat, RAG and agent features.',
            vendor: 'OpenAI', type: 'web', category: 'ai_tool', status: 'active',
            quota: 5_000_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Google Gemini 1.5 Pro',
            description: 'Multimodal LLM — free tier included with API access.',
            vendor: 'Google', type: 'web', category: 'ai_tool', status: 'active',
            quota: 2_000_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Anthropic Claude 3.5 Sonnet',
            description: 'High-quality reasoning model for docs and coding.',
            vendor: 'Anthropic', type: 'web', category: 'ai_tool', status: 'active',
            quota: 1_500_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Groq — Llama 3 (free tier)',
            description: 'Ultra-fast open model inference — free tier active.',
            vendor: 'Groq', type: 'web', category: 'ai_tool', status: 'active',
            quota: 1_000_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Mistral Large',
            description: 'European LLM for multilingual features (incl. Kannada).',
            vendor: 'Mistral AI', type: 'web', category: 'ai_tool', status: 'active',
            quota: 800_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Cohere Command R+',
            description: 'RAG-optimized model used for the keyword extractor.',
            vendor: 'Cohere', type: 'web', category: 'ai_tool', status: 'active',
            quota: 600_000, usage: 0, costUsd: 0, owner: adminId,
        },
        {
            name: 'Stability AI SDXL',
            description: 'Image generation for marketing and content.',
            vendor: 'Stability AI', type: 'web', category: 'ai_tool', status: 'active',
            quota: 100_000, usage: 0, costUsd: 0, owner: adminId,
        },
    ]);
    console.log('✓ AI tools created: 7 providers tracked (usage starts at 0 — real data only)');

    // ---------- Products: licensed software ----------
    await Product.create([
        {
            name: 'Adobe Photoshop CC',
            description: 'Licensed photo editing suite.',
            vendor: 'Adobe', type: 'desktop', category: 'software', status: 'active',
            quota: 0, usage: 0, costUsd: 0, owner: adminId,
            licenseKeyEncrypted: encryptSecret('PS-2026-DEMO-8F2A91C4'), licenseKeyMasked: maskSecret('PS-2026-DEMO-8F2A91C4'),
            licenseSeats: 2, licenseExpiresAt: new Date(Date.now() + 45 * DAY_MS),
        },
        {
            name: 'Adobe Illustrator CC',
            description: 'Vector design license.',
            vendor: 'Adobe', type: 'desktop', category: 'software', status: 'active',
            quota: 0, usage: 0, costUsd: 0, owner: adminId,
            licenseKeyEncrypted: encryptSecret('AI-2026-DEMO-1B3C77D2'), licenseKeyMasked: maskSecret('AI-2026-DEMO-1B3C77D2'),
            licenseSeats: 1, licenseExpiresAt: new Date(Date.now() + 120 * DAY_MS),
        },
        {
            name: 'Figma Professional',
            description: 'Team design & prototyping license.',
            vendor: 'Figma', type: 'desktop', category: 'software', status: 'active',
            quota: 0, usage: 0, costUsd: 0, owner: adminId,
            licenseKeyEncrypted: encryptSecret('FIGMA-PRO-5SEATS-DEMO'), licenseKeyMasked: maskSecret('FIGMA-PRO-5SEATS-DEMO'),
            licenseSeats: 5, licenseExpiresAt: new Date(Date.now() + 200 * DAY_MS),
        },
        {
            name: 'Microsoft 365 Business',
            description: 'Office suite subscription for the team.',
            vendor: 'Microsoft', type: 'desktop', category: 'software', status: 'active',
            quota: 0, usage: 0, costUsd: 0, owner: adminId,
            licenseKeyEncrypted: encryptSecret('M365-BUS-10SEATS-DEMO'), licenseKeyMasked: maskSecret('M365-BUS-10SEATS-DEMO'),
            licenseSeats: 10, licenseExpiresAt: new Date(Date.now() + 25 * DAY_MS),
        },
        {
            name: 'JetBrains All Products Pack',
            description: 'IDE licenses for the engineering team.',
            vendor: 'JetBrains', type: 'desktop', category: 'software', status: 'active',
            quota: 0, usage: 0, costUsd: 0, owner: adminId,
            licenseKeyEncrypted: encryptSecret('JB-AP-2026-DEMO'), licenseKeyMasked: maskSecret('JB-AP-2026-DEMO'),
            licenseSeats: 1, licenseExpiresAt: new Date(Date.now() + 300 * DAY_MS),
        },
    ]);
    console.log('✓ Licensed software created: Photoshop CC, Illustrator, Figma, MS 365, JetBrains');

    // ---------- API keys ----------
    // No API keys are seeded: the platform never fabricates key material. Add your real keys
    // (encrypted at rest, AES-256-GCM) via the API Keys page — only the admin can decrypt them.
    console.log('✓ API keys: none seeded — add your real keys via the API Keys page (encrypted at rest).');

    // ---------- Usage & visitor data ----------
    // Nothing is seeded here on purpose: usage and visitor numbers come ONLY from real sources —
    // the tracking snippet (web visits), provider usage connectors (API consumption), and manual
    // admin updates. This keeps every number on the dashboard real from day one.
    console.log('✓ Usage & visitor data: none seeded — only real tracked data will appear.');
};

/**
 * Run the seed. `reset` wipes all collections first. Idempotent without reset: the admin is
 * created/self-healed and real data (projects, deployments, products) is seeded only when the
 * database has no projects yet — so it is safe to call on every server boot.
 */
export const runSeed = async (reset = false): Promise<void> => {
    const uri = process.env.MONGO_URI || MONGO_URI_DEFAULT;
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    if (reset) await wipeAll();

    const admin = await ensureAdmin();

    // The platform is admin-only — remove any legacy non-admin accounts.
    const stale = await User.deleteMany({ role: { $ne: 'admin' } });
    if (stale.deletedCount > 0) {
        console.log(`✓ Removed ${stale.deletedCount} legacy non-admin account(s)`);
    }

    if (reset) {
        await seedRealData(admin.id);
    } else {
        const projectCount = await Project.countDocuments();
        if (projectCount > 0) {
            console.log(`✓ Projects already exist (${projectCount}) — run "npm run seed -- --reset" to rebuild with real data.`);
        } else {
            await seedRealData(admin.id);
        }
    }

    console.log('\nSeed complete.');
};

// Auto-run only when executed directly (npm run seed / node dist/seed.js), not when imported.
const isDirectRun =
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
    runSeed(process.argv.includes('--reset'))
        .then(async () => {
            await mongoose.disconnect();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error('Seed failed:', err instanceof Error ? err.message : err);
            await mongoose.disconnect();
            process.exit(1);
        });
}
