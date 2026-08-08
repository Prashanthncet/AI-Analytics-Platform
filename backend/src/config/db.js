"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017/ai_analytics?authSource=admin';
        await mongoose_1.default.connect(uri);
        console.log('MongoDB Connected');
    }
    catch (error) {
        console.error('MongoDB Connection Error: ', error);
        process.exit(1);
    }
};
exports.default = connectDB;
//# sourceMappingURL=db.js.map