/**
 * seed.js — Seeds MongoDB with sample users and quiz questions data
 * Run: node seed.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/miniproject';

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // ── Clear existing users ──
        await User.deleteMany({});
        console.log('🗑️  Cleared existing users');

        // ── Hash passwords ──
        const salt = await bcrypt.genSalt(10);
        const hash = (pw) => bcrypt.hashSync(pw, salt);

        // ── Sample Users ──
        const users = [
            {
                name: 'Aarav Sharma',
                email: 'aarav@upsc.com',
                password: hash('password123'),
                quizHistory: [
                    { subject: 'Geography', score: 16, total: 20, percentage: 80, date: new Date('2026-02-20') },
                    { subject: 'History', score: 14, total: 20, percentage: 70, date: new Date('2026-02-21') },
                    { subject: 'Polity', score: 18, total: 20, percentage: 90, date: new Date('2026-02-22') }
                ]
            },
            {
                name: 'Priya Patel',
                email: 'priya@upsc.com',
                password: hash('password123'),
                quizHistory: [
                    { subject: 'Economics', score: 12, total: 20, percentage: 60, date: new Date('2026-02-19') },
                    { subject: 'Science', score: 17, total: 20, percentage: 85, date: new Date('2026-02-23') }
                ]
            },
            {
                name: 'Test User',
                email: 'testuser@upsc.com',
                password: hash('password123'),
                quizHistory: [
                    { subject: 'Geography', score: 10, total: 20, percentage: 50, date: new Date('2026-02-18') },
                    { subject: 'Polity', score: 15, total: 20, percentage: 75, date: new Date('2026-02-20') },
                    { subject: 'History', score: 19, total: 20, percentage: 95, date: new Date('2026-02-24') },
                    { subject: 'Economics', score: 8, total: 20, percentage: 40, date: new Date('2026-02-25') }
                ]
            }
        ];

        const inserted = await User.insertMany(users);
        console.log(`\n👥 Seeded ${inserted.length} users:`);
        inserted.forEach(u => {
            console.log(`   • ${u.name} (${u.email}) — ${u.quizHistory.length} quiz results`);
        });

        console.log('\n✅ Database seeding complete!');
        console.log('   Login with any user using password: password123');
        console.log('   Example: testuser@upsc.com / password123\n');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed error:', err);
        process.exit(1);
    }
}

seed();
