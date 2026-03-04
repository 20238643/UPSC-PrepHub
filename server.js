const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

dotenv.config();
const app = express();

// ── Middleware ──
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// ── MongoDB Connection ──
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/miniproject')
    .then(() => console.log('✅ MongoDB connected to miniproject'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });

// ── XP & Level Helpers ──
function calcXP(percentage) {
    if (percentage >= 80) return 100;
    if (percentage >= 60) return 70;
    if (percentage >= 40) return 40;
    return 20;
}

function calcLevel(totalXP) {
    // Level thresholds: 1=0, 2=200, 3=500, 4=1000, 5=2000, 6=3500, 7=5500, 8=8000, 9=11000, 10=15000
    const thresholds = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000];
    let level = 1;
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (totalXP >= thresholds[i]) { level = i + 1; break; }
    }
    return level;
}

function calcStreak(lastQuizDate, currentStreak) {
    if (!lastQuizDate) return 1;
    const now = new Date();
    const last = new Date(lastQuizDate);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return currentStreak; // same day, no change
    if (diffDays === 1) return currentStreak + 1; // consecutive day
    return 1; // streak broken
}

function getBadges(user) {
    const badges = [];
    const totalQuizzes = user.quizHistory.length;
    const totalXP = user.xp;
    const subjects = [...new Set(user.quizHistory.map(h => h.subject))];
    const hasExcellent = user.quizHistory.some(h => h.percentage >= 80);
    const hasPerfect = user.quizHistory.some(h => h.percentage === 100);

    if (totalQuizzes >= 1) badges.push({ id: 'first', icon: '🎯', name: 'First Quiz', desc: 'Completed your first quiz' });
    if (totalQuizzes >= 5) badges.push({ id: 'quizzer', icon: '📝', name: 'Quizzer', desc: '5 quizzes completed' });
    if (totalQuizzes >= 20) badges.push({ id: 'dedicated', icon: '💪', name: 'Dedicated', desc: '20 quizzes completed' });
    if (hasExcellent) badges.push({ id: 'scholar', icon: '🏆', name: 'Scholar', desc: 'Scored 80%+ in a quiz' });
    if (hasPerfect) badges.push({ id: 'perfect', icon: '⭐', name: 'Perfect Score', desc: 'Scored 100% in a quiz' });
    if (subjects.length >= 3) badges.push({ id: 'explorer', icon: '🌍', name: 'Explorer', desc: 'Tried 3+ subjects' });
    if (subjects.length >= 5) badges.push({ id: 'allrounder', icon: '🎓', name: 'All-Rounder', desc: 'Tried all 5 subjects' });
    if (user.streak >= 3) badges.push({ id: 'streak3', icon: '🔥', name: 'On Fire', desc: '3-day streak' });
    if (user.streak >= 7) badges.push({ id: 'streak7', icon: '⚡', name: 'Lightning', desc: '7-day streak' });
    if (totalXP >= 1000) badges.push({ id: 'xp1k', icon: '💎', name: 'Diamond Mind', desc: '1000+ XP earned' });
    return badges;
}

function getRank(level) {
    if (level >= 10) return { name: 'Platinum', color: '#8ecae6', icon: '💠' };
    if (level >= 7) return { name: 'Gold', color: '#f39c12', icon: '🥇' };
    if (level >= 4) return { name: 'Silver', color: '#95a5a6', icon: '🥈' };
    return { name: 'Bronze', color: '#cd7f32', icon: '🥉' };
}

function xpForNextLevel(level) {
    const thresholds = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000];
    return thresholds[level] || 15000;
}

function xpForCurrentLevel(level) {
    const thresholds = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000];
    return thresholds[level - 1] || 0;
}

// ── Questions API ──
app.get('/api/questions/:subject', (req, res) => {
    const subject = req.params.subject;
    const filePath = path.join(__dirname, 'public', 'data', 'questions.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Could not read questions database.' });
        const allQuestions = JSON.parse(data);
        const subjectQuestions = allQuestions[subject];
        if (!subjectQuestions) return res.status(404).json({ error: `No questions found for subject: ${subject}` });
        const shuffled = subjectQuestions.sort(() => Math.random() - 0.5).slice(0, 20);
        res.json(shuffled);
    });
});

// ── List available subjects ──
app.get('/api/subjects', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'data', 'questions.json');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Could not read questions database.' });
        const subjects = Object.keys(JSON.parse(data));
        res.json({ subjects });
    });
});

