import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/projects.routes';
import productRoutes from './routes/products.routes';
import apiKeyRoutes from './routes/apikeys.routes';
import dashboardRoutes from './routes/dashboard.routes';
import deploymentRoutes from './routes/deployments.routes';
import { serveTrackingScript, trackPageview } from './routes/tracking.routes';
import visitorRoutes from './routes/visitors.routes';
import usageRoutes from './routes/usage.routes';
import reportRoutes from './routes/reports.routes';
import chatRoutes from './routes/chat.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app: Application = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// The tracking snippet posts via navigator.sendBeacon, which sends text/plain — parse it so
// /api/track receives the JSON string (handled in tracking.routes.ts).
app.use(express.text({ type: 'text/plain' }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Routes
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/products', productRoutes);
app.use('/api/apikeys', apiKeyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/deployments', deploymentRoutes);
// Embeddable visitor tracking snippet + anonymous pageview endpoint.
app.get('/t.js', serveTrackingScript);
app.post('/api/track', trackPageview);
app.use('/api/visitors', visitorRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);

// 404 + error handling (must come after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
