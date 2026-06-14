require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Trust proxy – required for Render (since it uses a proxy)
app.set('trust proxy', 1);

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'db', 'init.sql'), 'utf8');
        await pool.query(sql);
        console.log('✅ Database tables ready');
    } catch (err) {
        console.error('DB init error:', err.message);
    }
}

pool.connect(async (err) => {
    if (err) console.error('❌ DB connection error:', err.message);
    else {
        console.log('✅ PostgreSQL connected');
        await initDatabase();
    }
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Session configuration for production
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,          // Render uses HTTPS
        httpOnly: true,
        sameSite: 'lax',       // Helps with redirects
        maxAge: 3600000
    },
    proxy: true                // Trust the proxy (Render)
}));

app.use((req, res, next) => {
    req.pool = pool;
    next();
});

const authRoutes = require('./routes/auth')(pool);
const categoryRoutes = require('./routes/categories')(pool);
const productRoutes = require('./routes/products')(pool);
const orderRoutes = require('./routes/orders')(pool);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