// ── Register Route ──
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, message: 'All fields are required.' });

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser)
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({ name, email: email.toLowerCase(), password: hashedPassword });
        await user.save();

        res.json({ success: true, message: `Welcome ${name}! Registration successful.`, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// ── Login Route ──
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, message: 'Email and password are required.' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const level = calcLevel(user.xp);
        const rank = getRank(level);
        const badges = getBadges(user);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                name: user.name,
                email: user.email,
                xp: user.xp,
                level,
                streak: user.streak,
                rank,
                badges,
                quizHistory: user.quizHistory,
                xpForNext: xpForNextLevel(level),
                xpForCurrent: xpForCurrentLevel(level)
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// ── Save Quiz Result ──
app.post('/api/quiz-history', async (req, res) => {
    try {
        const { email, subject, score, total } = req.body;
        if (!email || !subject || score === undefined || !total)
            return res.status(400).json({ success: false, message: 'Missing required fields.' });

        const percentage = Math.round((score / total) * 100);
        const xpEarned = calcXP(percentage);

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const newStreak = calcStreak(user.lastQuizDate, user.streak);
        const newXP = user.xp + xpEarned;
        const newLevel = calcLevel(newXP);

        user.quizHistory.push({ subject, score, total, percentage, xpEarned });
        user.xp = newXP;
        user.level = newLevel;
        user.streak = newStreak;
        user.lastQuizDate = new Date();
        await user.save();

        const rank = getRank(newLevel);
        const badges = getBadges(user);

        res.json({
            success: true, message: 'Quiz result saved.',
            xpEarned, totalXP: newXP, level: newLevel, streak: newStreak,
            rank, badges,
            xpForNext: xpForNextLevel(newLevel),
            xpForCurrent: xpForCurrentLevel(newLevel)
        });
    } catch (err) {
        console.error('Quiz history save error:', err);
        res.status(500).json({ success: false, message: 'Server error saving quiz history.' });
    }
});

// ── Get Quiz History ──
app.get('/api/quiz-history/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const level = calcLevel(user.xp);
        const rank = getRank(level);
        const badges = getBadges(user);

        res.json({
            success: true,
            user: { name: user.name, email: user.email },
            xp: user.xp, level, streak: user.streak, rank, badges,
            quizHistory: user.quizHistory,
            xpForNext: xpForNextLevel(level),
            xpForCurrent: xpForCurrentLevel(level)
        });
    } catch (err) {
        console.error('Quiz history fetch error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching quiz history.' });
    }
});

// ── Get Stats (for Dashboard) ──
app.get('/api/stats/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email.toLowerCase() });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const level = calcLevel(user.xp);
        const rank = getRank(level);
        const badges = getBadges(user);

        // Per-subject stats
        const subjects = ['Geography', 'History', 'Polity', 'Economics', 'Science'];
        const subjectStats = {};
        subjects.forEach(s => {
            const attempts = user.quizHistory.filter(h => h.subject === s);
            if (attempts.length === 0) {
                subjectStats[s] = { attempts: 0, best: 0, latest: 0, trend: 'none' };
            } else {
                const sorted = attempts.sort((a, b) => new Date(a.date) - new Date(b.date));
                const best = Math.max(...attempts.map(a => a.percentage));
                const latest = sorted[sorted.length - 1].percentage;
                const prev = sorted.length > 1 ? sorted[sorted.length - 2].percentage : latest;
                const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'same';
                subjectStats[s] = { attempts: attempts.length, best, latest, trend };
            }
        });

        // Recent 10 quizzes
        const recentHistory = [...user.quizHistory]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        res.json({
            success: true,
            user: { name: user.name, email: user.email },
            xp: user.xp, level, streak: user.streak, rank, badges,
            subjectStats, recentHistory,
            totalQuizzes: user.quizHistory.length,
            xpForNext: xpForNextLevel(level),
            xpForCurrent: xpForCurrentLevel(level)
        });
    } catch (err) {
        console.error('Stats fetch error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching stats.' });
    }
});

// ── Start Server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 UPSC PrepHub server running at http://localhost:${PORT}`);
    console.log(`📚 Questions API: http://localhost:${PORT}/api/questions/Geography`);
    console.log(`📋 Subjects API:  http://localhost:${PORT}/api/subjects\n`);
});    
/    nnn  hiifghgdhhfsdh,/